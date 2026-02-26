import PIDController from './PIDController.js';
import PidTuner from './PidTuner.js';
import { setHeaterState } from '../routes/control.js';
import { settingsQueries } from '../db/database.js'; // To save tunings

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
    constructor(serial) {
        this.serial = serial;

        // Load initial tunings from DB if available, else defaults
        // Support both formats: nested pid object (from Settings page) and flat pid_p/pid_i/pid_d (legacy)
        const settings = settingsQueries.getAll();
        const pidSettings = settings.pid; // Nested object: { kp, ki, kd, ... }

        const p = parseFloat(pidSettings?.kp) || parseFloat(settings.pid_p) || 5.0;
        const i = parseFloat(pidSettings?.ki) || parseFloat(settings.pid_i) || 0.1;
        const d = parseFloat(pidSettings?.kd) || parseFloat(settings.pid_d) || 1.0;

        console.log(`[PidManager] Loaded tunings from DB: P=${p} I=${i} D=${d}`);

        this.pid = new PIDController(p, i, d, 1.0); // Kp, Ki, Kd, dt
        this.tuner = new PidTuner();
        this.lastTuningResults = null; // Store last tuning results for API retrieval
        this.enabled = false;
        this.mode = 'heating'; // 'heating' | 'holding'
        this.sensorAddress = null; // Specific sensor address to track

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
        console.log(`[PidManager] PID ${enabled ? 'ENABLED' : 'DISABLED'}`);
        if (!enabled && !this.tuner.tuning) {
            setHeaterState(0);
        }
    }

    setTarget(target) {
        this.pid.setTarget(parseFloat(target));
        console.log(`[PidManager] Target set to ${target}°C`);
    }

    /**
     * Set which sensor address to use for PID input.
     * @param {string|null} address - sensor address or null for default (mapped boiler)
     */
    setSensorAddress(address) {
        this.sensorAddress = address;
        console.log(`[PidManager] Sensor address: ${address || 'auto (mapped)'}`);
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
            console.log(`[PidManager] Mode: heating → holding (integral reset)`);
        } else {
            console.log(`[PidManager] Mode: ${mode}`);
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
        console.log(`[PidManager] Tunings updated: P=${kp} I=${ki} D=${kd}`);
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
        setHeaterState(0);
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
            // During tuning — MUST skip, do NOT use fallback boiler value
            if ((input === undefined || input === null) && this.tuner.tuning) {
                return; // Skip this data packet completely
            }
        }

        // Fallback to mapped boiler value (only when no sensorAddress or normal mode)
        if (input === undefined || input === null) input = parseFloat(sensors.boiler);
        if (input === undefined || input === null || isNaN(input)) return;

        // 1. Handle Tuning
        if (this.tuner.tuning) {
            const result = this.tuner.update(input);
            const powerToSend = Math.max(0, parseInt(result.power) || 0);
            setHeaterState(powerToSend);

            // Debug log every update during tuning
            const now = Date.now();
            if (!this._lastTuneLog || now - this._lastTuneLog > 3000) {
                console.log(`[PidManager:TUNE] input=${input.toFixed(1)}°C → tuner.power=${result.power} → heater=${powerToSend}% state=${result.state || 'done'}`);
                this._lastTuneLog = now;
            }

            if (result.done) {
                if (result.error) {
                    console.error(`[PidManager] Tuning failed: ${result.error}`);
                    this.lastTuningResults = { error: result.error };
                    setHeaterState(0);
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
                console.log(result.message);
                setHeaterState(0); // Turn off after tuning
            }
            return;
        }

        // 2. Handle Normal PID
        // NOTE: We don't check this.serial here — PID can work even without serial
        // because setHeaterState() handles hardware communication independently.
        if (!this.enabled) return;

        let heaterPower;
        if (this.mode === 'heating') {
            // Heating mode: full power with ramp-down near target
            heaterPower = this.pid.computeHeating(input, 5);
        } else {
            // Holding mode: classic PID for temperature maintenance
            const output = this.pid.compute(input);
            heaterPower = Math.round(Math.max(0, Math.min(100, output)));
        }

        setHeaterState(heaterPower);

        // Periodic log (every 30s)
        const now = Date.now();
        if (!this._lastPidLog || now - this._lastPidLog > 30000) {
            console.log(`[PidManager] ${this.mode.toUpperCase()}: input=${input.toFixed(1)}°C target=${this.pid.target}°C → heater=${heaterPower}%`);
            this._lastPidLog = now;
        }
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
