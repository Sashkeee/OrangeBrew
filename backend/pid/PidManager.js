import PIDController from './PIDController.js';
import PidTuner from './PidTuner.js';
import { KalmanFilter } from './KalmanFilter.js';
import { setHeaterState } from '../routes/control.js';
import { settingsQueries } from '../db/database.js'; // To save tunings
import logger from '../utils/logger.js';

const log = logger.child({ module: 'PidManager' });

/**
 * PidManager orchestrates the PID controller for brewing.
 * 
 * Two operational modes:
 * - 'heating': Full power with ramp-down near target (fast heating)
 * - 'holding': Classic PID to maintain temperature (gentle control)
 * 
 * The ProcessManager tells PidManager which mode to use via setMode().
 */
export default class PidManager {
    constructor(serial, userId) {
        this.serial = serial;
        this.userId = userId;  // нужен для per-user маршрутизации команд нагревателю

        // Load initial tunings from DB if available, else defaults
        // Support both formats: nested pid object (from Settings page) and flat pid_p/pid_i/pid_d (legacy)
        const settings = settingsQueries.getAll();
        const pidSettings = settings.pid; // Nested object: { kp, ki, kd, ... }

        const p = parseFloat(pidSettings?.kp) || parseFloat(settings.pid_p) || 5.0;
        const i = parseFloat(pidSettings?.ki) || parseFloat(settings.pid_i) || 0.1;
        const d = parseFloat(pidSettings?.kd) || parseFloat(settings.pid_d) || 1.0;

        log.info({ kp: p, ki: i, kd: d }, 'Loaded tunings from DB');

        this.pid = new PIDController(p, i, d, 1.0); // Kp, Ki, Kd, dt
        this.tuner = new PidTuner();
        this.lastTuningResults = null; // Store last tuning results for API retrieval
        this.enabled = false;
        this.mode = 'heating'; // 'heating' | 'holding'
        this.sensorAddress = null; // Specific sensor address to track

        // Kalman filter for sensor noise reduction
        const kalmanQ = parseFloat(settingsQueries.get('kalman_q')) || 0.01;
        const kalmanR = parseFloat(settingsQueries.get('kalman_r')) || 0.05;
        this.kalman = new KalmanFilter({ processNoise: kalmanQ, measurementNoise: kalmanR });
        this.kalmanEnabled = true;
        this.lastRawInput = null;
        this.lastFilteredInput = null;

        // Listen to sensor updates
        if (this.serial) {
            this.serial.on('data', (data) => {
                const msg = data.data || data; // handle unwrapped or wrapped
                if (msg.type === 'sensors') {
                    this.update(msg);
                }
            });
        }
    }

    setSerial(serial) {
        this.serial = serial;
        if (this.serial) {
            this.serial.on('data', (data) => {
                const msg = data.data || data;
                if (msg.type === 'sensors') {
                    this.update(msg);
                }
            });
        }
    }

    setEnabled(enabled) {
        // If tuning is running, don't allow enabling normal PID
        if (this.tuner.tuning && enabled) return;

        this.enabled = enabled;
        this.pid.setEnabled(enabled);
        log.info({ enabled }, `PID ${enabled ? 'ENABLED' : 'DISABLED'}`);
        if (!enabled && !this.tuner.tuning) {
            setHeaterState(0, this.userId);
        }
    }

    setTarget(target) {
        this.pid.setTarget(parseFloat(target));
        log.info({ target }, 'Target set');
    }

    /**
     * Set which sensor address to use for PID input.
     * @param {string|null} address - sensor address or null for default (mapped boiler)
     */
    setSensorAddress(address) {
        this.sensorAddress = address;
        log.info({ address: address || 'auto' }, 'Sensor address set');
    }

    /**
     * Set operational mode.
     * @param {'heating'|'holding'} mode 
     */
    setMode(mode) {
        const old = this.mode;
        this.mode = mode;
        if (mode === 'holding' && old === 'heating') {
            // Reset integral when transitioning to holding to prevent overshoot
            this.pid.resetIntegral();
            log.info({ from: 'heating', to: 'holding' }, 'Mode changed, integral reset');
        } else {
            log.info({ mode }, 'Mode set');
        }
    }

    /**
     * Reset PID integral (used when changing steps/targets).
     */
    resetIntegral() {
        this.pid.resetIntegral();
    }

    setTunings(kp, ki, kd) {
        this.pid.setTunings(parseFloat(kp), parseFloat(ki), parseFloat(kd));
        log.info({ kp, ki, kd }, 'Tunings updated');
    }

    // --- Tuning Methods ---
    startTuning(target, sensorAddress = null) {
        this.setEnabled(false); // Disable normal PID
        this.lastTuningResults = null; // Clear old results
        this.setSensorAddress(sensorAddress);
        this.tuner.start(target, 100);
    }

    stopTuning() {
        this.tuner.reset();
        setHeaterState(0, this.userId);
    }

    getTunerStatus() {
        const status = {
            tuning: this.tuner.tuning,
            state: this.tuner.state,
            cycle: this.tuner.currentCycle,
            maxCycles: this.tuner.targetCycles
        };
        // Include results if tuning completed
        if (this.lastTuningResults) {
            status.results = this.lastTuningResults;
        }
        return status;
    }

    update(sensors) {
        // Extract temperature from the correct sensor
        let input;
        const hasSensorsArray = sensors.sensors && Array.isArray(sensors.sensors);

        if (this.sensorAddress) {
            // Specific sensor address requested
            if (hasSensorsArray) {
                const targetSensor = sensors.sensors.find(s => s.address === this.sensorAddress);
                if (targetSensor) {
                    input = parseFloat(targetSensor.temp ?? targetSensor.value);
                }
            }
            // If sensorAddress is set but sensor NOT found (no array or address mismatch):
            // ALWAYS skip — do NOT fallback to boiler (could be mock or wrong sensor!)
            if (input === undefined || input === null) {
                return; // Skip this data packet completely
            }
        }

        // Fallback to mapped boiler value (only when no sensorAddress is set)
        if (input === undefined || input === null) input = parseFloat(sensors.boiler);
        if (input === undefined || input === null || isNaN(input)) return;

        // 1. Handle Tuning
        if (this.tuner.tuning) {
            const result = this.tuner.update(input);
            const powerToSend = Math.max(0, parseInt(result.power) || 0);
            setHeaterState(powerToSend, this.userId);

            // Debug log every update during tuning
            const now = Date.now();
            if (!this._lastTuneLog || now - this._lastTuneLog > 3000) {
                log.debug({ input: input.toFixed(1), tunerPower: result.power, heater: powerToSend, state: result.state || 'done' }, 'TUNE tick');
                this._lastTuneLog = now;
            }

            if (result.done) {
                if (result.error) {
                    log.error({ error: result.error }, 'Tuning failed');
                    this.lastTuningResults = { error: result.error };
                    setHeaterState(0, this.userId);
                    return;
                }

                // Store results for API retrieval
                this.lastTuningResults = {
                    Kp: result.results.Kp,
                    Ki: result.results.Ki,
                    Kd: result.results.Kd,
                    Ku: result.results.Ku,
                    Tu: result.results.Tu,
                    A: result.results.A
                };

                // Save to DB in the format expected by both frontend and PidManager
                // Save as nested object under 'pid' key (for Settings page)
                const currentPidSettings = settingsQueries.get('pid') || {};
                settingsQueries.set('pid', {
                    ...currentPidSettings,
                    kp: parseFloat(result.results.Kp.toFixed(2)),
                    ki: parseFloat(result.results.Ki.toFixed(3)),
                    kd: parseFloat(result.results.Kd.toFixed(2))
                });

                // Apply to running PID
                this.setTunings(result.results.Kp, result.results.Ki, result.results.Kd);
                log.info({ kp: result.results.Kp, ki: result.results.Ki, kd: result.results.Kd }, result.message);
                setHeaterState(0, this.userId); // Turn off after tuning
            }
            return;
        }

        // 2. Handle Normal PID
        // NOTE: We don't check this.serial here — PID can work even without serial
        // because setHeaterState() handles hardware communication independently.
        if (!this.enabled) return;

        // Apply Kalman filter to reduce sensor noise before PID computation.
        // UI always receives raw sensor data — filtering only affects PID input.
        // PidTuner uses its own EMA and is NOT affected by this filter.
        this.lastRawInput = input;
        const filteredInput = this.kalmanEnabled ? this.kalman.update(input) : input;
        this.lastFilteredInput = filteredInput;

        let heaterPower;
        if (this.mode === 'heating') {
            // Heating mode: full power with ramp-down near target
            heaterPower = this.pid.computeHeating(filteredInput, 5);
        } else {
            // Holding mode: classic PID for temperature maintenance
            const output = this.pid.compute(filteredInput);
            heaterPower = Math.round(Math.max(0, Math.min(100, output)));
        }

        setHeaterState(heaterPower, this.userId);

        // Periodic log (every 30s)
        const now = Date.now();
        if (!this._lastPidLog || now - this._lastPidLog > 30000) {
            const rawStr = this.lastRawInput.toFixed(2);
            const filtStr = filteredInput.toFixed(2);
            const filterInfo = this.kalmanEnabled && rawStr !== filtStr ? ` (raw=${rawStr})` : '';
            log.debug({ mode: this.mode, input: filtStr, raw: this.lastRawInput?.toFixed(2), target: this.pid.target, heater: heaterPower }, 'PID tick');
            this._lastPidLog = now;
        }
    }

    /**
     * Update Kalman filter parameters on-the-fly.
     * Called by settings route when POST /api/settings/kalman is received.
     * @param {{ enabled?: boolean, q?: number, r?: number }} params
     */
    updateKalman({ enabled, q, r } = {}) {
        if (enabled !== undefined) this.kalmanEnabled = Boolean(enabled);
        if (q !== undefined || r !== undefined) {
            const newQ = q !== undefined ? parseFloat(q) : this.kalman.q;
            const newR = r !== undefined ? parseFloat(r) : this.kalman.r;
            this.kalman = new KalmanFilter({
                processNoise: newQ,
                measurementNoise: newR,
                initialError: this.kalman._initialError
            });
            // Persist to DB so values survive restarts
            if (q !== undefined) settingsQueries.set('kalman_q', newQ);
            if (r !== undefined) settingsQueries.set('kalman_r', newR);
        }
        log.info({ enabled: this.kalmanEnabled, q: this.kalman.q, r: this.kalman.r }, 'Kalman updated');
    }

    getKalmanStatus() {
        return {
            enabled: this.kalmanEnabled,
            q: this.kalman.q,
            r: this.kalman.r,
            gain: this.kalman.gain,
            rawInput: this.lastRawInput,
            filteredInput: this.lastFilteredInput
        };
    }

    getStatus() {
        return {
            enabled: this.enabled,
            mode: this.mode,
            target: this.pid.target,
            kp: this.pid.kp,
            ki: this.pid.ki,
            kd: this.pid.kd,
            output: this.pid.lastInput
        };
    }
}
