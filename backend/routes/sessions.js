import { Router } from 'express';
import { sessionQueries, recipeQueries, temperatureQueries, fractionQueries, fermentationQueries } from '../db/database.js';
import telegram from '../services/telegram.js';
import logger from '../utils/logger.js';

const log = logger.child({ module: 'Sessions' });
const router = Router();

// GET /api/sessions — sessions for current user (optional ?type=mash|boil|...)
router.get('/', (req, res) => {
    try {
        const sessions = sessionQueries.getAll(req.user.id, req.query.type || null);
        res.json(sessions);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/sessions/:id — single session (must belong to current user)
router.get('/:id', (req, res) => {
    try {
        const session = sessionQueries.getById(req.params.id, req.user.id);
        if (!session) return res.status(404).json({ error: 'Session not found' });
        res.json(session);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/sessions — create session
router.post('/', async (req, res) => {
    try {
        log.info({ type: req.body.type }, 'Creating new session');
        const session = sessionQueries.create(req.body, req.user.id);

        let recipeName = '—';
        if (req.body.recipe_id) {
            const recipe = recipeQueries.getById(req.body.recipe_id, req.user.id);
            if (recipe) recipeName = recipe.name;
        }

        log.info({ type: req.body.type, recipeName }, 'Notifying Telegram');
        telegram.setCurrentProcessType(req.body.type || 'brew');
        await telegram.notifyPhaseChange(
            req.body.type || 'brew',
            'Начало процесса',
            `Рецепт: *${recipeName}*`
        );

        res.status(201).json(session);
    } catch (err) {
        log.error({ err }, 'Error creating session');
        res.status(500).json({ error: err.message });
    }
});

// PUT /api/sessions/:id — update session
router.put('/:id', (req, res) => {
    try {
        const session = sessionQueries.update(req.params.id, req.body, req.user.id);
        if (!session) return res.status(404).json({ error: 'Session not found' });
        res.json(session);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/sessions/:id/complete
router.post('/:id/complete', (req, res) => {
    try {
        const session = sessionQueries.complete(req.params.id, req.user.id);
        if (!session) return res.status(404).json({ error: 'Session not found' });
        telegram.notifyComplete(session.type || 'brew', { notes: session.notes });
        res.json(session);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE /api/sessions/:id
router.delete('/:id', (req, res) => {
    try {
        const result = sessionQueries.delete(req.params.id, req.user.id);
        if (!result.changes) return res.status(404).json({ error: 'Session not found' });
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─── Temperature Log ──────────────────────────────────────

// GET /api/sessions/:id/temperatures
router.get('/:id/temperatures', (req, res) => {
    try {
        const session = sessionQueries.getById(req.params.id, req.user.id);
        if (!session) return res.status(404).json({ error: 'Session not found' });
        const limit = parseInt(req.query.limit) || 500;
        const temps = temperatureQueries.getBySession(req.params.id, limit);
        res.json(temps);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/sessions/:id/temperatures
router.post('/:id/temperatures', (req, res) => {
    try {
        const session = sessionQueries.getById(req.params.id, req.user.id);
        if (!session) return res.status(404).json({ error: 'Session not found' });
        const { sensor, value } = req.body;
        temperatureQueries.insert(req.params.id, sensor, value);
        res.status(201).json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─── Fraction Log ─────────────────────────────────────────

// GET /api/sessions/:id/fractions
router.get('/:id/fractions', (req, res) => {
    try {
        const session = sessionQueries.getById(req.params.id, req.user.id);
        if (!session) return res.status(404).json({ error: 'Session not found' });
        const fractions = fractionQueries.getBySession(req.params.id);
        res.json(fractions);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/sessions/:id/fractions
router.post('/:id/fractions', (req, res) => {
    try {
        const session = sessionQueries.getById(req.params.id, req.user.id);
        if (!session) return res.status(404).json({ error: 'Session not found' });
        fractionQueries.insert({ session_id: req.params.id, ...req.body });
        res.status(201).json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─── Fermentation Entries ─────────────────────────────────

// GET /api/sessions/:id/fermentation
router.get('/:id/fermentation', (req, res) => {
    try {
        const session = sessionQueries.getById(req.params.id, req.user.id);
        if (!session) return res.status(404).json({ error: 'Session not found' });
        const entries = fermentationQueries.getBySession(req.params.id);
        res.json(entries);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/sessions/:id/fermentation
router.post('/:id/fermentation', (req, res) => {
    try {
        const session = sessionQueries.getById(req.params.id, req.user.id);
        if (!session) return res.status(404).json({ error: 'Session not found' });
        fermentationQueries.insert({ session_id: req.params.id, ...req.body });
        res.status(201).json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

export default router;
