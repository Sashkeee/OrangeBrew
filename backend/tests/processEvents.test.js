import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { initDatabase, closeDatabase, getDb, userQueries, recipeQueries, sessionQueries,
    eventOutboxQueries, processEventQueries } from '../db/database.js';
import ProcessManager from '../services/ProcessManager.js';
import { createOutboxRelay } from '../workers/outboxRelay.js';
import { readKafkaConfig, createKafkaPublisher } from '../infrastructure/kafka/client.js';
import telegram from '../services/telegram.js';

vi.mock('../services/telegram.js', () => ({ default: { notifyProcessEvent: vi.fn(), setCurrentProcessType: vi.fn(), sendMessage: vi.fn() } }));
vi.mock('../routes/control.js', () => ({ setPumpState: vi.fn() }));

let owner, other, recipe, manager, pid;
const quiet = { warn: vi.fn(), error: vi.fn() };
const rows = () => getDb().prepare('SELECT * FROM event_outbox ORDER BY id').all();
function newManager(userId = owner.id) {
    const controller = { setEnabled: vi.fn(), setTarget: vi.fn(), setMode: vi.fn(), setSensorAddress: vi.fn(), resetIntegral: vi.fn(), update: vi.fn() };
    return { manager: new ProcessManager(controller, userId), pid: controller };
}

beforeEach(async () => {
    vi.stubEnv('EVENTS_CAPTURE_ENABLED', 'true');
    vi.stubEnv('APP_ENV', 'test');
    vi.stubEnv('CONNECTION_TYPE', 'mock');
    await initDatabase(':memory:');
    owner = userQueries.create({ username: 'owner', password_hash: 'test' });
    other = userQueries.create({ username: 'other', password_hash: 'test' });
    recipe = { ...recipeQueries.create({ name: 'Mash' }, owner.id), mash_steps: [{ name: 'Hold', temp: 65, duration: 60 }] };
    ({ manager, pid } = newManager());
});
afterEach(() => {
    clearInterval(manager.timerInterval);
    closeDatabase();
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
});

describe('durable process transitions', () => {
    it('continues forwarding per-user PID/autotune data after a previous process completed', () => {
        manager.start(recipe);
        manager.complete();
        const data = { boiler: 20, sensors: [{ address: 'new-selected-sensor', temp: 20 }] };
        pid.update.mockClear();
        manager.handleSensorData('another-owned-device', data);
        expect(pid.update).toHaveBeenCalledWith(data);
        expect(manager.getState().status).toBe('COMPLETED');
    });
    it('commits scoped session and request before enabling heat; timer ticks are not events', () => {
        vi.useFakeTimers();
        pid.setEnabled.mockImplementation(enabled => {
            if (enabled) expect(JSON.parse(rows()[0].payload).eventType).toBe('process.start_requested');
        });
        manager.start(recipe, null, 'mash', 'local_serial', null, { correlationId: 'request-1' });
        const sessionId = manager.getState().sessionId;
        expect(sessionQueries.getById(sessionId, owner.id).user_id).toBe(owner.id);
        expect(rows().map(row => JSON.parse(row.payload).eventType)).toEqual(['process.start_requested', 'process.started']);
        expect(JSON.parse(rows()[1].payload).correlationId).toBe('request-1');
        vi.advanceTimersByTime(30000);
        expect(rows()).toHaveLength(2);
        manager.handleSensorData('local_serial', { boiler: 65 });
        expect(JSON.parse(rows()[2].payload).eventType).toBe('process.step_reached');
        expect(telegram.notifyProcessEvent).toHaveBeenCalledWith(expect.objectContaining({ eventType: 'process.started', userId: owner.id }));
    });

    it('rolls back session and snapshot when outbox insert fails, without invented ID or heat', () => {
        getDb().exec("CREATE TEMP TRIGGER fail_outbox BEFORE INSERT ON event_outbox BEGIN SELECT RAISE(ABORT,'injected failure'); END");
        expect(() => manager.start(recipe)).toThrow('injected failure');
        expect(pid.setEnabled).not.toHaveBeenCalledWith(true);
        expect(manager.getState().sessionId).toBeNull();
        expect(getDb().prepare('SELECT COUNT(*) n FROM brew_sessions').get().n).toBe(0);
        expect(getDb().prepare('SELECT COUNT(*) n FROM process_runtime_state').get().n).toBe(0);
    });

    it('rejects another tenant session, recipe, device and sensor before enabling heat', () => {
        const foreignSession = sessionQueries.create({ type: 'mash' }, other.id);
        const foreignRecipe = recipeQueries.create({ name: 'Foreign' }, other.id);
        getDb().prepare('INSERT INTO devices(id,name,user_id) VALUES(?,?,?)').run('foreign-device', 'Other', other.id);
        expect(() => manager.start(recipe, foreignSession.id)).toThrow('Session does not belong');
        expect(() => manager.start({ ...recipe, id: foreignRecipe.id })).toThrow('Recipe does not belong');
        expect(() => manager.start(recipe, null, 'mash', 'foreign-device')).toThrow('Device does not belong');
        expect(() => manager.start(recipe, null, 'mash', 'local_serial', 'foreign-sensor')).toThrow('Sensor does not belong');
        expect(pid.setEnabled).not.toHaveBeenCalledWith(true);
    });

    it('allows a fresh raw sensor only when the route supplies verified server context', () => {
        getDb().prepare('INSERT INTO devices(id,name,user_id) VALUES(?,?,?)').run('own-device', 'Own', owner.id);
        manager.start(recipe, null, 'mash', 'own-device', 'raw-sensor', { sensorVerified: true });
        expect(manager.getState()).toMatchObject({ status: 'HEATING', sensorAddress: 'raw-sensor', deviceId: 'own-device' });
    });

    it('turns heat off before a failing database stop and supports retrying the persisted stop', () => {
        manager.start(recipe);
        const sessionId = manager.getState().sessionId;
        getDb().exec("CREATE TEMP TRIGGER fail_outbox BEFORE INSERT ON event_outbox BEGIN SELECT RAISE(ABORT,'offline'); END");
        pid.setEnabled.mockClear();
        manager.stop();
        expect(pid.setEnabled).toHaveBeenNthCalledWith(1, false);
        expect(manager.getState()).toMatchObject({ status: 'PAUSED', persistenceError: true, sessionId });
        expect(() => manager.resume()).toThrow('operator acknowledgement');
        getDb().exec('DROP TRIGGER fail_outbox');
        manager.stop();
        expect(sessionQueries.getById(sessionId, owner.id).status).toBe('cancelled');
        expect(manager.getState().status).toBe('IDLE');
    });

    it('fails safe when a phase transition cannot be recorded', () => {
        manager.start(recipe);
        getDb().exec("CREATE TEMP TRIGGER fail_outbox BEFORE INSERT ON event_outbox BEGIN SELECT RAISE(ABORT,'disk full'); END");
        manager.handleSensorData('local_serial', { boiler: 65 });
        expect(pid.setEnabled).toHaveBeenLastCalledWith(false);
        expect(manager.getState()).toMatchObject({ status: 'PAUSED', persistenceError: true });
    });

    it('does not forward a different device reading into an active PID', () => {
        manager.start(recipe);
        manager.handleSensorData('another-device', { boiler: 90 });
        expect(pid.update).not.toHaveBeenCalled();
        expect(manager.getState().status).toBe('HEATING');
    });

    it('retains brew timing and session through mash-to-boil and finalizes only after boil', () => {
        vi.useFakeTimers();
        manager.start(recipe);
        const { sessionId, startTime } = manager.getState();
        vi.advanceTimersByTime(3000);
        manager.complete();
        expect(sessionQueries.getById(sessionId, owner.id).status).toBe('active');
        manager.start({ ...recipe, boil_time: 1 }, sessionId, 'boil');
        expect(manager.getState()).toMatchObject({ startTime, sessionId, elapsedTime: 3, status: 'HEATING' });
        manager.complete();
        expect(sessionQueries.getById(sessionId, owner.id).status).toBe('completed');
        manager.stop();
        expect(sessionQueries.getById(sessionId, owner.id).status).toBe('completed');
    });

    it('presents interrupted snapshots for acknowledgement without automatically resuming hardware', () => {
        manager.start(recipe);
        const sessionId = manager.getState().sessionId;
        clearInterval(manager.timerInterval);
        processEventQueries.markInterrupted();
        const restarted = newManager();
        expect(restarted.manager.getState().recovery).toEqual([expect.objectContaining({ sessionId })]);
        expect(restarted.pid.setEnabled).not.toHaveBeenCalledWith(true);
        expect(() => restarted.manager.start(recipe)).toThrow('operator acknowledgement');
        restarted.manager.stop();
        expect(processEventQueries.getRecoverable(owner.id)).toEqual([]);
        expect(processEventQueries.getRecoverable(other.id)).toEqual([]);
    });

    it('reserves capacity for active stops and never purges pending events by age', () => {
        manager.start(recipe);
        vi.stubEnv('OUTBOX_MAX_PENDING_EVENTS', '3');
        manager.stop();
        expect(rows()).toHaveLength(3);
        expect(manager.getState().status).toBe('IDLE');
        const sessionsBefore = getDb().prepare('SELECT COUNT(*) n FROM brew_sessions').get().n;
        expect(() => manager.start(recipe)).toThrow('storage is full');
        expect(getDb().prepare('SELECT COUNT(*) n FROM brew_sessions').get().n).toBe(sessionsBefore);
        eventOutboxQueries.cleanupPublished('9999-01-01T00:00:00.000Z');
        expect(rows()).toHaveLength(3);
    });
});

describe('outbox delivery and idempotent projection', () => {
    it('blocks later aggregate events on failed head, retrying with the same ID', async () => {
        manager.start(recipe);
        let now = Date.now();
        const publisher = { publish: vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(undefined), disconnect: vi.fn() };
        const config = readKafkaConfig({ APP_ENV: 'test', KAFKA_PUBLISH_ENABLED: 'true', KAFKA_BROKERS: 'unused:9092' });
        const relay = createOutboxRelay({ config, publisher, logger: quiet, now: () => now });
        await relay.runOnce();
        expect(rows()[0].attempts).toBe(1);
        expect(eventOutboxQueries.nextBatch(50, now)).toEqual([]);
        expect(publisher.publish).toHaveBeenCalledTimes(1);
        now += config.retryBaseMs + 1;
        await relay.runOnce();
        expect(publisher.publish.mock.calls[0][0].eventId).toBe(publisher.publish.mock.calls[1][0].eventId);
        expect(rows()[0].published_at).not.toBeNull();
        expect(rows()[1].published_at).toBeNull();
        await relay.runOnce();
        expect(rows()[1].published_at).not.toBeNull();
    });

    it('retries crash window after broker ack and applies an internal effect once', async () => {
        manager.start(recipe);
        const original = eventOutboxQueries.markPublished;
        const markPublished = vi.fn().mockImplementationOnce(() => { throw new Error('crash after ack'); }).mockImplementation(original);
        let now = Date.now();
        const publisher = { publish: vi.fn().mockResolvedValue(undefined), disconnect: vi.fn() };
        const config = readKafkaConfig({ APP_ENV: 'test', KAFKA_PUBLISH_ENABLED: 'true', KAFKA_BROKERS: 'unused:9092' });
        const relay = createOutboxRelay({ config, publisher, store: { ...eventOutboxQueries, markPublished }, logger: quiet, now: () => now });
        await relay.runOnce();
        now += config.retryBaseMs + 1;
        await relay.runOnce();
        const first = JSON.parse(publisher.publish.mock.calls[0][0].value);
        const retry = JSON.parse(publisher.publish.mock.calls[1][0].value);
        expect(retry.eventId).toBe(first.eventId);
        expect(processEventQueries.applyProjection(first)).toEqual({ duplicate: false });
        expect(processEventQueries.applyProjection(retry)).toEqual({ duplicate: true });
        expect(getDb().prepare('SELECT COUNT(*) n FROM processed_events').get().n).toBe(1);
        expect(() => processEventQueries.applyProjection({ ...first, eventId: 'foreign', userId: other.id })).toThrow('owner mismatch');
    });

    it('rolls back inbox on failed projection and rejects sequence gaps', () => {
        manager.start(recipe);
        const [first, second] = rows().map(row => JSON.parse(row.payload));
        getDb().exec("CREATE TEMP TRIGGER fail_projection BEFORE INSERT ON process_event_projection BEGIN SELECT RAISE(ABORT,'injected'); END");
        expect(() => processEventQueries.applyProjection(first)).toThrow('injected');
        expect(getDb().prepare('SELECT COUNT(*) n FROM processed_events').get().n).toBe(0);
        getDb().exec('DROP TRIGGER fail_projection');
        processEventQueries.applyProjection(first);
        expect(() => processEventQueries.applyProjection({ ...second, aggregateSequence: 4 })).toThrow('sequence gap');
        expect(processEventQueries.applyProjection(second)).toEqual({ duplicate: false });
    });

    it('does not access SQLite after a bounded stop while broker send is still pending', async () => {
        manager.start(recipe);
        let finish;
        const publisher = { publish: vi.fn(() => new Promise(resolve => { finish = resolve; })), disconnect: vi.fn() };
        const marked = vi.fn(eventOutboxQueries.markPublished);
        const config = readKafkaConfig({ APP_ENV: 'test', KAFKA_PUBLISH_ENABLED: 'true', KAFKA_BROKERS: 'unused:9092' });
        const relay = createOutboxRelay({ config, publisher, store: { ...eventOutboxQueries, markPublished: marked }, logger: quiet });
        const pending = relay.runOnce();
        await relay.stop({ timeoutMs: 5 });
        finish();
        await pending;
        expect(marked).not.toHaveBeenCalled();
        expect(rows()[0].published_at).toBeNull();
    });

    it('constructs the real idempotent producer and reaches the broker connection', async () => {
        const publisher = createKafkaPublisher(readKafkaConfig({ APP_ENV: 'test', KAFKA_BROKERS: '127.0.0.1:1',
            KAFKA_PUBLISH_ENABLED: 'true', KAFKA_DELIVERY_TIMEOUT_MS: '1000' }));
        try {
            let failure;
            try { await publisher.publish({ topic: 'orangebrew.test.process.events.v1', key: 'synthetic', value: '{}', eventId: 'synthetic' }); }
            catch (error) { failure = error; }
            // Transport failure or connection timeout, never invalid configuration
            // (e.g. zero message retries with enable.idempotence=true).
            expect([-195, -185]).toContain(failure?.code);
        } finally { await publisher.disconnect(); }
    }, 10000);

    it('keeps Kafka client lazy when disabled and waits for delivery acknowledgement when enabled', async () => {
        const factory = vi.fn();
        const disabled = createKafkaPublisher(readKafkaConfig({ APP_ENV: 'test' }), { clientFactory: factory });
        const relay = createOutboxRelay({ config: readKafkaConfig({ APP_ENV: 'test' }), publisher: disabled });
        relay.start();
        await relay.runOnce();
        expect(factory).not.toHaveBeenCalled();
        expect(() => readKafkaConfig({ KAFKA_PUBLISH_ENABLED: 'true' })).toThrow('KAFKA_BROKERS');
        expect(() => readKafkaConfig({ KAFKA_SSL: 'maybe' })).toThrow('KAFKA_SSL');
        let ack;
        const producer = { connect: vi.fn().mockResolvedValue(undefined), send: vi.fn(() => new Promise(resolve => { ack = resolve; })), disconnect: vi.fn() };
        const publisher = createKafkaPublisher(readKafkaConfig({ KAFKA_BROKERS: 'unused:9092' }), { clientFactory: async () => ({ producer: () => producer }) });
        let delivered = false;
        const sending = publisher.publish({ topic: 't', key: 'k', value: '{}', eventId: 'e' }).then(() => { delivered = true; });
        await vi.waitFor(() => expect(producer.send).toHaveBeenCalled());
        expect(delivered).toBe(false);
        ack();
        await sending;
        expect(delivered).toBe(true);
        producer.send.mockResolvedValueOnce(undefined);
        await publisher.publish({ topic: 'dlq', key: 'k', value: { reason: 'failure' }, eventId: 'dlq-1' });
        expect(producer.send).toHaveBeenLastCalledWith(expect.objectContaining({ messages: [{ key: 'k', value: '{"reason":"failure"}', headers: { eventId: 'dlq-1' } }] }));
        await publisher.disconnect();
    });
});
