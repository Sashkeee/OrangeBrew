import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import logger from './utils/logger.js';
import rateLimit from 'express-rate-limit';
import { createServer } from 'http';
import path from 'path';
import { fileURLToPath } from 'url';

// ─── Global error handlers (must be registered early) ─────
process.on('uncaughtException', (err) => {
    logger.fatal({ err }, 'Uncaught exception — exiting');
    process.exit(1);
});
process.on('unhandledRejection', (reason) => {
    logger.error({ err: reason }, 'Unhandled promise rejection');
});

import { initDatabase, closeDatabase } from './db/database.js';
import {
    initWebSocket,
    closeWebSocket,
    broadcastSensors,
    broadcastProcessState,
    onWsCommand,
    onHardwareData,
    sendToHardware,
    sendToUserHardware,
    broadcastToAllHardware,
    getClientCount,
    getHardwareCount
} from './ws/liveServer.js';
import { settingsQueries, sensorQueries, deviceQueries, auditQueries } from './db/database.js';
import { updateSensorReadings, updateDiscoveredSensors } from './routes/sensors.js';
import { setCommandSender, getControlState } from './routes/control.js';
import { MockSerial } from './serial/mockSerial.js';
import { mapSensors } from './utils/sensorMapper.js';
// @deprecated — RealSerial (USB Serial) больше не используется, ESP подключаются по WiFi/WebSocket
// import { RealSerial } from './serial/realSerial.js';
import PidManager from './pid/PidManager.js';
import telegram from './services/telegram.js';
import ProcessManager from './services/ProcessManager.js';

import recipesRouter from './routes/recipes.js';
import sessionsRouter from './routes/sessions.js';
import sensorsRouter from './routes/sensors.js';
import controlRouter from './routes/control.js';
import createSettingsRouter from './routes/settings.js';
import telegramRouter from './routes/telegram.js';
import processRouter from './routes/process.js';
import usersRouter from './routes/users.js';
import authRouter from './routes/auth.js';
import devicesRouter from './routes/devices.js';
import beerxmlRouter from './routes/beerxml.js';
import recipeSocialRouter from './routes/recipe-social.js';
import adminRouter from './routes/admin.js';
import { authenticate } from './middleware/auth.js';
import { errorHandler } from './middleware/errorHandler.js';
import { INTERVALS } from './config/constants.js';
import { swaggerUi, swaggerSpec } from './swagger.js';
import { addDefaultAdminIfNoneExists } from './db/seedAuth.js';

const PORT = parseInt(process.env.PORT) || 3001;
const DB_PATH = process.env.DB_PATH || './data/orangebrew.db';
const CONNECTION_TYPE = process.env.CONNECTION_TYPE || 'mock';

// ─── Express ──────────────────────────────────────────────

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

const app = express();
app.use(helmet({
    // CSP отключён — frontend и backend на разных портах в dev; Caddy управляет заголовками в prod
    contentSecurityPolicy: false,
}));
app.use(cors({
    origin: FRONTEND_URL,
    credentials: true,
}));
app.use(express.json());

// Rate limiting
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 минут
    max: 20,                   // 20 попыток за окно
    message: { error: 'Слишком много попыток. Повторите через 15 минут.' },
    standardHeaders: true,
    legacyHeaders: false,
});

const apiLimiter = rateLimit({
    windowMs: 60 * 1000,  // 1 минута
    max: 200,             // 200 запросов/мин на общий API
    standardHeaders: true,
    legacyHeaders: false,
});

// Structured HTTP request logging (pino-http → stdout → Vector → Betterstack)
app.use(pinoHttp({
    logger,
    // Skip health checks to reduce noise
    autoLogging: {
        ignore: (req) => req.url === '/health' || req.url === '/api/health',
    },
    customLogLevel: (req, res, err) => {
        if (err || res.statusCode >= 500) return 'error';
        if (res.statusCode >= 400) return 'warn';
        return 'info';
    },
    customSuccessMessage: (req, res) => `${req.method} ${req.url} ${res.statusCode}`,
    customErrorMessage: (req, res, err) => `${req.method} ${req.url} ${res.statusCode} — ${err?.message}`,
}));

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Swagger UI — enabled via SWAGGER_ENABLED env var (default: true in dev, false in prod)
const swaggerEnabled = process.env.SWAGGER_ENABLED
    ? process.env.SWAGGER_ENABLED === 'true'
    : process.env.NODE_ENV !== 'production';

if (swaggerEnabled) {
    app.use('/api-docs', apiLimiter, swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
        customSiteTitle: 'OrangeBrew API Docs',
        customCss: `
            /* Move opening brace to its own line in Schemas section */
            .model-box .model { display: block; }
            .model .brace-open { display: block; }
        `,
    }));
    app.get('/api-docs.json', apiLimiter, (req, res) => res.json(swaggerSpec));
    logger.info({ module: 'Server' }, 'Swagger UI enabled at /api-docs');
}

// Health check
app.get(['/api/health', '/health'], (req, res) => {
    res.json({
        status: 'ok',
        uptime: process.uptime(),
        connectionType: CONNECTION_TYPE,
        timestamp: new Date().toISOString(),
    });
});

// Auth route (public) — rate limiting только на проде
const isProd = process.env.NODE_ENV === 'production';
app.use(['/api/auth', '/auth'], ...(isProd ? [authLimiter] : []), authRouter);

// Protected API routes
app.use(['/api/recipes', '/recipes'], authenticate, recipesRouter);
app.use(['/api/sessions', '/sessions'], authenticate, sessionsRouter);
app.use(['/api/sensors', '/sensors'], authenticate, sensorsRouter);
app.use(['/api/control', '/control'], authenticate, controlRouter);
app.use(['/api/telegram', '/telegram'], authenticate, telegramRouter);
app.use(['/api/users', '/users'], authenticate, usersRouter);
app.use(['/api/devices', '/devices'], authenticate, devicesRouter);
// Raw XML body support for BeerXML import (application/xml or text/xml)
app.use(['/api/beerxml', '/beerxml'], express.text({ type: ['application/xml', 'text/xml'], limit: '5mb' }));
app.use(['/api/beerxml', '/beerxml'], authenticate, beerxmlRouter);

// Social features: likes + comments (mounted under /api/recipes)
app.use(['/api/recipes', '/recipes'], authenticate, recipeSocialRouter);

// Admin panel (requireAdmin is inside the router)
app.use('/api/admin', authenticate, adminRouter);

// Per-user ProcessManagers — Map<userId, ProcessManager>
// Создаются лениво при первом обращении к /api/process
const processManagers = new Map();

app.use(['/api/process', '/process'], authenticate, (req, res, next) => {
    req.processManager = getOrCreateProcessManager(req.user.id);
    next();
}, processRouter);

const settingsRouterInstance = createSettingsRouter();
app.use(['/api/settings', '/settings'], authenticate, (req, res, next) => {
    // Инжектируем PidManager текущего пользователя (null если PM ещё не создан)
    req.pidManager = processManagers.get(req.user.id)?.pidManager ?? null;
    next();
}, settingsRouterInstance);

// Debug routes — protected in all environments (техдолг #2 из CLAUDE.md)
app.post('/api/debug/mock/temps', authenticate, (req, res) => {
    if (CONNECTION_TYPE !== 'mock' || !serial) return res.status(400).json({ error: 'Not in mock mode' });
    serial.setTemperatures(req.body);
    res.json({ ok: true });
});

app.post('/api/debug/mock/simulation', authenticate, (req, res) => {
    if (CONNECTION_TYPE !== 'mock' || !serial) return res.status(400).json({ error: 'Not in mock mode' });
    serial.setSimulationEnabled(req.body.enabled);
    res.json({ ok: true, enabled: req.body.enabled });
});

// PID Debug Routes — используют per-user ProcessManager
app.post('/api/debug/pid/enable', authenticate, (req, res) => {
    const pm = processManagers.get(req.user.id);
    if (!pm) return res.status(503).json({ error: 'No ProcessManager for user — start a process first' });
    pm.pidManager.setEnabled(req.body.enabled);
    res.json({ ok: true, enabled: req.body.enabled });
});

app.post('/api/debug/pid/target', authenticate, (req, res) => {
    const pm = processManagers.get(req.user.id);
    if (!pm) return res.status(503).json({ error: 'No ProcessManager for user — start a process first' });
    pm.pidManager.setTarget(req.body.target);
    res.json({ ok: true, target: req.body.target });
});

app.post('/api/debug/pid/tunings', authenticate, (req, res) => {
    const pm = processManagers.get(req.user.id);
    if (!pm) return res.status(503).json({ error: 'No ProcessManager for user — start a process first' });
    const { kp, ki, kd } = req.body;
    pm.pidManager.setTunings(kp, ki, kd);
    res.json({ ok: true, tunings: { kp, ki, kd } });
});


// ─── Serve Frontend ───────────────────────────────────────
// (Removed SPA serving from backend as it's now handled by Caddy/Nginx)

// ─── Centralized error handler (must be AFTER all routes) ─
app.use(errorHandler);

// ─── Initialize ───────────────────────────────────────────

let serial = null;

// ─── Per-User ProcessManager Factory ──────────────────────
// Вызывается из middleware /api/process при первом обращении пользователя.
// Каждый пользователь получает изолированный ProcessManager + PidManager.
// serial инициализируется в main() до первого HTTP-запроса, поэтому closure корректна.
function getOrCreateProcessManager(userId) {
    if (processManagers.has(userId)) return processManagers.get(userId);

    // Команды нагревателю/насосу идут только на устройства данного пользователя
    const userCommandSender = (cmd) => {
        // Приоритет: WiFi-устройство пользователя → local serial (fallback)
        const sent = sendToUserHardware(userId, cmd);
        if (!sent && serial) {
            serial.write(JSON.stringify(cmd));
        }
    };

    // Регистрируем per-user sender в control.js
    setCommandSender(userId, userCommandSender);

    // Создаём PidManager с userId — он передаёт его в setHeaterState
    const userPid = new PidManager(serial, userId);

    // Создаём ProcessManager с userId — он передаёт его в setPumpState
    const pm = new ProcessManager(userPid, userId);

    // Транслируем обновления только этому пользователю
    pm.on('update', (state) => {
        broadcastProcessState(state, userId);
    });

    processManagers.set(userId, pm);
    logger.info({ module: 'Server', userId }, 'ProcessManager created');
    return pm;
}


async function main() {
    // Database (async — sql.js loads WASM)
    await initDatabase(DB_PATH);
    await addDefaultAdminIfNoneExists();

    // Reset stale "online" statuses — devices will be marked online when they reconnect via WS
    deviceQueries.resetAllOnline();

    // HTTP + WebSocket server
    const server = createServer(app);
    initWebSocket(server);

    // Initialize Telegram
    telegram.initTelegram();

    // ─── Serial / Mock Connection ─────────────────────────────
    // Priority: CONNECTION_TYPE env var → settings_v2 DB → 'mock' fallback
    let connectionMode = CONNECTION_TYPE;
    if (!process.env.CONNECTION_TYPE) {
        // Env not explicitly set — check DB settings (global, user_id=null)
        try {
            const hwSettings = settingsQueries.get('hardware', null);
            if (hwSettings && hwSettings.connectionType) {
                connectionMode = hwSettings.connectionType;
                logger.info({ module: 'Server', source: 'db', mode: connectionMode }, 'Connection type loaded from DB settings');
            }
        } catch { /* ignore — DB may not have setting yet */ }
    }

    if (connectionMode === 'mock') {
        logger.info({ module: 'Server', mode: 'mock' }, 'Starting in MOCK mode (no physical hardware)');
        serial = new MockSerial();
        serial.on('ack', (ack) => {
            logger.debug({ module: 'Mock', cmd: ack.cmd, ok: ack.ok }, 'ACK');
        });
    } else if (connectionMode === 'wifi') {
        // WiFi-only mode: no local serial, hardware connects via WebSocket
        logger.info({ module: 'Server', mode: 'wifi' }, 'Starting in WiFi-only mode (no local serial)');
        serial = { on: () => {}, write: () => {}, stop: () => {} }; // no-op stub
    } else {
        // 'serial' and other values → deprecated, fallback to wifi mode
        logger.warn({ module: 'Server', requested: connectionMode }, 'Serial mode is deprecated — falling back to WiFi-only mode');
        serial = { on: () => {}, write: () => {}, stop: () => {} }; // no-op stub
    }

    // mapSensors dependencies — passed to utils/sensorMapper.js
    const sensorMapperDeps = { sensorQueries, settingsQueries, logger };

    // Global Serial error handler to prevent Node.js crashes if USB disconnects
    serial.on('error', (err) => {
        logger.error({ module: 'Serial', err: err.message }, 'Serial connection error');
    });

    // Pass Serial sensor data (local USB / mock device)
    serial.on('data', (data) => {
        if (data.type !== 'sensors') return; // ignore control/ack events from MockSerial
        const deviceId = 'local_serial';
        updateSensorReadings(data);
        broadcastSensors({ deviceId, sensors: data.sensors });
        telegram.updateSensorData(data);

        // Роутим данные в тот PM, который контролирует local_serial
        for (const pm of processManagers.values()) {
            if (pm.state.deviceId === 'local_serial') {
                pm.handleSensorData(deviceId, data);
                break;
            }
        }
    });

    // Pass WebSocket sensor data (WiFi ESP32 devices)
    // ESP32 may send type:'sensors' or type:'sensors_raw' — handle both
    let lastHwDataLog = 0;
    onHardwareData((deviceId, data, userId) => {
        const hasSensors = Array.isArray(data.sensors) && data.sensors.length > 0;
        const isSensorMsg = data.type === 'sensors_raw' || data.type === 'sensors' || hasSensors;
        if (!isSensorMsg) return;

        // Track discovered sensors (per-user, in-memory)
        if (hasSensors && userId != null) {
            updateDiscoveredSensors(userId, data.sensors);
        } else if (hasSensors && userId == null) {
            logger.warn({ module: 'Server', deviceId }, 'Sensor data received from device with null user_id — discovered sensors not updated. Check device pairing.');
        }

        // Маппинг адресов сенсоров с user-scoped настройками
        const mappedData = mapSensors(deviceId, data, userId, sensorMapperDeps);

        // Periodic log
        const now = Date.now();
        if (now - lastHwDataLog > INTERVALS.HW_DATA_LOG_MS) {
            logger.info({ module: 'Server', deviceId, userId, boiler: mappedData.boiler, sensors: data.sensors?.length || 0 }, 'WiFi sensor data received');
            lastHwDataLog = now;
        }

        updateSensorReadings(mappedData);
        // Include raw sensors array in broadcast so frontend can show individual sensors
        // Per-user isolation: only broadcast to the device owner
        broadcastSensors({ deviceId, sensors: data.sensors, ...mappedData }, userId);

        // Роутим только в PM владельца устройства
        if (userId != null) {
            const pm = processManagers.get(userId);
            if (pm) {
                const enrichedData = { ...mappedData, sensors: data.sensors };
                pm.handleSensorData(deviceId, enrichedData);
            }
        }
    });

    // Broadcast PID status occasionally? 
    // Or hooks into PidManager to emit WebSocket events?
    // For now, let's just let it run.

    // ─── Start ────────────────────────────────────────────────

    server.listen(PORT, () => {
        logger.info({ module: 'Server', port: PORT, mode: CONNECTION_TYPE }, 'OrangeBrew Backend started');
        logger.info({
            module: 'Server',
            nodeVersion: process.version,
            env: process.env.NODE_ENV,
            dbPath: DB_PATH,
            connectionType: connectionMode,
            memoryMb: Math.round(process.memoryUsage().rss / 1024 / 1024),
        }, 'Environment info');
    });

    // ─── Periodic Heartbeat (every 5 min) ────────────────────
    setInterval(() => {
        logger.info({
            module: 'Health',
            rssMemMb: Math.round(process.memoryUsage().rss / 1024 / 1024),
            heapUsedMb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
            uiClients: getClientCount(),
            hwClients: getHardwareCount(),
            uptime: Math.round(process.uptime()),
        }, 'Heartbeat');
    }, 5 * 60 * 1000);

    // ─── Audit log cleanup (every 24h, delete entries older than 30 days) ──
    const runAuditCleanup = () => {
        try {
            const { changes } = auditQueries.cleanup(30);
            if (changes > 0) {
                logger.info({ module: 'Audit', deleted: changes }, 'Audit log cleanup');
            }
        } catch (err) {
            logger.error({ module: 'Audit', err }, 'Audit cleanup failed');
        }
    };
    runAuditCleanup(); // run once at startup
    setInterval(runAuditCleanup, 24 * 60 * 60 * 1000);

    // ─── Graceful Shutdown ────────────────────────────────────

    const shutdown = (signal) => {
        logger.info({ module: 'Server', signal }, 'Shutting down gracefully...');

        if (serial) {
            // serial.handleCommand({ cmd: 'emergencyStop' }); // Old mock method
            serial.write(JSON.stringify({ cmd: 'emergencyStop' }));
            if (serial.stop) serial.stop();
        }

        for (const pm of processManagers.values()) {
            pm.pidManager.setEnabled(false);
            pm.stop();
        }

        telegram.shutdownTelegram();

        // Правильный порядок: сначала WS (ESP32 отключится),
        // потом DB — иначе последние пакеты датчиков крашат db.prepare(null)
        closeWebSocket();
        closeDatabase();

        server.close(() => {
            logger.info({ module: 'Server' }, 'Goodbye!');
            process.exit(0);
        });

        // Force exit after 5 seconds
        setTimeout(() => process.exit(1), INTERVALS.SHUTDOWN_TIMEOUT_MS);
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err) => {
    logger.error({ module: 'Server', err }, 'Fatal startup error');
    process.exit(1);
});
