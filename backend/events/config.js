function integer(env, key, fallback, min = 1) {
    const value = env[key] === undefined ? fallback : Number(env[key]);
    if (!Number.isSafeInteger(value) || value < min) throw new Error(`${key} must be an integer >= ${min}`);
    return value;
}

export function booleanSetting(value, fallback, name) {
    if (value === undefined || value === '') return fallback;
    if (value === 'true' || value === true) return true;
    if (value === 'false' || value === false) return false;
    throw new Error(`${name} must be true or false`);
}

export function readEventConfig(env = process.env) {
    const environment = env.APP_ENV || (env.NODE_ENV === 'production' ? 'prod' : env.NODE_ENV === 'test' ? 'test' : 'development');
    if (!['test', 'prod', 'development'].includes(environment)) throw new Error('APP_ENV must be test, prod or development');
    return {
        captureEnabled: booleanSetting(env.EVENTS_CAPTURE_ENABLED, true, 'EVENTS_CAPTURE_ENABLED'), environment,
        topic: `orangebrew.${environment}.process.events.v1`,
        maxPendingEvents: integer(env, 'OUTBOX_MAX_PENDING_EVENTS', 100000),
        maxPendingBytes: integer(env, 'OUTBOX_MAX_PENDING_BYTES', 64 * 1024 * 1024),
        maxEventBytes: integer(env, 'EVENT_MAX_BYTES', 64 * 1024),
        pollMs: integer(env, 'OUTBOX_POLL_MS', 1000),
        batchSize: integer(env, 'OUTBOX_BATCH_SIZE', 50),
        retryBaseMs: integer(env, 'OUTBOX_RETRY_BASE_MS', 1000),
        retryMaxMs: integer(env, 'OUTBOX_RETRY_MAX_MS', 60000),
        publishedRetentionMs: integer(env, 'OUTBOX_PUBLISHED_RETENTION_HOURS', 24) * 60 * 60 * 1000,
    };
}
