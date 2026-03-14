/**
 * BeerXML import/export routes.
 *
 * POST /api/beerxml/import       — multipart/form-data (.xml file) or raw XML body
 * GET  /api/beerxml/export/:id   — download single recipe as .xml
 * GET  /api/beerxml/export-all   — download all user's recipes as .xml
 */

import { Router } from 'express';
import multer from 'multer';
import { recipeQueries } from '../db/database.js';
import { beerxmlToOrangeBrew } from '../beerxml/mapper.js';
import { orangeBrewToBeerxml } from '../beerxml/mapper.js';
import { generateBeerXmlString, generateMultipleRecipes } from '../beerxml/generator.js';
import { validateRecipe } from '../beerxml/parser.js';

const router = Router();

// multer: memory storage, 5 MB limit, only accept .xml
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
        if (file.mimetype === 'text/xml' || file.mimetype === 'application/xml' || file.originalname.endsWith('.xml')) {
            cb(null, true);
        } else {
            cb(new Error('Only .xml files are accepted'));
        }
    },
});

// ─── Import ───────────────────────────────────────────────

/**
 * POST /api/beerxml/import
 * Accepts either:
 *   - multipart/form-data with a field named "file" containing the .xml
 *   - application/xml or text/xml raw body
 */
router.post('/import', upload.single('file'), async (req, res) => {
    try {
        let xmlString;

        if (req.file) {
            // Uploaded via multipart
            xmlString = req.file.buffer.toString('utf8');
        } else if (req.body && typeof req.body === 'string' && req.body.trim().startsWith('<')) {
            // Raw XML body (Content-Type: application/xml)
            xmlString = req.body;
        } else {
            return res.status(400).json({ ok: false, error: 'No XML provided. Send a .xml file or raw XML body.' });
        }

        // Parse → OrangeBrew recipes
        let obRecipes;
        try {
            obRecipes = await beerxmlToOrangeBrew(xmlString);
        } catch (e) {
            return res.status(400).json({ ok: false, error: e.message });
        }

        // Validate and save each recipe
        const results = [];
        const errors  = [];

        for (const recipe of obRecipes) {
            const { valid, errors: validErrors } = validateRecipe(recipe);
            if (!valid) {
                errors.push({ name: recipe.name || '(unnamed)', errors: validErrors });
                continue;
            }
            try {
                const saved = recipeQueries.create(recipe, req.user.id);
                results.push({ id: saved.id, name: saved.name });
            } catch (e) {
                errors.push({ name: recipe.name, errors: [e.message] });
            }
        }

        res.json({
            ok:       true,
            imported: results.length,
            failed:   errors.length,
            recipes:  results,
            ...(errors.length ? { errors } : {}),
        });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

// ─── Export single ────────────────────────────────────────

/**
 * GET /api/beerxml/export/:id
 * Export one recipe owned by the current user as a .xml file.
 */
router.get('/export/:id', (req, res) => {
    try {
        const recipe = recipeQueries.getById(req.params.id, req.user.id);
        if (!recipe) return res.status(404).json({ error: 'Recipe not found' });

        const bxObj = orangeBrewToBeerxml(recipe);
        const xml   = generateBeerXmlString(bxObj);
        const safeFilename = (recipe.name || 'recipe')
            .replace(/[^a-zA-Z0-9_\- ]/g, '_')
            .replace(/\s+/g, '_')
            .slice(0, 64);

        res.setHeader('Content-Type', 'application/xml; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}.xml"`);
        res.send(xml);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─── Export all ───────────────────────────────────────────

/**
 * GET /api/beerxml/export-all
 * Export all recipes owned by the current user as a single .xml file.
 */
router.get('/export-all', (req, res) => {
    try {
        const recipes = recipeQueries.getAll(req.user.id);
        if (!recipes.length) return res.status(404).json({ error: 'No recipes found' });

        const bxObjects = recipes.map(orangeBrewToBeerxml);
        const xml       = generateMultipleRecipes(bxObjects);
        const date      = new Date().toISOString().slice(0, 10);

        res.setHeader('Content-Type', 'application/xml; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="orangebrew_recipes_${date}.xml"`);
        res.send(xml);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

export default router;
