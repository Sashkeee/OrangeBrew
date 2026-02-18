import { Router } from 'express';
import { settingsQueries } from '../db/database.js';

const router = Router();

// GET /api/settings — all settings
router.get('/', (req, res) => {
    try {
        const settings = settingsQueries.getAll();
        res.json(settings);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PUT /api/settings — bulk update settings
router.put('/', (req, res) => {
    try {
        settingsQueries.setBulk(req.body);
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/settings/test-connection — test ESP32 connection
router.post('/test-connection', (req, res) => {
    // Will be implemented when serial manager is connected
    res.json({ ok: true, status: 'mock', message: 'Connection test not available in mock mode' });
});

export default router;
