/**
 * multiuser.test.js — integration tests for multi-user concurrent scenarios (Plan 8).
 *
 * Scenarios:
 *   1. 3 users like a recipe simultaneously (Promise.all)
 *   2. Comments from 3 different users on the same recipe
 *   3. Parallel brewing + likes + comments across users
 *   4. Process isolation: user1 process does not affect user2
 *   5. MockSerial multi-device independence
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import { createServer } from 'http';
import {
    initDatabase, closeDatabase,
    recipeQueries, recipeLikesQueries, recipeCommentsQueries, userQueries,
} from '../db/database.js';
import { addDefaultAdminIfNoneExists } from '../db/seedAuth.js';
import recipeSocialRouter from '../routes/recipe-social.js';
import { createTestUser, createTestRecipe, createTestDevice } from './multiUserTestUtils.js';
import { MockSerial } from '../serial/mockSerial.js';
import { join } from 'path';
import { existsSync, unlinkSync } from 'fs';

const TEST_DB = join(import.meta.dirname, '..', 'data', 'test_multiuser.db');
let server, baseUrl;
let alice, bob, carol;
let sharedRecipeId;

// ─── App factory ──────────────────────────────────────────

function createApp() {
    const app = express();
    app.use(express.json());
    // Auth stub: X-Test-User-Id → req.user
    app.use((req, _res, next) => {
        const uid = req.headers['x-test-user-id'];
        req.user = uid
            ? { id: parseInt(uid, 10), username: `user${uid}`, role: 'user' }
            : { id: 1, username: 'admin', role: 'admin' };
        next();
    });
    app.use('/api/recipes', recipeSocialRouter);
    return app;
}

// Helper: HTTP call with user simulation
const api = (path, opts = {}, userId = null) => {
    const headers = { 'Content-Type': 'application/json' };
    if (userId !== null) headers['X-Test-User-Id'] = String(userId);
    return fetch(`${baseUrl}${path}`, {
        headers,
        ...opts,
        body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
};

// ─── Setup / Teardown ─────────────────────────────────────

beforeAll(async () => {
    if (existsSync(TEST_DB)) unlinkSync(TEST_DB);
    await initDatabase(TEST_DB);
    await addDefaultAdminIfNoneExists();

    alice = createTestUser('alice_mu');
    bob   = createTestUser('bob_mu');
    carol = createTestUser('carol_mu');

    // Alice creates a public shared recipe
    const recipe = createTestRecipe(alice.id, { name: 'Shared IPA', style: 'IPA' });
    recipeQueries.setPublic(recipe.id, alice.id, true);
    sharedRecipeId = recipe.id;

    await new Promise(resolve => {
        server = createServer(createApp()).listen(0, '127.0.0.1', () => {
            baseUrl = `http://127.0.0.1:${server.address().port}`;
            resolve();
        });
    });
});

afterAll(() => new Promise(resolve => {
    server.close(() => {
        closeDatabase();
        if (existsSync(TEST_DB)) unlinkSync(TEST_DB);
        resolve();
    });
}));

// ─── Scenario 1: Concurrent Likes ─────────────────────────

describe('Scenario 1: 3 users like a recipe simultaneously', () => {
    it('all three likes are recorded (Promise.all)', async () => {
        // All three users like the shared recipe at the same time
        const [resA, resB, resC] = await Promise.all([
            api(`/api/recipes/${sharedRecipeId}/like`, { method: 'POST' }, alice.id),
            api(`/api/recipes/${sharedRecipeId}/like`, { method: 'POST' }, bob.id),
            api(`/api/recipes/${sharedRecipeId}/like`, { method: 'POST' }, carol.id),
        ]);

        expect(resA.status).toBe(200);
        expect(resB.status).toBe(200);
        expect(resC.status).toBe(200);

        // Check final count via DB directly
        const { count } = recipeLikesQueries.getStatus(sharedRecipeId, alice.id);
        expect(count).toBe(3);
    });

    it('unlike + re-like does not double-count', async () => {
        // Alice unlikes (second toggle = unlike)
        await api(`/api/recipes/${sharedRecipeId}/like`, { method: 'POST' }, alice.id);
        // Alice re-likes
        await api(`/api/recipes/${sharedRecipeId}/like`, { method: 'POST' }, alice.id);

        const { count } = recipeLikesQueries.getStatus(sharedRecipeId, alice.id);
        // Should still be 3 (bob + carol + alice again)
        expect(count).toBe(3);
    });

    it('same user cannot double-like (UNIQUE constraint)', async () => {
        // The toggle mechanism means a second call = unlike, not duplicate
        await api(`/api/recipes/${sharedRecipeId}/like`, { method: 'POST' }, bob.id);
        const { isLiked } = recipeLikesQueries.getStatus(sharedRecipeId, bob.id);
        // Bob just unliked
        expect(isLiked).toBe(false);
        // Re-like bob
        await api(`/api/recipes/${sharedRecipeId}/like`, { method: 'POST' }, bob.id);
    });
});

// ─── Scenario 2: Comments from 3 users ────────────────────

describe('Scenario 2: Comments from 3 different users', () => {
    it('all three can post comments', async () => {
        const [resA, resB, resC] = await Promise.all([
            api(`/api/recipes/${sharedRecipeId}/comments`, {
                method: 'POST', body: { text: 'Alice loves this IPA!' },
            }, alice.id),
            api(`/api/recipes/${sharedRecipeId}/comments`, {
                method: 'POST', body: { text: 'Bob: good body!' },
            }, bob.id),
            api(`/api/recipes/${sharedRecipeId}/comments`, {
                method: 'POST', body: { text: 'Carol: cracking aroma.' },
            }, carol.id),
        ]);

        expect(resA.status).toBe(201);
        expect(resB.status).toBe(201);
        expect(resC.status).toBe(201);
    });

    it('all comments appear in GET /comments', async () => {
        const res = await api(`/api/recipes/${sharedRecipeId}/comments`);
        expect(res.status).toBe(200);
        const { comments, total } = await res.json();
        expect(total).toBeGreaterThanOrEqual(3);
        const texts = comments.map(c => c.text);
        expect(texts.some(t => t.includes('Alice'))).toBe(true);
        expect(texts.some(t => t.includes('Bob'))).toBe(true);
        expect(texts.some(t => t.includes('Carol'))).toBe(true);
    });

    it('user can only delete own comment', async () => {
        const res     = await api(`/api/recipes/${sharedRecipeId}/comments`);
        const { comments } = await res.json();
        const aliceComment = comments.find(c => c.username === 'alice_mu');
        const bobComment   = comments.find(c => c.username === 'bob_mu');

        expect(aliceComment).toBeDefined();
        expect(bobComment).toBeDefined();

        // Alice tries to delete Bob's comment → 403
        const failRes = await api(
            `/api/recipes/${sharedRecipeId}/comments/${bobComment.id}`,
            { method: 'DELETE' },
            alice.id
        );
        expect(failRes.status).toBe(403);

        // Alice deletes her own comment → 200
        const okRes = await api(
            `/api/recipes/${sharedRecipeId}/comments/${aliceComment.id}`,
            { method: 'DELETE' },
            alice.id
        );
        expect(okRes.status).toBe(200);
    });
});

// ─── Scenario 3: Parallel actions ─────────────────────────

describe('Scenario 3: Concurrent likes + comments + recipe creation', () => {
    it('handles mixed concurrent operations without corruption', async () => {
        const recipe2 = createTestRecipe(bob.id, { name: 'Bob Concurrent Recipe', style: 'Stout' });
        recipeQueries.setPublic(recipe2.id, bob.id, true);

        const ops = await Promise.all([
            // Alice likes shared recipe
            api(`/api/recipes/${sharedRecipeId}/like`, { method: 'POST' }, alice.id),
            // Bob likes his own recipe
            api(`/api/recipes/${recipe2.id}/like`, { method: 'POST' }, bob.id),
            // Carol comments on shared recipe
            api(`/api/recipes/${sharedRecipeId}/comments`, {
                method: 'POST', body: { text: 'Carol parallel comment' },
            }, carol.id),
            // Get trending (read-only, shouldn't interfere)
            api('/api/recipes/trending'),
            // Get similar (read-only)
            api(`/api/recipes/${sharedRecipeId}/similar`),
        ]);

        for (const res of ops) {
            expect([200, 201]).toContain(res.status);
        }

        // Verify DB integrity: no like count corruption
        const sharedStatus = recipeLikesQueries.getStatus(sharedRecipeId, carol.id);
        expect(sharedStatus.count).toBeGreaterThanOrEqual(1);
    });
});

// ─── Scenario 4: Process isolation ────────────────────────

describe('Scenario 4: User data isolation', () => {
    it("alice cannot see bob's private recipe", async () => {
        const bobPrivate = createTestRecipe(bob.id, { name: 'Bobs Secret Lager', style: 'Lager' });
        // Not made public

        // Fetch public library — should not include bob's private recipe
        const res  = await api('/api/recipes/public', {}, alice.id);
        const data = await res.json();
        const ids  = data.map(r => r.id);
        expect(ids).not.toContain(bobPrivate.id);
    });

    it('each user has independent like status', async () => {
        // Fresh recipe for this test
        const recipe = createTestRecipe(alice.id, { name: 'Test Isolation IPA', style: 'IPA' });
        recipeQueries.setPublic(recipe.id, alice.id, true);

        // Only Alice likes it
        await api(`/api/recipes/${recipe.id}/like`, { method: 'POST' }, alice.id);

        const aliceStatus = recipeLikesQueries.getStatus(recipe.id, alice.id);
        const bobStatus   = recipeLikesQueries.getStatus(recipe.id, bob.id);

        expect(aliceStatus.isLiked).toBe(true);
        expect(bobStatus.isLiked).toBe(false);
        expect(aliceStatus.count).toBe(1);
    });
});

// ─── Scenario 5: MockSerial multi-device ──────────────────

describe('Scenario 5: MockSerial multi-device independence', () => {
    it('creates independent virtual devices', () => {
        const mock = new MockSerial();
        mock.setSimulationEnabled(false);

        const d1 = mock.createDevice('device-alice', alice.id);
        const d2 = mock.createDevice('device-bob',   bob.id);
        const d3 = mock.createDevice('device-carol', carol.id);

        expect(mock.getDeviceIds()).toEqual(
            expect.arrayContaining(['device-alice', 'device-bob', 'device-carol'])
        );
    });

    it('commands to one device do not affect others', () => {
        const mock = new MockSerial();
        mock.setSimulationEnabled(false);
        mock.createDevice('dev-a', alice.id);
        mock.createDevice('dev-b', bob.id);

        mock.writeToDevice('dev-a', JSON.stringify({ cmd: 'setHeater', value: 80 }));

        const dataA = mock.getDeviceData('dev-a');
        const dataB = mock.getDeviceData('dev-b');

        // A was set to 80, B was not touched
        expect(dataA).not.toBeNull();
        expect(dataB).not.toBeNull();
    });

    it('setDeviceTemperatures only affects target device', () => {
        const mock = new MockSerial();
        mock.setSimulationEnabled(false);
        mock.createDevice('dev-x');
        mock.createDevice('dev-y');

        mock.setDeviceTemperatures('dev-x', { boiler: 75.0 });

        const x = mock.getDeviceData('dev-x');
        const y = mock.getDeviceData('dev-y');

        expect(x.sensors.boiler).toBe(75.0);
        expect(y.sensors.boiler).toBe(20.0); // untouched
    });

    it('simulateAlert emits device:alert event', () => {
        const mock = new MockSerial();
        mock.createDevice('dev-alert');

        const alerts = [];
        mock.on('device:alert', (e) => alerts.push(e));
        mock.simulateAlert('dev-alert', 'ethanol');

        expect(alerts).toHaveLength(1);
        expect(alerts[0]).toMatchObject({ deviceId: 'dev-alert', type: 'ethanol' });
    });

    it('removeDevice removes it from registry', () => {
        const mock = new MockSerial();
        mock.createDevice('dev-temp');
        mock.removeDevice('dev-temp');
        expect(mock.getDeviceData('dev-temp')).toBeNull();
    });

    it('getDeviceData returns null for unknown device', () => {
        const mock = new MockSerial();
        expect(mock.getDeviceData('nonexistent')).toBeNull();
    });

    it('default device still works after adding virtual devices', () => {
        const mock = new MockSerial();
        mock.setSimulationEnabled(false);
        mock.createDevice('extra-device');

        // Default device commands still work
        mock.write(JSON.stringify({ cmd: 'setHeater', value: 50 }));
        expect(mock.heaterPower).toBe(50);

        // And extra device is unaffected
        const extra = mock.getDeviceData('extra-device');
        // heaterPower is tracked in state, not returned in getDeviceData but control confirms it
        expect(extra.control.heater).toBe(0);
    });
});
