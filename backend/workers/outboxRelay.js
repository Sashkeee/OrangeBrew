import { eventOutboxQueries } from '../db/database.js';
import { readKafkaConfig, createKafkaPublisher } from '../infrastructure/kafka/client.js';
import logger from '../utils/logger.js';

export function createOutboxRelay({ config = readKafkaConfig(), publisher = createKafkaPublisher(config), store = eventOutboxQueries,
    logger: log = logger.child({ module: 'OutboxRelay' }), now = Date.now } = {}) {
    let running = false;
    let stopping = false;
    let timer;
    let inFlight;
    let lastCleanup = 0;
    let lastFailure = null;

    async function deliver() {
        const batch = store.nextBatch(config.batchSize, now());
        for (const row of batch) {
            if (stopping) break;
            try {
                await publisher.publish({ topic: row.topic, key: row.message_key, value: row.payload, eventId: row.event_id });
                if (stopping) break; // The durable row remains available for a harmless duplicate on restart.
                store.markPublished(row.event_id);
                lastFailure = null;
            } catch (err) {
                if (stopping) break;
                const delay = Math.min(config.retryMaxMs, config.retryBaseMs * (2 ** Math.min(row.attempts, 16)));
                // Never persist broker errors: they may contain credentials or payloads.
                store.markFailed(row.event_id, 'Kafka publication failed; retry scheduled', now() + delay);
                lastFailure = new Date(now()).toISOString();
                log.warn({ eventId: row.event_id, attempt: row.attempts + 1, retryInMs: delay }, 'Kafka publication failed; outbox retained');
            }
        }
        if (!stopping && now() - lastCleanup > 60000) {
            store.cleanupPublished(new Date(now() - config.publishedRetentionMs).toISOString());
            lastCleanup = now();
        }
    }

    function runOnce() {
        if (stopping || !config.publishEnabled) return Promise.resolve();
        if (inFlight) return inFlight;
        inFlight = deliver().finally(() => { inFlight = undefined; });
        return inFlight;
    }

    async function tick() {
        try { await runOnce(); }
        catch (err) { log.error({ err }, 'Outbox relay iteration failed; rows retained'); }
        finally {
            if (running && !stopping) { timer = setTimeout(tick, config.pollMs); timer.unref?.(); }
        }
    }

    return {
        start() {
            if (running || !config.publishEnabled) return;
            running = true;
            stopping = false;
            // Do not make startup depend on a network connection.
            timer = setTimeout(tick, 0);
            timer.unref?.();
        },
        runOnce,
        status() { return { enabled: config.publishEnabled, running, lastFailure, ...store.stats() }; },
        async stop({ timeoutMs = 2000 } = {}) {
            running = false;
            stopping = true;
            clearTimeout(timer);
            let timeout;
            const drain = (async () => {
                // Cancel native CONNECTING/send before waiting for publication.
                await publisher.disconnect();
                if (inFlight) await inFlight.catch(() => {});
            })();
            try {
                await Promise.race([drain, new Promise(resolve => { timeout = setTimeout(resolve, timeoutMs); })]);
            } finally { clearTimeout(timeout); }
            // Any send completing after this point checks stopping before accessing SQLite.
        },
    };
}
