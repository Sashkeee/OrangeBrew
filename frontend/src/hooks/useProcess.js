import { useState, useEffect, useCallback } from 'react';
import wsClient from '../api/wsClient.js';
import { API_BASE } from '../utils/constants.js';

const API_PROCESS_URL = `${API_BASE}/process`;

// Initial default state
const DEFAULT_STATE = {
    status: 'IDLE',
    mode: null,
    recipeName: '',
    steps: [],
    currentStepIndex: -1,
    stepPhase: 'heating',
    remainingTime: 0,
    startTime: null,
    elapsedTime: 0,
    recipeId: null,
    sessionId: null
};

export const useProcess = () => {
    const [processState, setProcessState] = useState(DEFAULT_STATE);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);

    // Initial fetch of status
    useEffect(() => {
        fetchStatus();

        // Listen for WebSocket updates
        if (!wsClient.connected) {
            wsClient.connect();
        }

        const unsub = wsClient.on('process', (msg) => {
            const data = msg.data || msg;
            setProcessState(data);
        });

        // Fallback poll every 2s
        const poller = setInterval(fetchStatus, 2000);

        return () => {
            unsub();
            clearInterval(poller);
        };
    }, []);

    const fetchStatus = async () => {
        try {
            const token = localStorage.getItem('orangebrew_token');
            const headers = {};
            if (token) headers['Authorization'] = `Bearer ${token}`;

            const res = await fetch(`${API_PROCESS_URL}/status`, { headers });
            if (res.ok) {
                const data = await res.json();
                setProcessState(data);
            }
        } catch (e) {
            console.error('Failed to fetch process status', e);
        }
    };

    const sendCommand = async (action, payload = {}) => {
        setIsLoading(true);
        setError(null);
        try {
            const token = localStorage.getItem('orangebrew_token');
            const headers = { 'Content-Type': 'application/json' };
            if (token) headers['Authorization'] = `Bearer ${token}`;

            const res = await fetch(`${API_PROCESS_URL}/${action}`, {
                method: 'POST',
                headers,
                body: JSON.stringify(payload)
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Command failed');

            if (data.state) setProcessState(data.state);
            return data;
        } catch (e) {
            setError(e.message);
            console.error(`[Process] Command '${action}' failed:`, e.message);
            throw e; // Re-throw so caller can handle
        } finally {
            setIsLoading(false);
        }
    };

    const start = useCallback((recipe, sessionId, mode, deviceId) => sendCommand('start', { recipe, sessionId, mode, deviceId }), []);
    const stop = useCallback(() => sendCommand('stop'), []);
    const pause = useCallback(() => sendCommand('pause'), []);
    const resume = useCallback(() => sendCommand('resume'), []);
    const skip = useCallback(() => sendCommand('skip'), []);

    return {
        processState,
        status: processState.status,
        currentStep: processState.steps && processState.steps[processState.currentStepIndex] ? processState.steps[processState.currentStepIndex] : null,
        activeStepIndex: processState.currentStepIndex,
        stepPhase: processState.stepPhase,
        remainingTime: processState.remainingTime,
        elapsedTime: processState.elapsedTime,

        start,
        stop,
        pause,
        resume,
        skip,

        isLoading,
        error
    };
};
