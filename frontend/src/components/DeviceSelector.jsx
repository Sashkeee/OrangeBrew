import React, { useState, useEffect, useCallback } from 'react';
import { ChevronDown, Wifi, WifiOff } from 'lucide-react';
import { deviceApi } from '../api/client';
import wsClient from '../api/wsClient';

export default function DeviceSelector({ value, onChange, label = "Контроллер" }) {
    const [devices, setDevices] = useState([]);
    const [loading, setLoading] = useState(true);

    const fetchDevices = useCallback((autoSelect = false) => {
        deviceApi.getAll().then(data => {
            const onlineOnes = data.filter(d => d.status === 'online');
            setDevices(onlineOnes);
            if (autoSelect && onlineOnes.length > 0 && !value) {
                onChange(onlineOnes[0].id);
            }
        }).catch(err => {
            console.error('[DeviceSelector] Failed to fetch devices', err);
            setDevices([]);
        }).finally(() => setLoading(false));
    }, [value, onChange]);

    useEffect(() => {
        fetchDevices(true);

        // WS: мгновенное обновление при изменении статуса устройства
        const unsub = wsClient.on('device_status', () => fetchDevices(false));

        // Fallback-поллинг каждые 15с для abrupt disconnect (TCP timeout ~30-60с)
        const interval = setInterval(() => fetchDevices(false), 15000);

        return () => {
            unsub();
            clearInterval(interval);
        };
    }, []);

    const hasDevices = devices.length > 0;

    return (
        <div style={{ marginBottom: '1rem' }}>
            <label style={{
                display: 'block',
                fontSize: '0.75rem',
                color: 'var(--text-secondary)',
                marginBottom: '0.4rem',
                textTransform: 'uppercase',
                letterSpacing: '0.05em'
            }}>
                {label}
            </label>
            <div style={{ position: 'relative' }}>
                <select
                    value={value || ''}
                    onChange={(e) => onChange(e.target.value)}
                    style={{
                        width: '100%',
                        padding: '0.8rem 1rem 0.8rem 2.5rem',
                        background: 'rgba(255,255,255,0.05)',
                        border: `1px solid ${hasDevices && value ? 'var(--accent-green)' : '#444'}`,
                        borderRadius: '8px',
                        color: '#fff',
                        appearance: 'none',
                        cursor: 'pointer',
                        fontSize: '0.9rem',
                        outline: 'none',
                        transition: 'border-color 0.2s'
                    }}
                >
                    {!hasDevices && (
                        <option value="">Нет устройств онлайн</option>
                    )}
                    {devices.map(d => (
                        <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                </select>
                {hasDevices && value ? (
                    <Wifi
                        size={16}
                        style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--accent-green)' }}
                    />
                ) : (
                    <WifiOff
                        size={16}
                        style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: '#666' }}
                    />
                )}
                <ChevronDown
                    size={16}
                    style={{ position: 'absolute', right: '1rem', top: '50%', transform: 'translateY(-50%)', color: '#666', pointerEvents: 'none' }}
                />
            </div>
            {hasDevices && value && (
                <div style={{ fontSize: '0.7rem', color: 'var(--accent-green)', marginTop: '0.3rem' }}>
                    ✓ WiFi устройство подключено
                </div>
            )}
        </div>
    );
}
