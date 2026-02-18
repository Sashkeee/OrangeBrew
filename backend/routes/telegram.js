import { Router } from 'express';
import telegram from '../services/telegram.js';

const router = Router();

// POST /api/telegram/set-process-type — set current process type (mash, boil, etc.)
router.post('/set-process-type', (req, res) => {
    const { type } = req.body;
    telegram.setCurrentProcessType(type);
    res.json({ ok: true });
});

// POST /api/telegram/notify-pump — notify pump change
router.post('/notify-pump', (req, res) => {
    const { value } = req.body;
    telegram.notifyPumpChange(value);
    res.json({ ok: true });
});

// POST /api/telegram/notify-mash-step — notify mash step reached/completed
router.post('/notify-mash-step', (req, res) => {
    const { type, step } = req.body;
    telegram.notifyMashStep(type, step);
    res.json({ ok: true });
});

// POST /api/telegram/notify-boil — notify boiling milestone
router.post('/notify-boil', (req, res) => {
    const { type, details } = req.body;
    telegram.notifyBoilMilestone(type, details);
    res.json({ ok: true });
});

export default router;
