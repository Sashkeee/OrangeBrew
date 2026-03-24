import express from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { userQueries } from '../db/database.js';
import { authenticate } from '../middleware/auth.js';
import config from '../config/env.js';
import logger from '../utils/logger.js';

const log = logger.child({ module: 'Auth' });
const router = express.Router();
const { JWT_SECRET } = config;

/** Build JWT payload + token string */
function makeToken(user) {
    return jwt.sign(
        { id: user.id, username: user.username, role: user.role },
        JWT_SECRET,
        { expiresIn: '30d' }
    );
}

// ─── POST /auth/login ──────────────────────────────────────

router.post('/login', async (req, res) => {
    log.info({ username: req.body.username, ip: req.ip }, 'Login attempt');
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({ error: 'Username and password required' });
        }

        const user = userQueries.getByUsername(username);
        if (!user) {
            log.warn({ username, ip: req.ip }, 'Failed login attempt — unknown user');
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const isMatch = await bcrypt.compare(password, user.password_hash);
        if (!isMatch) {
            log.warn({ username, ip: req.ip }, 'Failed login attempt — wrong password');
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const token = makeToken(user);

        res.json({
            message: 'Logged in successfully',
            token,
            user: {
                id:       user.id,
                username: user.username,
                role:     user.role,
                email:    user.email,
                subscription_tier:   user.subscription_tier,
                subscription_status: user.subscription_status,
            },
        });

    } catch (error) {
        log.error({ err: error }, 'Login error');
        res.status(500).json({ error: 'Internal server error' });
    }
});

// ─── POST /auth/register ───────────────────────────────────

router.post('/register', async (req, res) => {
    try {
        const { username, email, password, consent } = req.body;

        // Basic validation
        if (!username || !email || !password) {
            return res.status(400).json({ error: 'username, email and password are required' });
        }
        if (username.length < 3 || username.length > 32) {
            return res.status(400).json({ error: 'Username must be 3–32 characters' });
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            return res.status(400).json({ error: 'Invalid email format' });
        }
        if (password.length < 8) {
            return res.status(400).json({ error: 'Password must be at least 8 characters' });
        }
        if (!consent) {
            return res.status(400).json({ error: 'You must accept the privacy policy (152-ФЗ)' });
        }

        // Check uniqueness
        if (userQueries.getByUsername(username)) {
            return res.status(409).json({ error: 'Username already taken' });
        }
        if (userQueries.getByEmail(email)) {
            return res.status(409).json({ error: 'Email already registered' });
        }

        const password_hash = await bcrypt.hash(password, 10);
        const user = userQueries.create({ username, password_hash, email, role: 'user' });

        // Record consent timestamp (152-ФЗ compliance)
        userQueries.setConsent(user.id);

        log.info({ username, email }, 'User registered');

        const token = makeToken(user);

        res.status(201).json({
            message: 'Registration successful. Trial period: 14 days.',
            token,
            user: {
                id:       user.id,
                username: user.username,
                role:     user.role,
                email:    user.email,
                subscription_tier:   user.subscription_tier,
                subscription_status: user.subscription_status,
                subscription_expires_at: user.subscription_expires_at,
            },
        });

    } catch (error) {
        log.error({ err: error }, 'Register error');
        res.status(500).json({ error: 'Internal server error' });
    }
});

// ─── GET /auth/me — current user info ─────────────────────

router.get('/me', authenticate, (req, res) => {
    try {
        const user = userQueries.getById(req.user.id);
        if (!user) return res.status(404).json({ error: 'User not found' });
        res.json({
            id:       user.id,
            username: user.username,
            role:     user.role,
            email:    user.email,
            subscription_tier:      user.subscription_tier,
            subscription_status:    user.subscription_status,
            subscription_expires_at: user.subscription_expires_at,
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

export default router;
