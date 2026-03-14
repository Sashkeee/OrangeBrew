/**
 * logger.js — structured JSON logger for OrangeBrew backend.
 *
 * Uses pino for high-performance structured logging.
 * In production (NODE_ENV=production or Docker), outputs newline-delimited JSON
 * that Vector can pick up and ship to Betterstack.
 * In development, outputs human-friendly pretty-printed logs.
 *
 * Usage:
 *   import logger from './utils/logger.js';
 *   logger.info({ userId: 1 }, 'User logged in');
 *   logger.error({ err }, 'Something went wrong');
 *
 * Child loggers (per-module context):
 *   const log = logger.child({ module: 'PidManager' });
 *   log.debug({ kp: 2.5 }, 'PID updated');
 */

import pino from 'pino';

// LOG_FORMAT=json forces JSON output even in development (e.g. in Docker + Vector)
const isDev = process.env.NODE_ENV !== 'production' && process.env.LOG_FORMAT !== 'json';

const logger = pino({
    level: process.env.LOG_LEVEL || (isDev ? 'debug' : 'info'),

    // In production: plain JSON for Vector → Betterstack
    // In dev: human-friendly pretty print
    transport: isDev
        ? {
            target: 'pino-pretty',
            options: {
                colorize:        true,
                translateTime:   'SYS:HH:MM:ss',
                ignore:          'pid,hostname',
                messageFormat:   '[{module}] {msg}',
                singleLine:      false,
            },
        }
        : undefined,

    // Base fields on every log line
    base: {
        app:     'orangebrew',
        env:     process.env.NODE_ENV || 'development',
        service: 'backend',
    },

    // Rename msg → message to match Betterstack's default schema
    messageKey: 'message',

    // ISO timestamp
    timestamp: pino.stdTimeFunctions.isoTime,

    // Serialize Error objects cleanly
    serializers: {
        err: pino.stdSerializers.err,
        req: pino.stdSerializers.req,
        res: pino.stdSerializers.res,
    },
});

export default logger;
