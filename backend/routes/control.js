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

// POST /api/control/heater — set heater power
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

// POST /api/control/cooler — set cooler power
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

// POST /api/control/pump — toggle pump
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

// POST /api/control/dephleg — set dephlegmator
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

// POST /api/control/emergency-stop — emergency stop all
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

// GET /api/control — get current control state
router.get('/', (req, res) => {
    res.json(getControlState(req.user.id));
});

export default router;
