/**
 * recipe-social.js — API endpoints for public library, search, likes, and comments.
 * Mounted at: /api/recipes (alongside existing recipes.js).
 *
 * Endpoints:
 *   GET    /api/recipes/public               — public recipe library
 *   GET    /api/recipes/search               — FTS5 full-text search
 *   GET    /api/recipes/styles               — distinct styles for filter
 *   POST   /api/recipes/:id/publish          — toggle is_public
 *   POST   /api/recipes/:id/like             — toggle like
 *   GET    /api/recipes/:id/likes            — like status for current user
 *   POST   /api/recipes/:id/comments         — add comment
 *   GET    /api/recipes/:id/comments         — list comments (paginated)
 *   DELETE /api/recipes/:id/comments/:cid    — soft-delete comment (author only)
 */

import { Router } from 'express';
import {
    recipeLikesQueries, recipeCommentsQueries,
    recipeQueries, recipeSearchQueries, recipeTrendingQueries,
} from '../db/database.js';

const router = Router();

// ─── Public Library ───────────────────────────────────────

/**
 * GET /api/recipes/public — returns all public recipes (sorted by likes desc).
 * Includes author username, likes_count, comments_count.
 */
router.get('/public', (req, res) => {
    const limit  = Math.min(parseInt(req.query.limit,  10) || 50, 100);
    const offset = Math.max(parseInt(req.query.offset, 10) || 0,  0);

    try {
        const recipes = recipeQueries.getPublic(limit, offset).map(r => ({
            ...r,
            ingredients:   JSON.parse(r.ingredients   || '[]'),
            mash_steps:    JSON.parse(r.mash_steps    || '[]'),
            hop_additions: JSON.parse(r.hop_additions || '[]'),
        }));
        res.json(recipes);
    } catch (err) {
        console.error('[public] list failed:', err);
        res.status(500).json({ error: 'Failed to list public recipes' });
    }
});

// ─── Search ───────────────────────────────────────────────

/**
 * GET /api/recipes/search — FTS5 search across public recipes.
 * Query params: q (text), style, limit, offset
 */
router.get('/search', (req, res) => {
    const q      = (req.query.q     || '').slice(0, 200);
    const style  = req.query.style  || null;
    const limit  = Math.min(parseInt(req.query.limit,  10) || 20, 50);
    const offset = Math.max(parseInt(req.query.offset, 10) || 0,  0);

    try {
        const recipes = recipeSearchQueries.searchPublic(q, style, limit, offset).map(r => ({
            ...r,
            ingredients:   JSON.parse(r.ingredients   || '[]'),
            mash_steps:    JSON.parse(r.mash_steps    || '[]'),
            hop_additions: JSON.parse(r.hop_additions || '[]'),
        }));
        res.json(recipes);
    } catch (err) {
        console.error('[search] failed:', err);
        res.status(500).json({ error: 'Search failed' });
    }
});

/**
 * GET /api/recipes/styles — distinct styles for filter dropdown.
 */
router.get('/styles', (req, res) => {
    try {
        const styles = recipeSearchQueries.getPublicStyles();
        res.json(styles);
    } catch (err) {
        console.error('[styles] failed:', err);
        res.status(500).json({ error: 'Failed to get styles' });
    }
});

/**
 * POST /api/recipes/:id/publish — toggle is_public for own recipe.
 * Body: { isPublic: boolean }
 * Returns updated recipe.
 */
router.post('/:id/publish', (req, res) => {
    const recipeId = parseInt(req.params.id, 10);
    if (!recipeId) return res.status(400).json({ error: 'Invalid recipe id' });

    const { isPublic } = req.body;
    if (typeof isPublic !== 'boolean') {
        return res.status(400).json({ error: 'isPublic (boolean) required' });
    }

    try {
        const recipe = recipeQueries.setPublic(recipeId, req.user.id, isPublic);
        if (!recipe) return res.status(404).json({ error: 'Recipe not found' });
        res.json(recipe);
    } catch (err) {
        console.error('[publish] toggle failed:', err);
        res.status(500).json({ error: 'Failed to update recipe visibility' });
    }
});

// ─── Trending & Similar ───────────────────────────────────

/**
 * GET /api/recipes/trending — top recipes by engagement (likes*2 + comments).
 * Query params: days (default 7, max 90), limit (default 10, max 50)
 */
router.get('/trending', (req, res) => {
    const days  = Math.min(Math.max(parseInt(req.query.days,  10) || 7,  1), 90);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 50);

    try {
        const recipes = recipeTrendingQueries.getTrending(days, limit).map(r => ({
            ...r,
            ingredients:   JSON.parse(r.ingredients   || '[]'),
            mash_steps:    JSON.parse(r.mash_steps    || '[]'),
            hop_additions: JSON.parse(r.hop_additions || '[]'),
        }));
        res.json(recipes);
    } catch (err) {
        console.error('[trending] failed:', err);
        res.status(500).json({ error: 'Failed to get trending recipes' });
    }
});

/**
 * GET /api/recipes/:id/similar — similar public recipes by style.
 * Falls back to top-rated if style has no matches.
 * Query param: limit (default 5, max 20)
 */
router.get('/:id/similar', (req, res) => {
    const recipeId = parseInt(req.params.id, 10);
    if (!recipeId) return res.status(400).json({ error: 'Invalid recipe id' });

    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 5, 1), 20);

    try {
        const recipes = recipeTrendingQueries.getSimilar(recipeId, limit).map(r => ({
            ...r,
            ingredients:   JSON.parse(r.ingredients   || '[]'),
            mash_steps:    JSON.parse(r.mash_steps    || '[]'),
            hop_additions: JSON.parse(r.hop_additions || '[]'),
        }));
        res.json(recipes);
    } catch (err) {
        console.error('[similar] failed:', err);
        res.status(500).json({ error: 'Failed to get similar recipes' });
    }
});

// ─── Likes ────────────────────────────────────────────────

/** POST /api/recipes/:id/like — Toggle like. Returns { liked, count } */
router.post('/:id/like', (req, res) => {
    const recipeId = parseInt(req.params.id, 10);
    if (!recipeId) return res.status(400).json({ error: 'Invalid recipe id' });

    try {
        const result = recipeLikesQueries.toggle(recipeId, req.user.id);
        res.json(result);
    } catch (err) {
        console.error('[like] toggle failed:', err);
        res.status(500).json({ error: 'Failed to toggle like' });
    }
});

/** GET /api/recipes/:id/likes — Returns { count, isLiked } */
router.get('/:id/likes', (req, res) => {
    const recipeId = parseInt(req.params.id, 10);
    if (!recipeId) return res.status(400).json({ error: 'Invalid recipe id' });

    try {
        const result = recipeLikesQueries.getStatus(recipeId, req.user.id);
        res.json(result);
    } catch (err) {
        console.error('[like] getStatus failed:', err);
        res.status(500).json({ error: 'Failed to get like status' });
    }
});

// ─── Comments ─────────────────────────────────────────────

/** POST /api/recipes/:id/comments — Add comment. Returns { comment } */
router.post('/:id/comments', (req, res) => {
    const recipeId = parseInt(req.params.id, 10);
    if (!recipeId) return res.status(400).json({ error: 'Invalid recipe id' });

    const { text } = req.body;
    if (!text || typeof text !== 'string') {
        return res.status(400).json({ error: 'text is required' });
    }
    const trimmed = text.trim();
    if (trimmed.length < 1 || trimmed.length > 1000) {
        return res.status(400).json({ error: 'Comment must be 1–1000 characters' });
    }

    try {
        const comment = recipeCommentsQueries.create(recipeId, req.user.id, trimmed);
        res.status(201).json({ comment });
    } catch (err) {
        console.error('[comments] create failed:', err);
        res.status(500).json({ error: 'Failed to create comment' });
    }
});

/** GET /api/recipes/:id/comments — List comments. Returns { comments, total } */
router.get('/:id/comments', (req, res) => {
    const recipeId = parseInt(req.params.id, 10);
    if (!recipeId) return res.status(400).json({ error: 'Invalid recipe id' });

    const limit  = Math.min(parseInt(req.query.limit,  10) || 50, 100);
    const offset = Math.max(parseInt(req.query.offset, 10) || 0,  0);

    try {
        const result = recipeCommentsQueries.getByRecipe(recipeId, limit, offset);
        res.json(result);
    } catch (err) {
        console.error('[comments] list failed:', err);
        res.status(500).json({ error: 'Failed to list comments' });
    }
});

/** DELETE /api/recipes/:id/comments/:cid — Soft-delete (author only) */
router.delete('/:id/comments/:cid', (req, res) => {
    const commentId = parseInt(req.params.cid, 10);
    if (!commentId) return res.status(400).json({ error: 'Invalid comment id' });

    try {
        const result = recipeCommentsQueries.softDelete(commentId, req.user.id);
        if (result === null) return res.status(404).json({ error: 'Comment not found' });
        if (result === false) return res.status(403).json({ error: 'Not your comment' });
        res.json({ ok: true });
    } catch (err) {
        console.error('[comments] delete failed:', err);
        res.status(500).json({ error: 'Failed to delete comment' });
    }
});

export default router;
