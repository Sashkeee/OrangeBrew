/**
 * PID Controller for OrangeBrew brewing process.
 * 
 * Supports two modes:
 * - HEATING: Full power (100%) with optional ramp-down near target
 * - HOLDING: Classic PID to maintain temperature at target
 * 
 * The key insight for brewing: during heating phase, we want max power
 * to heat quickly. During holding, we want gentle PID to maintain temp.
 * Integral windup is managed by resetting when switching modes.
 */
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
            this.integral = 0;
            this.lastInput = 0;
        }
        this.enabled = enabled;
    }

    /**
     * Reset integral accumulator. Call this when:
     * - Transitioning from heating to holding (prevent overshoot)
     * - Changing target temperature (new step)
     */
    resetIntegral() {
        this.integral = 0;
        // Integral reset (silent — happens frequently during mode transitions)
    }

    /**
     * Compute PID output for HOLDING mode (temperature maintenance).
     * Classic PID with anti-windup.
     * @param {number} input - current temperature
     * @returns {number} output 0-100%
     */
    compute(input) {
        if (!this.enabled) return 0;

        const error = this.target - input;

        // Proportional term
        const pTerm = this.kp * error;

        // Integral term
        this.integral += this.ki * error * this.dt;
        // Anti-windup: clamp integral
        if (this.integral > this.outputLimitMax) this.integral = this.outputLimitMax;
        if (this.integral < this.outputLimitMin) this.integral = this.outputLimitMin;

        // Derivative term (on input to avoid derivative kick)
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

    /**
     * Compute output for HEATING mode (getting to target temperature).
     *
     * Default (rampDistance = 0): 100% power until ProcessManager detects temp >= target
     * and switches to HOLDING. This is the correct approach for brewing — let the PID
     * (with tuned Kp/Ki/Kd) handle steady-state control in HOLDING mode.
     *
     * Optional ramp (rampDistance > 0): reduces power in the last N degrees to limit
     * overshoot on fast-response setups (e.g. small vessels, light-bulb test bench).
     * Within the ramp zone: output = Kp * error (P-only, no integral windup).
     *
     * @param {number} input - current temperature
     * @param {number} rampDistance - degrees below target to start ramp (0 = disabled)
     * @param {number} minPower - minimum power floor in ramp zone, %
     * @returns {number} output 0-100%
     */
    computeHeating(input, rampDistance = 0, minPower = 5) {
        if (!this.enabled) return 0;

        const error = this.target - input;
        if (error <= 0) return 0;

        // No ramp configured — full power all the way to target
        if (rampDistance <= 0 || error >= rampDistance) return 100;

        // Ramp zone: P-only (no integral windup), clamped to [minPower, 100]
        const pOutput = this.kp * error;
        return Math.round(Math.max(minPower, Math.min(100, pOutput)));
    }
}

export default PIDController;
