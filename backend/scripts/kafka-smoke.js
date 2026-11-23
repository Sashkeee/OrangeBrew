// Disposable CI broker only: this script creates synthetic process facts.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { initDatabase, closeDatabase, getDb, userQueries, eventOutboxQueries, processEventQueries } from '../db/database.js';
import ProcessManager from '../services/ProcessManager.js';
import { createOutboxRelay } from '../workers/outboxRelay.js';
import { readKafkaConfig, createKafkaPublisher } from '../infrastructure/kafka/client.js';
import { createProcessConsumer } from '../consumers/processConsumer.js';
import telegram from '../services/telegram.js';
import { flushLogs } from '../utils/logger.js';

if (process.env.CI !== 'true' || process.env.APP_ENV !== 'test' || process.env.KAFKA_BROKERS !== 'kafka:9092') {
    throw new Error('Kafka smoke requires the disposable CI test broker');
}
const deadline = setTimeout(() => process.exit(1), 45000);
const config = readKafkaConfig();
const correlationId = `ci-${randomUUID()}`;
const publisher = createKafkaPublisher(config);
const relay = createOutboxRelay({ config, publisher });
let manager;
let consumer;
try {
    await initDatabase(':memory:');
    const owner = userQueries.create({ username: 'ci-smoke', password_hash: 'synthetic', role: 'user' });
    consumer = createProcessConsumer({ name: `orangebrew-test-smoke-${randomUUID()}`, topic: config.topic,
        dlqTopic: `orangebrew.${config.environment}.process.events.dlq.v1`, enabled: true, config,
        handler: event => event.correlationId === correlationId
            ? processEventQueries.applyProjection(event, correlationId) : { skipped: true } });
    consumer.start();
    const connectedBy = Date.now() + 15000;
    while (!consumer.status().connected && Date.now() < connectedBy) await delay(100);
    assert(consumer.status().connected, 'Native consumer failed to connect');

    // No hardware or MockSerial instance is created: PID functions are inert.
    const pid = { setEnabled() {}, setTarget() {}, setMode() {}, setSensorAddress() {} };
    manager = new ProcessManager(pid, owner.id);
    manager.start({ name: 'CI process', mash_steps: [{ name: 'Synthetic step', temp: 65, duration: 1 }] },
        null, 'mash', 'local_serial', null, { correlationId });
    manager.stop();
    const rows = getDb().prepare('SELECT * FROM event_outbox ORDER BY id').all();
    assert.equal(rows.length, 3);
    for (let index = 0; index < rows.length; index++) await relay.runOnce();
    assert.equal(eventOutboxQueries.stats().pendingEvents, 0, 'Broker acknowledgements did not drain outbox');

    const processedBy = Date.now() + 15000;
    while (consumer.status().processed < 3 && Date.now() < processedBy) await delay(100);
    assert.equal(getDb().prepare('SELECT COUNT(*) count FROM processed_events').get().count, 3);
    assert.equal(getDb().prepare('SELECT sequence FROM process_event_projection').get().sequence, 3);
    // Replay the same durable ID through the real broker: effect remains singular.
    await publisher.publish({ topic: rows[0].topic, key: rows[0].message_key, value: rows[0].payload, eventId: rows[0].event_id });
    const replayedBy = Date.now() + 10000;
    while (consumer.status().processed < 4 && Date.now() < replayedBy) await delay(100);
    assert(consumer.status().processed >= 4, 'Duplicate was not read back from Kafka');
    assert.equal(getDb().prepare('SELECT COUNT(*) count FROM processed_events').get().count, 3);
    assert.equal(consumer.status().deadLettered, 0);
    process.stdout.write('PASS: native Kafka outbox acknowledgements, process projection and duplicate replay.\n');
} catch (error) {
    process.stderr.write(`Kafka process smoke failed: ${error.message}\n`);
    process.exitCode = 1;
} finally {
    if (manager?.timerInterval) clearInterval(manager.timerInterval);
    await consumer?.stop({ timeoutMs: 4000 });
    await relay.stop({ timeoutMs: 4000 });
    await telegram.shutdownTelegram({ timeoutMs: 1000 });
    closeDatabase();
    await flushLogs({ timeoutMs: 500 });
    clearTimeout(deadline);
}
