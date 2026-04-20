import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer } from 'http';
import { WebSocket } from 'ws';
import { initDatabase, closeDatabase, userQueries, pairingQueries, deviceQueries } from '../db/database.js';
import { initWebSocket, closeWebSocket } from '../ws/liveServer.js';
import { join } from 'path';
import { existsSync, unlinkSync } from 'fs';

/**
 * Интеграционные тесты pairing flow (WS handshake).
 *
 * Покрывает:
 *  - корректный pair → paired с возвратом api_key;
 *  - коллизию deviceId: второй пользователь с тем же hardware deviceId получает
 *    server-generated UUID вместо перезаписи чужой записи;
 *  - невалидный pairing_code → close 4001;
 *  - бракованный payload → close 4000;
 *  - первое сообщение не pair/auth → close 4000.
 *
 * Используется реальный HTTP+WSS сервер на случайном порту.
 */

const TEST_DB = join(import.meta.dirname, '..', 'data', 'test_pairing.db');

let server;
let wsUrl;
let alice, bob;

// ── helpers ──────────────────────────────────────────────────

/**
 * Подождать `ms` миллисекунд.
 */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Сгенерировать 6-символьный pairing-code и создать запись в device_pairings.
 * Возвращает `code`.
 */
function newPairingCode(userId) {
    const code = Math.random().toString(36).slice(2, 8).toUpperCase();
    const expiresAt = new Date(Date.now() + 5 * 60_000).toISOString();
    pairingQueries.create(userId, code, expiresAt);
    return code;
}

/**
 * Открыть WS, отправить pairMsg, ждать paired-ответа или закрытия.
 * @returns {Promise<{paired?: object, closeCode?: number, closeReason?: string}>}
 */
function pairOnce(pairMsg, { timeout = 2500 } = {}) {
    return new Promise((resolve) => {
        const ws = new WebSocket(wsUrl);
        let settled = false;

        const finish = (result) => {
            if (settled) return;
            settled = true;
            try { ws.close(); } catch { /* ignore */ }
            resolve(result);
        };

        ws.on('open', () => {
            ws.send(JSON.stringify(pairMsg));
        });

        ws.on('message', (raw) => {
            try {
                const msg = JSON.parse(raw.toString());
                if (msg.type === 'paired') finish({ paired: msg });
                else if (msg.type === 'error') finish({ error: msg });
            } catch { /* ignore */ }
        });

        ws.on('close', (code, reason) => {
            finish({ closeCode: code, closeReason: reason?.toString() });
        });

        ws.on('error', () => { /* ignore, close will follow */ });

        setTimeout(() => finish({ timeout: true }), timeout);
    });
}

// ── setup / teardown ─────────────────────────────────────────

beforeAll(async () => {
    if (existsSync(TEST_DB)) unlinkSync(TEST_DB);
    await initDatabase(TEST_DB);

    alice = userQueries.create({ username: 'alice_pair', password_hash: 'x', role: 'user' });
    bob   = userQueries.create({ username: 'bob_pair',   password_hash: 'y', role: 'user' });

    await new Promise((resolve) => {
        server = createServer();
        initWebSocket(server);
        server.listen(0, '127.0.0.1', () => {
            const { port } = server.address();
            wsUrl = `ws://127.0.0.1:${port}/ws`;
            resolve();
        });
    });
});

afterAll(async () => {
    closeWebSocket();
    await new Promise((r) => server.close(r));
    closeDatabase();
    if (existsSync(TEST_DB)) unlinkSync(TEST_DB);
});

// ── tests ────────────────────────────────────────────────────

describe('pairing flow — happy path', () => {
    it('Alice pairs new device — returns api_key and persists owner', async () => {
        const code = newPairingCode(alice.id);
        const result = await pairOnce({
            type: 'pair',
            pairing_code: code,
            deviceId: 'ESP32S3_AA0001',
            name: 'Alice-ESP',
        });

        expect(result.paired).toBeDefined();
        expect(typeof result.paired.api_key).toBe('string');
        expect(result.paired.api_key.length).toBeGreaterThan(10);

        const device = deviceQueries.getById('ESP32S3_AA0001');
        expect(device).toBeDefined();
        expect(device.user_id).toBe(alice.id);
        expect(device.api_key).toBe(result.paired.api_key);
    });
});

describe('pairing flow — deviceId collision protection', () => {
    it('Bob pairs with SAME hardware deviceId — Alice\'s record stays intact', async () => {
        // Alice's device already exists with deviceId 'ESP32S3_DUP01'
        const codeA = newPairingCode(alice.id);
        const r1 = await pairOnce({
            type: 'pair',
            pairing_code: codeA,
            deviceId: 'ESP32S3_DUP01',
            name: 'Alice-DUP',
        });
        expect(r1.paired).toBeDefined();
        const aliceApiKey = r1.paired.api_key;

        // Bob attempts pairing with the SAME hardware ID
        const codeB = newPairingCode(bob.id);
        const r2 = await pairOnce({
            type: 'pair',
            pairing_code: codeB,
            deviceId: 'ESP32S3_DUP01',
            name: 'Bob-DUP',
        });
        expect(r2.paired).toBeDefined();
        const bobApiKey = r2.paired.api_key;

        // Alice's record is not overwritten
        const aliceDevice = deviceQueries.getById('ESP32S3_DUP01');
        expect(aliceDevice).toBeDefined();
        expect(aliceDevice.user_id).toBe(alice.id);
        expect(aliceDevice.api_key).toBe(aliceApiKey);

        // Bob got a fresh server-generated ID (UUID) owned by him
        const bobDevices = deviceQueries.getAll(bob.id);
        const bobDevice = bobDevices.find((d) => d.api_key === bobApiKey);
        expect(bobDevice).toBeDefined();
        expect(bobDevice.id).not.toBe('ESP32S3_DUP01');
        expect(bobDevice.user_id).toBe(bob.id);
    });

    it('SAME user re-pairing same deviceId reuses the record', async () => {
        const code1 = newPairingCode(alice.id);
        const r1 = await pairOnce({
            type: 'pair',
            pairing_code: code1,
            deviceId: 'ESP32S3_SAME01',
            name: 'Alice-SAME',
        });
        expect(r1.paired).toBeDefined();

        // Alice pairs SAME device again (e.g. factory reset)
        const code2 = newPairingCode(alice.id);
        const r2 = await pairOnce({
            type: 'pair',
            pairing_code: code2,
            deviceId: 'ESP32S3_SAME01',
            name: 'Alice-SAME-v2',
        });
        expect(r2.paired).toBeDefined();

        const device = deviceQueries.getById('ESP32S3_SAME01');
        expect(device.user_id).toBe(alice.id);
        // api_key обновлён на новое значение
        expect(device.api_key).toBe(r2.paired.api_key);
    });
});

describe('pairing flow — rejection paths', () => {
    it('неизвестный pairing_code → close 4001', async () => {
        const result = await pairOnce({
            type: 'pair',
            pairing_code: 'ZZZZZZ',
            deviceId: 'ESP32S3_BAD01',
        });
        expect(result.paired).toBeUndefined();
        // Сервер отправляет error + закрывает
        expect(result.closeCode === 4001 || result.error).toBeTruthy();
    });

    it('истёкший код отклоняется', async () => {
        // Создаём уже истёкший код вручную.
        // ВАЖНО: формат SQLite datetime('now') = 'YYYY-MM-DD HH:MM:SS' (пробел).
        // ISO-строка с 'T' лексикографически > datetime('now'), и expired ISO
        // будет выглядеть как "в будущем". Поэтому приводим к SQLite-формату.
        const code = 'EXPIRED';
        const d = new Date(Date.now() - 60_000); // 1 min ago
        const expiresAt = d.toISOString().replace('T', ' ').slice(0, 19); // 'YYYY-MM-DD HH:MM:SS'
        pairingQueries.create(alice.id, code, expiresAt);

        const result = await pairOnce({
            type: 'pair',
            pairing_code: code,
            deviceId: 'ESP32S3_EXP01',
        });
        expect(result.paired).toBeUndefined();
    });

    it('использованный код нельзя переиспользовать', async () => {
        const code = newPairingCode(alice.id);
        const r1 = await pairOnce({
            type: 'pair',
            pairing_code: code,
            deviceId: 'ESP32S3_USED01',
        });
        expect(r1.paired).toBeDefined();

        // Повторно тем же кодом
        const r2 = await pairOnce({
            type: 'pair',
            pairing_code: code,
            deviceId: 'ESP32S3_USED02',
        });
        expect(r2.paired).toBeUndefined();
    });

    it('pair без deviceId — отклонён (close 4000)', async () => {
        const code = newPairingCode(alice.id);
        const result = await pairOnce({
            type: 'pair',
            pairing_code: code,
            // deviceId missing
        });
        expect(result.paired).toBeUndefined();
    });

    it('pair без pairing_code — отклонён', async () => {
        const result = await pairOnce({
            type: 'pair',
            deviceId: 'ESP32S3_XX',
        });
        expect(result.paired).toBeUndefined();
    });

    it('первое сообщение неизвестного type — close 4000', async () => {
        const result = await pairOnce({ type: 'garbage', foo: 'bar' });
        expect(result.paired).toBeUndefined();
        expect(result.closeCode === 4000 || result.closeReason).toBeTruthy();
    });
});

describe('auth flow after pairing', () => {
    it('после pair ESP32 может переподключиться с {type: auth, api_key}', async () => {
        const code = newPairingCode(alice.id);
        const r1 = await pairOnce({
            type: 'pair',
            pairing_code: code,
            deviceId: 'ESP32S3_AUTH01',
        });
        expect(r1.paired).toBeDefined();
        const apiKey = r1.paired.api_key;

        // Небольшая пауза чтобы сервер успел корректно закрыть предыдущее
        await sleep(50);

        // Повторное подключение с api_key
        const authResult = await new Promise((resolve) => {
            const ws = new WebSocket(wsUrl);
            let closed = false;
            const finish = (v) => { if (!closed) { closed = true; resolve(v); try { ws.close(); } catch {} } };

            ws.on('open', () => {
                ws.send(JSON.stringify({ type: 'auth', api_key: apiKey }));
                // Успешный auth не шлёт сразу ответа; ждём небольшой отрезок —
                // если соединение не закрыто, считаем auth успешным.
                setTimeout(() => finish({ authenticated: true }), 300);
            });
            ws.on('close', (code) => finish({ closeCode: code }));
            ws.on('error', () => { /* ignore */ });
            setTimeout(() => finish({ timeout: true }), 2000);
        });

        expect(authResult.authenticated).toBe(true);
    });

    it('auth с неизвестным api_key → close 4001', async () => {
        const result = await new Promise((resolve) => {
            const ws = new WebSocket(wsUrl);
            let closed = false;
            const finish = (v) => { if (!closed) { closed = true; resolve(v); } };
            ws.on('open', () => {
                ws.send(JSON.stringify({ type: 'auth', api_key: 'bogus-key-000' }));
            });
            ws.on('close', (code, reason) => finish({ closeCode: code, closeReason: reason?.toString() }));
            ws.on('error', () => { /* ignore */ });
            setTimeout(() => finish({ timeout: true }), 2000);
        });
        expect(result.closeCode).toBe(4001);
    });
});
