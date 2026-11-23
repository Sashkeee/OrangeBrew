import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createServer } from 'node:http';
import WebSocket from 'ws';

const { entries, devices } = vi.hoisted(() => ({ entries: [], devices: {
    getByApiKey: vi.fn(key => key === 'valid-key' ? { id: 'trusted-device', user_id: 42, name: 'Device' } : undefined),
    updateStatus: vi.fn(),
} }));
vi.mock('../db/database.js', () => ({ deviceQueries: devices, pairingQueries: {} }));
vi.mock('../routes/sensors.js', () => ({ getSensorReadings: () => ({}) }));
vi.mock('../routes/control.js', () => ({ getControlState: () => ({}) }));
vi.mock('../config/env.js', () => ({ default: { JWT_SECRET: 'test-only-key' } }));
vi.mock('../utils/logger.js', () => ({ default: { child: bindings => Object.fromEntries(
    ['info', 'warn', 'error', 'debug'].map(level => [level, (metadata, message) => entries.push({ level, bindings, metadata, message })])
) } }));
import { closeWebSocket, getHardwareCount, initWebSocket, onHardwareData } from '../ws/liveServer.js';

describe('WebSocket log boundary', () => {
    let server;
    let endpoint;
    const sockets = [];
    async function connect() {
        const socket = new WebSocket(endpoint);
        sockets.push(socket);
        await new Promise((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });
        return socket;
    }
    beforeAll(async () => {
        server = createServer();
        initWebSocket(server);
        await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
        endpoint = `ws://127.0.0.1:${server.address().port}/ws`;
    });
    afterAll(async () => {
        sockets.forEach(socket => socket.terminate());
        closeWebSocket();
        await new Promise(resolve => server.close(resolve));
    });

    it('does not log a rejected API key or raw malformed authentication payload', async () => {
        const rejected = await connect();
        rejected.send(JSON.stringify({ type: 'auth', api_key: 'canary-rejected-api-key', deviceId: 'device' }));
        await new Promise(resolve => rejected.once('close', resolve));
        const malformed = await connect();
        malformed.send('{"api_key":"canary-malformed-key');
        await new Promise(resolve => malformed.once('close', resolve));
        expect(JSON.stringify(entries)).not.toContain('canary-rejected-api-key');
        expect(JSON.stringify(entries)).not.toContain('canary-malformed-key');
        expect(entries.some(entry => entry.message === 'HW first message rejected')).toBe(true);
    });

    it('assigns device log ownership from authentication and ignores stale connections', async () => {
        const data = vi.fn();
        onHardwareData(data);
        const previous = await connect();
        previous.send(JSON.stringify({ type: 'auth', api_key: 'valid-key' }));
        await vi.waitFor(() => expect(getHardwareCount()).toBe(1));
        const current = await connect();
        const previousAuthCount = devices.getByApiKey.mock.calls.length;
        current.send(JSON.stringify({ type: 'auth', api_key: 'valid-key' }));
        await vi.waitFor(() => expect(devices.getByApiKey.mock.calls.length).toBeGreaterThan(previousAuthCount));
        current.send(JSON.stringify({ type: 'device_log', userId: 999, deviceId: 'forged', source: 'proxy',
            'event.dataset': 'evil', msg: 'token=canary-device-token' }));
        await vi.waitFor(() => expect(entries.some(entry => entry.message === 'token=[REDACTED]')).toBe(true));
        const logged = entries.find(entry => entry.message === 'token=[REDACTED]');
        expect(logged.metadata).toMatchObject({ source: 'device', userId: 42, deviceId: 'trusted-device' });
        expect(logged.metadata).not.toHaveProperty('event.dataset');
        previous.send(JSON.stringify({ type: 'sensors', sensors: [{ temperature: 99 }] }));
        current.send(JSON.stringify({ type: 'sensors', sensors: [{ temperature: 25 }] }));
        await vi.waitFor(() => expect(data).toHaveBeenCalledTimes(1));
        expect(data).toHaveBeenCalledWith('trusted-device', { type: 'sensors', sensors: [{ temperature: 25 }] }, 42);
        expect(JSON.stringify(entries)).not.toContain('canary-device-token');
    });
});
