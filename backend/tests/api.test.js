import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import { createServer } from 'http';
import { initDatabase, closeDatabase, recipeQueries, sessionQueries } from '../db/database.js';
import { addDefaultAdminIfNoneExists } from '../db/seedAuth.js';
import { join } from 'path';
import { existsSync, unlinkSync } from 'fs';

import recipesRouter from '../routes/recipes.js';
import sessionsRouter from '../routes/sessions.js';
import sensorsRouter, { updateSensorReadings } from '../routes/sensors.js';
import controlRouter from '../routes/control.js';
import createSettingsRouter from '../routes/settings.js';

// ─── Test Server Setup ────────────────────────────────────

const TEST_DB = join(import.meta.dirname, '..', 'data', 'test_api.db');
let server, baseUrl;

function createApp() {
    const app = express();
    app.use(express.json());

    // Mock auth — все тесты работают от имени admin (id=1)
    app.use((req, _res, next) => {
        req.user = { id: 1, username: 'admin', role: 'admin' };
        next();
    });

    app.get('/api/health', (req, res) => res.json({ status: 'ok' }));
    app.use('/api/recipes', recipesRouter);
    app.use('/api/sessions', sessionsRouter);
    app.use('/api/sensors', sensorsRouter);
    app.use('/api/control', controlRouter);
    app.use('/api/settings', createSettingsRouter({ pidManager: null }));

    return app;
}

beforeAll(async () => {
    if (existsSync(TEST_DB)) unlinkSync(TEST_DB);
    await initDatabase(TEST_DB);
    await addDefaultAdminIfNoneExists(); // создаёт admin с id=1 (FK для recipes/sessions)

    const app = createApp();
    server = createServer(app);

    await new Promise((resolve) => {
        server.listen(0, () => {
            const { port } = server.address();
            baseUrl = `http://localhost:${port}`;
            resolve();
        });
    });
});

afterAll(async () => {
    await new Promise((resolve) => server.close(resolve));
    closeDatabase();
    if (existsSync(TEST_DB)) unlinkSync(TEST_DB);
});

// Helper
const api = (path, opts = {}) => fetch(`${baseUrl}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
});

// ═══════════════════════════════════════════════════════════
//  Health
// ═══════════════════════════════════════════════════════════

describe('GET /api/health', () => {
    it('should return status ok', async () => {
        const res = await api('/api/health');
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.status).toBe('ok');
    });
});

// ═══════════════════════════════════════════════════════════
//  Recipes API
// ═══════════════════════════════════════════════════════════

describe('Recipes API', () => {
    let recipeId;

    it('POST /api/recipes — should create a recipe', async () => {
        const res = await api('/api/recipes', {
            method: 'POST',
            body: {
                name: 'API Test Ale',
                style: 'Pale Ale',
                og: 1.050,
                fg: 1.010,
                ibu: 35,
                abv: 5.2,
                batch_size: 25,
                boil_time: 60,
                ingredients: [{ name: 'Maris Otter', amount: 4.5, unit: 'kg' }],
                mash_steps: [{ name: 'Mash', temp: 67, duration: 60 }],
                hop_additions: [{ name: 'EKG', amount: 25, time: 60 }],
                notes: 'API test',
            },
        });

        expect(res.status).toBe(201);
        const data = await res.json();
        expect(data.name).toBe('API Test Ale');
        expect(data.id).toBeDefined();
        recipeId = data.id;
    });

    it('GET /api/recipes — should list all recipes', async () => {
        const res = await api('/api/recipes');
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(Array.isArray(data)).toBe(true);
        expect(data.length).toBeGreaterThanOrEqual(1);
        // JSON fields should be parsed
        expect(Array.isArray(data[0].ingredients)).toBe(true);
    });

    it('GET /api/recipes/:id — should return single recipe', async () => {
        const res = await api(`/api/recipes/${recipeId}`);
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.name).toBe('API Test Ale');
        expect(Array.isArray(data.mash_steps)).toBe(true);
    });

    it('GET /api/recipes/:id — 404 for unknown id', async () => {
        const res = await api('/api/recipes/99999');
        expect(res.status).toBe(404);
    });

    it('PUT /api/recipes/:id — should update', async () => {
        const res = await api(`/api/recipes/${recipeId}`, {
            method: 'PUT',
            body: { name: 'Updated API Ale', abv: 5.5 },
        });
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.name).toBe('Updated API Ale');
    });

    it('DELETE /api/recipes/:id — should delete', async () => {
        const res = await api(`/api/recipes/${recipeId}`, { method: 'DELETE' });
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.ok).toBe(true);

        const check = await api(`/api/recipes/${recipeId}`);
        expect(check.status).toBe(404);
    });
});

// ═══════════════════════════════════════════════════════════
//  Sessions API
// ═══════════════════════════════════════════════════════════

describe('Sessions API', () => {
    let sessionId;

    it('POST /api/sessions — should create session', async () => {
        const res = await api('/api/sessions', {
            method: 'POST',
            body: { type: 'mash', notes: 'API test session' },
        });
        expect(res.status).toBe(201);
        const data = await res.json();
        expect(data.type).toBe('mash');
        expect(data.status).toBe('active');
        sessionId = data.id;
    });

    it('GET /api/sessions — should list sessions', async () => {
        const res = await api('/api/sessions');
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.length).toBeGreaterThanOrEqual(1);
    });

    it('GET /api/sessions?type=mash — should filter', async () => {
        await api('/api/sessions', { method: 'POST', body: { type: 'boil' } });
        const res = await api('/api/sessions?type=mash');
        const data = await res.json();
        expect(data.every(s => s.type === 'mash')).toBe(true);
    });

    it('GET /api/sessions/:id — should return session', async () => {
        const res = await api(`/api/sessions/${sessionId}`);
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.id).toBe(sessionId);
    });

    it('PUT /api/sessions/:id — should update session', async () => {
        const res = await api(`/api/sessions/${sessionId}`, {
            method: 'PUT',
            body: { notes: 'Updated via API' },
        });
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.notes).toBe('Updated via API');
    });

    it('POST /api/sessions/:id/complete — should complete session', async () => {
        const res = await api(`/api/sessions/${sessionId}/complete`, { method: 'POST' });
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.status).toBe('completed');
    });

    it('DELETE /api/sessions/:id — should delete', async () => {
        const res = await api(`/api/sessions/${sessionId}`, { method: 'DELETE' });
        expect(res.status).toBe(200);
    });

    // ─── Temperature Sub-routes ───────────────────────────────

    describe('Temperature log sub-routes', () => {
        let sid;
        beforeAll(async () => {
            const res = await api('/api/sessions', { method: 'POST', body: { type: 'mash' } });
            const data = await res.json();
            sid = data.id;
        });

        it('POST /api/sessions/:id/temperatures — should log temp', async () => {
            const res = await api(`/api/sessions/${sid}/temperatures`, {
                method: 'POST',
                body: { sensor: 'boiler', value: 65.5 },
            });
            expect(res.status).toBe(201);
        });

        it('GET /api/sessions/:id/temperatures — should return temps', async () => {
            await api(`/api/sessions/${sid}/temperatures`, {
                method: 'POST',
                body: { sensor: 'column', value: 60 },
            });

            const res = await api(`/api/sessions/${sid}/temperatures`);
            expect(res.status).toBe(200);
            const data = await res.json();
            expect(data.length).toBeGreaterThanOrEqual(2);
        });
    });

    // ─── Fraction Sub-routes ──────────────────────────────────

    describe('Fraction log sub-routes', () => {
        let sid;
        beforeAll(async () => {
            const res = await api('/api/sessions', { method: 'POST', body: { type: 'distillation' } });
            const data = await res.json();
            sid = data.id;
        });

        it('POST /api/sessions/:id/fractions — should add fraction', async () => {
            const res = await api(`/api/sessions/${sid}/fractions`, {
                method: 'POST',
                body: { phase: 'heads', volume: 50, abv: 85 },
            });
            expect(res.status).toBe(201);
        });

        it('GET /api/sessions/:id/fractions — should return fractions', async () => {
            const res = await api(`/api/sessions/${sid}/fractions`);
            expect(res.status).toBe(200);
            const data = await res.json();
            expect(data.length).toBeGreaterThanOrEqual(1);
        });
    });

    // ─── Fermentation Sub-routes ──────────────────────────────

    describe('Fermentation sub-routes', () => {
        let sid;
        beforeAll(async () => {
            const res = await api('/api/sessions', { method: 'POST', body: { type: 'fermentation' } });
            const data = await res.json();
            sid = data.id;
        });

        it('POST /api/sessions/:id/fermentation — should add entry', async () => {
            const res = await api(`/api/sessions/${sid}/fermentation`, {
                method: 'POST',
                body: { stage: 'primary', temperature: 20, gravity: 1.050 },
            });
            expect(res.status).toBe(201);
        });

        it('GET /api/sessions/:id/fermentation — should return entries', async () => {
            const res = await api(`/api/sessions/${sid}/fermentation`);
            expect(res.status).toBe(200);
            const data = await res.json();
            expect(data.length).toBeGreaterThanOrEqual(1);
        });
    });
});

// ═══════════════════════════════════════════════════════════
//  Sensors API
// ═══════════════════════════════════════════════════════════

describe('Sensors API', () => {
    it('GET /api/sensors — should return current readings', async () => {
        updateSensorReadings({ boiler: 65.5, column: 60.0 });
        const res = await api('/api/sensors');
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.boiler.value).toBe(65.5);
        expect(data.column.value).toBe(60.0);
    });

    it('GET /api/sensors/history — should return history', async () => {
        const res = await api('/api/sensors/history?minutes=10');
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(Array.isArray(data)).toBe(true);
    });
});

// ═══════════════════════════════════════════════════════════
//  Control API
// ═══════════════════════════════════════════════════════════

describe('Control API', () => {
    it('GET /api/control — should return current state', async () => {
        const res = await api('/api/control');
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data).toHaveProperty('heater');
        expect(data).toHaveProperty('cooler');
        expect(data).toHaveProperty('pump');
        expect(data).toHaveProperty('dephleg');
    });

    it('POST /api/control/heater — should set heater', async () => {
        const res = await api('/api/control/heater', { method: 'POST', body: { value: 75 } });
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.ok).toBe(true);
        expect(data.heater).toBe(75);
    });

    it('POST /api/control/heater — should clamp to 0-100', async () => {
        const res = await api('/api/control/heater', { method: 'POST', body: { value: 150 } });
        const data = await res.json();
        expect(data.heater).toBe(100);

        const res2 = await api('/api/control/heater', { method: 'POST', body: { value: -10 } });
        const data2 = await res2.json();
        expect(data2.heater).toBe(0);
    });

    it('POST /api/control/cooler — should set cooler', async () => {
        const res = await api('/api/control/cooler', { method: 'POST', body: { value: 50 } });
        const data = await res.json();
        expect(data.ok).toBe(true);
        expect(data.cooler).toBe(50);
    });

    it('POST /api/control/pump — should toggle pump', async () => {
        const res = await api('/api/control/pump', { method: 'POST', body: { value: true } });
        const data = await res.json();
        expect(data.ok).toBe(true);
        expect(data.pump).toBe(true);
    });

    it('POST /api/control/dephleg — should set dephlegmator', async () => {
        const res = await api('/api/control/dephleg', { method: 'POST', body: { value: 80, mode: 'auto' } });
        const data = await res.json();
        expect(data.ok).toBe(true);
        expect(data.dephleg).toBe(80);
        expect(data.mode).toBe('auto');
    });

    it('POST /api/control/emergency-stop — should reset everything', async () => {
        await api('/api/control/heater', { method: 'POST', body: { value: 100 } });
        const res = await api('/api/control/emergency-stop', { method: 'POST' });
        const data = await res.json();
        expect(data.ok).toBe(true);

        const state = await (await api('/api/control')).json();
        expect(state.heater).toBe(0);
        expect(state.cooler).toBe(0);
        expect(state.pump).toBe(false);
        expect(state.dephleg).toBe(0);
    });
});

// ═══════════════════════════════════════════════════════════
//  Settings API
// ═══════════════════════════════════════════════════════════

describe('Settings API', () => {
    it('GET /api/settings — should return settings object', async () => {
        const res = await api('/api/settings');
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(typeof data).toBe('object');
    });

    it('PUT /api/settings — should update settings', async () => {
        const res = await api('/api/settings', {
            method: 'PUT',
            body: { theme: 'dark', language: 'ru' },
        });
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.ok).toBe(true);

        const check = await (await api('/api/settings')).json();
        expect(check.theme).toBe('dark');
        expect(check.language).toBe('ru');
    });

    it('POST /api/settings/test-connection — should respond', async () => {
        const res = await api('/api/settings/test-connection', { method: 'POST' });
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.ok).toBe(true);
    });
});
