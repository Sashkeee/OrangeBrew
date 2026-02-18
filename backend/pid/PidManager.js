const PIDController = require('./PIDController');

class PidManager {
    constructor(serial) {
        this.serial = serial;
        this.pid = new PIDController(5.0, 0.1, 1.0, 1.0); // Kp, Ki, Kd, dt
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
        // Re-attach listener if needed, but simplest to assume serial is constant or handled at startup
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
        this.enabled = enabled;
        this.pid.setEnabled(enabled);
        console.log(`[PidManager] PID ${enabled ? 'ENABLED' : 'DISABLED'}`);
    }

    setTarget(target) {
        this.pid.setTarget(parseFloat(target));
        console.log(`[PidManager] Target set to ${target}°C`);
    }

    setTunings(kp, ki, kd) {
        this.pid.setTunings(parseFloat(kp), parseFloat(ki), parseFloat(kd));
        console.log(`[PidManager] Tunings updated: P=${kp} I=${ki} D=${kd}`);
    }

    update(sensors) {
        if (!this.enabled || !this.serial) return;

        // Assume boilerplate temperature for now
        const input = sensors.boiler;
        if (input === undefined) return;

        const output = this.pid.compute(input);
        const heaterPower = Math.round(Math.max(0, Math.min(100, output)));

        // Send command to serial (mock or real)
        // Note: 'setHeater' command
        this.serial.write(JSON.stringify({ cmd: 'setHeater', value: heaterPower }));
    }

    getStatus() {
        return {
            enabled: this.enabled,
            target: this.pid.target,
            kp: this.pid.kp,
            ki: this.pid.ki,
            kd: this.pid.kd,
            output: this.pid.lastInput // Just a placeholder, maybe expose integral etc
        };
    }
}

module.exports = PidManager;
