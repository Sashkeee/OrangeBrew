import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import path from 'path';
import { fileURLToPath } from 'url';

import { initDatabase, closeDatabase } from './db/database.js';
import {
    initWebSocket,
    broadcastSensors,
    broadcastProcessState,
    onWsCommand,
    onHardwareData,
    sendToHardware,
    broadcastToAllHardware,
    getClientCount
} from './ws/liveServer.js';
import { settingsQueries } from './db/database.js';
import { updateSensorReadings } from './routes/sensors.js';
import { setCommandSender, getControlState } from './routes/control.js';
import { MockSerial } from './serial/mockSerial.js';
import { RealSerial } from './serial/realSerial.js';
import PidManager from './pid/PidManager.js';
import telegram from './services/telegram.js';
import ProcessManager from './services/ProcessManager.js';

import recipesRouter from './routes/recipes.js';
import sessionsRouter from './routes/sessions.js';
import sensorsRouter from './routes/sensors.js';
import controlRouter from './routes/control.js';
import settingsRouter from './routes/settings.js';
import telegramRouter from './routes/telegram.js';
import createProcessRouter from './routes/process.js';
import usersRouter from './routes/users.js';
import authRouter from './routes/auth.js';
import devicesRouter from './routes/devices.js';
import { authenticate } from './middleware/auth.js';
import { addDefaultAdminIfNoneExists } from './db/seedAuth.js';

const PORT = parseInt(process.env.PORT) || 3001;
const DB_PATH = process.env.DB_PATH || './data/orangebrew.db';
const CONNECTION_TYPE = process.env.CONNECTION_TYPE || 'mock';

// ─── Express ──────────────────────────────────────────────

const app = express();
app.use(cors());
app.use(express.json());

// Request logging for debugging routing behind proxy
app.use((req, res, next) => {
    console.log(`[API] ${req.method} ${req.url}`);
    next();
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Health check
app.get(['/api/health', '/health'], (req, res) => {
    res.json({
        status: 'ok',
        uptime: process.uptime(),
        connectionType: CONNECTION_TYPE,
        timestamp: new Date().toISOString(),
    });
});

// Auth route (public)
app.use(['/api/auth', '/auth'], authRouter);

// Protected API routes
app.use(['/api/recipes', '/recipes'], authenticate, recipesRouter);
app.use(['/api/sessions', '/sessions'], authenticate, sessionsRouter);
app.use(['/api/sensors', '/sensors'], authenticate, sensorsRouter);
app.use(['/api/control', '/control'], authenticate, controlRouter);
app.use(['/api/settings', '/settings'], authenticate, settingsRouter);
app.use(['/api/telegram', '/telegram'], authenticate, telegramRouter);
app.use(['/api/users', '/users'], authenticate, usersRouter);
app.use(['/api/devices', '/devices'], authenticate, devicesRouter);

let processManager = null; // Defined here so we can mount the router early
app.use(['/api/process', '/process'], (req, res, next) => {
    if (!processManager) return res.status(503).json({ error: 'Process Manager not ready' });
    createProcessRouter(processManager)(req, res, next);
});

// Debug routes for Mock
app.post('/api/debug/mock/temps', (req, res) => {
    if (CONNECTION_TYPE !== 'mock' || !serial) return res.status(400).json({ error: 'Not in mock mode' });
    serial.setTemperatures(req.body);
    res.json({ ok: true });
});

app.post('/api/debug/mock/simulation', (req, res) => {
    if (CONNECTION_TYPE !== 'mock' || !serial) return res.status(400).json({ error: 'Not in mock mode' });
    serial.setSimulationEnabled(req.body.enabled);
    res.json({ ok: true, enabled: req.body.enabled });
});

// PID Debug Routes (Temporary until standard control route updated)
app.post('/api/debug/pid/enable', (req, res) => {
    if (!pidManager) return res.status(500).json({ error: 'PID Manager not initialized' });
    pidManager.setEnabled(req.body.enabled);
    res.json({ ok: true, enabled: req.body.enabled });
});

app.post('/api/debug/pid/target', (req, res) => {
    if (!pidManager) return res.status(500).json({ error: 'PID Manager not initialized' });
    pidManager.setTarget(req.body.target);
    res.json({ ok: true, target: req.body.target });
});

app.post('/api/debug/pid/tunings', (req, res) => {
    if (!pidManager) return res.status(500).json({ error: 'PID Manager not initialized' });
    const { kp, ki, kd } = req.body;
    pidManager.setTunings(kp, ki, kd);
    res.json({ ok: true, tunings: { kp, ki, kd } });
});


// ─── Serve Frontend ───────────────────────────────────────
// (Removed SPA serving from backend as it's now handled by Caddy/Nginx)


// ─── Initialize ───────────────────────────────────────────

let serial = null;
let pidManager = null; // Global PID Manager

async function main() {
    // Database (async — sql.js loads WASM)
    await initDatabase(DB_PATH);
    await addDefaultAdminIfNoneExists();

    // HTTP + WebSocket server
    const server = createServer(app);
    initWebSocket(server);

    // Initialize Telegram
    telegram.initTelegram();

    // ─── Serial / Mock Connection ─────────────────────────────

    const sendCommand = (cmd) => {
        // Route command to the correct device
        const targetDeviceId = processManager?.state?.deviceId;

        if (targetDeviceId && targetDeviceId !== 'local_serial') {
            // Send to assigned WebSocket hardware
            const sent = sendToHardware(targetDeviceId, cmd);
            if (!sent) console.warn(`[Server] Failed to send command to device ${targetDeviceId} (disconnected?)`);
        } else {
            // IF IDLE or local_serial, we still want manual controls to work on connected ESPs!
            // Try to broadcast to all connected WebSocket hardware first.
            const broadcasted = broadcastToAllHardware(cmd);

            // If no ESPs connected, fallback to local Serial (USB)
            if (!broadcasted && serial) {
                serial.write(JSON.stringify(cmd));
            }
        }
    };

    if (CONNECTION_TYPE === 'mock') {
        console.log('[Server] Starting in MOCK mode (no physical hardware)');
        serial = new MockSerial();
        setCommandSender(sendCommand);
        serial.on('ack', (ack) => {
            console.log(`[Mock] ACK: ${ack.cmd} → ${ack.ok ? 'OK' : 'FAIL'}`);
        });
        pidManager = new PidManager(serial);
    } else {
        const portName = process.env.SERIAL_PORT || 'COM3';
        const baudRate = parseInt(process.env.BAUD_RATE) || 115200;
        console.log(`[Server] Serial mode starting on ${portName} at ${baudRate} baud`);

        serial = new RealSerial(portName, baudRate);
        setCommandSender(sendCommand);
        pidManager = new PidManager(serial);
        serial.start();
    }

    // ─── Process Manager ──────────────────────────────────────

    processManager = new ProcessManager(pidManager);

    /**
     * Maps raw sensor addresses to roles (boiler, column, etc.) based on settings.
     */
    function mapSensors(deviceId, rawData) {
        if (!rawData || !rawData.sensors) return rawData;

        let sensorSettings;
        try {
            sensorSettings = settingsQueries.get('sensors');
            if (typeof sensorSettings === 'string') {
                sensorSettings = JSON.parse(sensorSettings);
            }
        } catch (e) {
            console.warn('[mapSensors] Failed to load sensor settings:', e.message);
            sensorSettings = {};
        }
        sensorSettings = sensorSettings || {};

        const mapped = {
            type: 'sensors',
            deviceId,
            sensors: rawData.sensors,
            boiler: undefined,
            column: undefined
        };

        // 1. Try to find by specific address in settings
        for (const [role, config] of Object.entries(sensorSettings)) {
            if (config && config.enabled && config.address) {
                const found = rawData.sensors.find(s => s.address === config.address);
                if (found) {
                    // ESP шлёт { address, temp }, не { address, value }
                    const rawTemp = found.temp ?? found.value ?? 0;
                    mapped[role] = rawTemp + (config.offset || 0);
                }
            }
        }

        // 2. Fallback: If boiler is still undefined, take the first available sensor
        if (mapped.boiler === undefined && rawData.sensors.length > 0) {
            mapped.boiler = rawData.sensors[0].temp ?? rawData.sensors[0].value ?? 0;
        }

        // 3. Fallback: If column is still undefined, take the second sensor
        if (mapped.column === undefined && rawData.sensors.length > 1) {
            mapped.column = rawData.sensors[1].temp ?? rawData.sensors[1].value ?? 0;
        }

        return mapped;
    }

    // Broadcast updates
    processManager.on('update', (state) => {
        broadcastProcessState(state);
    });

    // Global Serial error handler to prevent Node.js crashes if USB disconnects
    serial.on('error', (err) => {
        console.error('[Global Serial Error] Connection issue:', err.message);
    });

    // Pass Serial sensor data (default device)
    serial.on('data', (data) => {
        const deviceId = 'local_serial';
        updateSensorReadings(data);
        broadcastSensors({ deviceId, sensors: data.sensors });
        telegram.updateSensorData(data);
        telegram.updateControlState(getControlState());

        processManager.handleSensorData(deviceId, data);
    });

    // Pass WebSocket sensor data (remote devices)
    onHardwareData((deviceId, data) => {
        // If data is sensors_raw, we route it
        if (data.type === 'sensors_raw') {
            const mappedData = mapSensors(deviceId, data);

            // Update global latest readings for REST API
            updateSensorReadings(mappedData);

            // Broadcast sensors (both raw for debugging and mapped for UI)
            broadcastSensors({ deviceId, sensors: data.sensors, ...mappedData });

            // Pass to process and pid managers
            processManager.handleSensorData(deviceId, mappedData);
            if (pidManager) pidManager.update(mappedData);
        }
    });

    // Broadcast PID status occasionally? 
    // Or hooks into PidManager to emit WebSocket events?
    // For now, let's just let it run.

    // ─── Start ────────────────────────────────────────────────

    server.listen(PORT, () => {
        console.log(`
╔══════════════════════════════════════════════╗
║         🍺 OrangeBrew Backend v0.1.0         ║
╠══════════════════════════════════════════════╣
║  REST API:   http://localhost:${PORT}/api       ║
║  WebSocket:  ws://localhost:${PORT}/ws          ║
║  Health:     http://localhost:${PORT}/api/health ║
║  Mode:       ${CONNECTION_TYPE.padEnd(31)}║
╚══════════════════════════════════════════════╝
`);
    });

    // ─── Graceful Shutdown ────────────────────────────────────

    const shutdown = (signal) => {
        console.log(`\n[Server] Received ${signal}. Shutting down gracefully...`);

        if (serial) {
            // serial.handleCommand({ cmd: 'emergencyStop' }); // Old mock method
            serial.write(JSON.stringify({ cmd: 'emergencyStop' }));
            if (serial.stop) serial.stop();
        }

        if (pidManager) {
            pidManager.setEnabled(false);
        }

        telegram.shutdownTelegram();

        closeDatabase();

        server.close(() => {
            console.log('[Server] Goodbye! 🍻');
            process.exit(0);
        });

        // Force exit after 5 seconds
        setTimeout(() => process.exit(1), 5000);
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err) => {
    console.error('[Server] Fatal error:', err);
    process.exit(1);
});
