import { useState, useEffect, useRef } from 'react';
import wsClient from '../api/wsClient.js';
import { sensorsApi } from '../api/client.js';

/**
 * Hook for real-time sensor data via WebSocket.
 * Falls back to REST polling if WebSocket is unavailable.
 *
 * @returns {{ sensors, connected, error }}
 */
export function useSensors() {
    const [sensors, setSensors] = useState({
        boiler: { value: 0, timestamp: 0 },
        column: { value: 0, timestamp: 0 },
        dephleg: { value: 0, timestamp: 0 },
        output: { value: 0, timestamp: 0 },
        ambient: { value: 0, timestamp: 0 },
    });
    const [connected, setConnected] = useState(false);
    const [error, setError] = useState(null);
    const pollingRef = useRef(null);

    useEffect(() => {
        // Connect WebSocket
        wsClient.connect();

        // Listen for sensor updates
        const unsubSensors = wsClient.on('sensors', (msg) => {
            // Support both {type: 'sensors', data: {...}} and raw {...}
            const data = msg.data || msg;

            setSensors(prev => {
                const updated = { ...prev };
                const now = Date.now();

                for (const [key, val] of Object.entries(data)) {
                    // Skip if key is not a known sensor (e.g. 'type' or 'timestamp' from root)
                    if (key === 'type' || key === 'timestamp') continue;

                    if (typeof val === 'object' && val !== null && 'value' in val) {
                        updated[key] = val;
                    } else {
                        updated[key] = { value: Number(val), timestamp: now };
                    }
                }
                return updated;
            });
            setError(null);
        });

        // Listen for initial state
        const unsubInit = wsClient.on('init', (msg) => {
            if (msg.sensors) {
                setSensors(prev => ({ ...prev, ...msg.sensors }));
            }
        });

        // Connection status
        const unsubConn = wsClient.on('connection', (msg) => {
            setConnected(msg.connected);
            if (!msg.connected) {
                // Start REST polling as fallback
                startPolling();
            } else {
                stopPolling();
            }
        });

        return () => {
            unsubSensors();
            unsubInit();
            unsubConn();
            stopPolling();
        };
    }, []);

    const startPolling = () => {
        if (pollingRef.current) return;
        pollingRef.current = setInterval(async () => {
            try {
                const data = await sensorsApi.getCurrent();
                setSensors(prev => ({ ...prev, ...data }));
            } catch (e) {
                setError(e.message);
            }
        }, 2000);
    };

    const stopPolling = () => {
        if (pollingRef.current) {
            clearInterval(pollingRef.current);
            pollingRef.current = null;
        }
    };

    return { sensors, connected, error };
}
