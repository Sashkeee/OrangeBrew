import express from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { getDb } from '../db/database.js';

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'fallback_super_secret_for_orangebrew';

// Login route
router.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({ error: 'Username and password required' });
        }

        const db = getDb();
        const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);

        if (!user) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const isMatch = await bcrypt.compare(password, user.password_hash);

        if (!isMatch) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        // Generate token (expires in 30 days for convenience on local devices)
        const token = jwt.sign(
            { id: user.id, username: user.username, role: user.role },
            JWT_SECRET,
            { expiresIn: '30d' }
        );

        res.json({
            message: 'Logged in successfully',
            token,
            user: { id: user.id, username: user.username, role: user.role }
        });

    } catch (error) {
        console.error('[Auth API] Login error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

export default router;
