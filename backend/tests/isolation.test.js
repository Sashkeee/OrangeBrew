/**
 * Multi-tenant isolation tests.
 *
 * Проверяет, что пользователь B не может читать/изменять
 * рецепты, сессии и устройства пользователя A.
 *
 * Все тесты используют два разных req.user.id — без реального JWT.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import { createServer } from 'http';
import { initDatabase, closeDatabase, recipeQueries, sessionQueries, userQueries } from '../db/database.js';
import { join } from 'path';
import { existsSync, unlinkSync } from 'fs';

import recipesRouter from '../routes/recipes.js';
import sessionsRouter from '../routes/sessions.js';
import devicesRouter from '../routes/devices.js';
import controlRouter from '../routes/control.js';

// ─── Test Server Setup ─────────────────────────────────────

const TEST_DB = join(import.meta.dirname, '..', 'data', 'test_isolation.db');

let server, baseUrlA, baseUrlB;
let userA, userB;
let serverA, serverB; // два Express-приложения с разными userId

function makeApp(userId) {
    const app = express();
    app.use(express.json());

    // Мок-аутентификация: всегда req.user = указанный userId
    app.use((req, _res, next) => {
        req.user = { id: userId, role: 'user' };
        next();
    });

    app.use('/api/recipes', recipesRouter);
    app.use('/api/sessions', sessionsRouter);
    app.use('/api/devices', devicesRouter);
    app.use('/api/control', controlRouter);

    return app;
}

function listenAsync(app) {
    return new Promise((resolve) => {
        const s = createServer(app);
        s.listen(0, () => {
            const { port } = s.address();
            resolve({ server: s, url: `http://localhost:${port}` });
        });
    });
}

const api = (baseUrl) => (path, opts = {}) =>
    fetch(`${baseUrl}${path}`, {
        headers: { 'Content-Type': 'application/json' },
        ...opts,
        body: opts.body ? JSON.stringify(opts.body) : undefined,
    });

beforeAll(async () => {
    if (existsSync(TEST_DB)) unlinkSync(TEST_DB);
    await initDatabase(TEST_DB);

    // Создаём двух пользователей
    userA = userQueries.create({ username: 'alice', password_hash: 'x', role: 'user' });
    userB = userQueries.create({ username: 'bob',   password_hash: 'y', role: 'user' });

    const a = await listenAsync(makeApp(userA.id));
    const b = await listenAsync(makeApp(userB.id));

    serverA  = a.server;
    baseUrlA = a.url;
    serverB  = b.server;
    baseUrlB = b.url;
});

afterAll(async () => {
    await Promise.all([
        new Promise((r) => serverA.close(r)),
        new Promise((r) => serverB.close(r)),
    ]);
    closeDatabase();
    if (existsSync(TEST_DB)) unlinkSync(TEST_DB);
});

// ═══════════════════════════════════════════════════════════
//  Recipes isolation
// ═══════════════════════════════════════════════════════════

describe('Recipes — user isolation', () => {
    let aliceRecipeId;

    const recipePayload = {
        name: "Alice's Secret Ale",
        style: 'IPA',
        og: 1.060, fg: 1.012, ibu: 45, abv: 6.3,
        batch_size: 20, boil_time: 60,
        ingredients: [{ name: 'Pale Malt', amount: 5, unit: 'kg' }],
        mash_steps: [{ name: 'Mash', temp: 67, duration: 60 }],
        hop_additions: [{ name: 'Citra', amount: 30, time: 60 }],
    };

    beforeAll(async () => {
        const res = await api(baseUrlA)('/api/recipes', { method: 'POST', body: recipePayload });
        const data = await res.json();
        aliceRecipeId = data.id;
    });

    it('Alice видит свой рецепт в списке', async () => {
        const res = await api(baseUrlA)('/api/recipes');
        const data = await res.json();
        expect(data.some(r => r.id === aliceRecipeId)).toBe(true);
    });

    it('Bob не видит рецепт Alice в своём списке', async () => {
        const res = await api(baseUrlB)('/api/recipes');
        const data = await res.json();
        expect(data.some(r => r.id === aliceRecipeId)).toBe(false);
    });

    it('Bob получает 404 при прямом запросе рецепта Alice', async () => {
        const res = await api(baseUrlB)(`/api/recipes/${aliceRecipeId}`);
        expect(res.status).toBe(404);
    });

    it('Bob не может обновить рецепт Alice (PUT возвращает 404)', async () => {
        const res = await api(baseUrlB)(`/api/recipes/${aliceRecipeId}`, {
            method: 'PUT',
            body: { name: 'Hacked Name' },
        });
        expect(res.status).toBe(404);

        // Имя рецепта у Alice не изменилось
        const check = await api(baseUrlA)(`/api/recipes/${aliceRecipeId}`);
        const data = await check.json();
        expect(data.name).toBe("Alice's Secret Ale");
    });

    it('Bob не может удалить рецепт Alice (DELETE возвращает 404)', async () => {
        const res = await api(baseUrlB)(`/api/recipes/${aliceRecipeId}`, { method: 'DELETE' });
        expect(res.status).toBe(404);

        // Рецепт у Alice всё ещё есть
        const check = await api(baseUrlA)(`/api/recipes/${aliceRecipeId}`);
        expect(check.status).toBe(200);
    });
});

// ═══════════════════════════════════════════════════════════
//  Sessions isolation
// ═══════════════════════════════════════════════════════════

describe('Sessions — user isolation', () => {
    let aliceSessionId;

    beforeAll(async () => {
        const res = await api(baseUrlA)('/api/sessions', {
            method: 'POST',
            body: { type: 'mash', notes: 'Alice private session' },
        });
        const data = await res.json();
        aliceSessionId = data.id;
    });

    it('Alice видит свою сессию', async () => {
        const res = await api(baseUrlA)('/api/sessions');
        const data = await res.json();
        expect(data.some(s => s.id === aliceSessionId)).toBe(true);
    });

    it('Bob не видит сессию Alice в своём списке', async () => {
        const res = await api(baseUrlB)('/api/sessions');
        const data = await res.json();
        expect(data.some(s => s.id === aliceSessionId)).toBe(false);
    });

    it('Bob получает 404 при прямом запросе сессии Alice', async () => {
        const res = await api(baseUrlB)(`/api/sessions/${aliceSessionId}`);
        expect(res.status).toBe(404);
    });

    it('Bob не может обновить сессию Alice (PUT возвращает 404)', async () => {
        const res = await api(baseUrlB)(`/api/sessions/${aliceSessionId}`, {
            method: 'PUT',
            body: { notes: 'Hacked by Bob' },
        });
        expect(res.status).toBe(404);

        // Notes у Alice не изменились
        const check = await api(baseUrlA)(`/api/sessions/${aliceSessionId}`);
        const data = await check.json();
        expect(data.notes).toBe('Alice private session');
    });

    it('Bob не может завершить сессию Alice (POST /complete возвращает 404)', async () => {
        const res = await api(baseUrlB)(`/api/sessions/${aliceSessionId}/complete`, { method: 'POST' });
        expect(res.status).toBe(404);

        // Сессия у Alice всё ещё active
        const check = await api(baseUrlA)(`/api/sessions/${aliceSessionId}`);
        const data = await check.json();
        expect(data.status).toBe('active');
    });

    it('Bob не может удалить сессию Alice (DELETE возвращает 404)', async () => {
        const res = await api(baseUrlB)(`/api/sessions/${aliceSessionId}`, { method: 'DELETE' });
        expect(res.status).toBe(404);

        const check = await api(baseUrlA)(`/api/sessions/${aliceSessionId}`);
        expect(check.status).toBe(200);
    });
});

// ═══════════════════════════════════════════════════════════
//  Control state isolation
// ═══════════════════════════════════════════════════════════

describe('Control state — user isolation', () => {
    it('Alice и Bob имеют независимые состояния нагревателя', async () => {
        // Alice включает нагреватель на 80%
        await api(baseUrlA)('/api/control/heater', { method: 'POST', body: { value: 80 } });

        // Bob проверяет свой нагреватель — должен быть 0
        const res = await api(baseUrlB)('/api/control');
        const state = await res.json();
        expect(state.heater).toBe(0);
    });

    it('Bob включает помпу — у Alice помпа не включается', async () => {
        await api(baseUrlB)('/api/control/pump', { method: 'POST', body: { value: true } });

        const res = await api(baseUrlA)('/api/control');
        const state = await res.json();
        expect(state.pump).toBe(false);
    });

    it('Emergency stop Alice не сбрасывает состояние Bob', async () => {
        // Bob включает нагреватель на 60%
        await api(baseUrlB)('/api/control/heater', { method: 'POST', body: { value: 60 } });

        // Alice делает emergency stop
        await api(baseUrlA)('/api/control/emergency-stop', { method: 'POST' });

        // Состояние Bob остаётся прежним
        const res = await api(baseUrlB)('/api/control');
        const state = await res.json();
        expect(state.heater).toBe(60);
    });
});

// ═══════════════════════════════════════════════════════════
//  Devices isolation
// ═══════════════════════════════════════════════════════════

describe('Devices — user isolation', () => {
    it('Bob не видит устройства Alice', async () => {
        // Проверяем что списки устройств независимы
        const aliceDevices = await (await api(baseUrlA)('/api/devices')).json();
        const bobDevices   = await (await api(baseUrlB)('/api/devices')).json();

        // Устройства Alice не пересекаются с устройствами Bob
        const aliceIds = new Set(aliceDevices.map(d => d.id));
        const bobIds   = new Set(bobDevices.map(d => d.id));
        const intersection = [...aliceIds].filter(id => bobIds.has(id));
        expect(intersection).toHaveLength(0);
    });

    it('Bob не может удалить несуществующее устройство Alice (404)', async () => {
        // Несуществующее устройство — всегда 404
        const res = await api(baseUrlB)('/api/devices/nonexistent-device-id', { method: 'DELETE' });
        expect(res.status).toBe(404);
    });
});

// ═══════════════════════════════════════════════════════════
//  Cross-user recipe import isolation
// ═══════════════════════════════════════════════════════════

describe('Recipe import — создаёт рецепты только для текущего пользователя', () => {
    it('Импорт Bob создаёт рецепт только у Bob, не у Alice', async () => {
        const importPayload = {
            recipes: [{
                name: "Bob's Imported Stout",
                style: 'Stout',
                og: 1.070, fg: 1.018, ibu: 40, abv: 7.0,
                batch_size: 20, boil_time: 60,
                ingredients: [], mash_steps: [], hop_additions: [],
            }]
        };

        const res = await api(baseUrlB)('/api/recipes/import', { method: 'POST', body: importPayload });
        expect(res.status).toBe(200);

        const aliceRecipes = await (await api(baseUrlA)('/api/recipes')).json();
        expect(aliceRecipes.some(r => r.name === "Bob's Imported Stout")).toBe(false);

        const bobRecipes = await (await api(baseUrlB)('/api/recipes')).json();
        expect(bobRecipes.some(r => r.name === "Bob's Imported Stout")).toBe(true);
    });
});
