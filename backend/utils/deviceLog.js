import { sanitizeText } from './redact.js';

/** Only authenticated server identity is admitted; device payload fields never become metadata. */
export function createDeviceLogHandler({ logger, now = Date.now, maxBytes = 8192, maxPerWindow = 20, windowMs = 10000 } = {}) {
    const windows = new Map();
    const stats = { accepted: 0, dropped: 0, truncated: 0 };
    function handle(message, { deviceId, userId }) {
        if (userId == null || !deviceId) return false;
        const time = now();
        let window = windows.get(deviceId);
        if (!window || time - window.started >= windowMs) {
            if (window?.dropped) logger.warn({ source: 'device', deviceId, userId,
                'event.action': 'device.log.rate_limited', 'orangebrew.log.dropped': window.dropped }, 'Device log rate limit');
            window = { started: time, count: 0, dropped: 0 };
            if (windows.size >= 10000) windows.delete(windows.keys().next().value);
            windows.set(deviceId, window);
        }
        if (window.count >= maxPerWindow) { window.dropped++; stats.dropped++; return false; }
        window.count++;
        const raw = typeof message.msg === 'string' ? message.msg : '[invalid device log message]';
        const truncated = Buffer.byteLength(raw) > maxBytes;
        const fields = {
            source: 'device', deviceId, userId, 'event.action': 'device.log',
            'orangebrew.log.truncated': truncated,
        };
        if (Number.isFinite(message.uptime) && message.uptime >= 0) fields['orangebrew.device.uptime'] = message.uptime;
        const level = ['info', 'warn', 'error', 'debug'].includes(message.level) ? message.level : 'info';
        logger[level](fields, sanitizeText(raw, maxBytes));
        stats.accepted++;
        if (truncated) stats.truncated++;
        return true;
    }
    return { handle, getStats: () => ({ ...stats }), clear: () => windows.clear() };
}
