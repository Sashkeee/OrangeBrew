import express from 'express';
import { randomBytes } from 'crypto';
import { deviceQueries, pairingQueries } from '../db/database.js';
import logger from '../utils/logger.js';
import { writeAudit } from '../utils/audit.js';

const log = logger.child({ module: 'Devices' });
const router = express.Router();

// ─── Device listing ────────────────────────────────────────

/**
 * @openapi
 * /api/devices:
 *   get:
 *     tags: [Devices]
 *     summary: List devices owned by current user
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Array of user's ESP32 devices
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Device'
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/', (req, res) => {
    try {
        const devices = deviceQueries.getAll(req.user.id);
        res.json(devices);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * @openapi
 * /api/devices/{id}:
 *   patch:
 *     tags: [Devices]
 *     summary: Rename device or change its role
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Device ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 description: New display name for the device
 *                 example: Kitchen Brewery
 *               role:
 *                 type: string
 *                 description: Device role
 *                 example: fermenter
 *     responses:
 *       200:
 *         description: Device updated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
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

/**
 * @openapi
 * /api/devices/{id}:
 *   delete:
 *     tags: [Devices]
 *     summary: Delete a device
 *     description: Removes an ESP32 device. Only the owner can delete their device.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Device ID
 *     responses:
 *       200:
 *         description: Device deleted
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *       404:
 *         description: Device not found or not owned by user
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.delete('/:id', (req, res) => {
    try {
        const result = deviceQueries.delete(req.params.id, req.user.id);
        if (!result.changes) return res.status(404).json({ error: 'Device not found' });
        log.warn({ userId: req.user.id, deviceId: req.params.id }, 'Device deleted');
        writeAudit({ userId: req.user.id, action: 'device.delete', detail: `Deleted device ${req.params.id}` });
        res.json({ success: true });
    } catch (err) {
        log.error({ err, userId: req.user.id, deviceId: req.params.id }, 'Error deleting device');
        res.status(500).json({ error: err.message });
    }
});

// ─── Device Pairing ────────────────────────────────────────

/**
 * @openapi
 * /api/devices/pair/init:
 *   post:
 *     tags: [Devices]
 *     summary: Generate a 6-char pairing code
 *     description: >
 *       Creates a pairing code valid for 15 minutes. The user enters this code
 *       on the ESP32's captive portal to link the device to their account.
 *       Stale codes are cleaned up automatically.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Pairing code generated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 pairing_code:
 *                   type: string
 *                   example: A3K7YN
 *                   description: 6-char uppercase alphanumeric code (no 0/O/I/1)
 *                 expires_at:
 *                   type: string
 *                   format: date-time
 *                   description: ISO timestamp when the code expires
 *                 expires_in:
 *                   type: integer
 *                   example: 900
 *                   description: Seconds until expiration
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
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
        writeAudit({ userId: req.user.id, action: 'device.pair', detail: `Initiated device pairing (code: ${code})` });

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
 * @openapi
 * /api/devices/pair/status:
 *   get:
 *     tags: [Devices]
 *     summary: Poll pairing status
 *     description: >
 *       Frontend polls this endpoint to check whether the ESP32 has completed
 *       the pairing handshake. Returns "pending" until the device connects,
 *       or "paired" with device details once complete.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: code
 *         required: true
 *         schema:
 *           type: string
 *         description: The 6-char pairing code from /pair/init
 *         example: A3K7YN
 *     responses:
 *       200:
 *         description: Pairing status
 *         content:
 *           application/json:
 *             schema:
 *               oneOf:
 *                 - type: object
 *                   properties:
 *                     status:
 *                       type: string
 *                       enum: [pending]
 *                     expires_at:
 *                       type: string
 *                       format: date-time
 *                 - type: object
 *                   properties:
 *                     status:
 *                       type: string
 *                       enum: [paired]
 *                     device:
 *                       $ref: '#/components/schemas/Device'
 *       400:
 *         description: Missing code parameter
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       403:
 *         description: Code belongs to another user
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: Pairing code not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       410:
 *         description: Pairing code expired
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
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
