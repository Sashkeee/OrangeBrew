import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { createServer } from 'http';

import { initDatabase, closeDatabase } from './db/database.js';
import { initWebSocket, broadcastSensors } from './ws/liveServer.js';
import { updateSensorReadings } from './routes/sensors.js';
import { setCommandSender } from './routes/control.js';
import { MockSerial } from './serial/mockSerial.js';

import recipesRouter from './routes/recipes.js';
import sessionsRouter from './routes/sessions.js';
import sensorsRouter from './routes/sensors.js';
import controlRouter from './routes/control.js';
import settingsRouter from './routes/settings.js';

const PORT = parseInt(process.env.PORT) || 3001;
const DB_PATH = process.env.DB_PATH || './data/orangebrew.db';
const CONNECTION_TYPE = process.env.CONNECTION_TYPE || 'mock';

// ─── Express ──────────────────────────────────────────────

const app = express();
app.use(cors());
app.use(express.json());

// Health check
app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        uptime: process.uptime(),
        connectionType: CONNECTION_TYPE,
        timestamp: new Date().toISOString(),
    });
});

// API routes
app.use('/api/recipes', recipesRouter);
app.use('/api/sessions', sessionsRouter);
app.use('/api/sensors', sensorsRouter);
app.use('/api/control', controlRouter);
app.use('/api/settings', settingsRouter);

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

// ─── Initialize ───────────────────────────────────────────

let serial = null;

async function main() {
    // Database (async — sql.js loads WASM)
    await initDatabase(DB_PATH);

    // HTTP + WebSocket server
    const server = createServer(app);
    initWebSocket(server);

    // ─── Serial / Mock Connection ─────────────────────────────

    if (CONNECTION_TYPE === 'mock') {
        console.log('[Server] Starting in MOCK mode (no physical hardware)');
        serial = new MockSerial();

        // Forward commands from control routes to mock
        setCommandSender((cmd) => serial.handleCommand(cmd));

        // Listen for sensor data from mock
        serial.on('sensors', (data) => {
            updateSensorReadings(data);
            broadcastSensors(data);
        });

        serial.on('ack', (ack) => {
            console.log(`[Mock] ACK: ${ack.cmd} → ${ack.ok ? 'OK' : 'FAIL'}`);
        });

        serial.start();
    } else {
        console.log(`[Server] Serial mode: ${CONNECTION_TYPE} (not implemented yet — falling back to mock)`);
        serial = new MockSerial();
        setCommandSender((cmd) => serial.handleCommand(cmd));
        serial.on('sensors', (data) => {
            updateSensorReadings(data);
            broadcastSensors(data);
        });
        serial.start();
    }

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
            serial.handleCommand({ cmd: 'emergencyStop' });
            serial.stop();
        }

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
