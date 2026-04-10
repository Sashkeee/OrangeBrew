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
     * - Far from target (>= rampDistance): 100% power
     * - Near target (< rampDistance): P-only using tuned Kp — no integral windup
     * - At or above target: 0% — ProcessManager switches to HOLDING
     *
     * Using Kp in the ramp zone means autotune directly affects the heating approach.
     * Higher Kp = steeper power curve near target (more aggressive approach).
     *
     * @param {number} input - current temperature
     * @param {number} rampDistance - degrees below target to start P-only ramp (default 2)
     * @param {number} minPower - minimum power floor in ramp zone, % (default 5)
     * @returns {number} output 0-100%
     */
    computeHeating(input, rampDistance = 2, minPower = 5) {
        if (!this.enabled) return 0;

        const error = this.target - input;

        if (error <= 0) {
            // Already at or above target
            return 0;
        }

        if (error >= rampDistance) {
            // Far from target — full power
            return 100;
        }

        // Near target — P-only: uses tuned Kp, no integral accumulation.
        // Output = Kp * error, clamped to [minPower, 100].
        // At error=rampDistance with typical Kp, output approaches 100% naturally.
        // If Kp is very small (< 100/rampDistance), minPower ensures heater stays on.
        const pOutput = this.kp * error;
        return Math.round(Math.max(minPower, Math.min(100, pOutput)));
    }
}

export default PIDController;
