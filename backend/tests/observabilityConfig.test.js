import { describe, expect, it } from 'vitest';
import { readObservabilityConfig } from '../config/observability.js';
import { readKafkaConfig } from '../infrastructure/kafka/client.js';

describe('observability environment validation', () => {
    it('runs locally without Kafka while retaining durable capture', () => {
        expect(readObservabilityConfig({})).toMatchObject({ publishEnabled: false, transport: 'direct', events: { captureEnabled: true } });
    });
    it('rejects Kafka notifications unless capture and publishing are both enabled', () => {
        expect(() => readObservabilityConfig({ NOTIFICATIONS_TRANSPORT: 'kafka' })).toThrow('require');
        expect(() => readObservabilityConfig({ NOTIFICATIONS_TRANSPORT: 'kafka', KAFKA_PUBLISH_ENABLED: 'true', EVENTS_CAPTURE_ENABLED: 'false' })).toThrow('require');
        expect(readObservabilityConfig({ NOTIFICATIONS_TRANSPORT: 'kafka', KAFKA_PUBLISH_ENABLED: 'true' }).transport).toBe('kafka');
    });
    it('fails closed for plaintext production Kafka', () => {
        expect(() => readKafkaConfig({ APP_ENV: 'prod', KAFKA_PUBLISH_ENABLED: 'true', KAFKA_BROKERS: 'broker:9092' })).toThrow('KAFKA_SSL');
        expect(readKafkaConfig({ APP_ENV: 'prod', KAFKA_PUBLISH_ENABLED: 'true', KAFKA_BROKERS: 'broker:9093', KAFKA_SSL: 'true' }).ssl).toBe(true);
    });
    it('rejects invalid transport, environment and unbounded notification TTL', () => {
        expect(() => readObservabilityConfig({ NOTIFICATIONS_TRANSPORT: 'unknown' })).toThrow('NOTIFICATIONS_TRANSPORT');
        expect(() => readObservabilityConfig({ APP_ENV: 'unknown' })).toThrow('APP_ENV');
        expect(() => readObservabilityConfig({ NOTIFICATION_TTL_MS: 'Infinity' })).toThrow('NOTIFICATION_TTL_MS');
    });
});
