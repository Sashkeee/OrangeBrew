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
import logger from '../utils/logger.js';
import { writeAudit } from '../utils/audit.js';

const log = logger.child({ module: 'Social' });
const router = Router();

// ─── Public Library ───────────────────────────────────────

/**
 * @openapi
 * /api/recipes/public:
 *   get:
 *     tags: [Social]
 *     summary: Public recipe library
 *     description: Returns all public recipes sorted by likes descending. Includes author username, likes_count, comments_count.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 50, maximum: 100 }
 *         description: Max recipes to return
 *       - in: query
 *         name: offset
 *         schema: { type: integer, default: 0 }
 *         description: Pagination offset
 *     responses:
 *       200:
 *         description: Array of public recipes
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
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
        log.error({ err }, 'Public list failed');
        res.status(500).json({ error: 'Failed to list public recipes' });
    }
});

// ─── Search ───────────────────────────────────────────────

/**
 * @openapi
 * /api/recipes/search:
 *   get:
 *     tags: [Social]
 *     summary: FTS5 full-text search
 *     description: Search across public recipes using SQLite FTS5. Supports text query and style filter.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: q
 *         schema: { type: string, maxLength: 200 }
 *         description: Search query text
 *       - in: query
 *         name: style
 *         schema: { type: string }
 *         description: Filter by beer style
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20, maximum: 50 }
 *         description: Max results to return
 *       - in: query
 *         name: offset
 *         schema: { type: integer, default: 0 }
 *         description: Pagination offset
 *     responses:
 *       200:
 *         description: Array of matching recipes
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *       500:
 *         description: Search failed
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
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
        log.error({ err }, 'Search failed');
        res.status(500).json({ error: 'Search failed' });
    }
});

/**
 * @openapi
 * /api/recipes/styles:
 *   get:
 *     tags: [Social]
 *     summary: Distinct beer styles for filter
 *     description: Returns a list of distinct beer styles from public recipes, for use in filter dropdowns.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Array of style strings
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: string
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/styles', (req, res) => {
    try {
        const styles = recipeSearchQueries.getPublicStyles();
        res.json(styles);
    } catch (err) {
        log.error({ err }, 'Styles failed');
        res.status(500).json({ error: 'Failed to get styles' });
    }
});

/**
 * @openapi
 * /api/recipes/{id}/publish:
 *   post:
 *     tags: [Social]
 *     summary: Toggle recipe public visibility
 *     description: Set or unset is_public on own recipe. Only the recipe owner can toggle.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *         description: Recipe ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [isPublic]
 *             properties:
 *               isPublic:
 *                 type: boolean
 *                 description: Whether the recipe should be public
 *     responses:
 *       200:
 *         description: Updated recipe object
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *       400:
 *         description: Invalid recipe id or missing isPublic
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: Recipe not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
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
        writeAudit({ userId: req.user.id, action: 'recipe.publish', detail: `${isPublic ? 'Published' : 'Unpublished'} recipe "${recipe.name || '#' + recipeId}"` });
        res.json(recipe);
    } catch (err) {
        log.error({ err }, 'Publish toggle failed');
        res.status(500).json({ error: 'Failed to update recipe visibility' });
    }
});

// ─── Trending & Similar ───────────────────────────────────

/**
 * @openapi
 * /api/recipes/trending:
 *   get:
 *     tags: [Social]
 *     summary: Trending recipes
 *     description: Returns top recipes ranked by engagement score (likes*2 + comments) within a time window.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: days
 *         schema: { type: integer, default: 7, minimum: 1, maximum: 90 }
 *         description: Time window in days
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 10, minimum: 1, maximum: 50 }
 *         description: Max recipes to return
 *     responses:
 *       200:
 *         description: Array of trending recipes
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
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
        log.error({ err }, 'Trending failed');
        res.status(500).json({ error: 'Failed to get trending recipes' });
    }
});

/**
 * @openapi
 * /api/recipes/{id}/similar:
 *   get:
 *     tags: [Social]
 *     summary: Similar recipes
 *     description: Returns public recipes similar by style. Falls back to top-rated if no style matches.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *         description: Recipe ID
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 5, minimum: 1, maximum: 20 }
 *         description: Max similar recipes to return
 *     responses:
 *       200:
 *         description: Array of similar recipes
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *       400:
 *         description: Invalid recipe id
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
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
        log.error({ err }, 'Similar failed');
        res.status(500).json({ error: 'Failed to get similar recipes' });
    }
});

// ─── Likes ────────────────────────────────────────────────

/**
 * @openapi
 * /api/recipes/{id}/like:
 *   post:
 *     tags: [Social]
 *     summary: Toggle like
 *     description: Toggle like on a recipe for the current user. Returns new liked state and total count.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *         description: Recipe ID
 *     responses:
 *       200:
 *         description: Like toggle result
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 liked:
 *                   type: boolean
 *                   description: Whether the recipe is now liked by the user
 *                 count:
 *                   type: integer
 *                   description: Total like count
 *       400:
 *         description: Invalid recipe id
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post('/:id/like', (req, res) => {
    const recipeId = parseInt(req.params.id, 10);
    if (!recipeId) return res.status(400).json({ error: 'Invalid recipe id' });

    try {
        const result = recipeLikesQueries.toggle(recipeId, req.user.id);
        res.json(result);
    } catch (err) {
        log.error({ err }, 'Like toggle failed');
        res.status(500).json({ error: 'Failed to toggle like' });
    }
});

/**
 * @openapi
 * /api/recipes/{id}/likes:
 *   get:
 *     tags: [Social]
 *     summary: Get like status
 *     description: Returns the total like count and whether the current user has liked this recipe.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *         description: Recipe ID
 *     responses:
 *       200:
 *         description: Like status
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 count:
 *                   type: integer
 *                   description: Total like count
 *                 isLiked:
 *                   type: boolean
 *                   description: Whether the current user liked this recipe
 *       400:
 *         description: Invalid recipe id
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/:id/likes', (req, res) => {
    const recipeId = parseInt(req.params.id, 10);
    if (!recipeId) return res.status(400).json({ error: 'Invalid recipe id' });

    try {
        const result = recipeLikesQueries.getStatus(recipeId, req.user.id);
        res.json(result);
    } catch (err) {
        log.error({ err }, 'Like getStatus failed');
        res.status(500).json({ error: 'Failed to get like status' });
    }
});

// ─── Comments ─────────────────────────────────────────────

/**
 * @openapi
 * /api/recipes/{id}/comments:
 *   post:
 *     tags: [Social]
 *     summary: Add comment
 *     description: Add a comment to a recipe. Text must be 1-1000 characters.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *         description: Recipe ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [text]
 *             properties:
 *               text:
 *                 type: string
 *                 minLength: 1
 *                 maxLength: 1000
 *                 description: Comment text
 *     responses:
 *       201:
 *         description: Created comment
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 comment:
 *                   type: object
 *       400:
 *         description: Invalid recipe id or missing/invalid text
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
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
        log.error({ err }, 'Comment create failed');
        res.status(500).json({ error: 'Failed to create comment' });
    }
});

/**
 * @openapi
 * /api/recipes/{id}/comments:
 *   get:
 *     tags: [Social]
 *     summary: List comments
 *     description: Returns paginated comments for a recipe with total count.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *         description: Recipe ID
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 50, maximum: 100 }
 *         description: Max comments to return
 *       - in: query
 *         name: offset
 *         schema: { type: integer, default: 0 }
 *         description: Pagination offset
 *     responses:
 *       200:
 *         description: Comments with total count
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 comments:
 *                   type: array
 *                   items:
 *                     type: object
 *                 total:
 *                   type: integer
 *       400:
 *         description: Invalid recipe id
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/:id/comments', (req, res) => {
    const recipeId = parseInt(req.params.id, 10);
    if (!recipeId) return res.status(400).json({ error: 'Invalid recipe id' });

    const limit  = Math.min(parseInt(req.query.limit,  10) || 50, 100);
    const offset = Math.max(parseInt(req.query.offset, 10) || 0,  0);

    try {
        const result = recipeCommentsQueries.getByRecipe(recipeId, limit, offset);
        res.json(result);
    } catch (err) {
        log.error({ err }, 'Comment list failed');
        res.status(500).json({ error: 'Failed to list comments' });
    }
});

/**
 * @openapi
 * /api/recipes/{id}/comments/{cid}:
 *   delete:
 *     tags: [Social]
 *     summary: Soft-delete comment
 *     description: Soft-delete a comment. Only the comment author can delete their own comment.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *         description: Recipe ID
 *       - in: path
 *         name: cid
 *         required: true
 *         schema: { type: integer }
 *         description: Comment ID
 *     responses:
 *       200:
 *         description: Comment deleted
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok:
 *                   type: boolean
 *       400:
 *         description: Invalid comment id
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       403:
 *         description: Not the comment author
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: Comment not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.delete('/:id/comments/:cid', (req, res) => {
    const commentId = parseInt(req.params.cid, 10);
    if (!commentId) return res.status(400).json({ error: 'Invalid comment id' });

    try {
        const result = recipeCommentsQueries.softDelete(commentId, req.user.id);
        if (result === null) return res.status(404).json({ error: 'Comment not found' });
        if (result === false) return res.status(403).json({ error: 'Not your comment' });
        res.json({ ok: true });
    } catch (err) {
        log.error({ err }, 'Comment delete failed');
        res.status(500).json({ error: 'Failed to delete comment' });
    }
});

export default router;
