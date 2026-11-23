import { booleanSetting, readEventConfig } from '../../events/config.js';

export function readKafkaConfig(env = process.env) {
    const publishEnabled = booleanSetting(env.KAFKA_PUBLISH_ENABLED, false, 'KAFKA_PUBLISH_ENABLED');
    const brokers = (env.KAFKA_BROKERS || '').split(',').map(value => value.trim()).filter(Boolean);
    if (publishEnabled && brokers.length === 0) throw new Error('KAFKA_BROKERS is required when publishing is enabled');
    const username = env.KAFKA_SASL_USERNAME;
    const password = env.KAFKA_SASL_PASSWORD;
    if (!!username !== !!password) throw new Error('Both Kafka SASL credentials are required');
    const mechanism = (env.KAFKA_SASL_MECHANISM || 'plain').toLowerCase();
    if (!['plain', 'scram-sha-256', 'scram-sha-512'].includes(mechanism)) throw new Error('Unsupported Kafka SASL mechanism');
    const ssl = booleanSetting(env.KAFKA_SSL, false, 'KAFKA_SSL');
    const events = readEventConfig(env);
    if (events.environment === 'prod' && publishEnabled && !ssl) throw new Error('Production Kafka requires KAFKA_SSL=true');
    const deliveryTimeoutMs = Number(env.KAFKA_DELIVERY_TIMEOUT_MS || 10000);
    if (!Number.isSafeInteger(deliveryTimeoutMs) || deliveryTimeoutMs < 1000 || deliveryTimeoutMs > 60000) throw new Error('KAFKA_DELIVERY_TIMEOUT_MS must be between 1000 and 60000');
    return { ...events, enabled: publishEnabled, publishEnabled, brokers,
        clientId: env.KAFKA_CLIENT_ID || 'orangebrew-backend', ssl, caLocation: env.KAFKA_SSL_CA_LOCATION,
        sasl: username ? { mechanism, username, password } : undefined, deliveryTimeoutMs };
}

// Dynamic import keeps native Kafka entirely out of the disabled application's startup path.
export async function createKafkaClient(config = readKafkaConfig()) {
    if (!config.brokers?.length) throw new Error('KAFKA_BROKERS is required for a Kafka client');
    const imported = await import('@confluentinc/kafka-javascript');
    const { KafkaJS } = imported.default || imported;
    return new KafkaJS.Kafka({
        'bootstrap.servers': config.brokers.join(','), 'client.id': config.clientId,
        'security.protocol': config.sasl ? (config.ssl ? 'sasl_ssl' : 'sasl_plaintext') : (config.ssl ? 'ssl' : 'plaintext'),
        ...(config.caLocation ? { 'ssl.ca.location': config.caLocation } : {}),
        ...(config.sasl ? { 'sasl.mechanism': config.sasl.mechanism.toUpperCase(), 'sasl.username': config.sasl.username, 'sasl.password': config.sasl.password } : {}),
        'socket.timeout.ms': config.deliveryTimeoutMs,
        // SDK cancellation waits for the current metadata attempt. Keep each
        // setup attempt short; the relay/consumer own the reconnect policy.
        kafkaJS: { logLevel: KafkaJS.logLevel.NOTHING, connectionTimeout: Math.min(config.deliveryTimeoutMs, 2000),
            authenticationTimeout: 0, requestTimeout: config.deliveryTimeoutMs, retry: { retries: 0 } },
    });
}

export function createKafkaPublisher(config = readKafkaConfig(), { clientFactory = createKafkaClient } = {}) {
    let producer;
    let connecting;
    let closed = false;
    async function connectedProducer() {
        if (closed) throw new Error('Kafka publisher stopped');
        if (!connecting) connecting = (async () => {
            const kafka = await clientFactory(config);
            if (closed) throw new Error('Kafka publisher stopped');
            const attempt = kafka.producer({ 'enable.idempotence': true, 'acks': 'all',
                // KafkaJS retry.retries also maps to native message retries.
                // Keep connection retries disabled above, but permit idempotent
                // delivery retries within message.timeout.ms.
                'retries': 5,
                'message.timeout.ms': config.deliveryTimeoutMs, 'allow.auto.create.topics': false });
            producer = attempt;
            await attempt.connect();
            if (closed) throw new Error('Kafka publisher stopped');
            return attempt;
        })().catch(async err => {
            const failed = producer;
            producer = undefined;
            connecting = undefined;
            if (failed) await failed.disconnect().catch(() => {});
            throw err;
        });
        return connecting;
    }
    return {
        async publish({ topic, key, value, eventId }) {
            const ready = await connectedProducer();
            // Promise resolution is a delivery report, not merely a local queue acceptance.
            const encoded = typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value);
            await ready.send({ topic, messages: [{ key, value: encoded, headers: { eventId } }] });
        },
        async disconnect() {
            closed = true;
            const current = producer;
            const pending = connecting;
            // Abort native CONNECTING before awaiting its promise.
            if (current) await current.disconnect();
            if (pending) await pending.catch(() => {});
            producer = undefined;
            connecting = undefined;
        },
    };
}
