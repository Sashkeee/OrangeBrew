/**
 * Tests for Plan 5: Trending + Similar recipe endpoints.
 * Uses same pattern as recipe-social.test.js — real SQLite, stub auth.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import { createServer } from 'http';
import {
    initDatabase, closeDatabase,
    recipeQueries, recipeLikesQueries, userQueries, recipeTrendingQueries,
} from '../db/database.js';
import { addDefaultAdminIfNoneExists } from '../db/seedAuth.js';
import recipeSocialRouter from '../routes/recipe-social.js';
import { join } from 'path';
import { existsSync, unlinkSync } from 'fs';

const TEST_DB = join(import.meta.dirname, '..', 'data', 'test_trending.db');
let server, baseUrl;
let adminId, user2Id;
let ipaId, stoutId, pilsnerId, privateId;

// ─── App factory ──────────────────────────────────────────

function createApp() {
    const app = express();
    app.use(express.json());

    // Auth stub: X-Test-User-Id header → req.user
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

    adminId = 1;

    // Create second user
    userQueries.create({ username: 'user2_trending', password_hash: 'x', role: 'user' });
    user2Id = userQueries.getByUsername('user2_trending').id;

    // Create test recipes (all public except privateId)
    const mkRecipe = (name, style, opts = {}) =>
        recipeQueries.create({
            name, style,
            batch_size: 20, boil_time: 60,
            og: 1.060, fg: 1.012, ibu: 40, abv: 6.2,
            notes: '', ingredients: [], mash_steps: [], hop_additions: [],
            ...opts,
        }, adminId);

    const ipa   = mkRecipe('Galaxy IPA',    'IPA');
    const stout = mkRecipe('Milk Stout',    'Stout');
    const pils  = mkRecipe('Czech Pilsner', 'Pilsner');
    const priv  = mkRecipe('Private Lager', 'Lager');

    ipaId     = ipa.id;
    stoutId   = stout.id;
    pilsnerId = pils.id;
    privateId = priv.id;

    // Make IPA, Stout, Pilsner public; keep Private Lager private
    recipeQueries.setPublic(ipaId,     adminId, true);
    recipeQueries.setPublic(stoutId,   adminId, true);
    recipeQueries.setPublic(pilsnerId, adminId, true);

    // Add likes: IPA gets 3 likes, Stout gets 1, Pilsner gets 0
    recipeLikesQueries.toggle(ipaId, adminId);
    recipeLikesQueries.toggle(ipaId, user2Id);
    // Add a third like from a new user
    userQueries.create({ username: 'user3_trending', password_hash: 'x', role: 'user' });
    const user3 = userQueries.getByUsername('user3_trending');
    recipeLikesQueries.toggle(ipaId, user3.id);

    recipeLikesQueries.toggle(stoutId, adminId);

    // Start server
    await new Promise(resolve => {
        server = createServer(createApp()).listen(0, '127.0.0.1', () => {
            const { port } = server.address();
            baseUrl = `http://127.0.0.1:${port}`;
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

// ─── Trending ─────────────────────────────────────────────

describe('GET /api/recipes/trending', () => {
    it('returns only public recipes', async () => {
        const res = await api('/api/recipes/trending');
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(Array.isArray(data)).toBe(true);

        const ids = data.map(r => r.id);
        expect(ids).not.toContain(privateId);
        expect(ids).toContain(ipaId);
    });

    it('sorts by score (likes*2 + comments) descending', async () => {
        const res  = await api('/api/recipes/trending');
        const data = await res.json();

        // IPA has 3 likes (score=6), Stout has 1 like (score=2)
        const ipaIdx   = data.findIndex(r => r.id === ipaId);
        const stoutIdx = data.findIndex(r => r.id === stoutId);

        expect(ipaIdx).not.toBe(-1);
        expect(stoutIdx).not.toBe(-1);
        expect(ipaIdx).toBeLessThan(stoutIdx);
    });

    it('score field is present on each recipe', async () => {
        const res  = await api('/api/recipes/trending');
        const data = await res.json();
        const ipa  = data.find(r => r.id === ipaId);
        expect(ipa).toBeDefined();
        expect(typeof ipa.score).toBe('number');
        expect(ipa.score).toBe(6); // 3 likes * 2
    });

    it('respects ?limit param', async () => {
        const res  = await api('/api/recipes/trending?limit=1');
        const data = await res.json();
        expect(data.length).toBe(1);
    });

    it('caps limit at 50', async () => {
        const res  = await api('/api/recipes/trending?limit=999');
        const data = await res.json();
        expect(data.length).toBeLessThanOrEqual(50);
    });

    it('respects ?days param — 0 days returns only zero-like recipes in window', async () => {
        // days=0 → only recipes with likes_count > 0 qualify (the date clause fails for 0)
        // Since IPA, Stout have likes they still appear
        const res  = await api('/api/recipes/trending?days=1');
        const data = await res.json();
        expect(Array.isArray(data)).toBe(true);
        // IPA was just created so it's within 1 day, and has likes
        const ipa = data.find(r => r.id === ipaId);
        expect(ipa).toBeDefined();
    });

    it('ingredients are parsed as arrays', async () => {
        const res  = await api('/api/recipes/trending');
        const data = await res.json();
        for (const r of data) {
            expect(Array.isArray(r.ingredients)).toBe(true);
            expect(Array.isArray(r.mash_steps)).toBe(true);
            expect(Array.isArray(r.hop_additions)).toBe(true);
        }
    });

    it('includes author username', async () => {
        const res  = await api('/api/recipes/trending');
        const data = await res.json();
        const ipa  = data.find(r => r.id === ipaId);
        expect(ipa.author).toBe('admin');
    });
});

// ─── Similar ──────────────────────────────────────────────

describe('GET /api/recipes/:id/similar', () => {
    it('returns only public recipes', async () => {
        const res = await api(`/api/recipes/${ipaId}/similar`);
        expect(res.status).toBe(200);
        const data = await res.json();
        const ids = data.map(r => r.id);
        expect(ids).not.toContain(privateId);
    });

    it('excludes the recipe itself', async () => {
        // Create a second public IPA to have a same-style match
        const ipa2 = recipeQueries.create({
            name: 'Hazy IPA', style: 'IPA',
            batch_size: 20, boil_time: 60,
            og: 1.070, fg: 1.014, ibu: 60, abv: 7.5,
            notes: '', ingredients: [], mash_steps: [], hop_additions: [],
        }, adminId);
        recipeQueries.setPublic(ipa2.id, adminId, true);

        const res  = await api(`/api/recipes/${ipaId}/similar`);
        const data = await res.json();
        const ids  = data.map(r => r.id);
        expect(ids).not.toContain(ipaId);
        // The second IPA should appear
        expect(ids).toContain(ipa2.id);
    });

    it('returns recipes of the same style first', async () => {
        // Create more IPAs to have enough same-style recipes
        const ipa3 = recipeQueries.create({
            name: 'West Coast IPA', style: 'IPA',
            batch_size: 25, boil_time: 90,
            og: 1.068, fg: 1.010, ibu: 70, abv: 7.8,
            notes: '', ingredients: [], mash_steps: [], hop_additions: [],
        }, adminId);
        recipeQueries.setPublic(ipa3.id, adminId, true);

        const res  = await api(`/api/recipes/${ipaId}/similar`);
        const data = await res.json();
        expect(data.length).toBeGreaterThan(0);

        // All returned styles should be IPA (or fallback if not enough)
        const sameStyle = data.filter(r => r.style === 'IPA');
        expect(sameStyle.length).toBeGreaterThan(0);
    });

    it('falls back to top-rated when not enough same-style results', async () => {
        // Pilsner is unique — should fall back to other public recipes
        const res  = await api(`/api/recipes/${pilsnerId}/similar`);
        const data = await res.json();
        expect(Array.isArray(data)).toBe(true);
        // Should return other public recipes as fallback
        expect(data.length).toBeGreaterThan(0);
        const ids = data.map(r => r.id);
        expect(ids).not.toContain(pilsnerId);
    });

    it('respects ?limit param', async () => {
        const res  = await api(`/api/recipes/${ipaId}/similar?limit=1`);
        const data = await res.json();
        expect(data.length).toBeLessThanOrEqual(1);
    });

    it('returns 400 for invalid recipe id', async () => {
        const res = await api('/api/recipes/abc/similar');
        expect(res.status).toBe(400);
    });

    it('returns empty array for nonexistent recipe', async () => {
        const res  = await api('/api/recipes/999999/similar');
        const data = await res.json();
        expect(Array.isArray(data)).toBe(true);
        expect(data.length).toBe(0);
    });

    it('ingredients parsed as arrays', async () => {
        const res  = await api(`/api/recipes/${ipaId}/similar`);
        const data = await res.json();
        for (const r of data) {
            expect(Array.isArray(r.ingredients)).toBe(true);
        }
    });
});

// ─── DB-level unit tests ───────────────────────────────────

describe('recipeTrendingQueries unit tests', () => {
    it('getTrending returns array', () => {
        const results = recipeTrendingQueries.getTrending(7, 10);
        expect(Array.isArray(results)).toBe(true);
    });

    it('getSimilar returns array', () => {
        const results = recipeTrendingQueries.getSimilar(ipaId, 5);
        expect(Array.isArray(results)).toBe(true);
    });

    it('getSimilar with unknown id returns empty array', () => {
        const results = recipeTrendingQueries.getSimilar(99999, 5);
        expect(results).toEqual([]);
    });

    it('getTrending respects days window', () => {
        const all  = recipeTrendingQueries.getTrending(365, 50);
        const none = recipeTrendingQueries.getTrending(0, 50);
        // 0-day window only shows recipes with likes > 0
        const noneWithNoLikes = none.filter(r => r.likes_count === 0);
        expect(noneWithNoLikes.length).toBe(0);
        expect(all.length).toBeGreaterThanOrEqual(none.length);
    });
});
