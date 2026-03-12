import express from 'express';

/**
 * Process router — читает req.processManager, который инжектируется middleware в server.js.
 * Каждый пользователь получает свой ProcessManager через Map<userId, ProcessManager>.
 */
const router = express.Router();

// Get current status
router.get('/status', (req, res) => {
    res.json(req.processManager.getState());
});

// Start process
router.post('/start', (req, res) => {
    try {
        const { recipe, sessionId, mode, deviceId, sensorAddress } = req.body;
        if (!recipe) {
            return res.status(400).json({ error: 'Recipe is required' });
        }
        req.processManager.start(recipe, sessionId, mode, deviceId || 'local_serial', sensorAddress);
        res.json({ ok: true, state: req.processManager.getState() });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// Stop process
router.post('/stop', (req, res) => {
    req.processManager.stop();
    res.json({ ok: true, state: req.processManager.getState() });
});

// Pause process
router.post('/pause', (req, res) => {
    req.processManager.pause();
    res.json({ ok: true, state: req.processManager.getState() });
});

// Resume process
router.post('/resume', (req, res) => {
    req.processManager.resume();
    res.json({ ok: true, state: req.processManager.getState() });
});

// Skip step
router.post('/skip', (req, res) => {
    req.processManager.skip();
    res.json({ ok: true, state: req.processManager.getState() });
});

// --- Auto-Tuner API ---
router.post('/tune-start', (req, res) => {
    try {
        const target = req.body.target || 65;
        const sensorAddress = req.body.sensorAddress || null;
        req.processManager.pidManager.startTuning(target, sensorAddress);
        res.json({ ok: true, message: 'Autotune started' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/tune-stop', (req, res) => {
    try {
        req.processManager.pidManager.stopTuning();
        res.json({ ok: true, message: 'Autotune stopped' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/tune-status', (req, res) => {
    try {
        res.json(req.processManager.pidManager.getTunerStatus());
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

export default router;
