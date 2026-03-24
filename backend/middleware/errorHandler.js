/**
 * Centralized Express error handler.
 *
 * Catches errors propagated via next(err) from routes.
 * - 5xx → logs as error, returns generic message (hides internals)
 * - 4xx → logs as warn, returns err.message
 *
 * Usage in server.js:
 *   import { errorHandler } from './middleware/errorHandler.js';
 *   // ... after all routes ...
 *   app.use(errorHandler);
 */
import logger from '../utils/logger.js';

const log = logger.child({ module: 'ErrorHandler' });

export function errorHandler(err, req, res, _next) {
    const status = err.status || err.statusCode || 500;
    const isServer = status >= 500;

    if (isServer) {
        log.error({
            err,
            method: req.method,
            url: req.url,
            userId: req.user?.id,
        }, 'Unhandled route error');
    } else {
        log.warn({
            status,
            message: err.message,
            url: req.url,
        }, 'Client error');
    }

    res.status(status).json({
        error: isServer ? 'Internal server error' : err.message,
    });
}
