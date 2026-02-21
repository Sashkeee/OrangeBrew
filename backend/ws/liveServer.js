import { WebSocketServer } from 'ws';
import jwt from 'jsonwebtoken';
import url from 'url';
import { getSensorReadings } from '../routes/sensors.js';
import { getControlState } from '../routes/control.js';

const JWT_SECRET = process.env.JWT_SECRET || 'fallback_super_secret_for_orangebrew';
const HARDWARE_API_KEY = process.env.HARDWARE_API_KEY || 'default_hardware_key_123';

/** @type {Set<import('ws').WebSocket>} */
const clients = new Set();

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
                    if (msg.auth_key === HARDWARE_API_KEY) {
                        clearTimeout(authTimeout);
                        setupAuthenticatedClient(ws);
                        // Forward if it contains other commands too
                        if (msg.type || msg.cmd) {
                            handleClientMessage(ws, msg);
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
    clients.add(ws);
    console.log(`[WS] Client authenticated and connected. Total: ${clients.size}`);

    // Send initial state
    ws.send(JSON.stringify({
        type: 'init',
        sensors: getSensorReadings(),
        control: getControlState(),
    }));


    ws.on('message', (raw) => {
        try {
            const msg = JSON.parse(raw.toString());
            handleClientMessage(ws, msg);
        } catch (e) {
            ws.send(JSON.stringify({ type: 'error', message: 'Invalid JSON' }));
        }
    });

    ws.on('close', () => {
        clients.delete(ws);
        console.log(`[WS] Client disconnected. Total: ${clients.size}`);
    });

    ws.on('error', (err) => {
        console.error('[WS] Client error:', err.message);
        clients.delete(ws);
    });
}

/**
 * Handle incoming message from a WebSocket client.
 */
function handleClientMessage(ws, msg) {
    // Forward control commands via the onCommand handler
    if (onCommandHandler && msg.type) {
        onCommandHandler(msg);
    }
}

/** Callback for control commands from WS clients */
let onCommandHandler = null;

/**
 * Register a handler for control commands received via WebSocket.
 * @param {Function} handler
 */
export function onWsCommand(handler) {
    onCommandHandler = handler;
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
    for (const ws of clients) {
        if (ws.readyState === 1) { // OPEN
            ws.send(msg);
        }
    }
}

/**
 * Broadcast control state update.
 */
export function broadcastControl(controlState) {
    const msg = JSON.stringify({
        type: 'control',
        data: controlState,
        timestamp: Date.now(),
    });
    for (const ws of clients) {
        if (ws.readyState === 1) {
            ws.send(msg);
        }
    }
}

/**
 * Broadcast a phase change event.
 */
export function broadcastPhaseChange(phase, sessionType) {
    const msg = JSON.stringify({
        type: 'phaseChange',
        phase,
        sessionType,
        timestamp: Date.now(),
    });
    for (const ws of clients) {
        if (ws.readyState === 1) {
            ws.send(msg);
        }
    }
}

/**
 * Broadcast an alert.
 */
export function broadcastAlert(level, message) {
    const msg = JSON.stringify({
        type: 'alert',
        level,  // 'warning' | 'error' | 'info'
        message,
        timestamp: Date.now(),
    });
    for (const ws of clients) {
        if (ws.readyState === 1) {
            ws.send(msg);
        }
    }
}

/**
 * Broadcast process state update.
 */
export function broadcastProcessState(state) {
    global._latestProcessState = state; // Save for periodic reports
    const msg = JSON.stringify({
        type: 'process',
        data: state,
        timestamp: Date.now(),
    });
    for (const ws of clients) {
        if (ws.readyState === 1) {
            ws.send(msg);
        }
    }
}

/**
 * Get the count of connected clients.
 */
export function getClientCount() {
    return clients.size;
}
