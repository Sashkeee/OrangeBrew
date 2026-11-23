import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { initDatabase, closeDatabase, userQueries, settingsQueries, sessionQueries } from '../db/database.js';
import telegram, { getTelegramConfig } from '../services/telegram.js';
import { notificationDelivery } from '../services/notificationDelivery.js';

let first;
let second;
let fetchMock;
let sessionsByUser;
beforeEach(async () => {
    await initDatabase(':memory:');
    first = userQueries.create({ username: 'first', password_hash: 'test', role: 'user' });
    second = userQueries.create({ username: 'second', password_hash: 'test', role: 'user' });
    sessionsByUser = new Map([first, second].map(user => [user.id, sessionQueries.create({ type: 'mash' }, user.id).id]));
    for (const user of [first, second]) settingsQueries.set('telegram', {
        enabled: true, botToken: `fake-token-${user.id}`, chatId: `chat-${user.id}`, notifyInterval: 0,
    }, user.id);
    fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ ok: true }) });
    vi.stubGlobal('fetch', fetchMock);
    vi.stubEnv('NOTIFICATIONS_TRANSPORT', 'direct');
    telegram.initTelegram();
});
afterEach(async () => {
    await telegram.shutdownTelegram();
    closeDatabase();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
});

const eventFor = (userId, eventId = 'test-event') => ({ eventId, userId, sessionId: sessionsByUser.get(userId),
    eventType: 'process.started', occurredAt: new Date().toISOString(), payload: { mode: 'mash' } });

describe('per-user Telegram delivery', () => {
    it('uses only the authenticated recipient and refuses an omitted user', async () => {
        expect((await telegram.sendMessage('hello')).skipped).toBe(true);
        await telegram.sendMessage('hello', { userId: second.id });
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(JSON.parse(fetchMock.mock.calls[0][1].body).chat_id).toBe(`chat-${second.id}`);
        expect(fetchMock.mock.calls[0][0]).toContain(`fake-token-${second.id}`);
    });
    it('does not inherit another user or global Telegram credentials', () => {
        settingsQueries.set('telegram', { enabled: true, botToken: 'global-secret', chatId: 'global-chat' });
        const other = userQueries.create({ username: 'no-config', password_hash: 'test', role: 'user' });
        expect(getTelegramConfig(other.id).enabled).toBe(false);
        expect(getTelegramConfig(other.id).botToken).toBeUndefined();
    });
    it('keeps sensor and process context separate', async () => {
        telegram.updateSensorData({ boiler: 99 }, first.id);
        telegram.updateSensorData({ boiler: 21 }, second.id);
        telegram.setCurrentProcessType('mash', first.id);
        telegram.setCurrentProcessType('fermentation', second.id);
        await telegram.sendStatusReport(second.id);
        const body = JSON.parse(fetchMock.mock.calls[0][1].body);
        expect(body.text).toContain('21°C');
        expect(body.text).toContain('fermentation');
        expect(body.text).not.toContain('99');
    });
    it('does not resend a fresh direct backlog after switching to Kafka', async () => {
        const event = eventFor(first.id);
        await telegram.notifyProcessEvent(event);
        vi.stubEnv('NOTIFICATIONS_TRANSPORT', 'kafka');
        expect((await telegram.notifyProcessEvent(event, { source: 'kafka' })).duplicate).toBe(true);
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });
    it('defers direct delivery in Kafka mode and expires stale Kafka notifications', async () => {
        vi.stubEnv('NOTIFICATIONS_TRANSPORT', 'kafka');
        const event = eventFor(first.id);
        expect((await telegram.notifyProcessEvent(event)).deferred).toBe(true);
        event.occurredAt = new Date(Date.now() - 86400000).toISOString();
        expect((await telegram.notifyProcessEvent(event, { source: 'kafka' })).skipped).toBe(true);
        expect(fetchMock).not.toHaveBeenCalled();
    });
    it('leases concurrent sends and retries after a failed send', async () => {
        expect(notificationDelivery.claim('lease', first.id, 1000)).toBe('claimed');
        expect(notificationDelivery.claim('lease', first.id, 1001)).toBe('busy');
        notificationDelivery.finish('lease', 'failed', 1002);
        expect(notificationDelivery.claim('lease', first.id, 1003)).toBe('claimed');
        expect(() => notificationDelivery.claim('lease', second.id, 1004)).toThrow('owner mismatch');
    });
    it('reports Telegram 429 as retryable without leaking the API response', async () => {
        fetchMock.mockResolvedValueOnce({ ok: false, status: 429,
            json: async () => ({ ok: false, description: 'secret response', parameters: { retry_after: 2 } }) });
        const result = await telegram.notifyProcessEvent(eventFor(first.id));
        expect(result).toMatchObject({ ok: false, retryable: true, retryAfter: 2 });
        expect(JSON.stringify(result)).not.toContain('secret response');
        await telegram.notifyProcessEvent(eventFor(first.id));
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });
    it('bounds a user-supplied interval instead of overflowing Node timers', () => {
        settingsQueries.set('telegram', { enabled: true, botToken: 'fake', chatId: 'fake', notifyInterval: 1e12 }, first.id);
        const spy = vi.spyOn(globalThis, 'setInterval');
        try {
            telegram.initTelegram(first.id);
            expect(spy).toHaveBeenLastCalledWith(expect.any(Function), 86400000);
        } finally { spy.mockRestore(); }
    });
});
