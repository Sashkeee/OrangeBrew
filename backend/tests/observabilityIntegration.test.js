import { afterEach, describe, expect, it, vi } from 'vitest';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { closeDatabase, getDb, initDatabase, sessionQueries, settingsQueries, userQueries } from '../db/database.js';
import telegram from '../services/telegram.js';

describe('notification ownership and shutdown regressions', () => {
    afterEach(async () => {
        await telegram.shutdownTelegram({ timeoutMs: 100 });
        closeDatabase();
        vi.unstubAllGlobals();
        vi.unstubAllEnvs();
    });
    async function fixture() {
        await initDatabase(':memory:');
        const owner = userQueries.create({ username: 'owner', password_hash: 'synthetic', role: 'user' });
        const stranger = userQueries.create({ username: 'stranger', password_hash: 'synthetic', role: 'user' });
        const session = sessionQueries.create({ type: 'mash' }, owner.id);
        for (const user of [owner, stranger]) settingsQueries.set('telegram', {
            enabled: true, botToken: `synthetic-token-${user.id}`, chatId: `synthetic-chat-${user.id}`, notifyInterval: 0,
        }, user.id);
        vi.stubEnv('NOTIFICATIONS_TRANSPORT', 'direct');
        telegram.initTelegram();
        const event = { eventId: 'synthetic-event', eventType: 'process.started', userId: owner.id,
            sessionId: session.id, occurredAt: new Date().toISOString(), payload: {} };
        return { owner, stranger, session, event };
    }
    it('rejects a valid recipient paired with a different user session before sending or claiming', async () => {
        const { stranger, event } = await fixture();
        const fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);
        const result = await telegram.notifyProcessEvent({ ...event, userId: stranger.id });
        expect(result).toMatchObject({ ok: false, retryable: false });
        expect(fetchMock).not.toHaveBeenCalled();
        expect(getDb().prepare('SELECT COUNT(*) count FROM notification_delivery').get().count).toBe(0);
    });
    it('aborts pending Telegram HTTP and settles its ledger before SQLite closes', async () => {
        const { event } = await fixture();
        let signal;
        vi.stubGlobal('fetch', vi.fn((_url, options) => {
            signal = options.signal;
            return new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new Error('synthetic abort')), { once: true }));
        }));
        const delivery = telegram.notifyProcessEvent(event);
        expect(signal.aborted).toBe(false);
        await telegram.shutdownTelegram({ timeoutMs: 200 });
        expect(signal.aborted).toBe(true);
        expect(getDb().prepare('SELECT status FROM notification_delivery WHERE event_id=?').get(event.eventId).status).toBe('failed');
        closeDatabase();
        await expect(delivery).resolves.toMatchObject({ ok: false, retryable: true });
    });
});

const backendDirectory = fileURLToPath(new URL('../', import.meta.url));
async function startServer(overrides = {}) {
    const directory = await mkdtemp(join(tmpdir(), 'orangebrew-observability-'));
    const probe = createServer();
    await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
    const port = probe.address().port;
    await new Promise(resolve => probe.close(resolve));
    const database = join(directory, 'test.db');
    // IPC exercises the real SIGTERM handler on Windows, where child.kill('SIGTERM')
    // terminates the process directly without dispatching a JavaScript signal event.
    const wrapper = "process.on('message', message => { if (message === 'shutdown') process.emit('SIGTERM'); }); await import('./server.js');";
    const child = spawn(process.execPath, ['--input-type=module', '-e', wrapper], {
        cwd: backendDirectory, stdio: ['ignore', 'pipe', 'pipe', 'ipc'], windowsHide: true,
        env: { ...process.env, NODE_ENV: 'test', APP_ENV: 'test', PORT: String(port), DB_PATH: database,
            DOTENV_CONFIG_PATH: join(directory, 'absent.env'), JWT_SECRET: 'synthetic-observability-test-key',
            CONNECTION_TYPE: 'mock', LOG_FORMAT: 'json', LOG_LEVEL: 'info', SWAGGER_ENABLED: 'false',
            EVENTS_CAPTURE_ENABLED: 'true', KAFKA_PUBLISH_ENABLED: 'false', KAFKA_BROKERS: '',
            KAFKA_SASL_USERNAME: '', KAFKA_SASL_PASSWORD: '', KAFKA_SSL: 'false',
            NOTIFICATIONS_TRANSPORT: 'direct', TELEGRAM_BOT_TOKEN: '', TELEGRAM_CHAT_ID: '', TELEGRAM_OWNER_USER_ID: '',
            ...overrides },
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    const exited = new Promise((resolve, reject) => { child.once('exit', (code, signal) => resolve({ code, signal })); child.once('error', reject); });
    const baseUrl = `http://127.0.0.1:${port}`;
    async function ready() {
        const deadline = Date.now() + 10000;
        while (Date.now() < deadline) {
            if (child.exitCode !== null) throw new Error(`Server exited ${child.exitCode}: ${stderr}\n${stdout}`);
            try {
                const response = await fetch(`${baseUrl}/api/health`, { signal: AbortSignal.timeout(200) });
                if (response.ok) { await response.text(); return; }
            } catch { /* poll the isolated local child */ }
            await new Promise(resolve => setTimeout(resolve, 25));
        }
        throw new Error(`Server did not become ready: ${stderr}\n${stdout}`);
    }
    return { baseUrl, database, ready, logs: () => ({ stdout, stderr }),
        async stop() {
            if (child.exitCode !== null) return exited;
            if (child.connected) child.send('shutdown');
            let timer;
            try {
                return await Promise.race([exited, new Promise((_resolve, reject) => { timer = setTimeout(() => reject(new Error(`Server exceeded bounded shutdown. stdout=${stdout.slice(-6000)} stderr=${stderr.slice(-3000)}`)), 7000); })]);
            } finally { clearTimeout(timer); }
        },
        async cleanup() {
            if (child.exitCode === null) { child.kill(); await exited; }
            if (!directory.startsWith(join(tmpdir(), 'orangebrew-observability-'))) throw new Error('Unexpected test directory');
            await rm(directory, { recursive: true, force: true });
        },
    };
}

describe('real backend HTTP and shutdown smoke', () => {
    it('starts without Kafka, captures a mock process and closes safely with valid ECS output', async () => {
        const instance = await startServer();
        try {
            await instance.ready();
            const login = await fetch(`${instance.baseUrl}/auth/login`, { method: 'POST',
                headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'admin', password: 'admin123' }) });
            expect(login.status).toBe(200);
            const { token } = await login.json();
            const headers = { authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'x-request-id': 'real-server-smoke' };
            const started = await fetch(`${instance.baseUrl}/api/process/start?token=synthetic-query-secret`, {
                method: 'POST', headers, body: JSON.stringify({ recipe: { name: 'Synthetic mash', mash_steps: [{ name: 'Test step', temp: 65, duration: 1 }] }, mode: 'mash' }),
            });
            expect(started.status).toBe(200);
            await started.text();
            const status = await fetch(`${instance.baseUrl}/api/admin/observability`, { headers });
            const diagnostics = await status.json();
            expect(diagnostics.outbox.pendingEvents).toBeGreaterThanOrEqual(2);
            expect(diagnostics.relay.enabled).toBe(false);
            expect(await instance.stop()).toEqual({ code: 0, signal: null });
            const { stdout } = instance.logs();
            const rows = stdout.trim().split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
            expect(rows.find(row => row.message === 'Goodbye!')).toBeDefined();
            expect(rows.find(row => row['orangebrew.request.id'] === 'real-server-smoke' && row['http.response.status_code'] === 200)).toBeDefined();
            expect(stdout).not.toContain(token);
            expect(stdout).not.toContain('synthetic-query-secret');
            expect(stdout).not.toContain('Unhandled promise rejection');
            const db = new Database(instance.database, { readonly: true });
            try {
                expect(db.prepare('SELECT status FROM brew_sessions LIMIT 1').get().status).toBe('cancelled');
                expect(db.prepare('SELECT COUNT(*) count FROM event_outbox').get().count).toBeGreaterThanOrEqual(3);
            } finally { db.close(); }
        } finally { await instance.cleanup(); }
    }, 15000);

    it('keeps HTTP live and shutdown bounded when enabled Kafka cannot connect', async () => {
        const instance = await startServer({ KAFKA_PUBLISH_ENABLED: 'true', KAFKA_BROKERS: '127.0.0.1:1', KAFKA_DELIVERY_TIMEOUT_MS: '1000' });
        try {
            await instance.ready();
            expect((await fetch(`${instance.baseUrl}/api/health`)).status).toBe(200);
            const login = await fetch(`${instance.baseUrl}/auth/login`, { method: 'POST',
                headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'admin', password: 'admin123' }) });
            const { token } = await login.json();
            const started = await fetch(`${instance.baseUrl}/api/process/start`, { method: 'POST',
                headers: { 'Content-Type': 'application/json', authorization: `Bearer ${token}` },
                body: JSON.stringify({ recipe: { name: 'Offline Kafka', mash_steps: [{ name: 'Step', temp: 65, duration: 1 }] }, mode: 'mash' }) });
            expect(started.status).toBe(200);
            await started.text();
            // Let the outbox relay enter producer.connect as well as the consumer.
            await new Promise(resolve => setTimeout(resolve, 1200));
            expect(await instance.stop()).toEqual({ code: 0, signal: null });
            expect(instance.logs().stdout).not.toContain('Unhandled promise rejection');
        } finally { await instance.cleanup(); }
    }, 15000);
});
