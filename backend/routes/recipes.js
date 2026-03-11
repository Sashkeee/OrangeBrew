import { Router } from 'express';
import { recipeQueries } from '../db/database.js';

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

        res.json({ ok: true, imported, skipped, total: recipes.length });
    } catch (err) {
        res.status(500).json({ error: err.message });
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
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

export default router;
