class PIDController {
    constructor(kp = 1.0, ki = 0.0, kd = 0.0, dt = 1.0) {
        this.kp = kp;
        this.ki = ki;
        this.kd = kd;
        this.dt = dt; // seconds

        this.target = 0;
        this.lastInput = 0;
        this.integral = 0;
        this.outputLimitMin = 0;
        this.outputLimitMax = 100;
        this.enabled = false;
    }

    setTarget(target) {
        this.target = target;
    }

    setTunings(kp, ki, kd) {
        this.kp = kp;
        this.ki = ki;
        this.kd = kd;
    }

    setEnabled(enabled) {
        if (enabled && !this.enabled) {
            // Reset integral and last input when enabling to avoid bumps
            // this.integral = 0; // Optional: keep or reset? Reset is safer.
            // this.integral = Math.max(this.outputLimitMin, Math.min(this.outputLimitMax, this.integral));
            this.integral = 0;
        }
        this.enabled = enabled;
    }

    compute(input) {
        if (!this.enabled) return 0;

        const error = this.target - input;

        // Proportional term
        const pTerm = this.kp * error;

        // Integral term
        this.integral += this.ki * error * this.dt;
        // Anti-windup
        if (this.integral > this.outputLimitMax) this.integral = this.outputLimitMax;
        if (this.integral < this.outputLimitMin) this.integral = this.outputLimitMin;

        // Derivative term (on input to avoid kick)
        const dInput = (input - this.lastInput) / this.dt;
        const dTerm = -this.kd * dInput;

        // Compute output
        let output = pTerm + this.integral + dTerm;

        // Clamp output
        if (output > this.outputLimitMax) output = this.outputLimitMax;
        if (output < this.outputLimitMin) output = this.outputLimitMin;

        this.lastInput = input;

        return output;
    }
}

module.exports = PIDController;
