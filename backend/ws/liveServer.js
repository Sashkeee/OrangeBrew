import { WebSocketServer } from 'ws';
import { randomUUID } from 'crypto';
import jwt from 'jsonwebtoken';
import url from 'url';
import { getSensorReadings } from '../routes/sensors.js';
import { getControlState } from '../routes/control.js';
import { deviceQueries, pairingQueries } from '../db/database.js';

const JWT_SECRET = process.env.JWT_SECRET || 'fallback_super_secret_for_orangebrew';

/**
 * UI clients: Map<ws, { userId: number }>
 * Replaces old Set — we now track which user each UI connection belongs to.
 */
const uiClients = new Map();

/**
 * Hardware clients: Map<deviceId, { ws, userId: number }>
 * userId = owner of the device (set at auth/pairing time).
 */
const hardwareClients = new Map();

let wss = null;
let pingInterval = null;

// ─── Init ──────────────────────────────────────────────────

/**
 * Initialize WebSocket server on the given HTTP server.
 * @param {import('http').Server} server
 */
export function initWebSocket(server) {
    wss = new WebSocketServer({ server, path: '/ws' });

    wss.on('connection', (ws, req) => {
        const query = url.parse(req.url, true).query;

        // ── UI client: authenticates via JWT in query string ──
        if (query.token) {
            try {
                const decoded = jwt.verify(query.token, JWT_SECRET);
                setupUiClient(ws, decoded.id);
                return;
            } catch {
                ws.close(4001, 'Invalid token');
                return;
            }
        }

        // ── Hardware client: authenticates via first message ──
        const authTimeout = setTimeout(() => {
            ws.close(4001, 'Auth timeout');
        }, 10_000);

        ws.once('message', async (raw) => {
            clearTimeout(authTimeout);
            try {
                const msg = JSON.parse(raw.toString());

                // ── Pairing flow: ESP32 has no api_key yet ──
                if (msg.type === 'pair') {
                    await handlePairingMessage(ws, msg);
                    return;
                }

                // ── Auth flow: ESP32 has api_key from previous pairing ──
                if (msg.type === 'auth') {
                    const device = deviceQueries.getByApiKey(msg.api_key);
                    if (!device) {
                        console.log(`[WS] Unknown api_key attempt: ${msg.api_key} (deviceId: ${msg.deviceId || 'unknown'})`);
                        ws.close(4001, 'Unknown api_key');
                        return;
                    }
                    setupHardwareClient(ws, device.id, device.user_id, device.name, device.role);

                    // If first message also contains sensor data, handle it
                    if (msg.sensors) {
                        handleHardwareMessage(device.id, msg);
                    }
                    return;
                }

                ws.close(4000, 'Expected type:auth or type:pair');
            } catch {
                ws.close(4000, 'Invalid JSON');
            }
        });
    });

    // ── Ping all clients every 30s to keep connections alive through proxies ──
    pingInterval = setInterval(() => {
        for (const [ws] of uiClients) {
            if (ws.isAlive === false) {
                uiClients.delete(ws);
                ws.terminate();
                continue;
            }
            ws.isAlive = false;
            ws.ping();
        }
        for (const [deviceId, entry] of hardwareClients) {
            if (entry.ws.isAlive === false) {
                hardwareClients.delete(deviceId);
                deviceQueries.updateStatus(deviceId, 'offline');
                entry.ws.terminate();
                console.log(`[WS] Hardware ping timeout: ${deviceId}`);
                continue;
            }
            entry.ws.isAlive = false;
            entry.ws.ping();
        }
    }, 30_000);

    wss.on('close', () => clearInterval(pingInterval));

    console.log('[WS] WebSocket server initialized on /ws');
}

// ─── Pairing ───────────────────────────────────────────────

/**
 * Handle {type:'pair', pairing_code, deviceId, name} from ESP32.
 * If code is valid, creates device + api_key and sends {type:'paired', api_key} back.
 */
async function handlePairingMessage(ws, msg) {
    const { pairing_code, deviceId, name = 'OrangeBrew ESP32' } = msg;

    if (!pairing_code || !deviceId) {
        ws.send(JSON.stringify({ type: 'error', message: 'pairing_code and deviceId are required' }));
        ws.close(4000, 'Bad pairing payload');
        return;
    }

    const pairing = pairingQueries.getByCode(pairing_code);
    if (!pairing) {
        ws.send(JSON.stringify({ type: 'error', message: 'Invalid or expired pairing code' }));
        ws.close(4001, 'Invalid pairing code');
        return;
    }

    // Generate per-device api_key
    const api_key = randomUUID();

    // Create/upsert device record owned by the user who initiated pairing
    deviceQueries.upsert(deviceId, name, pairing.user_id, api_key);

    // Mark pairing as used
    pairingQueries.markUsed(pairing.id, deviceId);

    console.log(`[WS] Device paired: ${deviceId} → user_id=${pairing.user_id}`);

    // Tell ESP32 its new api_key (it should store in NVS and reconnect with type:'auth')
    ws.send(JSON.stringify({ type: 'paired', api_key }));
    ws.close(1000, 'Paired — reconnect with api_key');
}

// ─── Client setup ──────────────────────────────────────────

function setupUiClient(ws, userId) {
    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });
    uiClients.set(ws, { userId });
    console.log(`[WS] UI client connected (userId=${userId}). Total UI: ${uiClients.size}`);

    ws.send(JSON.stringify({
        type: 'init',
        sensors: getSensorReadings(),
        control: getControlState(),
    }));

    ws.on('message', (raw) => {
        try {
            const msg = JSON.parse(raw.toString());
            handleUiMessage(ws, userId, msg);
        } catch {
            ws.send(JSON.stringify({ type: 'error', message: 'Invalid JSON' }));
        }
    });

    ws.on('close', () => {
        uiClients.delete(ws);
        console.log(`[WS] UI client disconnected (userId=${userId}). Total UI: ${uiClients.size}`);
    });

    ws.on('error', () => {
        uiClients.delete(ws);
    });
}

function setupHardwareClient(ws, deviceId, userId, name = 'OrangeBrew ESP32', role = 'unassigned') {
    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });
    hardwareClients.set(deviceId, { ws, userId });
    ws.deviceId = deviceId;
    deviceQueries.updateStatus(deviceId, 'online');

    console.log(`[WS] Hardware connected: ${deviceId} (user=${userId}, name=${name}). Total HW: ${hardwareClients.size}`);

    ws.on('message', (raw) => {
        ws.isAlive = true;
        try {
            const msg = JSON.parse(raw.toString());
            handleHardwareMessage(deviceId, msg);
        } catch {
            console.error(`[WS] Invalid JSON from hardware ${deviceId}`);
        }
    });

    ws.on('close', () => {
        hardwareClients.delete(deviceId);
        deviceQueries.updateStatus(deviceId, 'offline');
        console.log(`[WS] Hardware disconnected: ${deviceId}`);
    });

    ws.on('error', () => {
        hardwareClients.delete(deviceId);
        deviceQueries.updateStatus(deviceId, 'offline');
    });
}

// ─── Message handlers ──────────────────────────────────────

function handleUiMessage(ws, userId, msg) {
    if (onCommandHandler) {
        onCommandHandler(msg, userId);
    }
}

function handleHardwareMessage(deviceId, msg) {
    if (onHardwareDataHandler) {
        const meta = hardwareClients.get(deviceId);
        onHardwareDataHandler(deviceId, msg, meta?.userId);
    }
}

let onCommandHandler = null;
let onHardwareDataHandler = null;

export function onWsCommand(handler) {
    onCommandHandler = handler;
}

export function onHardwareData(handler) {
    onHardwareDataHandler = handler;
}

// ─── Broadcast helpers ─────────────────────────────────────

/**
 * Send a message to all UI connections of a specific user.
 * @param {number} userId
 * @param {string} type
 * @param {object} data
 */
export function broadcastToUser(userId, type, data) {
    const msg = JSON.stringify({ type, data, timestamp: Date.now() });
    for (const [ws, meta] of uiClients) {
        if (meta.userId === userId && ws.readyState === 1) {
            ws.send(msg);
        }
    }
}

/**
 * Broadcast to ALL connected UI clients (used for global sensor data in single-user or system events).
 */
function broadcastAll(payload) {
    const msg = JSON.stringify({ ...payload, timestamp: Date.now() });
    for (const ws of uiClients.keys()) {
        if (ws.readyState === 1) ws.send(msg);
    }
}

export function broadcastSensors(sensorData) {
    broadcastAll({ type: 'sensors', data: sensorData });
}

export function broadcastControl(controlState, userId = null) {
    if (userId !== null) {
        broadcastToUser(userId, 'control', controlState);
    } else {
        broadcastAll({ type: 'control', data: controlState });
    }
}

export function broadcastPhaseChange(phase, sessionType) {
    broadcastAll({ type: 'phaseChange', phase, sessionType });
}

export function broadcastAlert(level, message) {
    broadcastAll({ type: 'alert', level, message });
}

/**
 * Broadcast process state.
 * When userId is provided → only sent to that user's sessions.
 * Without userId → sent to all (legacy/global fallback).
 * @param {object} state
 * @param {number|null} userId
 */
export function broadcastProcessState(state, userId = null) {
    if (userId !== null) {
        broadcastToUser(userId, 'process', state);
    } else {
        broadcastAll({ type: 'process', data: state });
    }
}

// ─── Hardware commands ─────────────────────────────────────

export function sendToHardware(deviceId, cmd) {
    const entry = hardwareClients.get(deviceId);
    if (entry?.ws.readyState === 1) {
        entry.ws.send(JSON.stringify(cmd));
        return true;
    }
    return false;
}

/**
 * Send command to all hardware devices owned by a specific user.
 */
export function sendToUserHardware(userId, cmd) {
    const msg = JSON.stringify(cmd);
    let sent = false;
    for (const [deviceId, entry] of hardwareClients) {
        if (entry.userId === userId && entry.ws.readyState === 1) {
            entry.ws.send(msg);
            sent = true;
        }
    }
    return sent;
}

export function broadcastToAllHardware(cmd) {
    let sent = false;
    const msg = JSON.stringify(cmd);
    for (const entry of hardwareClients.values()) {
        if (entry.ws.readyState === 1) {
            entry.ws.send(msg);
            sent = true;
        }
    }
    return sent;
}

// ─── Stats ─────────────────────────────────────────────────

export function getClientCount() {
    return uiClients.size;
}

export function getHardwareCount() {
    return hardwareClients.size;
}
