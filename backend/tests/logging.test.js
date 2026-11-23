import { afterEach, describe, expect, it } from 'vitest';
import winston from 'winston';
import { createAppLogger } from '../utils/logger.js';
import { getLogContext, runWithLogContext, setLogContext } from '../utils/logContext.js';
import { redact, safeUrlPath, sanitizeText } from '../utils/redact.js';
import { createDeviceLogHandler } from '../utils/deviceLog.js';

const instances = [];
function capture(options = {}) {
    const lines = [];
    const transport = new winston.Transport({ log(info, callback) {
        lines.push(info[Symbol.for('message')]);
        callback();
    } });
    const instance = createAppLogger({ transport, format: 'json', environment: 'test', ...options });
    instances.push(instance);
    return { ...instance, lines, records: () => lines.map(line => JSON.parse(line)) };
}
afterEach(async () => { await Promise.all(instances.splice(0).map(instance => instance.close({ timeoutMs: 20 }))); });

describe('application logging contract', () => {
    it('keeps child bindings, ECS fields, errors, fatal and independent event IDs', async () => {
        const output = capture({ level: 'trace' });
        const child = output.logger.child({ module: 'ProcessManager', userId: 42 }).child({ deviceId: 'device-a' });
        const error = new TypeError('token=canary-secret');
        child.error({ err: error, sessionId: 7 }, 'Failed API key=canary-key');
        child.fatal('Fatal shutdown');
        child.trace({ phase: 2 }, 'Trace detail');
        expect(await output.flush()).toBe(true);
        const [record, fatal, trace] = output.records();
        expect(record).toMatchObject({
            'log.level': 'error', 'log.logger': 'ProcessManager', 'user.id': '42',
            'orangebrew.device.id': 'device-a', 'orangebrew.session.id': '7',
            'event.dataset': 'orangebrew.backend', 'deployment.environment.name': 'test',
            'service.name': 'orangebrew-backend', error: { type: 'TypeError' },
        });
        expect(record['@timestamp']).toMatch(/^\d{4}-/);
        expect(record.error.stack_trace).toContain('TypeError');
        expect(output.lines.join('\n')).not.toContain('canary-secret');
        expect(output.lines.join('\n')).not.toContain('canary-key');
        expect(new Set([record, fatal, trace].map(entry => entry['event.id'])).size).toBe(3);
        expect(fatal['log.level']).toBe('fatal');
        expect(trace['log.level']).toBe('trace');
        expect(error.message).toBe('token=canary-secret');
    });

    it('honors filtering and prevents payloads from changing routing or deployment', async () => {
        const output = capture({ level: 'warn' });
        output.logger.info('hidden');
        output.logger.warn({ source: 'device', 'event.dataset': 'evil', 'event.id': 'spoof',
            'service.name': 'evil', service: { name: 'evil' }, 'deployment.environment.name': 'prod',
            data_stream: { namespace: 'evil' }, api_key: 'secret' }, 'visible');
        await output.flush();
        expect(output.records()).toHaveLength(1);
        expect(output.records()[0]).toMatchObject({ 'event.dataset': 'orangebrew.device',
            'service.name': 'orangebrew-backend', 'deployment.environment.name': 'test', api_key: '[REDACTED]' });
        expect(output.records()[0]).not.toHaveProperty('source');
        expect(output.records()[0]['event.id']).not.toBe('spoof');
        expect(output.records()[0]).not.toHaveProperty('data_stream');
        output.logger.warn({ deviceId: { bogus: true }, req: { body: { private: 'private-payload' } }, body: 'private-payload' }, 'Untrusted metadata');
        await output.flush();
        expect(output.records()[1]).not.toHaveProperty('orangebrew.device.id');
        expect(output.lines[1]).not.toContain('private-payload');
    });

    it('keeps overlapping asynchronous request contexts isolated', async () => {
        const output = capture();
        await Promise.all(['request-a', 'request-b'].map((requestId, index) => runWithLogContext({ requestId }, async () => {
            await new Promise(resolve => setTimeout(resolve, 5 - index));
            setLogContext({ sessionId: index });
            output.logger.info('async work');
        })));
        await output.flush();
        const rows = output.records();
        expect(rows.find(row => row['orangebrew.request.id'] === 'request-a')['orangebrew.session.id']).toBe('0');
        expect(rows.find(row => row['orangebrew.request.id'] === 'request-b')['orangebrew.session.id']).toBe('1');
        expect(getLogContext()).toEqual({});
    });

    it('caps encoded records and does not invoke metadata getters', async () => {
        const output = capture();
        const metadata = Object.fromEntries(Array.from({ length: 100 }, (_value, index) => [`field${index}`, '\\'.repeat(8192)]));
        Object.defineProperty(metadata, 'getter', { enumerable: true, get() { throw new Error('do not invoke'); } });
        output.logger.info(metadata, 'Huge data');
        await output.flush();
        expect(Buffer.byteLength(output.lines[0])).toBeLessThanOrEqual(65536);
        expect(output.records()[0]['orangebrew.log.truncated']).toBe(true);
    });

    it('bounds a stalled transport and flush timeout', async () => {
        const transport = new winston.Transport({ log(_info, _callback) {} });
        const instance = createAppLogger({ transport, format: 'json' });
        instances.push(instance);
        for (let count = 0; count < 1100; count++) instance.logger.info('pending');
        expect(instance.logger.getStats()).toMatchObject({ pending: 1024, dropped: 76 });
        expect(await instance.flush({ timeoutMs: 10 })).toBe(false);
    });
});

describe('secret removal before stdout', () => {
    it('redacts nested secrets, URL queries, headers and Error without mutating inputs', () => {
        const input = { apiKey: 'key-1', headers: { authorization: 'Bearer key-2', cookie: 'session=key-3' },
            originalUrl: '/ws?token=key-4', nested: { pairing_code: 'key-5' }, err: new Error('password=key-6') };
        const result = redact(input);
        expect(result.apiKey).toBe('[REDACTED]');
        expect(result.headers.authorization).toBe('[REDACTED]');
        expect(result.originalUrl).toBe('/ws');
        expect(result.err).toBeInstanceOf(Error);
        expect(result.err.stack).not.toContain('key-6');
        expect(input.apiKey).toBe('key-1');
        const text = sanitizeText('https://user:pass@example.com/a?%74oken=hidden Bearer bearer-secret\nCookie: one=1;two=secret\n{"api_key":"json-secret"}');
        for (const value of ['hidden', 'bearer-secret', 'two=secret', 'json-secret', 'user:pass']) expect(text).not.toContain(value);
        expect(safeUrlPath('/api?q=secret#token')).toBe('/api');
        expect(sanitizeText(sanitizeText('password=secret'))).toBe(sanitizeText('password=secret'));
    });
});

describe('device logging boundary', () => {
    it('uses server identity and bounds bytes/rate independently per device', async () => {
        const output = capture({ level: 'debug' });
        let time = 0;
        const handler = createDeviceLogHandler({ logger: output.logger, now: () => time, maxBytes: 30, maxPerWindow: 2, windowMs: 100 });
        const identity = { deviceId: 'server-device', userId: 42 };
        handler.handle({ level: 'info', msg: 'password=hidden ' + 'ж'.repeat(100), deviceId: 'fake', userId: 666, 'event.dataset': 'evil' }, identity);
        handler.handle({ level: 'fatal', msg: 'hello' }, identity);
        expect(handler.handle({ msg: 'dropped' }, identity)).toBe(false);
        expect(handler.handle({ msg: 'other' }, { deviceId: 'other', userId: 43 })).toBe(true);
        time = 101;
        handler.handle({ msg: 'new window' }, identity);
        await output.flush();
        const [first, second] = output.records();
        expect(first).toMatchObject({ 'event.dataset': 'orangebrew.device', 'user.id': '42', 'orangebrew.device.id': 'server-device', 'orangebrew.log.truncated': true });
        expect(Buffer.byteLength(first.message)).toBeLessThanOrEqual(30);
        expect(first.message).not.toContain('hidden');
        expect(second['log.level']).toBe('info');
        expect(handler.getStats()).toEqual({ accepted: 4, dropped: 1, truncated: 1 });
        expect(output.records().find(row => row['event.action'] === 'device.log.rate_limited')['orangebrew.log.dropped']).toBe(1);
    });
});
