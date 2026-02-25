import { Router } from 'express';
import telegram from '../services/telegram.js';
import { broadcastControl } from '../ws/liveServer.js';

const router = Router();

// Current control state
let controlState = {
    heater: 0,        // 0-100%
    cooler: 0,        // 0-100%
    pump: false,       // on/off
    dephleg: 0,        // 0-100%
    dephlegMode: 'manual', // auto/manual
};

/** Callback to send commands to ESP32 via serial */
let sendCommand = null;

/**
 * Register the serial command sender.
 */
export function setCommandSender(fn) {
    sendCommand = fn;
}

/**
 * Get current control state.
 */
export function getControlState() {
    return { ...controlState };
}

/**
 * Force set heater power internally
 */
export function setHeaterState(value) {
    const safeValue = Math.min(100, Math.max(0, parseInt(value) || 0));
    controlState.heater = safeValue;
    if (sendCommand) sendCommand({ cmd: 'setHeater', value: safeValue });
    broadcastControl(controlState);
}

/**
 * Force set pump state internally
 */
export function setPumpState(state) {
    controlState.pump = !!state;
    if (sendCommand) sendCommand({ cmd: 'setPump', value: controlState.pump });
    broadcastControl(controlState);
}

// POST /api/control/heater — set heater power
router.post('/heater', (req, res) => {
    try {
        const value = Math.min(100, Math.max(0, parseInt(req.body.value) || 0));
        controlState.heater = value;
        if (sendCommand) sendCommand({ cmd: 'setHeater', value });
        res.json({ ok: true, heater: value });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/control/cooler — set cooler power
router.post('/cooler', (req, res) => {
    try {
        const value = Math.min(100, Math.max(0, parseInt(req.body.value) || 0));
        controlState.cooler = value;
        if (sendCommand) sendCommand({ cmd: 'setCooler', value });
        res.json({ ok: true, cooler: value });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/control/pump — toggle pump
router.post('/pump', (req, res) => {
    try {
        const value = !!req.body.value;
        controlState.pump = value;
        if (sendCommand) sendCommand({ cmd: 'setPump', value });
        telegram.notifyPumpChange(value); // Notify telegram when pump state changes
        res.json({ ok: true, pump: value });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/control/dephleg — set dephlegmator
router.post('/dephleg', (req, res) => {
    try {
        const value = Math.min(100, Math.max(0, parseInt(req.body.value) || 0));
        const mode = req.body.mode || controlState.dephlegMode;
        controlState.dephleg = value;
        controlState.dephlegMode = mode;
        if (sendCommand) sendCommand({ cmd: 'setDephleg', value, mode });
        res.json({ ok: true, dephleg: value, mode });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/control/emergency-stop — emergency stop all
router.post('/emergency-stop', (req, res) => {
    try {
        controlState.heater = 0;
        controlState.cooler = 0;
        controlState.pump = false;
        controlState.dephleg = 0;
        if (sendCommand) sendCommand({ cmd: 'emergencyStop' });
        res.json({ ok: true, message: 'Emergency stop executed' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/control — get current control state
router.get('/', (req, res) => {
    res.json(controlState);
});

export default router;
