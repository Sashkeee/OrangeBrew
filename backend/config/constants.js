/**
 * Named constants — previously magic numbers scattered across the codebase.
 *
 * Centralised here so they can be tuned / documented in one place.
 * Import only the groups you need:
 *   import { SAFETY, INTERVALS } from '../config/constants.js';
 */

// ── Safety limits ──────────────────────────────────────────
export const SAFETY = {
    /** Absolute maximum safe temperature (°C). PidTuner aborts above this. */
    MAX_TEMP_C: 98,

    /** Hysteresis deadband half-width around relay target (°C). */
    HYSTERESIS_C: 1.5,
};

// ── EMA / signal processing ───────────────────────────────
export const SIGNAL = {
    /** EMA alpha for temperature smoothing (higher = faster response). */
    EMA_ALPHA: 0.4,

    /** Number of consecutive samples to confirm a direction change. */
    CONFIRM_SAMPLES: 3,
};

// ── Time intervals (milliseconds) ─────────────────────────
export const INTERVALS = {
    /** Temperature logging to DB during a running process. */
    TEMP_LOG_MS: 10_000,

    /** WebSocket ping interval for liveness detection. */
    WS_PING_MS: 10_000,

    /** Wait for unauthenticated hardware WS before closing. */
    WS_AUTH_TIMEOUT_MS: 10_000,

    /** Forced exit after graceful shutdown signal. */
    SHUTDOWN_TIMEOUT_MS: 5_000,

    /** Periodic hardware data log to reduce noise. */
    HW_DATA_LOG_MS: 30_000,
};

// ── PID tuning defaults ───────────────────────────────────
export const PID_TUNING = {
    /** Number of relay oscillation cycles before computing results. */
    TARGET_CYCLES: 3,

    /** Minimum oscillation period to accept (seconds). Below this → noise. */
    MIN_PERIOD_S: 2,

    /** Minimum oscillation amplitude to accept (°C). Below this → no signal. */
    MIN_AMPLITUDE_C: 0.1,
};
