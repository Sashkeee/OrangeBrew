/**
 * Tests for recipe social features: public library, likes, comments.
 * Uses the same pattern as api.test.js — real SQLite, mocked auth.
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
import { join } from 'path';
import { existsSync, unlinkSync } from 'fs';

const TEST_DB = join(import.meta.dirname, '..', 'data', 'test_social.db');
let server, baseUrl;
let adminId, user2Id, recipeId;

// Build a minimal Express app where req.user can be overridden per-test
function createApp() {
    const app = express();
    app.use(express.json());

    // Auth stub — tests mutate this to simulate different users
    app.use((req, _res, next) => {
        req.user = req._testUser ?? { id: 1, username: 'admin', role: 'admin' };
        next();
    });

    app.use('/api/recipes', recipeSocialRouter);
    return app;
}

// Helper: fetch wrapper
const api = (path, opts = {}, userId = null) => {
    const headers = { 'Content-Type': 'application/json' };
    // Pass user id via header — intercepted by a middleware added below
    if (userId !== null) headers['X-Test-User-Id'] = String(userId);
    return fetch(`${baseUrl}${path}`, {
        headers,
        ...opts,
        body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
};

beforeAll(async () => {
    if (existsSync(TEST_DB)) unlinkSync(TEST_DB);
    await initDatabase(TEST_DB);
    await addDefaultAdminIfNoneExists();

    adminId = 1;

    // Create a second user
    userQueries.create({ username: 'user2', password_hash: 'x', role: 'user' });
    const u2 = userQueries.getByUsername('user2');
    user2Id = u2.id;

    // Create a recipe owned by admin
    const recipe = recipeQueries.create({
        name: 'Test IPA', style: 'IPA', batch_size: 20,
        boil_time: 60, og: 1.065, fg: 1.012,
        ibu: 50, abv: 7.0, notes: '', ingredients: [], mash_steps: [], hop_additions: [],
    }, adminId);
    recipeId = recipe.id;

    const app = createApp();

    // Middleware to simulate different users from X-Test-User-Id header
    app.use((req, _res, next) => next()); // no-op (user already set above)

    // Override user based on test header (re-set in the actual middleware)
    const appWithUserSwitch = express();
    appWithUserSwitch.use(express.json());
    appWithUserSwitch.use((req, _res, next) => {
        const testUserId = req.headers['x-test-user-id'];
        req.user = testUserId
            ? { id: parseInt(testUserId, 10), username: `user${testUserId}`, role: 'user' }
            : { id: adminId, username: 'admin', role: 'admin' };
        next();
    });
    appWithUserSwitch.use('/api/recipes', recipeSocialRouter);

    server = createServer(appWithUserSwitch);
    await new Promise(resolve => server.listen(0, () => {
        baseUrl = `http://localhost:${server.address().port}`;
        resolve();
    }));
});

afterAll(async () => {
    await new Promise(resolve => server.close(resolve));
    closeDatabase();
    if (existsSync(TEST_DB)) unlinkSync(TEST_DB);
});

// ─── DB-level unit tests ───────────────────────────────────

describe('recipeQueries.getPublic / setPublic', () => {
    it('recipe is private by default', () => {
        const r = recipeQueries.getById(recipeId);
        expect(r.is_public).toBe(0);
    });

    it('setPublic makes recipe visible', () => {
        recipeQueries.setPublic(recipeId, adminId, true);
        const pubs = recipeQueries.getPublic();
        expect(pubs.some(r => r.id === recipeId)).toBe(true);
    });

    it('setPublic(false) removes from public list', () => {
        recipeQueries.setPublic(recipeId, adminId, false);
        const pubs = recipeQueries.getPublic();
        expect(pubs.some(r => r.id === recipeId)).toBe(false);
    });
});

describe('recipeLikesQueries', () => {
    it('toggle adds a like', () => {
        const { liked, count } = recipeLikesQueries.toggle(recipeId, adminId);
        expect(liked).toBe(true);
        expect(count).toBe(1);
    });

    it('toggle again removes the like', () => {
        const { liked, count } = recipeLikesQueries.toggle(recipeId, adminId);
        expect(liked).toBe(false);
        expect(count).toBe(0);
    });

    it('two users liking the same recipe gives count=2', () => {
        recipeLikesQueries.toggle(recipeId, adminId);
        const { count } = recipeLikesQueries.toggle(recipeId, user2Id);
        expect(count).toBe(2);
        // cleanup
        recipeLikesQueries.toggle(recipeId, adminId);
        recipeLikesQueries.toggle(recipeId, user2Id);
    });

    it('getStatus returns correct isLiked', () => {
        recipeLikesQueries.toggle(recipeId, adminId);
        const status = recipeLikesQueries.getStatus(recipeId, adminId);
        expect(status.isLiked).toBe(true);
        expect(status.count).toBe(1);
        recipeLikesQueries.toggle(recipeId, adminId);
    });
});

describe('recipeCommentsQueries', () => {
    it('create returns comment with username', () => {
        const comment = recipeCommentsQueries.create(recipeId, adminId, 'Hello!');
        expect(comment.text).toBe('Hello!');
        expect(comment.username).toBe('admin');
    });

    it('getByRecipe returns list in order', () => {
        const { comments, total } = recipeCommentsQueries.getByRecipe(recipeId);
        expect(total).toBeGreaterThanOrEqual(1);
        expect(comments[0].text).toBe('Hello!');
    });

    it('softDelete removes comment from list', () => {
        const c = recipeCommentsQueries.create(recipeId, adminId, 'To delete');
        const result = recipeCommentsQueries.softDelete(c.id, adminId);
        expect(result).toBe(true);
        const { comments } = recipeCommentsQueries.getByRecipe(recipeId);
        expect(comments.every(x => x.id !== c.id)).toBe(true);
    });

    it('softDelete returns false for wrong user', () => {
        const c = recipeCommentsQueries.create(recipeId, adminId, 'Mine');
        const result = recipeCommentsQueries.softDelete(c.id, user2Id);
        expect(result).toBe(false);
    });
});

// ─── HTTP endpoint tests ───────────────────────────────────

describe('GET /api/recipes/public', () => {
    it('returns only public recipes', async () => {
        recipeQueries.setPublic(recipeId, adminId, true);
        const res = await api('/api/recipes/public');
        const data = await res.json();
        expect(res.status).toBe(200);
        expect(data.some(r => r.id === recipeId)).toBe(true);
        recipeQueries.setPublic(recipeId, adminId, false);
    });
});

describe('POST /api/recipes/:id/publish', () => {
    it('owner can publish', async () => {
        const res = await api(`/api/recipes/${recipeId}/publish`, {
            method: 'POST', body: { isPublic: true },
        }, adminId);
        expect(res.status).toBe(200);
        recipeQueries.setPublic(recipeId, adminId, false);
    });

    it('non-owner gets 404', async () => {
        const res = await api(`/api/recipes/${recipeId}/publish`, {
            method: 'POST', body: { isPublic: true },
        }, user2Id);
        expect(res.status).toBe(404);
    });

    it('missing isPublic returns 400', async () => {
        const res = await api(`/api/recipes/${recipeId}/publish`, {
            method: 'POST', body: {},
        }, adminId);
        expect(res.status).toBe(400);
    });
});

describe('POST /api/recipes/:id/like', () => {
    it('toggles like on', async () => {
        const res = await api(`/api/recipes/${recipeId}/like`, { method: 'POST' }, adminId);
        const data = await res.json();
        expect(res.status).toBe(200);
        expect(data.liked).toBe(true);
        // cleanup
        await api(`/api/recipes/${recipeId}/like`, { method: 'POST' }, adminId);
    });
});

describe('POST /api/recipes/:id/comments + DELETE', () => {
    it('creates and deletes own comment', async () => {
        const post = await api(`/api/recipes/${recipeId}/comments`, {
            method: 'POST', body: { text: 'HTTP test comment' },
        }, adminId);
        expect(post.status).toBe(201);
        const { comment } = await post.json();
        expect(comment.text).toBe('HTTP test comment');

        const del = await api(`/api/recipes/${recipeId}/comments/${comment.id}`, {
            method: 'DELETE',
        }, adminId);
        expect(del.status).toBe(200);
    });

    it('cannot delete another user\'s comment', async () => {
        const post = await api(`/api/recipes/${recipeId}/comments`, {
            method: 'POST', body: { text: 'Admin comment' },
        }, adminId);
        const { comment } = await post.json();

        const del = await api(`/api/recipes/${recipeId}/comments/${comment.id}`, {
            method: 'DELETE',
        }, user2Id);
        expect(del.status).toBe(403);
    });

    it('rejects comment longer than 1000 chars', async () => {
        const res = await api(`/api/recipes/${recipeId}/comments`, {
            method: 'POST', body: { text: 'x'.repeat(1001) },
        }, adminId);
        expect(res.status).toBe(400);
    });
});
