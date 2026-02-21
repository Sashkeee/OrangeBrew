import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'fallback_super_secret_for_orangebrew';

export function authenticate(req, res, next) {
    // During dev/testing or local network, you might want an easy bypass mechanism
    // But for production VPS, this is strict
    const authHeader = req.headers.authorization;

    if (!authHeader) {
        return res.status(401).json({ error: 'Authorization header is missing' });
    }

    const token = authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
        return res.status(401).json({ error: 'Token is missing' });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded; // Attach user payload to request
        next();
    } catch (error) {
        return res.status(401).json({ error: 'Invalid or expired token', expired: error.name === 'TokenExpiredError' });
    }
}
