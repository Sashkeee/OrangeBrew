import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import path from 'path';
import { fileURLToPath } from 'url';

import { initDatabase, closeDatabase } from './db/database.js';
import { initWebSocket, broadcastSensors, broadcastProcessState } from './ws/liveServer.js';
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
import { authenticate } from './middleware/auth.js';
import { addDefaultAdminIfNoneExists } from './db/seedAuth.js';

const PORT = parseInt(process.env.PORT) || 3001;
const DB_PATH = process.env.DB_PATH || './data/orangebrew.db';
const CONNECTION_TYPE = process.env.CONNECTION_TYPE || 'mock';

// ─── Express ──────────────────────────────────────────────

const app = express();
app.use(cors());
app.use(express.json());

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Health check
app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        uptime: process.uptime(),
        connectionType: CONNECTION_TYPE,
        timestamp: new Date().toISOString(),
    });
});

// Auth route (public)
app.use('/api/auth', authRouter);

// Protected API routes
app.use('/api/recipes', authenticate, recipesRouter);
app.use('/api/sessions', authenticate, sessionsRouter);
app.use('/api/sensors', authenticate, sensorsRouter);
app.use('/api/control', authenticate, controlRouter);
app.use('/api/settings', authenticate, settingsRouter);
app.use('/api/telegram', authenticate, telegramRouter);
app.use('/api/users', authenticate, usersRouter);

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

const frontendDist = path.join(__dirname, '../frontend/dist');
app.use(express.static(frontendDist));
app.get('*', (req, res) => {
    res.sendFile(path.join(frontendDist, 'index.html'));
});


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

    if (CONNECTION_TYPE === 'mock') {
        console.log('[Server] Starting in MOCK mode (no physical hardware)');
        serial = new MockSerial();

        // Forward commands from control routes to mock
        setCommandSender((cmd) => {
            // If manual heater command, disable PID
            if (cmd.cmd === 'setHeater' && pidManager && pidManager.enabled) {
                // pidManager.setEnabled(false); // Optional: auto-disable PID on manual override
            }
            serial.write(JSON.stringify(cmd));
        });

        // Listen for sensor data from mock

        serial.on('ack', (ack) => {
            console.log(`[Mock] ACK: ${ack.cmd} → ${ack.ok ? 'OK' : 'FAIL'}`);
        });

        // Initialize PID Manager
        pidManager = new PidManager(serial);

        // serial.start(); // Not needed for MockSerial (auto-starts)
    } else {
        const portName = process.env.SERIAL_PORT || 'COM3';
        const baudRate = parseInt(process.env.BAUD_RATE) || 115200;
        console.log(`[Server] Serial mode starting on ${portName} at ${baudRate} baud`);

        serial = new RealSerial(portName, baudRate);
        setCommandSender((cmd) => serial.write(JSON.stringify(cmd)));
        pidManager = new PidManager(serial);
        serial.start();
    }

    // ─── Process Manager ──────────────────────────────────────

    const processManager = new ProcessManager(pidManager);

    // Broadcast updates
    processManager.on('update', (state) => {
        broadcastProcessState(state);
    });

    // Global Serial error handler to prevent Node.js crashes if USB disconnects
    serial.on('error', (err) => {
        console.error('[Global Serial Error] Connection issue:', err.message);
        // Optional: Implement reconnect logic here in the future
    });

    // Pass sensor data to Process Manager and Clients
    serial.on('data', (data) => {
        // Core updates
        updateSensorReadings(data);
        broadcastSensors(data);
        telegram.updateSensorData(data);
        telegram.updateControlState(getControlState());

        // Process Logic
        processManager.handleSensorData(data);
    });

    // Mount Process API
    app.use('/api/process', createProcessRouter(processManager));

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
