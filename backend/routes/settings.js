import { Router } from 'express';
import { settingsQueries } from '../db/database.js';
import { sendMessage, reloadTelegramConfig } from '../services/telegram.js';

const router = Router();

// GET /api/settings — all settings
router.get('/', (req, res) => {
    try {
        const settings = settingsQueries.getAll();
        res.json(settings);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PUT /api/settings — bulk update settings
router.put('/', (req, res) => {
    try {
        settingsQueries.setBulk(req.body);
        // If telegram settings were updated, reload the service
        if (req.body.telegram) {
            reloadTelegramConfig();
        }
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

export default router;

