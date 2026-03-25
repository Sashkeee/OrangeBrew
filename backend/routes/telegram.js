import { Router } from 'express';
import telegram from '../services/telegram.js';

const router = Router();

/**
 * @openapi
 * /api/telegram/set-process-type:
 *   post:
 *     summary: Set current process type for Telegram notifications
 *     tags: [Telegram]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [type]
 *             properties:
 *               type:
 *                 type: string
 *                 description: "Process type (e.g. mash, boil, distillation)"
 *     responses:
 *       200:
 *         description: Process type updated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok:
 *                   type: boolean
 */
router.post('/set-process-type', (req, res) => {
    const { type } = req.body;
    telegram.setCurrentProcessType(type);
    res.json({ ok: true });
});

/**
 * @openapi
 * /api/telegram/notify-pump:
 *   post:
 *     summary: Send Telegram notification about pump state change
 *     tags: [Telegram]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [value]
 *             properties:
 *               value:
 *                 type: boolean
 *                 description: Pump state (true = on, false = off)
 *     responses:
 *       200:
 *         description: Notification sent
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok:
 *                   type: boolean
 */
router.post('/notify-pump', (req, res) => {
    const { value } = req.body;
    telegram.notifyPumpChange(value);
    res.json({ ok: true });
});

/**
 * @openapi
 * /api/telegram/notify-mash-step:
 *   post:
 *     summary: Send Telegram notification about mash step event
 *     tags: [Telegram]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [type, step]
 *             properties:
 *               type:
 *                 type: string
 *                 description: "Event type (e.g. reached, completed)"
 *               step:
 *                 type: object
 *                 description: Mash step details (name, temperature, duration, etc.)
 *     responses:
 *       200:
 *         description: Notification sent
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok:
 *                   type: boolean
 */
router.post('/notify-mash-step', (req, res) => {
    const { type, step } = req.body;
    telegram.notifyMashStep(type, step);
    res.json({ ok: true });
});

/**
 * @openapi
 * /api/telegram/notify-boil:
 *   post:
 *     summary: Send Telegram notification about boiling milestone
 *     tags: [Telegram]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [type, details]
 *             properties:
 *               type:
 *                 type: string
 *                 description: "Boil event type (e.g. start, hop_addition, end)"
 *               details:
 *                 type: object
 *                 description: Boil event details
 *     responses:
 *       200:
 *         description: Notification sent
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok:
 *                   type: boolean
 */
router.post('/notify-boil', (req, res) => {
    const { type, details } = req.body;
    telegram.notifyBoilMilestone(type, details);
    res.json({ ok: true });
});

export default router;
