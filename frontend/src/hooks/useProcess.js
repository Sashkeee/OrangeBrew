import { useState, useEffect, useCallback } from 'react';
import wsClient from '../api/wsClient.js';

const API_PROCESS_URL = `${import.meta.env.VITE_API_URL || 'http://localhost:3001/api'}/process`;

// Initial default state
const DEFAULT_STATE = {
    status: 'IDLE',
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

        // Listen for WebSocket updates using the shared client
        // We need to ensure the client is connected (usually handled in App or useSensors)
        if (!wsClient.connected) {
            wsClient.connect();
        }

        const unsub = wsClient.on('process', (msg) => {
            const data = msg.data || msg;
            setProcessState(data);
        });

        // Also fallback poll every 2s in case WS drops
        const poller = setInterval(fetchStatus, 2000);

        return () => {
            unsub();
            clearInterval(poller);
        };
    }, []);

    const fetchStatus = async () => {
        try {
            const res = await fetch(`${API_PROCESS_URL}/status`);
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
            const res = await fetch(`${API_PROCESS_URL}/${action}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Command failed');

            // Optimistic update or wait for WS? 
            // Better to use the returned state if available
            if (data.state) setProcessState(data.state);
            return data;
        } catch (e) {
            setError(e.message);
            throw e;
        } finally {
            setIsLoading(false);
        }
    };

    const start = useCallback((recipe, sessionId, mode) => sendCommand('start', { recipe, sessionId, mode }), []);
    const stop = useCallback(() => sendCommand('stop'), []);
    const pause = useCallback(() => sendCommand('pause'), []);
    const resume = useCallback(() => sendCommand('resume'), []);
    const skip = useCallback(() => sendCommand('skip'), []);

    return {
        processState,
        status: processState.status, // shortcut
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
