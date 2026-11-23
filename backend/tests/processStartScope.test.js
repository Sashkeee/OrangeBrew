import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import express from 'express';
import processRouter from '../routes/process.js';
import { updateDiscoveredSensors, isDiscoveredSensorForDevice } from '../routes/sensors.js';

vi.mock('../utils/audit.js', () => ({ writeAudit: vi.fn() }));
const processManager = { start: vi.fn(), getState: () => ({ status: 'HEATING' }) };
let server, base;
beforeAll(async () => {
    const app = express();
    app.use(express.json());
    app.use((req, res, next) => { req.user = { id: 7301 }; req.processManager = processManager; next(); });
    app.use('/process', processRouter);
    server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    base = `http://127.0.0.1:${server.address().port}`;
});
afterAll(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });

describe('process start raw sensor verification', () => {
    it('accepts only a fresh server observation for the exact tenant and device', () => {
        const now = Date.now();
        updateDiscoveredSensors(7301, [{ address: 'raw-scope-test', temp: 20 }], 'owner-device');
        expect(isDiscoveredSensorForDevice(7301, 'owner-device', 'raw-scope-test', now + 5)).toBe(true);
        expect(isDiscoveredSensorForDevice(7302, 'owner-device', 'raw-scope-test', now + 5)).toBe(false);
        expect(isDiscoveredSensorForDevice(7301, 'different-device', 'raw-scope-test', now + 5)).toBe(false);
        expect(isDiscoveredSensorForDevice(7301, 'owner-device', 'raw-scope-test', now + 60001)).toBe(false);
    });

    it('derives trusted context on the server and ignores a body claiming sensor verification', async () => {
        updateDiscoveredSensors(7301, [{ address: 'raw-http-test', temp: 20 }], 'owner-device');
        const send = body => fetch(`${base}/process/start`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ recipe: { mash_steps: [{ temp: 65, duration: 60 }] }, ...body }) });
        expect((await send({ deviceId: 'owner-device', sensorAddress: 'raw-http-test' })).status).toBe(200);
        expect(processManager.start.mock.calls.at(-1)[5].sensorVerified).toBe(true);
        expect((await send({ deviceId: 'different-device', sensorAddress: 'raw-http-test', sensorVerified: true,
            context: { sensorVerified: true } })).status).toBe(200);
        expect(processManager.start.mock.calls.at(-1)[5].sensorVerified).toBe(false);
    });
});
