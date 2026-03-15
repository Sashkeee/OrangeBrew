import { useState, useEffect, useRef, useMemo } from 'react';
import wsClient from '../api/wsClient.js';
import { sensorsApi } from '../api/client.js';

/** Default palette for sensors without a saved color */
export const SENSOR_DEFAULT_COLORS = [
    '#FF6B35', '#03a9f4', '#4caf50', '#ff9800', '#e91e63',
    '#9c27b0', '#00bcd4', '#8bc34a', '#ff5722', '#607d8b',
];

/**
 * Hook for real-time sensor data via WebSocket.
 * Falls back to REST polling if WebSocket is unavailable.
 */
export function useSensors() {
    const [sensors, setSensors] = useState({
        boiler: { value: 0, timestamp: 0 },
        column: { value: 0, timestamp: 0 },
        dephleg: { value: 0, timestamp: 0 },
        output: { value: 0, timestamp: 0 },
        ambient: { value: 0, timestamp: 0 },
    });

    const [rawSensors, setRawSensors] = useState([]);
    const [sensorConfig, setSensorConfig] = useState([]);
    const [connected, setConnected] = useState(wsClient.connected);
    const [error, setError] = useState(null);
    const pollingRef = useRef(null);

    const reloadConfig = () => {
        sensorsApi.getConfig()
            .then(setSensorConfig)
            .catch(() => {});
    };

    useEffect(() => {
        reloadConfig();
    }, []);

    const namedSensors = useMemo(() => {
        return rawSensors.map((s, i) => {
            const cfg = sensorConfig.find(c => c.address === s.address);
            return {
                address: s.address,
                temp: s.temp,
                name: cfg?.name || ('Датчик ' + (i + 1)),
                color: cfg?.color || SENSOR_DEFAULT_COLORS[i % SENSOR_DEFAULT_COLORS.length],
                offset: cfg?.offset ?? 0,
                enabled: cfg ? cfg.enabled !== 0 : true,
            };
        });
    }, [rawSensors, sensorConfig]);

    useEffect(() => {
        wsClient.connect();

        const unsubSensors = wsClient.on('sensors', (msg) => {
            const data = msg.data || msg;

            if (data.sensors && Array.isArray(data.sensors)) {
                setRawSensors(data.sensors);
            }

            setSensors(prev => {
                const updated = { ...prev };
                const now = Date.now();
                const skipKeys = ['type', 'timestamp', 'deviceId', 'sensors'];

                for (const [key, val] of Object.entries(data)) {
                    if (skipKeys.includes(key)) continue;
                    if (typeof val === 'object' && val !== null && 'value' in val) {
                        updated[key] = val;
                    } else if (typeof val === 'number') {
                        updated[key] = { value: val, timestamp: now };
                    }
                }
                return updated;
            });
            setError(null);
        });

        const unsubInit = wsClient.on('init', (msg) => {
            if (msg.sensors) {
                setSensors(prev => ({ ...prev, ...msg.sensors }));
            }
        });

        const unsubConn = wsClient.on('connection', (msg) => {
            setConnected(msg.connected);
            if (!msg.connected) {
                startPolling();
            } else {
                stopPolling();
            }
        });

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

    return { sensors, rawSensors, namedSensors, sensorConfig, reloadConfig, connected, error };
}
