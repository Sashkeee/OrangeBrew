import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import Ajv from 'ajv';

const schema = JSON.parse(readFileSync(new URL('./schemas/process-event.v1.json', import.meta.url), 'utf8'));
const validate = new Ajv({ allErrors: true }).compile(schema);

export function validateProcessEvent(event) {
    if (!validate(event)) throw new Error(`Invalid process event: ${validate.errors.map(error => `${error.instancePath} ${error.message}`).join('; ')}`);
    if (event.aggregateId !== `session:${event.sessionId}`) throw new Error('Event aggregate does not match session');
    for (const field of ['occurredAt', 'recordedAt']) {
        const parsed = Date.parse(event[field]);
        if (!Number.isFinite(parsed) || new Date(parsed).toISOString() !== event[field]) throw new Error(`Invalid ISO timestamp: ${field}`);
    }
    return event;
}

export function createProcessEvent({ userId, sessionId, deviceId = null, sequence, eventType, payload, context = {}, now = new Date().toISOString() }) {
    return validateProcessEvent({
        eventId: randomUUID(), eventType, schemaVersion: 1, occurredAt: now, recordedAt: now,
        userId, deviceId, sessionId, aggregateId: `session:${sessionId}`, aggregateSequence: sequence,
        correlationId: context.correlationId || randomUUID(), causationId: context.causationId || null, payload,
    });
}
