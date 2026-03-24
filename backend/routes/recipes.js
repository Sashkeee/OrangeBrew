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

// GET /api/recipes — recipes owned by the current user
router.get('/', (req, res) => {
    try {
        const recipes = recipeQueries.getAll(req.user.id).map(parseRecipe);
        res.json(recipes);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─── Export / Import ──────────────────────────────────────

// GET /api/recipes/export — export user's recipes as JSON
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

// POST /api/recipes/import — import recipes from JSON
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

// POST /api/recipes/:id/scale — preview scaled recipe (does NOT save)
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

// POST /api/recipes/:id/scale-and-save — scale and persist as a new recipe
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

// GET /api/recipes/:id
router.get('/:id', (req, res) => {
    try {
        const recipe = recipeQueries.getById(req.params.id, req.user.id);
        if (!recipe) return res.status(404).json({ error: 'Recipe not found' });
        res.json(parseRecipe(recipe));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/recipes — create recipe
router.post('/', (req, res) => {
    try {
        const recipe = recipeQueries.create(req.body, req.user.id);
        log.info({ userId: req.user.id, recipeName: recipe.name }, 'Recipe created');
        res.status(201).json(parseRecipe(recipe));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PUT /api/recipes/:id — update recipe
router.put('/:id', (req, res) => {
    try {
        const recipe = recipeQueries.update(req.params.id, req.body, req.user.id);
        if (!recipe) return res.status(404).json({ error: 'Recipe not found' });
        res.json(parseRecipe(recipe));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE /api/recipes/:id — delete recipe
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
