import { randomUUID } from 'node:crypto';
import logger from '../utils/logger.js';
import { runWithLogContext } from '../utils/logContext.js';
import { safeUrlPath, sanitizeText } from '../utils/redact.js';

const VALID_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
export function createRequestLogger({ logger: applicationLogger = logger, skipPaths = ['/health', '/api/health'] } = {}) {
    return (req, res, next) => {
        const candidate = req.headers['x-request-id'];
        const requestId = typeof candidate === 'string' && VALID_ID.test(candidate) ? candidate : randomUUID();
        const path = safeUrlPath(req.originalUrl || req.url);
        const started = process.hrtime.bigint();
        const context = { requestId, correlationId: requestId };
        req.id = requestId;
        req.log = applicationLogger.child(context);
        res.setHeader('X-Request-ID', requestId);
        let logged = false;
        const complete = aborted => {
            if (logged) return;
            logged = true;
            if (skipPaths.includes(path)) return;
            const status = aborted ? 499 : res.statusCode;
            const fields = {
                ...context, module: 'HTTP', userId: req.user?.id,
                'http.request.method': sanitizeText(req.method, 32),
                'http.response.status_code': status, 'url.path': path,
                'event.duration': Number(process.hrtime.bigint() - started),
                'event.action': aborted ? 'http.request_aborted' : 'http.request_completed',
                'event.outcome': aborted || status >= 400 ? 'failure' : 'success',
            };
            if (typeof req.route?.path === 'string') fields['orangebrew.http.route'] = sanitizeText(req.route.path, 2048);
            const level = status >= 500 ? 'error' : status >= 400 ? 'warn' : 'info';
            req.log[level](fields, `${req.method} ${path} ${status}`);
        };
        res.once('finish', () => complete(false));
        res.once('close', () => complete(!res.writableFinished));
        return runWithLogContext(context, next);
    };
}
export default createRequestLogger();
