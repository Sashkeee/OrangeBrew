import { describe, it, expect } from 'vitest';
import { formatTime, formatElapsed } from '../utils/formatTime';

describe('formatTime()', () => {
    it('should format 0 seconds as "00:00"', () => {
        expect(formatTime(0)).toBe('00:00');
    });

    it('should format seconds under a minute', () => {
        expect(formatTime(30)).toBe('00:30');
        expect(formatTime(5)).toBe('00:05');
        expect(formatTime(59)).toBe('00:59');
    });

    it('should format minutes and seconds', () => {
        expect(formatTime(60)).toBe('01:00');
        expect(formatTime(90)).toBe('01:30');
        expect(formatTime(3599)).toBe('59:59');
    });

    it('should format hours:minutes:seconds when >= 1 hour', () => {
        expect(formatTime(3600)).toBe('1:00:00');
        expect(formatTime(3661)).toBe('1:01:01');
        expect(formatTime(7200)).toBe('2:00:00');
    });

    it('should pad minutes and seconds with leading zeros', () => {
        expect(formatTime(3605)).toBe('1:00:05');
        expect(formatTime(3660)).toBe('1:01:00');
    });

    it('should handle large values', () => {
        expect(formatTime(86400)).toBe('24:00:00'); // 24 hours
    });
});

describe('formatElapsed()', () => {
    it('should format 0 seconds as "00:00"', () => {
        expect(formatElapsed(0)).toBe('00:00');
    });

    it('should format seconds < 1 hour as mm:ss', () => {
        expect(formatElapsed(90)).toBe('01:30');
        expect(formatElapsed(300)).toBe('05:00');
    });

    it('should format hours as h:mm:ss', () => {
        expect(formatElapsed(3600)).toBe('1:00:00');
        expect(formatElapsed(3661)).toBe('1:01:01');
    });

    it('should format days when >= 24 hours', () => {
        expect(formatElapsed(86400)).toBe('1д 0ч 0м');
        expect(formatElapsed(90000)).toBe('1д 1ч 0м');
        expect(formatElapsed(172800)).toBe('2д 0ч 0м');
    });

    it('should include hours and minutes with days', () => {
        expect(formatElapsed(93600)).toBe('1д 2ч 0м');
        expect(formatElapsed(93660)).toBe('1д 2ч 1м');
    });
});
