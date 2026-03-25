import { Router } from 'express';
import { recipeQueries } from '../db/database.js';
import { scaleRecipe } from '../utils/scaleRecipe.js';
import logger from '../utils/logger.js';

const log = logger.child({ module: 'Recipes' });
const router = Router();

// Helper: parse JSON fields in a recipe row
function parseRecipe(r) {
    return {
        ...r,
        ingredients:   JSON.parse(r.ingredients   || '[]'),
        mash_steps:    JSON.parse(r.mash_steps    || '[]'),
        hop_additions: JSON.parse(r.hop_additions || '[]'),
    };
}

/**
 * @openapi
 * components:
 *   schemas:
 *     Recipe:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *           example: 1
 *         name:
 *           type: string
 *           example: Pale Ale
 *         style:
 *           type: string
 *           example: American Pale Ale
 *         batch_size:
 *           type: number
 *           example: 20
 *         boil_time:
 *           type: integer
 *           example: 60
 *         og:
 *           type: number
 *           nullable: true
 *           example: 1.050
 *         fg:
 *           type: number
 *           nullable: true
 *           example: 1.010
 *         ibu:
 *           type: number
 *           nullable: true
 *           example: 35
 *         ebc:
 *           type: number
 *           nullable: true
 *           example: 12
 *         ingredients:
 *           type: array
 *           items:
 *             type: object
 *         mash_steps:
 *           type: array
 *           items:
 *             type: object
 *         hop_additions:
 *           type: array
 *           items:
 *             type: object
 *         notes:
 *           type: string
 *           nullable: true
 *         is_public:
 *           type: integer
 *           enum: [0, 1]
 *           example: 0
 *         user_id:
 *           type: integer
 *         created_at:
 *           type: string
 *           format: date-time
 *         updated_at:
 *           type: string
 *           format: date-time
 */

/**
 * @openapi
 * /api/recipes:
 *   get:
 *     tags: [Recipes]
 *     summary: List all recipes owned by the current user
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Array of user recipes
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Recipe'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/', (req, res) => {
    try {
        const recipes = recipeQueries.getAll(req.user.id).map(parseRecipe);
        res.json(recipes);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─── Export / Import ──────────────────────────────────────

/**
 * @openapi
 * /api/recipes/export:
 *   get:
 *     tags: [Recipes]
 *     summary: Export all user recipes as a JSON file download
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: JSON file with exported recipes
 *         headers:
 *           Content-Disposition:
 *             schema:
 *               type: string
 *               example: attachment; filename="orangebrew_recipes_2026-03-25.json"
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 version:
 *                   type: integer
 *                   example: 1
 *                 exported_at:
 *                   type: string
 *                   format: date-time
 *                 recipes:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Recipe'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/export', (req, res) => {
    try {
        const recipes = recipeQueries.getAll(req.user.id).map(parseRecipe);
        const exportData = recipes.map(({ id, created_at, updated_at, user_id, ...rest }) => rest);

        res.setHeader('Content-Type', 'application/json');
        res.setHeader(
            'Content-Disposition',
            `attachment; filename="orangebrew_recipes_${new Date().toISOString().slice(0, 10)}.json"`
        );
        res.json({ version: 1, exported_at: new Date().toISOString(), recipes: exportData });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * @openapi
 * /api/recipes/import:
 *   post:
 *     tags: [Recipes]
 *     summary: Import recipes from a JSON payload
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [recipes]
 *             properties:
 *               recipes:
 *                 type: array
 *                 items:
 *                   type: object
 *                   description: Recipe data (same shape as export, without id/user_id/timestamps)
 *     responses:
 *       200:
 *         description: Import result summary
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok:
 *                   type: boolean
 *                   example: true
 *                 imported:
 *                   type: integer
 *                   example: 3
 *                 skipped:
 *                   type: integer
 *                   example: 1
 *                 total:
 *                   type: integer
 *                   example: 4
 *       400:
 *         description: Invalid payload (missing recipes array)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post('/import', (req, res) => {
    try {
        const { recipes } = req.body;
        if (!Array.isArray(recipes)) {
            return res.status(400).json({ error: 'Expected { recipes: [...] }' });
        }

        let imported = 0;
        let skipped  = 0;
        for (const recipe of recipes) {
            try {
                recipeQueries.create(recipe, req.user.id);
                imported++;
            } catch {
                skipped++;
            }
        }

        log.info({ userId: req.user.id, imported, skipped, total: recipes.length }, 'Recipes imported');
        res.json({ ok: true, imported, skipped, total: recipes.length });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─── Scaling ──────────────────────────────────────────────

/**
 * @openapi
 * /api/recipes/{id}/scale:
 *   post:
 *     tags: [Recipes]
 *     summary: Preview a scaled recipe (does not save)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Recipe ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [targetBatchSize]
 *             properties:
 *               targetBatchSize:
 *                 type: number
 *                 example: 40
 *                 description: Target batch size in liters
 *     responses:
 *       200:
 *         description: Scaled recipe preview
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 recipe:
 *                   $ref: '#/components/schemas/Recipe'
 *       400:
 *         description: Invalid targetBatchSize or scaling error
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
 */
router.post('/:id/scale', (req, res) => {
    try {
        const recipe = recipeQueries.getById(req.params.id, req.user.id);
        if (!recipe) return res.status(404).json({ error: 'Recipe not found' });

        const targetBatchSize = parseFloat(req.body.targetBatchSize);
        if (!targetBatchSize || targetBatchSize <= 0) {
            return res.status(400).json({ error: 'targetBatchSize must be a positive number' });
        }

        const scaled = scaleRecipe(parseRecipe(recipe), targetBatchSize);
        res.json({ recipe: scaled });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

/**
 * @openapi
 * /api/recipes/{id}/scale-and-save:
 *   post:
 *     tags: [Recipes]
 *     summary: Scale a recipe and save as a new recipe
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Source recipe ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [targetBatchSize]
 *             properties:
 *               targetBatchSize:
 *                 type: number
 *                 example: 40
 *                 description: Target batch size in liters
 *     responses:
 *       201:
 *         description: Scaled recipe saved as a new recipe
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 recipe:
 *                   $ref: '#/components/schemas/Recipe'
 *       400:
 *         description: Invalid targetBatchSize or scaling error
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
 */
router.post('/:id/scale-and-save', (req, res) => {
    try {
        const recipe = recipeQueries.getById(req.params.id, req.user.id);
        if (!recipe) return res.status(404).json({ error: 'Recipe not found' });

        const targetBatchSize = parseFloat(req.body.targetBatchSize);
        if (!targetBatchSize || targetBatchSize <= 0) {
            return res.status(400).json({ error: 'targetBatchSize must be a positive number' });
        }

        const scaled = scaleRecipe(parseRecipe(recipe), targetBatchSize);
        const saved  = recipeQueries.create(scaled, req.user.id);
        res.status(201).json({ recipe: parseRecipe(saved) });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// ─── Individual Ops ───────────────────────────────────────

/**
 * @openapi
 * /api/recipes/{id}:
 *   get:
 *     tags: [Recipes]
 *     summary: Get a single recipe by ID
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Recipe ID
 *     responses:
 *       200:
 *         description: Recipe object
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Recipe'
 *       404:
 *         description: Recipe not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/:id', (req, res) => {
    try {
        const recipe = recipeQueries.getById(req.params.id, req.user.id);
        if (!recipe) return res.status(404).json({ error: 'Recipe not found' });
        res.json(parseRecipe(recipe));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * @openapi
 * /api/recipes:
 *   post:
 *     tags: [Recipes]
 *     summary: Create a new recipe
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name]
 *             properties:
 *               name:
 *                 type: string
 *                 example: Pale Ale
 *               style:
 *                 type: string
 *                 example: American Pale Ale
 *               batch_size:
 *                 type: number
 *                 example: 20
 *               boil_time:
 *                 type: integer
 *                 example: 60
 *               og:
 *                 type: number
 *                 example: 1.050
 *               fg:
 *                 type: number
 *                 example: 1.010
 *               ibu:
 *                 type: number
 *                 example: 35
 *               ebc:
 *                 type: number
 *                 example: 12
 *               ingredients:
 *                 type: array
 *                 items:
 *                   type: object
 *               mash_steps:
 *                 type: array
 *                 items:
 *                   type: object
 *               hop_additions:
 *                 type: array
 *                 items:
 *                   type: object
 *               notes:
 *                 type: string
 *     responses:
 *       201:
 *         description: Created recipe
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Recipe'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post('/', (req, res) => {
    try {
        const recipe = recipeQueries.create(req.body, req.user.id);
        log.info({ userId: req.user.id, recipeName: recipe.name }, 'Recipe created');
        res.status(201).json(parseRecipe(recipe));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * @openapi
 * /api/recipes/{id}:
 *   put:
 *     tags: [Recipes]
 *     summary: Update an existing recipe
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Recipe ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               style:
 *                 type: string
 *               batch_size:
 *                 type: number
 *               boil_time:
 *                 type: integer
 *               og:
 *                 type: number
 *               fg:
 *                 type: number
 *               ibu:
 *                 type: number
 *               ebc:
 *                 type: number
 *               ingredients:
 *                 type: array
 *                 items:
 *                   type: object
 *               mash_steps:
 *                 type: array
 *                 items:
 *                   type: object
 *               hop_additions:
 *                 type: array
 *                 items:
 *                   type: object
 *               notes:
 *                 type: string
 *     responses:
 *       200:
 *         description: Updated recipe
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Recipe'
 *       404:
 *         description: Recipe not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.put('/:id', (req, res) => {
    try {
        const recipe = recipeQueries.update(req.params.id, req.body, req.user.id);
        if (!recipe) return res.status(404).json({ error: 'Recipe not found' });
        res.json(parseRecipe(recipe));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * @openapi
 * /api/recipes/{id}:
 *   delete:
 *     tags: [Recipes]
 *     summary: Delete a recipe
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Recipe ID
 *     responses:
 *       200:
 *         description: Recipe deleted
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok:
 *                   type: boolean
 *                   example: true
 *       404:
 *         description: Recipe not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.delete('/:id', (req, res) => {
    try {
        const result = recipeQueries.delete(req.params.id, req.user.id);
        if (!result.changes) return res.status(404).json({ error: 'Recipe not found' });
        log.warn({ userId: req.user.id, recipeId: req.params.id }, 'Recipe deleted');
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

export default router;
