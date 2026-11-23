/** Application logger facade, independent of its transport's argument ordering. */
import { randomUUID } from 'node:crypto';
import winston from 'winston';
import { ecsFormat } from '@elastic/ecs-winston-format';
import { getLogContext } from './logContext.js';
import { redact, sanitizeText } from './redact.js';

const LEVELS = { fatal: 0, error: 1, warn: 2, info: 3, debug: 4, trace: 5 };
const MAX_RECORD_BYTES = 64 * 1024;
const APP_ENVS = new Set(['test', 'prod', 'development']);
const MESSAGE = Symbol.for('message');

const boundJson = winston.format(info => {
    if (Buffer.byteLength(info[MESSAGE]) <= MAX_RECORD_BYTES) return info;
    const minimal = {};
    for (const key of ['@timestamp', 'ecs.version', 'log.level', 'log.logger', 'service.name', 'service.version', 'deployment.environment.name', 'event.id', 'event.dataset', 'message']) {
        if (info[key] != null) minimal[key] = info[key];
    }
    minimal['orangebrew.log.truncated'] = true;
    info[MESSAGE] = JSON.stringify(minimal);
    return info;
});

function applicationEnv() {
    if (APP_ENVS.has(process.env.APP_ENV)) return process.env.APP_ENV;
    return process.env.NODE_ENV === 'production' ? 'prod'
        : process.env.NODE_ENV === 'test' ? 'test' : 'development';
}

function fieldsFor(metadata) {
    const fields = { ...redact(metadata) };
    const aliases = {
        module: 'log.logger', userId: 'user.id', deviceId: 'orangebrew.device.id',
        sessionId: 'orangebrew.session.id', requestId: 'orangebrew.request.id',
        correlationId: 'orangebrew.correlation.id', causationId: 'orangebrew.causation.id',
    };
    for (const [source, destination] of Object.entries(aliases)) {
        if (['string', 'number', 'bigint'].includes(typeof fields[source])) fields[destination] = sanitizeText(fields[source], 256);
        delete fields[source];
    }
    // Call-site payloads cannot control collector routing or deployment identity.
    for (const key of Object.keys(fields)) {
        if (/^(?:data_stream|service|deployment)(?:\.|$)/.test(key)
            || ['level', 'message', '@timestamp', 'ecs.version', 'event', 'event.id', 'event.dataset', 'log'].includes(key)) delete fields[key];
    }
    for (const key of ['source', 'req', 'res', 'headers', 'body', 'requestBody', 'responseBody']) delete fields[key];
    return fields;
}

export function createAppLogger({ transport, level, format, environment = applicationEnv() } = {}) {
    const json = format ? format === 'json'
        : process.env.LOG_FORMAT === 'json' || process.env.NODE_ENV === 'production';
    const configuredLevel = level || process.env.LOG_LEVEL || (json ? 'info' : 'debug');
    let closed = false;
    const pending = new Set();
    let dropped = 0;
    let failed = false;
    const waiters = new Set();
    const destination = transport || new winston.Transport({
        log(info, callback) {
            process.stdout.write(`${info[Symbol.for('message')]}\n`, callback);
        },
    });
    if (!transport && !process.stdout.listenerCount('error')) process.stdout.on('error', () => {});
    const write = destination.log.bind(destination);
    destination.log = (info, callback) => {
        write(info, error => {
            if (error) failed = true;
            pending.delete(info['event.id']);
            callback(error);
            if (!pending.size) for (const resolve of waiters) resolve(!failed);
        });
    };
    const backend = winston.createLogger({
        levels: LEVELS,
        level: Object.hasOwn(LEVELS, configuredLevel) ? configuredLevel : 'info',
        exitOnError: false,
        format: json ? winston.format.combine(ecsFormat({ apmIntegration: false }), boundJson())
            : winston.format.printf(info => `${info.level.toUpperCase()} [${info['log.logger'] || 'Backend'}] ${info.message}`),
        transports: [destination],
    });
    backend.on('error', () => {});

    function facade(bindings = {}) {
        const result = {
            child(extra = {}) { return facade({ ...bindings, ...redact(extra) }); },
            isLevelEnabled(name) { return backend.isLevelEnabled(name); },
            flush(options) { return flush(options); },
            getStats() { return { pending: pending.size, dropped, failed }; },
        };
        for (const name of Object.keys(LEVELS)) {
            result[name] = (metadata, message) => {
                if (closed || !backend.isLevelEnabled(name)) return;
                if (failed || pending.size >= 1024) { dropped++; return; }
                const extra = metadata instanceof Error ? { err: metadata }
                    : metadata && typeof metadata === 'object' ? metadata : {};
                const text = typeof message === 'string' ? message
                    : typeof metadata === 'string' ? metadata : metadata instanceof Error ? metadata.message : '';
                const merged = { ...redact(getLogContext()), ...bindings, ...redact(extra) };
                const record = {
                    ...fieldsFor(merged), level: name, message: sanitizeText(text),
                    'event.id': randomUUID(),
                    'event.dataset': merged.source === 'device' ? 'orangebrew.device' : 'orangebrew.backend',
                    'service.name': 'orangebrew-backend',
                    'deployment.environment.name': environment,
                    'service.version': sanitizeText(process.env.SERVICE_VERSION || 'development', 256),
                };
                const estimated = JSON.stringify(record, (_key, value) => value instanceof Error
                    ? { type: value.name, message: value.message, stack_trace: value.stack } : value);
                if (Buffer.byteLength(estimated) > MAX_RECORD_BYTES - 2048) {
                    for (const key of Object.keys(record)) {
                        if (!['level', 'message', 'event.id', 'event.dataset', 'log.logger', 'deployment.environment.name', 'service.name', 'service.version'].includes(key)) delete record[key];
                    }
                    record['orangebrew.log.truncated'] = true;
                }
                pending.add(record['event.id']);
                backend.log(record);
            };
        }
        return result;
    }

    function flush({ timeoutMs = 1000 } = {}) {
        if (!pending.size) return Promise.resolve(!failed);
        return new Promise(resolve => {
            const timer = setTimeout(() => finish(false), Math.max(0, timeoutMs));
            const finish = success => { clearTimeout(timer); waiters.delete(finish); resolve(success); };
            waiters.add(finish);
        });
    }
    return {
        logger: facade(), flush,
        async close(options) {
            closed = true;
            const drained = await flush(options);
            backend.close();
            return drained;
        },
    };
}

const instance = createAppLogger();
export const flushLogs = options => instance.flush(options);
export const closeLogger = options => instance.close(options);
export default instance.logger;
