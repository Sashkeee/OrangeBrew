import { setTimeout as delay } from 'node:timers/promises';
import { randomUUID } from 'node:crypto';
import { createKafkaClient, createKafkaPublisher } from '../infrastructure/kafka/client.js';
import { validateProcessEvent } from '../events/processEvent.js';
import logger from '../utils/logger.js';
import { redact, sanitizeText } from '../utils/redact.js';
import { runWithLogContext } from '../utils/logContext.js';

/** Each message is committed only after its effect or a broker-acked DLQ write.
 * A completed DB effect with a failed offset commit is deliberately replayable.
 */
export function createProcessConsumer({ name, topic, dlqTopic, handler, enabled = false,
    config, clientFactory = createKafkaClient, publisher = createKafkaPublisher(config),
    log = logger.child({ module: 'KafkaConsumer', consumer: name }), maxAttempts = 3 } = {}) {
    if (!name || !topic || !dlqTopic || typeof handler !== 'function') throw new Error('Consumer requires name, topic, DLQ and handler');
    let consumer;
    let running = false;
    let connecting;
    let reconnectTimer;
    const controller = new AbortController();
    const metrics = { connected: false, processed: 0, failed: 0, deadLettered: 0, lastSuccessAt: null, lastError: null };

    async function processMessage({ topic: sourceTopic, partition, message }) {
        let event;
        let failure;
        try {
            if (!message.value || message.value.length > 262144) throw new Error('Invalid event size');
            event = JSON.parse(message.value.toString('utf8'));
            if (validateProcessEvent(event) === false) throw new Error('Invalid process event schema');
        } catch (err) { failure = err; }

        if (!failure) {
            for (let attempt = 1; attempt <= maxAttempts; attempt++) {
                if (!running || controller.signal.aborted) throw new Error('Consumer stopping');
                try {
                    const result = await runWithLogContext({ userId: event.userId, sessionId: event.sessionId,
                        correlationId: event.correlationId, domainEventId: event.eventId }, () => handler(event));
                    if (result?.ok === false) {
                        const err = new Error(result.description || 'Consumer effect failed');
                        err.retryable = result.retryable !== false;
                        err.retryAfter = result.retryAfter;
                        throw err;
                    }
                    failure = null;
                    break;
                } catch (err) {
                    failure = err;
                    if (err.retryable === false || attempt === maxAttempts) break;
                    const waitMs = Math.min(10000, Math.max(100 * 2 ** (attempt - 1), (err.retryAfter || 0) * 1000));
                    await delay(waitMs, undefined, { signal: controller.signal });
                }
            }
        }

        if (failure) {
            metrics.failed++;
            const eventId = randomUUID();
            await publisher.publish({ topic: dlqTopic, key: message.key?.toString() || event?.aggregateId || name, eventId,
                value: { eventId, consumer: name, source: { topic: sourceTopic, partition, offset: message.offset },
                    failedAt: new Date().toISOString(), reason: sanitizeText(failure.message, 1024),
                    event: event ? redact(event, { maxDepth: 8, maxStringBytes: 8192 }) : null } });
            metrics.deadLettered++;
            log.warn({ eventId: event?.eventId, partition, offset: message.offset }, 'Process event moved to DLQ');
        }
        if (!running) throw new Error('Consumer stopping before offset commit');
        // BigInt avoids precision loss for Kafka offsets above Number.MAX_SAFE_INTEGER.
        await consumer.commitOffsets([{ topic: sourceTopic, partition, offset: (BigInt(message.offset) + 1n).toString() }]);
        metrics.processed++;
        metrics.lastSuccessAt = new Date().toISOString();
    }

    async function connect() {
        try {
            const kafka = await clientFactory(config);
            if (!running) return;
            consumer = kafka.consumer({ 'group.id': name, 'enable.auto.commit': false,
                'auto.offset.reset': 'earliest', 'max.poll.interval.ms': 300000 });
            await consumer.connect();
            if (!running) { await consumer.disconnect(); return; }
            await consumer.subscribe({ topic });
            await consumer.run({ eachMessage: processMessage });
            metrics.connected = true;
            metrics.lastError = null;
        } catch (err) {
            metrics.connected = false;
            if (!running) {
                try { await consumer?.disconnect(); } catch { /* cancellation during shutdown */ }
                return;
            }
            metrics.lastError = sanitizeText(err.message, 1024);
            log.warn({ err }, 'Kafka consumer connection failed; will retry');
            try { await consumer?.disconnect(); } catch { /* retry uses a fresh instance */ }
            if (running) {
                reconnectTimer = setTimeout(() => { connecting = connect(); }, 5000);
                reconnectTimer.unref?.();
            }
        }
    }
    return {
        start() {
            if (!enabled || running) return;
            running = true;
            connecting = connect();
        },
        async stop({ timeoutMs = 1500 } = {}) {
            running = false;
            controller.abort();
            clearTimeout(reconnectTimer);
            let timer;
            try {
                await Promise.race([(async () => {
                    // The native client can abort CONNECTING; waiting for connect
                    // before disconnect leaves its retry loop alive during exit.
                    await consumer?.disconnect();
                    await connecting;
                    await publisher.disconnect();
                })(), new Promise(resolve => { timer = setTimeout(resolve, timeoutMs); })]);
            } finally { clearTimeout(timer); metrics.connected = false; }
        },
        status: () => ({ enabled, running, ...metrics }),
    };
}
