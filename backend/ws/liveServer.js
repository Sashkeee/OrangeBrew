import { WebSocketServer } from 'ws';
import jwt from 'jsonwebtoken';
import url from 'url';
import { getSensorReadings } from '../routes/sensors.js';
import { getControlState } from '../routes/control.js';
import { deviceQueries } from '../db/database.js';

const JWT_SECRET = process.env.JWT_SECRET || 'fallback_super_secret_for_orangebrew';
const HARDWARE_API_KEY = process.env.HARDWARE_API_KEY || 'default_hardware_key_123';

/** @type {Set<import('ws').WebSocket>} */
const uiClients = new Set();

/** @type {Map<string, import('ws').WebSocket>} */
const hardwareClients = new Map();

let wss = null;

/**
 * Initialize WebSocket server on the given HTTP server.
 * @param {import('http').Server} server
 */
export function initWebSocket(server) {
    wss = new WebSocketServer({ server, path: '/ws' });

    wss.on('connection', (ws, req) => {
        const query = url.parse(req.url, true).query;
        let isAuth = false;

        // Check if token query is present for web UI
        if (query.token) {
            try {
                jwt.verify(query.token, JWT_SECRET);
                isAuth = true;
            } catch (err) {
                // Invalid token
            }
        }

        // Wait for first message from Hardware to provide hardware key, or if token was valid from UI then we are good
        if (isAuth) {
            setupAuthenticatedClient(ws);
        } else {
            // Hardware doesn't support query token easily right now, wait for a message with auth_key.
            // Allow 5 seconds to auth
            const authTimeout = setTimeout(() => {
                ws.close(4001, 'Unauthorized');
            }, 5000);

            ws.once('message', (raw) => {
                try {
                    const msg = JSON.parse(raw.toString());
                    // Support old auth_key or new auth object
                    const key = msg.auth_key || (msg.type === 'auth' ? msg.apiKey : null);

                    if (key === HARDWARE_API_KEY) {
                        clearTimeout(authTimeout);
                        const deviceId = msg.deviceId || `esp32_${Math.random().toString(36).substr(2, 9)}`;
                        setupHardwareClient(ws, deviceId, msg.name, msg.role);

                        // Forward if it contains other data too
                        if (msg.type === 'sensors_raw') {
                            handleHardwareMessage(ws, deviceId, msg);
                        }
                    } else {
                        ws.close(4001, 'Unauthorized hardware key');
                    }
                } catch (e) {
                    ws.close(4000, 'Invalid auth payload');
                }
            });
        }
    });

    console.log('[WS] WebSocket server initialized on /ws (Secured)');
}

function setupAuthenticatedClient(ws) {
    uiClients.add(ws);
    console.log(`[WS] UI Client connected. Total UI: ${uiClients.size}`);

    ws.send(JSON.stringify({
        type: 'init',
        sensors: getSensorReadings(),
        control: getControlState(),
    }));

    ws.on('message', (raw) => {
        try {
            const msg = JSON.parse(raw.toString());
            handleUiMessage(ws, msg);
        } catch (e) {
            ws.send(JSON.stringify({ type: 'error', message: 'Invalid JSON' }));
        }
    });

    ws.on('close', () => {
        uiClients.delete(ws);
        console.log(`[WS] UI Client disconnected. Total UI: ${uiClients.size}`);
    });

    ws.on('error', (err) => {
        uiClients.delete(ws);
    });
}

function setupHardwareClient(ws, deviceId, name = 'OrangeBrew ESP32', role = 'unassigned') {
    // Upsert to DB
    deviceQueries.upsert(deviceId, name, role);

    // Store in Map
    hardwareClients.set(deviceId, ws);
    ws.deviceId = deviceId;

    console.log(`[WS] Hardware connected: ${deviceId} (${name}). Total Hardware: ${hardwareClients.size}`);

    ws.on('message', (raw) => {
        try {
            const msg = JSON.parse(raw.toString());
            handleHardwareMessage(ws, deviceId, msg);
        } catch (e) {
            console.error(`[WS] Invalid hardware JSON from ${deviceId}`);
        }
    });

    ws.on('close', () => {
        hardwareClients.delete(deviceId);
        deviceQueries.updateStatus(deviceId, 'offline');
        console.log(`[WS] Hardware disconnected: ${deviceId}`);
    });

    ws.on('error', (err) => {
        hardwareClients.delete(deviceId);
        deviceQueries.updateStatus(deviceId, 'offline');
    });
}

function handleUiMessage(ws, msg) {
    // Web UI sends commands
    if (onCommandHandler) {
        onCommandHandler(msg);
    }
}

function handleHardwareMessage(ws, deviceId, msg) {
    // Hardware sends sensor data
    if (onHardwareDataHandler) {
        onHardwareDataHandler(deviceId, msg);
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

/**
 * Broadcast sensor data to all connected clients.
 * @param {object} sensorData
 */
export function broadcastSensors(sensorData) {
    const msg = JSON.stringify({
        type: 'sensors',
        data: sensorData,
        timestamp: Date.now(),
    });
    for (const ws of uiClients) {
        if (ws.readyState === 1) ws.send(msg);
    }
}

export function broadcastControl(controlState) {
    const msg = JSON.stringify({
        type: 'control',
        data: controlState,
        timestamp: Date.now(),
    });
    for (const ws of uiClients) {
        if (ws.readyState === 1) ws.send(msg);
    }
}

export function broadcastPhaseChange(phase, sessionType) {
    const msg = JSON.stringify({
        type: 'phaseChange',
        phase,
        sessionType,
        timestamp: Date.now(),
    });
    for (const ws of uiClients) {
        if (ws.readyState === 1) ws.send(msg);
    }
}

export function broadcastAlert(level, message) {
    const msg = JSON.stringify({
        type: 'alert',
        level,
        message,
        timestamp: Date.now(),
    });
    for (const ws of uiClients) {
        if (ws.readyState === 1) ws.send(msg);
    }
}

export function broadcastProcessState(state) {
    global._latestProcessState = state;
    const msg = JSON.stringify({
        type: 'process',
        data: state,
        timestamp: Date.now(),
    });
    for (const ws of uiClients) {
        if (ws.readyState === 1) ws.send(msg);
    }
}

export function sendToHardware(deviceId, cmd) {
    const ws = hardwareClients.get(deviceId);
    if (ws && ws.readyState === 1) {
        ws.send(JSON.stringify(cmd));
        return true;
    }
    return false;
}

export function getClientCount() {
    return uiClients.size;
}

export function getHardwareCount() {
    return hardwareClients.size;
}
