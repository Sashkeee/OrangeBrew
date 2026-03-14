/**
 * One-dimensional Kalman filter for temperature sensor noise reduction.
 *
 * Designed for DS18B20 sensors used in brewing/distillation:
 *   - processNoise (Q): how fast temperature can change between measurements (°C²/s)
 *   - measurementNoise (R): sensor measurement variance (°C²)
 *
 * Defaults: q=0.01, r=0.05 — empirically tuned for DS18B20 at 1-second intervals.
 * These can be overridden via POST /api/settings/kalman.
 */
export class KalmanFilter {
    constructor({ processNoise = 0.01, measurementNoise = 0.05, initialError = 1.0 } = {}) {
        this.q = processNoise;      // Process noise covariance
        this.r = measurementNoise;  // Measurement noise covariance
        this._initialError = initialError;
        this.x = null;              // Current state estimate (°C)
        this.p = initialError;      // Estimate error covariance
        this.initialized = false;
    }

    /**
     * Feed a new measurement and get the filtered estimate.
     * @param {number} measurement - raw sensor reading (°C)
     * @returns {number} filtered temperature estimate (°C)
     */
    update(measurement) {
        if (!this.initialized) {
            this.x = measurement;
            this.initialized = true;
            return measurement;
        }

        // Predict step: covariance grows with process noise
        this.p += this.q;

        // Update step
        const k = this.p / (this.p + this.r); // Kalman gain
        this.x += k * (measurement - this.x);
        this.p *= (1 - k);

        return this.x;
    }

    /**
     * Reset filter state (e.g. when sensor is reconnected or process restarts).
     */
    reset() {
        this.x = null;
        this.p = this._initialError;
        this.initialized = false;
    }

    /** Current Kalman gain — approaches 0 as filter gains confidence. */
    get gain() {
        return this.p / (this.p + this.r);
    }
}
