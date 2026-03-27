import { Router } from 'express';
import { settingsQueries } from '../db/database.js';
import { sendMessage, reloadTelegramConfig } from '../services/telegram.js';
import logger from '../utils/logger.js';
import { writeAudit } from '../utils/audit.js';

const log = logger.child({ module: 'Settings' });
const router = Router();

/**
 * Create settings router.
 * pidManager берётся из req.pidManager, который инжектируется middleware в server.js.
 */
export default function createSettingsRouter() {

    /**
     * @openapi
     * /api/settings:
     *   get:
     *     tags: [Settings]
     *     summary: Get settings for current user
     *     description: Returns global defaults merged with user-specific overrides.
     *     security:
     *       - bearerAuth: []
     *     responses:
     *       200:
     *         description: Key-value settings object (global defaults + user overrides)
     *         content:
     *           application/json:
     *             schema:
     *               type: object
     *               additionalProperties: true
     *       500:
     *         description: Server error
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/Error'
     */
    router.get('/', (req, res) => {
        try {
            // Global defaults first, then user overrides on top
            const global  = settingsQueries.getAll(null);
            const userSet = settingsQueries.getAll(req.user.id);
            res.json({ ...global, ...userSet });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    /**
     * @openapi
     * /api/settings:
     *   put:
     *     tags: [Settings]
     *     summary: Bulk update settings for current user
     *     description: |
     *       Saves key-value pairs to settings_v2 for the authenticated user.
     *       If `telegram` key is present, reloads Telegram service config.
     *       If `pid` key contains kp/ki/kd, applies tunings to the running PidManager.
     *     security:
     *       - bearerAuth: []
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema:
     *             type: object
     *             additionalProperties: true
     *             properties:
     *               pid:
     *                 type: object
     *                 properties:
     *                   kp:
     *                     type: number
     *                     example: 2.5
     *                   ki:
     *                     type: number
     *                     example: 0.1
     *                   kd:
     *                     type: number
     *                     example: 1.0
     *               telegram:
     *                 type: object
     *                 description: Telegram settings (triggers config reload)
     *     responses:
     *       200:
     *         description: Settings saved
     *         content:
     *           application/json:
     *             schema:
     *               type: object
     *               properties:
     *                 ok:
     *                   type: boolean
     *                   example: true
     *       500:
     *         description: Server error
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/Error'
     */
    router.put('/', (req, res) => {
        try {
            settingsQueries.setBulk(req.body, req.user.id);

            // If telegram settings were updated, reload the service
            if (req.body.telegram) {
                reloadTelegramConfig();
            }

            // If PID settings were updated, apply to the running PidManager (injected by server.js)
            const pidManager = req.pidManager;
            if (req.body.pid && pidManager) {
                const pid = req.body.pid;
                if (pid.kp !== undefined && pid.ki !== undefined && pid.kd !== undefined) {
                    pidManager.setTunings(pid.kp, pid.ki, pid.kd);
                    log.info({ kp: pid.kp, ki: pid.ki, kd: pid.kd }, 'Applied PID tunings');
                }
            }

            const sections = Object.keys(req.body).join(', ');
            writeAudit({ userId: req.user.id, action: 'settings.update', detail: `Updated: ${sections}`, ip: req.ip });
            res.json({ ok: true });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    /**
     * @openapi
     * /api/settings/kalman:
     *   get:
     *     tags: [Settings]
     *     summary: Get Kalman filter status
     *     description: Returns current Kalman filter parameters, gain, and raw/filtered input values from PidManager.
     *     security:
     *       - bearerAuth: []
     *     responses:
     *       200:
     *         description: Kalman filter status
     *         content:
     *           application/json:
     *             schema:
     *               type: object
     *               properties:
     *                 enabled:
     *                   type: boolean
     *                   example: false
     *                 q:
     *                   type: number
     *                   description: Process noise covariance
     *                   example: 0.01
     *                 r:
     *                   type: number
     *                   description: Measurement noise covariance
     *                   example: 0.05
     *                 gain:
     *                   type: number
     *                   nullable: true
     *                   description: Current Kalman gain
     *                 rawInput:
     *                   type: number
     *                   nullable: true
     *                   description: Last raw sensor reading
     *                 filteredInput:
     *                   type: number
     *                   nullable: true
     *                   description: Last filtered sensor reading
     */
    router.get('/kalman', (req, res) => {
        const pidManager = req.pidManager;
        if (!pidManager) return res.json({ enabled: false, q: 0.01, r: 0.05, gain: null, rawInput: null, filteredInput: null });
        res.json(pidManager.getKalmanStatus());
    });

    /**
     * @openapi
     * /api/settings/kalman:
     *   post:
     *     tags: [Settings]
     *     summary: Update Kalman filter parameters
     *     description: Updates Kalman filter settings on the running PidManager and persists enabled flag to DB.
     *     security:
     *       - bearerAuth: []
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema:
     *             type: object
     *             properties:
     *               enabled:
     *                 type: boolean
     *                 description: Enable or disable Kalman filter
     *                 example: true
     *               q:
     *                 type: number
     *                 description: Process noise covariance
     *                 example: 0.01
     *               r:
     *                 type: number
     *                 description: Measurement noise covariance
     *                 example: 0.05
     *     responses:
     *       200:
     *         description: Parameters updated
     *         content:
     *           application/json:
     *             schema:
     *               type: object
     *               properties:
     *                 ok:
     *                   type: boolean
     *                   example: true
     *       500:
     *         description: Server error
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/Error'
     */
    router.post('/kalman', (req, res) => {
        try {
            const { enabled, q, r } = req.body;
            const pidManager = req.pidManager;
            if (pidManager) pidManager.updateKalman({ enabled, q, r });

            // Persist enabled flag to DB (q/r are persisted inside updateKalman)
            if (enabled !== undefined) settingsQueries.set('kalman_enabled', enabled, req.user.id);

            res.json({ ok: true });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    /**
     * @openapi
     * /api/settings/test-connection:
     *   post:
     *     tags: [Settings]
     *     summary: Test ESP32 connection
     *     description: Attempts to verify connectivity with the ESP32 hardware. Currently returns mock status.
     *     security:
     *       - bearerAuth: []
     *     responses:
     *       200:
     *         description: Connection test result
     *         content:
     *           application/json:
     *             schema:
     *               type: object
     *               properties:
     *                 ok:
     *                   type: boolean
     *                   example: true
     *                 status:
     *                   type: string
     *                   example: mock
     *                 message:
     *                   type: string
     *                   example: Connection test not available in mock mode
     */
    router.post('/test-connection', (req, res) => {
        // Will be implemented when serial manager is connected
        res.json({ ok: true, status: 'mock', message: 'Connection test not available in mock mode' });
    });

    /**
     * @openapi
     * /api/settings/test-telegram:
     *   post:
     *     tags: [Settings]
     *     summary: Send test Telegram notification
     *     description: Sends a test message via the configured Telegram bot to verify integration.
     *     security:
     *       - bearerAuth: []
     *     responses:
     *       200:
     *         description: Result of the test message send
     *         content:
     *           application/json:
     *             schema:
     *               type: object
     *               properties:
     *                 ok:
     *                   type: boolean
     *                 message:
     *                   type: string
     *                   example: Сообщение отправлено
     *       500:
     *         description: Telegram API error
     *         content:
     *           application/json:
     *             schema:
     *               type: object
     *               properties:
     *                 ok:
     *                   type: boolean
     *                   example: false
     *                 error:
     *                   type: string
     */
    router.post('/test-telegram', async (req, res) => {
        try {
            const result = await sendMessage('🧪 *Тестовое уведомление*\n\nOrangeBrew — Telegram интеграция работает!');
            if (result?.ok) {
                res.json({ ok: true, message: 'Сообщение отправлено' });
            } else {
                res.json({ ok: false, message: result?.description || 'Неизвестная ошибка Telegram API' });
            }
        } catch (err) {
            res.status(500).json({ ok: false, error: err.message });
        }
    });

    /**
     * @openapi
     * /api/settings/reload-telegram:
     *   post:
     *     tags: [Settings]
     *     summary: Reload Telegram config from DB
     *     description: Re-reads Telegram bot token and chat ID from the database and reinitializes the Telegram service.
     *     security:
     *       - bearerAuth: []
     *     responses:
     *       200:
     *         description: Config reloaded
     *         content:
     *           application/json:
     *             schema:
     *               type: object
     *               properties:
     *                 ok:
     *                   type: boolean
     *                   example: true
     *       500:
     *         description: Server error
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/Error'
     */
    router.post('/reload-telegram', (req, res) => {
        try {
            reloadTelegramConfig();
            res.json({ ok: true });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    return router;
}
