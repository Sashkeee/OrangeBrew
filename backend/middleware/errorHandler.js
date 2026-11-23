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
import { safeUrlPath } from '../utils/redact.js';

const log = logger.child({ module: 'ErrorHandler' });

export function errorHandler(err, req, res, _next) {
    const proposedStatus = Number(err.status || err.statusCode || 500);
    const status = Number.isInteger(proposedStatus) && proposedStatus >= 400 && proposedStatus <= 599 ? proposedStatus : 500;
    const isServer = status >= 500;

    const requestLog = req.log || log;
    if (isServer) {
        requestLog.error({
            err,
            'http.request.method': req.method,
            'url.path': safeUrlPath(req.url),
            userId: req.user?.id,
        }, 'Unhandled route error');
    } else {
        requestLog.warn({
            status,
            err,
            'url.path': safeUrlPath(req.url),
        }, 'Client error');
    }

    if (res.headersSent) return _next(err);
    res.status(status).json({
        error: isServer ? 'Internal server error' : err.message,
    });
}
