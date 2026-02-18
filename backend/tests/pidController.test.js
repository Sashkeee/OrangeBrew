import { describe, it, expect, beforeEach } from 'vitest';
import PIDController from '../pid/PidController.js';

describe('PIDController', () => {
    let pid;

    beforeEach(() => {
        pid = new PIDController(1.0, 0.1, 0.5, 1.0);
    });

    // ─── Initialization ───────────────────────────────────────

    describe('initialization', () => {
        it('should initialize with given tunings', () => {
            expect(pid.kp).toBe(1.0);
            expect(pid.ki).toBe(0.1);
            expect(pid.kd).toBe(0.5);
            expect(pid.dt).toBe(1.0);
        });

        it('should initialize with default state', () => {
            expect(pid.target).toBe(0);
            expect(pid.lastInput).toBe(0);
            expect(pid.integral).toBe(0);
            expect(pid.enabled).toBe(false);
        });

        it('should have default output limits [0, 100]', () => {
            expect(pid.outputLimitMin).toBe(0);
            expect(pid.outputLimitMax).toBe(100);
        });

        it('should use default tunings when none supplied', () => {
            const defaultPid = new PIDController();
            expect(defaultPid.kp).toBe(1.0);
            expect(defaultPid.ki).toBe(0.0);
            expect(defaultPid.kd).toBe(0.0);
            expect(defaultPid.dt).toBe(1.0);
        });
    });

    // ─── Setters ──────────────────────────────────────────────

    describe('setters', () => {
        it('setTarget() should update target', () => {
            pid.setTarget(65);
            expect(pid.target).toBe(65);
        });

        it('setTunings() should update Kp, Ki, Kd', () => {
            pid.setTunings(2.0, 0.5, 3.0);
            expect(pid.kp).toBe(2.0);
            expect(pid.ki).toBe(0.5);
            expect(pid.kd).toBe(3.0);
        });

        it('setEnabled(true) should enable and reset integral', () => {
            pid.integral = 50;
            pid.setEnabled(true);
            expect(pid.enabled).toBe(true);
            expect(pid.integral).toBe(0);
        });

        it('setEnabled(false) should disable', () => {
            pid.setEnabled(true);
            pid.setEnabled(false);
            expect(pid.enabled).toBe(false);
        });

        it('setEnabled(true) twice should not reset integral on second call', () => {
            pid.setEnabled(true);
            pid.integral = 25;
            pid.setEnabled(true); // already enabled → no reset
            expect(pid.integral).toBe(25);
        });
    });

    // ─── compute() ────────────────────────────────────────────

    describe('compute()', () => {
        it('should return 0 when disabled', () => {
            pid.setTarget(70);
            expect(pid.compute(20)).toBe(0);
        });

        it('should return positive output when below target (P-only)', () => {
            const pPid = new PIDController(2.0, 0, 0, 1.0);
            pPid.setEnabled(true);
            pPid.setTarget(70);
            const output = pPid.compute(60); // error = 10
            expect(output).toBe(20); // 2.0 * 10
        });

        it('should return 0 when at target (P-only)', () => {
            const pPid = new PIDController(2.0, 0, 0, 1.0);
            pPid.setEnabled(true);
            pPid.setTarget(50);
            const output = pPid.compute(50);
            expect(output).toBe(0);
        });

        it('should accumulate integral over multiple calls', () => {
            const iPid = new PIDController(0, 1.0, 0, 1.0);
            iPid.setEnabled(true);
            iPid.setTarget(50);

            iPid.compute(40); // error=10, integral=10
            iPid.compute(40); // error=10, integral=20
            const out = iPid.compute(40); // error=10, integral=30
            expect(out).toBe(30);
        });

        it('should apply derivative on input change (not setpoint)', () => {
            const dPid = new PIDController(0, 0, 1.0, 1.0);
            dPid.setEnabled(true);
            dPid.setTarget(50);

            dPid.compute(40); // lastInput was 0, dInput = 40/1 = 40, dTerm = -40
            // dTerm = -1 * 40 = -40, clamped to 0
            const out1 = dPid.compute(42);
            // dInput = (42 - 40) / 1 = 2, dTerm = -2
            // pTerm = 0, integral = 0, output = -2 → clamped to 0
            expect(out1).toBe(0); // clamped
        });

        it('should clamp output to [0, 100]', () => {
            pid.setEnabled(true);
            pid.setTarget(200);
            const output = pid.compute(0); // huge error
            expect(output).toBe(100);
        });

        it('should clamp negative output to 0', () => {
            pid.setEnabled(true);
            pid.setTarget(0);
            const output = pid.compute(100); // negative error
            expect(output).toBe(0);
        });
    });

    // ─── Anti-windup ──────────────────────────────────────────

    describe('anti-windup', () => {
        it('should limit integral to outputLimitMax', () => {
            pid.setEnabled(true);
            pid.setTarget(200);
            // Large error → integral grows quickly
            for (let i = 0; i < 1000; i++) pid.compute(0);
            expect(pid.integral).toBeLessThanOrEqual(100);
        });

        it('should limit integral to outputLimitMin', () => {
            pid.setEnabled(true);
            pid.setTarget(-200);
            for (let i = 0; i < 1000; i++) pid.compute(100);
            expect(pid.integral).toBeGreaterThanOrEqual(0);
        });
    });

    // ─── Edge Cases ───────────────────────────────────────────

    describe('edge cases', () => {
        it('should handle zero tunings', () => {
            const zeroPid = new PIDController(0, 0, 0, 1.0);
            zeroPid.setEnabled(true);
            zeroPid.setTarget(50);
            expect(zeroPid.compute(20)).toBe(0);
        });

        it('should handle very small dt', () => {
            const fastPid = new PIDController(1.0, 0.0, 0.0, 0.01);
            fastPid.setEnabled(true);
            fastPid.setTarget(50);
            const out = fastPid.compute(45);
            expect(out).toBeGreaterThan(0); // P-term = 1.0 * 5 = 5
            expect(out).toBe(5);
        });

        it('should handle negative targets', () => {
            pid.setEnabled(true);
            pid.setTarget(-10);
            const out = pid.compute(0); // error = -10, clamped to 0
            expect(out).toBe(0);
        });
    });
});
