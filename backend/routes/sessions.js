import { Router } from 'express';
import { sessionQueries, temperatureQueries, fractionQueries, fermentationQueries } from '../db/database.js';

const router = Router();

// GET /api/sessions — all sessions (optional ?type=mash|boil|fermentation|distillation|rectification)
router.get('/', (req, res) => {
    try {
        const sessions = sessionQueries.getAll(req.query.type);
        res.json(sessions);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/sessions/:id — single session with details
router.get('/:id', (req, res) => {
    try {
        const session = sessionQueries.getById(req.params.id);
        if (!session) return res.status(404).json({ error: 'Session not found' });
        res.json(session);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/sessions — create session
router.post('/', (req, res) => {
    try {
        const session = sessionQueries.create(req.body);
        res.status(201).json(session);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PUT /api/sessions/:id — update session (status, notes)
router.put('/:id', (req, res) => {
    try {
        const session = sessionQueries.update(req.params.id, req.body);
        if (!session) return res.status(404).json({ error: 'Session not found' });
        res.json(session);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/sessions/:id/complete — mark session as completed
router.post('/:id/complete', (req, res) => {
    try {
        const session = sessionQueries.complete(req.params.id);
        if (!session) return res.status(404).json({ error: 'Session not found' });
        res.json(session);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE /api/sessions/:id — delete session
router.delete('/:id', (req, res) => {
    try {
        sessionQueries.delete(req.params.id);
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─── Temperature Log ──────────────────────────────────────

// GET /api/sessions/:id/temperatures — temperature log for session
router.get('/:id/temperatures', (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 500;
        const temps = temperatureQueries.getBySession(req.params.id, limit);
        res.json(temps);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/sessions/:id/temperatures — log temperature reading
router.post('/:id/temperatures', (req, res) => {
    try {
        const { sensor, value } = req.body;
        temperatureQueries.insert(req.params.id, sensor, value);
        res.status(201).json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─── Fraction Log ─────────────────────────────────────────

// GET /api/sessions/:id/fractions — fraction log for distillation session
router.get('/:id/fractions', (req, res) => {
    try {
        const fractions = fractionQueries.getBySession(req.params.id);
        res.json(fractions);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/sessions/:id/fractions — add fraction entry
router.post('/:id/fractions', (req, res) => {
    try {
        fractionQueries.insert({ session_id: req.params.id, ...req.body });
        res.status(201).json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─── Fermentation Entries ─────────────────────────────────

// GET /api/sessions/:id/fermentation — fermentation diary
router.get('/:id/fermentation', (req, res) => {
    try {
        const entries = fermentationQueries.getBySession(req.params.id);
        res.json(entries);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/sessions/:id/fermentation — add fermentation entry
router.post('/:id/fermentation', (req, res) => {
    try {
        fermentationQueries.insert({ session_id: req.params.id, ...req.body });
        res.status(201).json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

export default router;
