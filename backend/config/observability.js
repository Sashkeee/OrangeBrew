import { booleanSetting, readEventConfig } from '../events/config.js';

export function readObservabilityConfig(env = process.env) {
    const events = readEventConfig(env);
    const publishEnabled = booleanSetting(env.KAFKA_PUBLISH_ENABLED, false, 'KAFKA_PUBLISH_ENABLED');
    const transport = env.NOTIFICATIONS_TRANSPORT || 'direct';
    if (!['direct', 'kafka'].includes(transport)) throw new Error('NOTIFICATIONS_TRANSPORT must be direct or kafka');
    if (transport === 'kafka' && (!publishEnabled || !events.captureEnabled)) {
        throw new Error('Kafka notifications require EVENTS_CAPTURE_ENABLED=true and KAFKA_PUBLISH_ENABLED=true');
    }
    const ttl = Number(env.NOTIFICATION_TTL_MS || 900000);
    if (!Number.isSafeInteger(ttl) || ttl < 1000 || ttl > 7 * 86400000) throw new Error('NOTIFICATION_TTL_MS must be 1000..604800000');
    return { events, publishEnabled, transport, notificationTtlMs: ttl,
        projectionEnabled: booleanSetting(env.PROCESS_PROJECTION_ENABLED, true, 'PROCESS_PROJECTION_ENABLED') };
}
