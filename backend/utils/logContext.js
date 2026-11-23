import { AsyncLocalStorage } from 'node:async_hooks';

const storage = new AsyncLocalStorage();
export const getLogContext = () => storage.getStore() || {};
export function runWithLogContext(bindings, callback) {
    return storage.run({ ...getLogContext(), ...bindings }, callback);
}
/** Enrich only the active request; never creates a process-wide context. */
export function setLogContext(bindings) {
    const current = storage.getStore();
    if (current) Object.assign(current, bindings);
}
