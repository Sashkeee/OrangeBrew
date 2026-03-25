import express from 'express';
import bcrypt from 'bcrypt';
import { getDb } from '../db/database.js';
import logger from '../utils/logger.js';

const log = logger.child({ module: 'Users' });
const router = express.Router();

// Middleware to Ensure Admin
const requireAdmin = (req, res, next) => {
    if (req.user && req.user.role === 'admin') {
        next();
    } else {
        res.status(403).json({ error: 'Permission denied. Admins only.' });
    }
};

// --- PROFILE ROUTES (For authenticated users to manage themselves) ---

/**
 * @openapi
 * /api/users/me:
 *   get:
 *     summary: Get my profile
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Current user profile
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: integer
 *                 username:
 *                   type: string
 *                 role:
 *                   type: string
 *                   enum: [user, admin]
 *                 created_at:
 *                   type: string
 *                   format: date-time
 *       404:
 *         description: User not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/me', (req, res) => {
    try {
        const db = getDb();
        const user = db.prepare('SELECT id, username, role, created_at FROM users WHERE id = ?').get(req.user.id);
        if (!user) return res.status(404).json({ error: 'User not found' });
        res.json(user);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * @openapi
 * /api/users/profile:
 *   put:
 *     summary: Update my profile (username and/or password)
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               username:
 *                 type: string
 *                 description: New username
 *               currentPassword:
 *                 type: string
 *                 description: Current password (required when changing password)
 *               newPassword:
 *                 type: string
 *                 description: New password
 *     responses:
 *       200:
 *         description: Profile updated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *       400:
 *         description: Validation error (e.g. username taken, missing current password)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         description: Current password is incorrect
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: User not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.put('/profile', async (req, res) => {
    try {
        const { username, currentPassword, newPassword } = req.body;
        const db = getDb();

        const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
        if (!user) return res.status(404).json({ error: 'User not found' });

        // If trying to change password or username, we might want to verify current password first
        if (currentPassword) {
            const isMatch = await bcrypt.compare(currentPassword, user.password_hash);
            if (!isMatch) return res.status(401).json({ error: 'Текущий пароль неверен' });
        } else if (newPassword) {
            return res.status(400).json({ error: 'Для смены пароля введите текущий пароль' });
        }

        let newHash = user.password_hash;
        if (newPassword) {
            const salt = await bcrypt.genSalt(10);
            newHash = await bcrypt.hash(newPassword, salt);
        }

        const newUsername = username || user.username;

        // Check if username already exists for another user
        if (newUsername !== user.username) {
            const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(newUsername);
            if (existing) return res.status(400).json({ error: 'Имя пользователя уже занято' });
        }

        db.prepare('UPDATE users SET username = ?, password_hash = ? WHERE id = ?')
            .run(newUsername, newHash, req.user.id);

        res.json({ message: 'Профиль успешно обновлен' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});


// --- ADMIN ROUTES ---

/**
 * @openapi
 * /api/users:
 *   get:
 *     summary: List all users (admin only)
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Array of users
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: integer
 *                   username:
 *                     type: string
 *                   role:
 *                     type: string
 *                     enum: [user, admin]
 *                   created_at:
 *                     type: string
 *                     format: date-time
 *       403:
 *         description: Permission denied — admins only
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/', requireAdmin, (req, res) => {
    try {
        const db = getDb();
        const users = db.prepare('SELECT id, username, role, created_at FROM users ORDER BY id ASC').all();
        res.json(users);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * @openapi
 * /api/users:
 *   post:
 *     summary: Create a new user (admin only)
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [username, password]
 *             properties:
 *               username:
 *                 type: string
 *               password:
 *                 type: string
 *               role:
 *                 type: string
 *                 enum: [user, admin]
 *                 default: user
 *     responses:
 *       201:
 *         description: User created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: integer
 *                 username:
 *                   type: string
 *                 role:
 *                   type: string
 *                   enum: [user, admin]
 *       400:
 *         description: Validation error (missing fields or username taken)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       403:
 *         description: Permission denied — admins only
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post('/', requireAdmin, async (req, res) => {
    try {
        const { username, password, role } = req.body;
        if (!username || !password) return res.status(400).json({ error: 'Username and password required' });

        const db = getDb();
        const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
        if (existing) return res.status(400).json({ error: 'Имя пользователя уже занято' });

        const salt = await bcrypt.genSalt(10);
        const hash = await bcrypt.hash(password, salt);

        const userRole = role === 'admin' ? 'admin' : 'user';

        const result = db.prepare('INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)')
            .run(username, hash, userRole);

        log.info({ adminId: req.user.id, username, role: userRole }, 'User created by admin');
        res.status(201).json({ id: result.lastInsertRowid, username, role: userRole });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * @openapi
 * /api/users/{id}:
 *   delete:
 *     summary: Delete a user (admin only)
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: User ID to delete
 *     responses:
 *       200:
 *         description: User deleted
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *       400:
 *         description: Cannot delete yourself
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       403:
 *         description: Permission denied — admins only
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: User not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.delete('/:id', requireAdmin, (req, res) => {
    try {
        const id = parseInt(req.params.id);
        if (id === req.user.id) return res.status(400).json({ error: 'Нельзя удалить самого себя' });

        const db = getDb();
        const user = db.prepare('SELECT id FROM users WHERE id = ?').get(id);
        if (!user) return res.status(404).json({ error: 'Пользователь не найден' });

        db.prepare('DELETE FROM users WHERE id = ?').run(id);
        log.warn({ adminId: req.user.id, deletedUserId: id }, 'User deleted');
        res.json({ message: 'Пользователь удален' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

export default router;
