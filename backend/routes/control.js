import { Router } from 'express';
import telegram from '../services/telegram.js';
import { broadcastControl } from '../ws/liveServer.js';

const router = Router();

// Per-user control state and command senders
const controlStates = new Map();  // userId → state object
const commandSenders = new Map(); // userId → fn(cmd)

function getOrCreateControlState(userId) {
    if (!controlStates.has(userId)) {
        controlStates.set(userId, {
            heater: 0,
            cooler: 0,
            pump: false,
            dephleg: 0,
            dephlegMode: 'manual',
        });
    }
    return controlStates.get(userId);
}

/**
 * Register a per-user command sender (called from server.js when a PM is created).
 */
export function setCommandSender(userId, fn) {
    commandSenders.set(userId, fn);
}

/**
 * Remove a per-user command sender (cleanup on disconnect / user removal).
 */
export function removeCommandSender(userId) {
    commandSenders.delete(userId);
    controlStates.delete(userId);
}

/**
 * Get current control state for a user.
 */
export function getControlState(userId) {
    return { ...getOrCreateControlState(userId) };
}

/**
 * Force set heater power internally (called by PidManager).
 */
export function setHeaterState(value, userId) {
    const state = getOrCreateControlState(userId);
    const safeValue = Math.min(100, Math.max(0, parseInt(value) || 0));
    state.heater = safeValue;
    commandSenders.get(userId)?.({ cmd: 'setHeater', value: safeValue });
    broadcastControl(state, userId);
}

/**
 * Force set pump state internally (called by ProcessManager).
 */
export function setPumpState(val, userId) {
    const state = getOrCreateControlState(userId);
    state.pump = !!val;
    commandSenders.get(userId)?.({ cmd: 'setPump', value: state.pump });
    broadcastControl(state, userId);
}

/**
 * @openapi
 * /api/control/heater:
 *   post:
 *     summary: Set heater power
 *     tags: [Control]
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
 *                 type: integer
 *                 minimum: 0
 *                 maximum: 100
 *                 description: Heater power percentage
 *     responses:
 *       200:
 *         description: Heater power updated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok:
 *                   type: boolean
 *                 heater:
 *                   type: integer
 *       500:
 *         description: Internal server error
 */
router.post('/heater', (req, res) => {
    try {
        const userId = req.user.id;
        const value = Math.min(100, Math.max(0, parseInt(req.body.value) || 0));
        const state = getOrCreateControlState(userId);
        state.heater = value;
        commandSenders.get(userId)?.({ cmd: 'setHeater', value });
        broadcastControl(state, userId);
        res.json({ ok: true, heater: value });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * @openapi
 * /api/control/cooler:
 *   post:
 *     summary: Set cooler power
 *     tags: [Control]
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
 *                 type: integer
 *                 minimum: 0
 *                 maximum: 100
 *                 description: Cooler power percentage
 *     responses:
 *       200:
 *         description: Cooler power updated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok:
 *                   type: boolean
 *                 cooler:
 *                   type: integer
 *       500:
 *         description: Internal server error
 */
router.post('/cooler', (req, res) => {
    try {
        const userId = req.user.id;
        const value = Math.min(100, Math.max(0, parseInt(req.body.value) || 0));
        const state = getOrCreateControlState(userId);
        state.cooler = value;
        commandSenders.get(userId)?.({ cmd: 'setCooler', value });
        broadcastControl(state, userId);
        res.json({ ok: true, cooler: value });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * @openapi
 * /api/control/pump:
 *   post:
 *     summary: Toggle pump on/off
 *     tags: [Control]
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
 *         description: Pump state updated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok:
 *                   type: boolean
 *                 pump:
 *                   type: boolean
 *       500:
 *         description: Internal server error
 */
router.post('/pump', (req, res) => {
    try {
        const userId = req.user.id;
        const value = !!req.body.value;
        const state = getOrCreateControlState(userId);
        state.pump = value;
        commandSenders.get(userId)?.({ cmd: 'setPump', value });
        broadcastControl(state, userId);
        telegram.notifyPumpChange(value);
        res.json({ ok: true, pump: value });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * @openapi
 * /api/control/dephleg:
 *   post:
 *     summary: Set dephlegmator power and mode
 *     tags: [Control]
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
 *                 type: integer
 *                 minimum: 0
 *                 maximum: 100
 *                 description: Dephlegmator power percentage
 *               mode:
 *                 type: string
 *                 description: Operating mode (e.g. "manual"). Defaults to current mode if omitted.
 *     responses:
 *       200:
 *         description: Dephlegmator settings updated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok:
 *                   type: boolean
 *                 dephleg:
 *                   type: integer
 *                 mode:
 *                   type: string
 *       500:
 *         description: Internal server error
 */
router.post('/dephleg', (req, res) => {
    try {
        const userId = req.user.id;
        const value = Math.min(100, Math.max(0, parseInt(req.body.value) || 0));
        const state = getOrCreateControlState(userId);
        const mode = req.body.mode || state.dephlegMode;
        state.dephleg = value;
        state.dephlegMode = mode;
        commandSenders.get(userId)?.({ cmd: 'setDephleg', value, mode });
        broadcastControl(state, userId);
        res.json({ ok: true, dephleg: value, mode });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * @openapi
 * /api/control/emergency-stop:
 *   post:
 *     summary: Emergency stop all outputs
 *     description: Immediately sets heater, cooler, and dephlegmator to 0 and turns off the pump.
 *     tags: [Control]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Emergency stop executed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok:
 *                   type: boolean
 *                 message:
 *                   type: string
 *       500:
 *         description: Internal server error
 */
router.post('/emergency-stop', (req, res) => {
    try {
        const userId = req.user.id;
        const state = getOrCreateControlState(userId);
        state.heater = 0;
        state.cooler = 0;
        state.pump = false;
        state.dephleg = 0;
        commandSenders.get(userId)?.({ cmd: 'emergencyStop' });
        broadcastControl(state, userId);
        res.json({ ok: true, message: 'Emergency stop executed' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * @openapi
 * /api/control:
 *   get:
 *     summary: Get current control state
 *     tags: [Control]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Current control state
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 heater:
 *                   type: integer
 *                   description: Heater power (0-100)
 *                 cooler:
 *                   type: integer
 *                   description: Cooler power (0-100)
 *                 pump:
 *                   type: boolean
 *                   description: Pump state
 *                 dephleg:
 *                   type: integer
 *                   description: Dephlegmator power (0-100)
 *                 dephlegMode:
 *                   type: string
 *                   description: Dephlegmator operating mode
 */
router.get('/', (req, res) => {
    res.json(getControlState(req.user.id));
});

export default router;
