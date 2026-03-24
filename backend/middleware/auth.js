import jwt from 'jsonwebtoken';
import config from '../config/env.js';
import logger from '../utils/logger.js';

const { JWT_SECRET } = config;
const log = logger.child({ module: 'Auth' });

export function authenticate(req, res, next) {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
        log.debug({ ip: req.ip, url: req.url }, 'Missing Authorization header');
        return res.status(401).json({ error: 'Authorization header is missing' });
    }

    const token = authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
        log.debug({ ip: req.ip, url: req.url }, 'Missing token');
        return res.status(401).json({ error: 'Token is missing' });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded; // Attach user payload to request
        next();
    } catch (error) {
        if (error.name === 'TokenExpiredError') {
            log.info({ ip: req.ip, url: req.url }, 'Expired token');
        } else {
            log.warn({ ip: req.ip, userAgent: req.headers['user-agent'] }, 'Invalid token');
        }
        return res.status(401).json({ error: 'Invalid or expired token', expired: error.name === 'TokenExpiredError' });
    }
}
