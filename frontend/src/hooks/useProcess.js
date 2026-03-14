import { useState, useEffect, useCallback } from 'react';
import wsClient from '../api/wsClient.js';
import { processApi } from '../api/client.js';

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
    sessionId: null,
};

export const useProcess = () => {
    const [processState, setProcessState] = useState(DEFAULT_STATE);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);

    const fetchStatus = useCallback(async () => {
        try {
            const data = await processApi.getStatus();
            setProcessState(data);
        } catch (e) {
            console.error('[Process] Failed to fetch status:', e.message);
        }
    }, []);

    useEffect(() => {
        // Начальная загрузка состояния
        fetchStatus();

        if (!wsClient.connected) wsClient.connect();

        // ─── Polling: включается только когда WS не работает ───
        let poller = null;

        const startPolling = () => {
            if (!poller) poller = setInterval(fetchStatus, 2000);
        };

        const stopPolling = () => {
            if (poller) { clearInterval(poller); poller = null; }
        };

        // WS-обновления — основной канал
        const unsubProcess = wsClient.on('process', (msg) => {
            setProcessState(msg.data || msg);
        });

        // Управление polling по состоянию WS-соединения
        const unsubConnection = wsClient.on('connection', ({ connected }) => {
            if (connected) stopPolling();
            else startPolling();
        });

        // Если WS уже не подключён в момент mount — включаем polling сразу
        if (!wsClient.connected) startPolling();

        return () => {
            unsubProcess();
            unsubConnection();
            stopPolling();
        };
    }, [fetchStatus]);

    const sendCommand = useCallback(async (action, payload = {}) => {
        setIsLoading(true);
        setError(null);
        try {
            const data = await processApi[action](payload);
            if (data.state) setProcessState(data.state);
            return data;
        } catch (e) {
            setError(e.message);
            console.error(`[Process] Command '${action}' failed:`, e.message);
            throw e;
        } finally {
            setIsLoading(false);
        }
    }, []);

    const start  = useCallback((recipe, sessionId, mode, deviceId, sensorAddress) =>
        sendCommand('start', { recipe, sessionId, mode, deviceId, sensorAddress }), [sendCommand]);
    const stop   = useCallback(() => sendCommand('stop'),   [sendCommand]);
    const pause  = useCallback(() => sendCommand('pause'),  [sendCommand]);
    const resume = useCallback(() => sendCommand('resume'), [sendCommand]);
    const skip   = useCallback(() => sendCommand('skip'),   [sendCommand]);

    return {
        processState,
        status: processState.status,
        currentStep: processState.steps?.[processState.currentStepIndex] ?? null,
        activeStepIndex: processState.currentStepIndex,
        stepPhase: processState.stepPhase,
        remainingTime: processState.remainingTime,
        elapsedTime: processState.elapsedTime,

        start, stop, pause, resume, skip,
        isLoading,
        error,
    };
};
