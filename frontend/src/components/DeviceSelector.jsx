import React, { useState, useEffect } from 'react';
import { Cpu, ChevronDown, Wifi } from 'lucide-react';
import { deviceApi } from '../api/client';

export default function DeviceSelector({ value, onChange, label = "Контроллер" }) {
    const [devices, setDevices] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        deviceApi.getAll().then(data => {
            const onlineOnes = data.filter(d => d.status === 'online');
            // Always include local_serial as an option
            const options = [
                ...onlineOnes,
                { id: 'local_serial', name: 'Локальный порт (USB)' }
            ];
            setDevices(options);

            // Auto-select: if there are online WiFi devices and no value yet (or default),
            // select the first online one
            if (onlineOnes.length > 0 && (!value || value === 'local_serial')) {
                onChange(onlineOnes[0].id);
            } else if (!value) {
                onChange('local_serial');
            }
        }).catch(err => {
            console.error('[DeviceSelector] Failed to fetch devices', err);
            setDevices([{ id: 'local_serial', name: 'Локальный порт (USB)' }]);
            if (!value) onChange('local_serial');
        }).finally(() => setLoading(false));
    }, []);

    const selectedDevice = devices.find(d => d.id === value);
    const isWifi = value && value !== 'local_serial';

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
                    value={value || 'local_serial'}
                    onChange={(e) => onChange(e.target.value)}
                    style={{
                        width: '100%',
                        padding: '0.8rem 1rem 0.8rem 2.5rem',
                        background: 'rgba(255,255,255,0.05)',
                        border: `1px solid ${isWifi ? 'var(--accent-green)' : '#444'}`,
                        borderRadius: '8px',
                        color: '#fff',
                        appearance: 'none',
                        cursor: 'pointer',
                        fontSize: '0.9rem',
                        outline: 'none',
                        transition: 'border-color 0.2s'
                    }}
                >
                    {devices.map(d => (
                        <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                </select>
                {isWifi ? (
                    <Wifi
                        size={16}
                        style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--accent-green)' }}
                    />
                ) : (
                    <Cpu
                        size={16}
                        style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--primary-color)' }}
                    />
                )}
                <ChevronDown
                    size={16}
                    style={{ position: 'absolute', right: '1rem', top: '50%', transform: 'translateY(-50%)', color: '#666', pointerEvents: 'none' }}
                />
            </div>
            {isWifi && (
                <div style={{ fontSize: '0.7rem', color: 'var(--accent-green)', marginTop: '0.3rem' }}>
                    ✓ WiFi устройство подключено
                </div>
            )}
        </div>
    );
}
