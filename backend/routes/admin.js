import express from 'express';
import bcrypt from 'bcrypt';
import { userQueries, deviceQueries, auditQueries } from '../db/database.js';
import { requireAdmin } from '../middleware/auth.js';
import { writeAudit } from '../utils/audit.js';
import logger from '../utils/logger.js';

const log = logger.child({ module: 'Admin' });
const router = express.Router();

// All routes in this file require admin role
router.use(requireAdmin);

// ─── GET /api/admin/users — enriched user list ───────────

router.get('/users', (req, res) => {
    try {
        const users = userQueries.getAll().map(u => {
            const user = userQueries.getById(u.id);
            return {
                ...u,
                banned_at: user?.banned_at || null,
                banned_reason: user?.banned_reason || '',
                device_count: deviceQueries.getAll(u.id).length,
            };
        });
        res.json(users);
    } catch (err) {
        log.error({ err }, 'Failed to list users');
        res.status(500).json({ error: err.message });
    }
});

// ─── GET /api/admin/users/:id — single user detail ──────

router.get('/users/:id', (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const user = userQueries.getById(id);
        if (!user) return res.status(404).json({ error: 'User not found' });

        const { password_hash, ...safe } = user;
        safe.device_count = deviceQueries.getAll(id).length;

        res.json(safe);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─── GET /api/admin/audit/:userId — user audit log ──────

router.get('/audit/:userId', (req, res) => {
    try {
        const userId = parseInt(req.params.userId);
        const limit = Math.min(parseInt(req.query.limit) || 100, 500);
        const offset = Math.max(parseInt(req.query.offset) || 0, 0);

        const entries = auditQueries.getByUser(userId, limit, offset);
        const total = auditQueries.countByUser(userId);

        res.json({ entries, total, limit, offset });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─── GET /api/admin/audit — global recent audit log ─────

router.get('/audit', (req, res) => {
    try {
        const limit = Math.min(parseInt(req.query.limit) || 100, 500);
        const offset = Math.max(parseInt(req.query.offset) || 0, 0);

        const entries = auditQueries.getRecent(limit, offset);
        res.json({ entries, limit, offset });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─── POST /api/admin/users/:id/ban ──────────────────────

router.post('/users/:id/ban', (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const { reason = '' } = req.body || {};

        if (id === req.user.id) {
            return res.status(400).json({ error: 'Cannot ban yourself' });
        }

        const user = userQueries.getById(id);
        if (!user) return res.status(404).json({ error: 'User not found' });

        if (user.role === 'admin') {
            return res.status(400).json({ error: 'Cannot ban another admin' });
        }

        userQueries.ban(id, reason);
        writeAudit({ userId: id, action: 'admin.ban', detail: `Banned by admin: ${reason || 'no reason'}`, adminId: req.user.id, ip: req.ip });
        log.warn({ adminId: req.user.id, userId: id, reason }, 'User banned');

        res.json({ ok: true, message: 'User banned' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─── POST /api/admin/users/:id/unban ────────────────────

router.post('/users/:id/unban', (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const user = userQueries.getById(id);
        if (!user) return res.status(404).json({ error: 'User not found' });

        userQueries.unban(id);
        writeAudit({ userId: id, action: 'admin.unban', detail: 'Unbanned by admin', adminId: req.user.id, ip: req.ip });
        log.info({ adminId: req.user.id, userId: id }, 'User unbanned');

        res.json({ ok: true, message: 'User unbanned' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─── POST /api/admin/users/:id/reset-password ───────────

router.post('/users/:id/reset-password', async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const { newPassword } = req.body || {};

        if (!newPassword || newPassword.length < 8) {
            return res.status(400).json({ error: 'Password must be at least 8 characters' });
        }

        const user = userQueries.getById(id);
        if (!user) return res.status(404).json({ error: 'User not found' });

        const hash = await bcrypt.hash(newPassword, 10);
        userQueries.updatePassword(id, hash);

        writeAudit({ userId: id, action: 'admin.reset_password', detail: 'Password reset by admin', adminId: req.user.id, ip: req.ip });
        log.info({ adminId: req.user.id, userId: id }, 'Password reset by admin');

        res.json({ ok: true, message: 'Password reset successfully' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─── DELETE /api/admin/users/:id/devices ─────────────────

router.delete('/users/:id/devices', (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const user = userQueries.getById(id);
        if (!user) return res.status(404).json({ error: 'User not found' });

        const devices = deviceQueries.getAll(id);
        const { changes } = deviceQueries.deleteAllByUser(id);

        writeAudit({ userId: id, action: 'admin.delete_devices', detail: `Deleted ${changes} device(s) by admin`, adminId: req.user.id, ip: req.ip });
        log.warn({ adminId: req.user.id, userId: id, deleted: changes }, 'All user devices deleted by admin');

        res.json({ ok: true, deleted: changes });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

export default router;
