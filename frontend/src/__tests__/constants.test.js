import { describe, it, expect } from 'vitest';
import { API_BASE, WS_URL, debugPost } from '../utils/constants';

describe('constants', () => {
    it('API_BASE should be a valid HTTP URL ending with /api', () => {
        expect(API_BASE).toMatch(/^https?:\/\/.+\/api$/);
    });

    it('WS_URL should be a valid WebSocket URL ending with /ws', () => {
        expect(WS_URL).toMatch(/^wss?:\/\/.+\/ws$/);
    });

    it('API_BASE and WS_URL should point to the same host:port', () => {
        const apiHost = API_BASE.replace(/^https?:\/\//, '').replace(/\/api$/, '');
        const wsHost = WS_URL.replace(/^wss?:\/\//, '').replace(/\/ws$/, '');
        expect(apiHost).toBe(wsHost);
    });

    it('debugPost should be a function', () => {
        expect(typeof debugPost).toBe('function');
    });
});
