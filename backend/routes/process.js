import express from 'express';

export default function createProcessRouter(processManager) {
    const router = express.Router();

    // Get current status
    router.get('/status', (req, res) => {
        res.json(processManager.getState());
    });

    // Start process
    router.post('/start', (req, res) => {
        try {
            const { recipe, sessionId, mode } = req.body;
            if (!recipe) {
                return res.status(400).json({ error: 'Recipe is required' });
            }
            processManager.start(recipe, sessionId, mode); // mode: 'mash' | 'boil'
            res.json({ ok: true, state: processManager.getState() });
        } catch (err) {
            res.status(400).json({ error: err.message });
        }
    });

    // Stop process
    router.post('/stop', (req, res) => {
        processManager.stop();
        res.json({ ok: true, state: processManager.getState() });
    });

    // Pause process
    router.post('/pause', (req, res) => {
        processManager.pause();
        res.json({ ok: true, state: processManager.getState() });
    });

    // Resume process
    router.post('/resume', (req, res) => {
        processManager.resume();
        res.json({ ok: true, state: processManager.getState() });
    });

    // Skip step
    router.post('/skip', (req, res) => {
        processManager.skip();
        res.json({ ok: true, state: processManager.getState() });
    });

    return router;
}
