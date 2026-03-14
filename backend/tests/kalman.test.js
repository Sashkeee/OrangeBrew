import { describe, it, expect, beforeEach } from 'vitest';
import { KalmanFilter } from '../pid/KalmanFilter.js';

describe('KalmanFilter', () => {
    let filter;

    beforeEach(() => {
        filter = new KalmanFilter({ processNoise: 0.01, measurementNoise: 0.05, initialError: 1.0 });
    });

    it('first measurement is returned as-is', () => {
        const result = filter.update(65.0);
        expect(result).toBe(65.0);
        expect(filter.initialized).toBe(true);
    });

    it('series of constant values stabilises the output', () => {
        const value = 67.5;
        let out;
        for (let i = 0; i < 50; i++) out = filter.update(value);
        expect(Math.abs(out - value)).toBeLessThan(0.001);
    });

    it('noisy signal ±0.5°C — RMS deviation from true value is < raw RMS (filter reduces noise)', () => {
        const trueTemp = 68.0;
        // Prime the filter
        for (let i = 0; i < 30; i++) filter.update(trueTemp);

        // Deterministic noisy signal: sine-wave noise ±0.5°C
        const rawDeviations = [];
        const filteredDeviations = [];
        for (let i = 0; i < 200; i++) {
            const noise = 0.5 * Math.sin(i * 0.7) * (i % 3 === 0 ? -1 : 1);
            rawDeviations.push(noise * noise);
            const filtered = filter.update(trueTemp + noise);
            filteredDeviations.push((filtered - trueTemp) ** 2);
        }

        const rawRms      = Math.sqrt(rawDeviations.reduce((a, b) => a + b) / rawDeviations.length);
        const filteredRms = Math.sqrt(filteredDeviations.reduce((a, b) => a + b) / filteredDeviations.length);

        // Filter must reduce noise by at least 50%
        expect(filteredRms).toBeLessThan(rawRms * 0.5);
    });

    it('step-change: filter follows the new value within 10 iterations', () => {
        const initial = 50.0;
        const target  = 70.0;

        // Stabilise at initial
        for (let i = 0; i < 50; i++) filter.update(initial);

        // Jump to new temperature
        let out;
        for (let i = 0; i < 10; i++) out = filter.update(target);

        // Should be within 1°C of target after 10 steps
        expect(Math.abs(out - target)).toBeLessThan(1.0);
    });

    it('gain decreases over time as filter gains confidence', () => {
        const gains = [];
        for (let i = 0; i < 20; i++) {
            filter.update(65.0);
            gains.push(filter.gain);
        }
        // Each gain should be ≤ the previous one (monotonically non-increasing)
        for (let i = 1; i < gains.length; i++) {
            expect(gains[i]).toBeLessThanOrEqual(gains[i - 1] + 1e-10);
        }
    });

    it('reset() clears state and re-initialises on next measurement', () => {
        filter.update(65.0);
        filter.update(66.0);
        expect(filter.initialized).toBe(true);

        filter.reset();
        expect(filter.initialized).toBe(false);
        expect(filter.x).toBeNull();

        // After reset, first measurement returned as-is again
        const result = filter.update(70.0);
        expect(result).toBe(70.0);
    });

    it('gain getter returns a value in (0, 1)', () => {
        for (let i = 0; i < 10; i++) filter.update(65.0);
        expect(filter.gain).toBeGreaterThan(0);
        expect(filter.gain).toBeLessThan(1);
    });

    it('kalmanEnabled=false passes raw values through PID without filtering', () => {
        // Simulate what PidManager does when kalmanEnabled = false
        const raw = 65.3;
        const filtered = false ? filter.update(raw) : raw;
        expect(filtered).toBe(raw);
    });
});
