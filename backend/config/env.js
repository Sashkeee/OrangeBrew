/**
 * Centralized environment configuration.
 * Validates required env vars at import time — the process will crash
 * immediately on startup if a critical variable is missing, instead of
 * running with an insecure fallback.
 */

// ── Required ──────────────────────────────────────────────
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
    // In test environment allow a deterministic secret for vitest
    if (process.env.NODE_ENV === 'test') {
        process.env.JWT_SECRET = 'test_secret_for_vitest';
    } else {
        console.error('FATAL: JWT_SECRET environment variable is not set. Exiting.');
        process.exit(1);
    }
}

export default {
    JWT_SECRET: process.env.JWT_SECRET,
};
