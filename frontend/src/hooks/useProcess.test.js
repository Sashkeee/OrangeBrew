import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useProcess } from './useProcess';
import wsClient from '../api/wsClient.js';

// Mock wsClient
vi.mock('../api/wsClient.js', () => ({
    default: {
        connected: false,
        connect: vi.fn(),
        on: vi.fn(() => vi.fn()), // Return unsub function
        send: vi.fn()
    }
}));

// Mock fetch
global.fetch = vi.fn();

describe('useProcess Hook', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // Default mock that handles basic status check
        fetch.mockImplementation((url, headers) => {
            if (url.includes('/status')) {
                return Promise.resolve({
                    ok: true,
                    json: async () => ({ status: 'IDLE', steps: [] })
                });
            }
            // For commands, default to success if not overridden by test
            // But tests should override if they test specific commmands
            return Promise.resolve({
                ok: true,
                json: async () => ({ ok: true, state: { status: 'HEATING', steps: [] } })
            });
        });
    });

    it('should initialize with default state', async () => {
        const { result } = renderHook(() => useProcess());

        expect(result.current.status).toBe('IDLE');
        expect(result.current.processState.steps).toEqual([]);

        // Should try to fetch initial status
        await waitFor(() => expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/process/status')));
    });

    it('should connect to WebSocket if not connected', async () => {
        wsClient.connected = false;
        renderHook(() => useProcess());
        expect(wsClient.connect).toHaveBeenCalled();
        await waitFor(() => expect(fetch).toHaveBeenCalled());
    });

    it('should update state on WebSocket message', async () => {
        let wsCallback;
        wsClient.on.mockImplementation((type, cb) => {
            if (type === 'process') wsCallback = cb;
            return vi.fn();
        });

        const { result } = renderHook(() => useProcess());
        await waitFor(() => expect(fetch).toHaveBeenCalled());

        const newState = { status: 'HEATING', currentStepIndex: 0, steps: [{ temp: 65 }] };

        act(() => {
            if (wsCallback) wsCallback({ type: 'process', data: newState });
        });

        expect(result.current.processState).toEqual(newState);
        expect(result.current.status).toBe('HEATING');
    });

    it('should send start command', async () => {
        // Specific mock for start command
        fetch.mockImplementation((url, options) => {
            if (url.includes('/status')) {
                return Promise.resolve({
                    ok: true,
                    json: async () => ({ status: 'IDLE', steps: [] })
                });
            }
            if (url.includes('/start')) {
                return Promise.resolve({
                    ok: true,
                    json: async () => ({ ok: true, state: { status: 'HEATING', steps: [] } })
                });
            }
            return Promise.resolve({ ok: false });
        });

        const { result } = renderHook(() => useProcess());

        // Wait for initial fetch to settle
        await waitFor(() => expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/process/status')));

        // start() принимает 4 аргумента: recipe, sessionId, mode, deviceId
        await act(async () => {
            await result.current.start({ name: 'Test Recipe' }, 'session-123', 'mash', 'local_serial');
        });

        // Проверяем, что fetch был вызван с правильным URL и телом
        expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/process/start'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                recipe: { name: 'Test Recipe' },
                sessionId: 'session-123',
                mode: 'mash',
                deviceId: 'local_serial'
            })
        });

        expect(result.current.status).toBe('HEATING');
    });


    it('should handle errors', async () => {
        fetch.mockImplementation((url) => {
            if (url.includes('/status')) {
                return Promise.resolve({ ok: true, json: async () => ({ status: 'IDLE' }) });
            }
            // Fail any command
            return Promise.resolve({
                ok: false,
                json: async () => ({ error: 'Start failed' })
            });
        });

        const { result } = renderHook(() => useProcess());

        // Wait for initial fetch
        await waitFor(() => expect(fetch).toHaveBeenCalled());

        await act(async () => {
            try {
                await result.current.start({}, 'sess');
            } catch (e) {
                expect(e.message).toBe('Start failed');
            }
        });

        expect(result.current.error).toBe('Start failed');
    });
});
