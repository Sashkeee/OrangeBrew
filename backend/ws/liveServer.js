import { WebSocketServer } from 'ws';
import { getSensorReadings } from '../routes/sensors.js';
import { getControlState } from '../routes/control.js';

/** @type {Set<import('ws').WebSocket>} */
const clients = new Set();

let wss = null;

/**
 * Initialize WebSocket server on the given HTTP server.
 * @param {import('http').Server} server
 */
export function initWebSocket(server) {
    wss = new WebSocketServer({ server, path: '/ws' });

    wss.on('connection', (ws) => {
        clients.add(ws);
        console.log(`[WS] Client connected. Total: ${clients.size}`);

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
    });

    console.log('[WS] WebSocket server initialized on /ws');
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
