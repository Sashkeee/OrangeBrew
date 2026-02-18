import { useState, useEffect, useCallback } from 'react';
import { controlApi } from '../api/client.js';
import wsClient from '../api/wsClient.js';
import { debugPost } from '../utils/constants';

/**
 * Hook for controlling hardware (heater, cooler, pump, dephlegmator).
 * Receives real-time control state updates via WebSocket.
 *
 * @returns {{ control, setHeater, setCooler, setPump, setDephleg, emergencyStop, loading }}
 */
export function useControl() {
    const [control, setControl] = useState({
        heater: 0,
        cooler: 0,
        pump: false,
        dephleg: 0,
        dephlegMode: 'manual',
    });
    const [loading, setLoading] = useState(false);

    // Listen for control state updates via WebSocket
    useEffect(() => {
        const unsub = wsClient.on('control', (msg) => {
            if (msg.data) setControl(prev => ({ ...prev, ...msg.data }));
        });

        // Also get initial state from init message
        const unsubInit = wsClient.on('init', (msg) => {
            if (msg.control) setControl(prev => ({ ...prev, ...msg.control }));
        });

        // Load initial state via REST
        controlApi.getState().then(data => setControl(prev => ({ ...prev, ...data }))).catch(() => { });

        return () => { unsub(); unsubInit(); };
    }, []);

    const setHeater = useCallback(async (value) => {
        try {
            setLoading(true);
            await controlApi.setHeater(value);
            setControl(prev => ({ ...prev, heater: value }));
        } catch (e) {
            console.error('[Control] setHeater failed:', e);
        } finally {
            setLoading(false);
        }
    }, []);

    const setCooler = useCallback(async (value) => {
        try {
            setLoading(true);
            await controlApi.setCooler(value);
            setControl(prev => ({ ...prev, cooler: value }));
        } catch (e) {
            console.error('[Control] setCooler failed:', e);
        } finally {
            setLoading(false);
        }
    }, []);

    const setPump = useCallback(async (value) => {
        try {
            setLoading(true);
            await controlApi.setPump(value);
            setControl(prev => ({ ...prev, pump: value }));
        } catch (e) {
            console.error('[Control] setPump failed:', e);
        } finally {
            setLoading(false);
        }
    }, []);

    const setDephleg = useCallback(async (value, mode) => {
        try {
            setLoading(true);
            await controlApi.setDephleg(value, mode);
            setControl(prev => ({ ...prev, dephleg: value, dephlegMode: mode || prev.dephlegMode }));
        } catch (e) {
            console.error('[Control] setDephleg failed:', e);
        } finally {
            setLoading(false);
        }
    }, []);

    // New PID methods
    const setPidMode = useCallback(async (enabled) => {
        try {
            await debugPost('/pid/enable', { enabled });
        } catch (e) {
            console.error('[Control] setPidMode failed:', e);
        }
    }, []);

    const setPidTarget = useCallback(async (target) => {
        try {
            await debugPost('/pid/target', { target });
        } catch (e) {
            console.error('[Control] setPidTarget failed:', e);
        }
    }, []);

    const emergencyStop = useCallback(async () => {
        try {
            await controlApi.emergencyStop();
            setControl({ heater: 0, cooler: 0, pump: false, dephleg: 0, dephlegMode: 'manual' });
        } catch (e) {
            console.error('[Control] emergencyStop failed:', e);
        }
    }, []);

    return {
        control,
        setHeater,
        setCooler,
        setPump,
        setDephleg,
        setPidMode,
        setPidTarget,
        emergencyStop,
        loading
    };
}
