import PIDController from './PIDController.js';
import PidTuner from './PidTuner.js';
import { setHeaterState } from '../routes/control.js';
import { settingsQueries } from '../db/database.js'; // To save tunings

export default class PidManager {
    constructor(serial) {
        this.serial = serial;

        // Load initial tunings from DB if available, else defaults
        const settings = settingsQueries.getAll();
        const p = parseFloat(settings.pid_p) || 5.0;
        const i = parseFloat(settings.pid_i) || 0.1;
        const d = parseFloat(settings.pid_d) || 1.0;

        this.pid = new PIDController(p, i, d, 1.0); // Kp, Ki, Kd, dt
        this.tuner = new PidTuner();
        this.enabled = false;

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

    setTunings(kp, ki, kd) {
        this.pid.setTunings(parseFloat(kp), parseFloat(ki), parseFloat(kd));
        console.log(`[PidManager] Tunings updated: P=${kp} I=${ki} D=${kd}`);
    }

    // --- Tuning Methods ---
    startTuning(target) {
        this.setEnabled(false); // Disable normal PID
        this.tuner.start(target, 100);
    }

    stopTuning() {
        this.tuner.reset();
        setHeaterState(0);
    }

    getTunerStatus() {
        return {
            tuning: this.tuner.tuning,
            state: this.tuner.state,
            cycle: this.tuner.currentCycle,
            maxCycles: this.tuner.targetCycles
        };
    }

    update(sensors) {
        const input = sensors.boiler;
        if (input === undefined) return;

        // 1. Handle Tuning
        if (this.tuner.tuning) {
            const result = this.tuner.update(input);
            setHeaterState(result.power); // Send PWM

            if (result.done) {
                // Save new coefficients to DB
                settingsQueries.setBulk({
                    pid_p: result.results.Kp.toFixed(2),
                    pid_i: result.results.Ki.toFixed(3),
                    pid_d: result.results.Kd.toFixed(2)
                });
                // Apply to running PID
                this.setTunings(result.results.Kp, result.results.Ki, result.results.Kd);
                console.log(result.message);
                setHeaterState(0); // Turn off after tuning
            }
            return;
        }

        // 2. Handle Normal PID
        if (!this.enabled || !this.serial) return;
        const output = this.pid.compute(input);
        const heaterPower = Math.round(Math.max(0, Math.min(100, output)));
        setHeaterState(heaterPower);

        // Periodic log (every 30s)
        const now = Date.now();
        if (!this._lastPidLog || now - this._lastPidLog > 30000) {
            console.log(`[PidManager] PID: input=${input.toFixed(1)}°C target=${this.pid.target}°C → heater=${heaterPower}%`);
            this._lastPidLog = now;
        }
    }

    getStatus() {
        return {
            enabled: this.enabled,
            target: this.pid.target,
            kp: this.pid.kp,
            ki: this.pid.ki,
            kd: this.pid.kd,
            output: this.pid.lastInput
        };
    }
}


