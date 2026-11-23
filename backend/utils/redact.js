export const REDACTED = '[REDACTED]';
const SENSITIVE_KEY = /^(?:authorization|proxyauthorization|cookies?|setcookie|password|passwordhash|passwd|passphrase|secret|jwtsecret|token|accesstoken|refreshtoken|bottoken|apikey|pairingcode|wifipass|wifipassword)$/i;
const ASSIGNMENT = /(["']?(?:authorization|proxy[-_]?authorization|cookies?|set[-_]?cookie|password(?:_hash)?|passwd|passphrase|(?:jwt[-_]?)?secret|(?:access[-_]?|refresh[-_]?|bot[-_]?)?token|api[-_ ]?key|pairing[-_]?code|wifi[-_]?(?:pass|password))["']?\s*[:=]\s*)(?:\[REDACTED\]|"[^"\r\n]*"|'[^'\r\n]*'|[^\s,;&}\]]+)/gi;

export function truncateUtf8(value, maxBytes) {
    if (Buffer.byteLength(value) <= maxBytes) return value;
    return Buffer.from(value).subarray(0, maxBytes).toString('utf8').replace(/\uFFFD$/, '');
}

/** Text is untrusted too: secrets can arrive in exceptions and device messages. */
export function sanitizeText(value, maxBytes = 8192) {
    let text = String(value ?? '');
    text = text.replace(/\b(?:cookie|set-cookie|authorization|proxy-authorization)\s*:\s*[^\r\n]*/gi, header => `${header.split(':')[0]}: ${REDACTED}`);
    text = text.replace(/\bBearer\s+[^\s,"';]+/gi, `Bearer ${REDACTED}`);
    text = text.replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, REDACTED);
    text = text.replace(/\bbot\d+:[A-Za-z0-9_-]+/g, `bot${REDACTED}`);
    text = text.replace(/(https?:\/\/)[^\s/@]+:[^\s/@]+@/gi, `$1${REDACTED}@`);
    text = text.replace(/https?:\/\/[^\s"'<>]+/gi, url => {
        try {
            const parsed = new URL(url);
            return `${parsed.protocol}//${parsed.host}${parsed.pathname}`;
        } catch { return '[invalid URL]'; }
    });
    text = text.replace(ASSIGNMENT, (_match, prefix) => `${prefix}${REDACTED}`);
    text = text.replace(/([?&](?:token|api_key|apikey|password|pairing_code)=)[^\s&#]*/gi, `$1${REDACTED}`);
    return truncateUtf8(text, maxBytes);
}

/** Logs keep a path, never URL credentials, query parameters, or fragments. */
export function safeUrlPath(value) {
    try {
        return sanitizeText(new URL(String(value || '/'), 'http://orangebrew.invalid').pathname, 2048);
    } catch { return '[invalid path]'; }
}

/** Copy bounded metadata without executing arbitrary toJSON methods or getters. */
export function redact(value, { maxDepth = 6, maxStringBytes = 8192 } = {}) {
    const seen = new WeakSet();
    const visit = (item, depth) => {
        if (typeof item === 'string') return sanitizeText(item, maxStringBytes);
        if (typeof item === 'bigint') return item.toString();
        if (item == null || typeof item === 'boolean') return item;
        if (typeof item === 'number') return Number.isFinite(item) ? item : null;
        if (typeof item !== 'object') return undefined;
        if (seen.has(item)) return '[Circular]';
        if (depth >= maxDepth) return '[MaxDepth]';
        seen.add(item);
        if (item instanceof Error) {
            const error = new Error(sanitizeText(item.message, maxStringBytes));
            Object.setPrototypeOf(error, Object.getPrototypeOf(item));
            error.name = sanitizeText(item.name, 256);
            error.stack = sanitizeText(item.stack || `${error.name}: ${error.message}`, maxStringBytes);
            if (item.cause) error.cause = visit(item.cause, depth + 1);
            if (item.code != null) error.code = visit(item.code, depth + 1);
            return error;
        }
        if (Array.isArray(item)) return item.slice(0, 100).map(entry => visit(entry, depth + 1));
        const result = Object.create(null);
        for (const key of Object.keys(item).slice(0, 100)) {
            if (['__proto__', 'constructor', 'prototype'].includes(key)) continue;
            if (SENSITIVE_KEY.test(key.replace(/[^a-z]/gi, ''))) { result[key] = REDACTED; continue; }
            const descriptor = Object.getOwnPropertyDescriptor(item, key);
            if (!descriptor || !('value' in descriptor)) continue;
            result[key] = /^(?:url|originalUrl)$/i.test(key)
                ? safeUrlPath(descriptor.value) : visit(descriptor.value, depth + 1);
        }
        return result;
    };
    return visit(value, 0);
}
