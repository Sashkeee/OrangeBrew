import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer, get } from 'node:http';
import express from 'express';
import winston from 'winston';
import { createAppLogger } from '../utils/logger.js';
import { createRequestLogger } from '../middleware/requestLogger.js';
import { errorHandler } from '../middleware/errorHandler.js';
import { setLogContext } from '../utils/logContext.js';

describe('HTTP logging integration', () => {
    const records = [];
    const output = createAppLogger({ format: 'json', environment: 'test', transport: new winston.Transport({
        log(info, callback) { records.push(JSON.parse(info[Symbol.for('message')])); callback(); },
    }) });
    let server;
    let baseUrl;
    beforeAll(async () => {
        const app = express();
        app.use(createRequestLogger({ logger: output.logger }));
        app.use((req, _res, next) => { req.user = { id: 42 }; setLogContext({ userId: req.user.id }); next(); });
        app.get('/api/items/:id', async (req, res) => {
            await new Promise(resolve => setTimeout(resolve, req.params.id === 'slow' ? 10 : 1));
            output.logger.child({ module: 'Route' }).info('nested async work');
            res.json({ ok: true });
        });
        app.get('/api/failure', (_req, _res, next) => next(new Error('password=hidden-error-secret')));
        app.get('/api/missing', (_req, res) => res.status(404).json({ error: 'missing' }));
        app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));
        app.get('/api/abort', (_req, res) => {
            res.write('starting');
            const timer = setTimeout(() => res.end('finished'), 1000);
            res.once('close', () => clearTimeout(timer));
        });
        app.use(errorHandler);
        server = createServer(app);
        await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
        baseUrl = `http://127.0.0.1:${server.address().port}`;
    });
    afterAll(async () => {
        await new Promise(resolve => server.close(resolve));
        await output.close();
    });

    it('links concurrent requests to their async child logs, excludes queries and headers', async () => {
        const results = await Promise.all(['slow', 'fast'].map(id => fetch(`${baseUrl}/api/items/${id}?token=hidden-query`, {
            headers: { 'x-request-id': `request-${id}`, authorization: 'Bearer hidden-header', cookie: 'session=hidden-cookie' },
        })));
        for (let index = 0; index < results.length; index++) {
            expect(results[index].headers.get('x-request-id')).toBe(index === 0 ? 'request-slow' : 'request-fast');
            await results[index].text();
        }
        await output.flush();
        for (const id of ['slow', 'fast']) {
            const linked = records.filter(row => row['orangebrew.request.id'] === `request-${id}`);
            expect(linked).toHaveLength(2);
            expect(linked.find(row => row['log.logger'] === 'HTTP')).toMatchObject({
                'http.request.method': 'GET', 'http.response.status_code': 200, 'user.id': '42',
                'url.path': `/api/items/${id}`, 'orangebrew.http.route': '/api/items/:id',
            });
            expect(linked.find(row => row['log.logger'] === 'Route')['user.id']).toBe('42');
            expect(linked.find(row => row['log.logger'] === 'HTTP')['event.duration']).toBeGreaterThan(0);
        }
        const json = JSON.stringify(records);
        for (const secret of ['hidden-query', 'hidden-header', 'hidden-cookie']) expect(json).not.toContain(secret);
    });

    it('uses correct HTTP severity and correlates sanitized route errors', async () => {
        const failed = await fetch(`${baseUrl}/api/failure?api_key=hidden-query`, { headers: { 'x-request-id': 'failure' } });
        expect(await failed.json()).toEqual({ error: 'Internal server error' });
        await (await fetch(`${baseUrl}/api/missing`, { headers: { 'x-request-id': 'missing' } })).text();
        await output.flush();
        expect(records.find(row => row['orangebrew.request.id'] === 'failure' && row['event.action'] === 'http.request_completed')).toMatchObject({ 'log.level': 'error', 'http.response.status_code': 500 });
        expect(records.find(row => row['orangebrew.request.id'] === 'missing')).toMatchObject({ 'log.level': 'warn', 'http.response.status_code': 404 });
        expect(records.find(row => row.error)?.error.stack_trace).toContain('Error');
        expect(JSON.stringify(records)).not.toContain('hidden-error-secret');
    });

    it('generates an ID for invalid input and skips health completion events', async () => {
        const response = await fetch(`${baseUrl}/api/health?token=hidden`, { headers: { 'x-request-id': 'invalid id' } });
        const id = response.headers.get('x-request-id');
        expect(id).toMatch(/^[a-f0-9-]{36}$/);
        await response.text();
        await output.flush();
        expect(records.find(row => row['orangebrew.request.id'] === id)).toBeUndefined();
    });

    it('emits one aborted request event when a response closes before finish', async () => {
        await new Promise((resolve, reject) => {
            const request = get(`${baseUrl}/api/abort`, { headers: { 'x-request-id': 'aborted-request' } }, response => {
                response.once('data', () => { response.destroy(); resolve(); });
            });
            request.on('error', reject);
        });
        for (let tries = 0; tries < 20 && !records.some(row => row['orangebrew.request.id'] === 'aborted-request'); tries++) {
            await new Promise(resolve => setTimeout(resolve, 5));
        }
        const aborted = records.filter(row => row['orangebrew.request.id'] === 'aborted-request');
        expect(aborted).toHaveLength(1);
        expect(aborted[0]).toMatchObject({ 'event.action': 'http.request_aborted', 'http.response.status_code': 499, 'log.level': 'warn' });
    });
});
