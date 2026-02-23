import React, { useState, useEffect } from 'react';
import { Cpu, ChevronDown } from 'lucide-react';
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

            // If no value is set, default to first online or serial
            if (!value && options.length > 0) {
                onChange(options[0].id);
            }
        }).catch(err => {
            console.error('[DeviceSelector] Failed to fetch devices', err);
            setDevices([{ id: 'local_serial', name: 'Локальный порт (USB)' }]);
        }).finally(() => setLoading(false));
    }, []);

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
                        border: '1px solid #444',
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
                <Cpu
                    size={16}
                    style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--primary-color)' }}
                />
                <ChevronDown
                    size={16}
                    style={{ position: 'absolute', right: '1rem', top: '50%', transform: 'translateY(-50%)', color: '#666', pointerEvents: 'none' }}
                />
            </div>
        </div>
    );
}
