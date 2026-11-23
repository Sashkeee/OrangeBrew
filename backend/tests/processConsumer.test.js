import { describe, expect, it, vi } from 'vitest';
import { createProcessConsumer } from '../consumers/processConsumer.js';
import { createProcessEvent } from '../events/processEvent.js';

async function fixture(handler, { dlqFailure = false } = {}) {
    let callback;
    const consumer = { connect: vi.fn(), subscribe: vi.fn(), disconnect: vi.fn(), commitOffsets: vi.fn(),
        run: vi.fn(async ({ eachMessage }) => { callback = eachMessage; }) };
    const publisher = { publish: dlqFailure ? vi.fn().mockRejectedValue(new Error('Kafka unavailable')) : vi.fn(), disconnect: vi.fn() };
    const instance = createProcessConsumer({ name: 'test', topic: 'process', dlqTopic: 'dlq', enabled: true,
        clientFactory: async () => ({ consumer: () => consumer }), publisher, handler, maxAttempts: 1,
        log: { warn: vi.fn() } });
    instance.start();
    await vi.waitFor(() => expect(callback).toBeTypeOf('function'));
    return { consumer, publisher, instance, deliver: callback };
}
const event = () => createProcessEvent({ userId: 1, sessionId: 1, sequence: 1,
    eventType: 'process.started', payload: { mode: 'mash' } });
const message = value => ({ topic: 'process', partition: 0,
    message: { value: Buffer.from(typeof value === 'string' ? value : JSON.stringify(value)), offset: '9007199254740993', key: Buffer.from('1:1') } });

describe('process Kafka consumer', () => {
    it('commits only after a completed effect, preserving large offsets exactly', async () => {
        let release;
        const gate = new Promise(resolve => { release = resolve; });
        const f = await fixture(() => gate);
        try {
            const pending = f.deliver(message(event()));
            await Promise.resolve();
            expect(f.consumer.commitOffsets).not.toHaveBeenCalled();
            release({ ok: true });
            await pending;
            expect(f.consumer.commitOffsets).toHaveBeenCalledWith([{ topic: 'process', partition: 0, offset: '9007199254740994' }]);
        } finally { await f.instance.stop(); }
    });
    it('acks malformed records only after an acknowledged DLQ write', async () => {
        const handler = vi.fn();
        const f = await fixture(handler);
        try {
            await f.deliver(message('{not-json'));
            expect(handler).not.toHaveBeenCalled();
            expect(f.publisher.publish).toHaveBeenCalledWith(expect.objectContaining({ topic: 'dlq' }));
            expect(f.publisher.publish.mock.invocationCallOrder[0]).toBeLessThan(f.consumer.commitOffsets.mock.invocationCallOrder[0]);
        } finally { await f.instance.stop(); }
    });
    it('leaves the offset uncommitted if DLQ is unavailable', async () => {
        const f = await fixture(vi.fn(), { dlqFailure: true });
        try {
            await expect(f.deliver(message('{broken'))).rejects.toThrow('Kafka unavailable');
            expect(f.consumer.commitOffsets).not.toHaveBeenCalled();
        } finally { await f.instance.stop(); }
    });
    it('leaves the offset uncommitted when effect commit fails and DLQ cannot save it', async () => {
        const f = await fixture(() => { throw new Error('DB failure'); }, { dlqFailure: true });
        try {
            await expect(f.deliver(message(event()))).rejects.toThrow('Kafka unavailable');
            expect(f.consumer.commitOffsets).not.toHaveBeenCalled();
        } finally { await f.instance.stop(); }
    });
});
