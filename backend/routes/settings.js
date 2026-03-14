import { Router } from 'express';
import { settingsQueries } from '../db/database.js';
import { sendMessage, reloadTelegramConfig } from '../services/telegram.js';

const router = Router();

/**
 * Create settings router.
 * pidManager берётся из req.pidManager, который инжектируется middleware в server.js.
 */
export default function createSettingsRouter() {

    // GET /api/settings — settings for current user (merged with global defaults)
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

    // PUT /api/settings — bulk update settings for current user
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
                    console.log(`[Settings] Applied PID tunings: P=${pid.kp} I=${pid.ki} D=${pid.kd}`);
                }
            }

            res.json({ ok: true });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // GET /api/settings/kalman — get Kalman filter status
    router.get('/kalman', (req, res) => {
        const pidManager = req.pidManager;
        if (!pidManager) return res.json({ enabled: false, q: 0.01, r: 0.05, gain: null, rawInput: null, filteredInput: null });
        res.json(pidManager.getKalmanStatus());
    });

    // POST /api/settings/kalman — update Kalman filter parameters
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

    // POST /api/settings/test-connection — test ESP32 connection
    router.post('/test-connection', (req, res) => {
        // Will be implemented when serial manager is connected
        res.json({ ok: true, status: 'mock', message: 'Connection test not available in mock mode' });
    });

    // POST /api/settings/test-telegram — send a test notification
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

    // POST /api/settings/reload-telegram — reload Telegram config from DB
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
