import express from 'express';
import { randomBytes } from 'crypto';
import { deviceQueries, pairingQueries } from '../db/database.js';
import logger from '../utils/logger.js';

const log = logger.child({ module: 'Devices' });
const router = express.Router();

// ─── Device listing ────────────────────────────────────────

// GET /api/devices — devices owned by current user
router.get('/', (req, res) => {
    try {
        const devices = deviceQueries.getAll(req.user.id);
        res.json(devices);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PATCH /api/devices/:id — rename or change role (ownership check)
router.patch('/:id', (req, res) => {
    try {
        const { id } = req.params;
        const { name, role } = req.body;

        if (name) deviceQueries.rename(id, name, req.user.id);
        if (role) deviceQueries.setRole(id, role, req.user.id);

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE /api/devices/:id (ownership check)
router.delete('/:id', (req, res) => {
    try {
        const result = deviceQueries.delete(req.params.id, req.user.id);
        if (!result.changes) return res.status(404).json({ error: 'Device not found' });
        log.warn({ userId: req.user.id, deviceId: req.params.id }, 'Device deleted');
        res.json({ success: true });
    } catch (err) {
        log.error({ err, userId: req.user.id, deviceId: req.params.id }, 'Error deleting device');
        res.status(500).json({ error: err.message });
    }
});

// ─── Device Pairing ────────────────────────────────────────

/**
 * POST /api/devices/pair/init
 * Generates a 6-char pairing code valid for 15 minutes.
 * The user shows this code on the ESP32's captive portal / display.
 */
router.post('/pair/init', (req, res) => {
    try {
        // Clean up stale codes first
        pairingQueries.cleanup();

        // Generate 6-char uppercase alphanumeric code (no 0/O/I/1 to avoid confusion)
        const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        let code = '';
        const bytes = randomBytes(6);
        for (const b of bytes) {
            code += alphabet[b % alphabet.length];
        }

        const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
        const pairing = pairingQueries.create(req.user.id, code, expiresAt);
        log.info({ userId: req.user.id, code }, 'Pairing code generated');

        res.json({
            pairing_code: pairing.pairing_code,
            expires_at:   pairing.expires_at,
            expires_in:   900, // seconds
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * GET /api/devices/pair/status?code=ABC123
 * Poll this from the frontend to know when the ESP32 completed pairing.
 * Returns { status: 'pending' } or { status: 'paired', device }
 */
router.get('/pair/status', (req, res) => {
    try {
        const { code } = req.query;
        if (!code) return res.status(400).json({ error: 'code is required' });

        const pairing = pairingQueries.getByCodeAny(code);

        if (!pairing) {
            return res.status(404).json({ error: 'Pairing code not found' });
        }

        // Verify ownership
        if (pairing.user_id !== req.user.id) {
            return res.status(403).json({ error: 'Forbidden' });
        }

        // Pairing completed — device connected and received api_key
        if (pairing.used_at && pairing.device_id) {
            const device = deviceQueries.getById(pairing.device_id);
            return res.json({ status: 'paired', device });
        }

        // Code expired without device connecting
        if (pairing.expires_at < new Date().toISOString()) {
            return res.status(410).json({ error: 'Pairing code expired' });
        }

        res.json({ status: 'pending', expires_at: pairing.expires_at });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

export default router;
