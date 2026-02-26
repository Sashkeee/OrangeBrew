import { useState, useEffect, useRef } from 'react';
import wsClient from '../api/wsClient.js';
import { sensorsApi } from '../api/client.js';

/**
 * Hook for real-time sensor data via WebSocket.
 * Falls back to REST polling if WebSocket is unavailable.
 *
 * @returns {{ sensors, rawSensors, connected, error }}
 */
export function useSensors() {
    const [sensors, setSensors] = useState({
        boiler: { value: 0, timestamp: 0 },
        column: { value: 0, timestamp: 0 },
        dephleg: { value: 0, timestamp: 0 },
        output: { value: 0, timestamp: 0 },
        ambient: { value: 0, timestamp: 0 },
    });
    const [rawSensors, setRawSensors] = useState([]); // Raw sensor array [{address, temp}, ...]
    // ВАЖНО: инициализируем из текущего состояния wsClient,
    // а не из false — иначе поздно смонтированные компоненты
    // пропустят событие 'connection' и навсегда останутся "disconnected"
    const [connected, setConnected] = useState(wsClient.connected);
    const [error, setError] = useState(null);
    const pollingRef = useRef(null);

    useEffect(() => {
        // Connect WebSocket
        wsClient.connect();

        // Listen for sensor updates
        const unsubSensors = wsClient.on('sensors', (msg) => {
            // Support both {type: 'sensors', data: {...}} and raw {...}
            const data = msg.data || msg;

            // Store raw sensor array if present
            if (data.sensors && Array.isArray(data.sensors)) {
                setRawSensors(data.sensors);
            }

            setSensors(prev => {
                const updated = { ...prev };
                const now = Date.now();

                // Ключи, которые НЕ являются показаниями датчиков
                const skipKeys = ['type', 'timestamp', 'deviceId', 'sensors'];

                for (const [key, val] of Object.entries(data)) {
                    if (skipKeys.includes(key)) continue;

                    if (typeof val === 'object' && val !== null && 'value' in val) {
                        // Формат: { value: 22.75, timestamp: ... }
                        updated[key] = val;
                    } else if (typeof val === 'number') {
                        // Формат: boiler: 22.75 (число напрямую из mapSensors)
                        updated[key] = { value: val, timestamp: now };
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
                startPolling();
            } else {
                stopPolling();
            }
        });

        // Синхронизируем состояние
        if (wsClient.connected) {
            setConnected(true);
            stopPolling();
        } else {
            startPolling();
        }

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

    return { sensors, rawSensors, connected, error };
}
