import React from 'react';
import { Thermometer, ChevronDown } from 'lucide-react';

/**
 * Dropdown to select which temperature sensor to use for the process.
 * Shows available sensor addresses with their current temperatures.
 * 
 * @param {{ rawSensors: Array<{address: string, temp: number}>, value: string|null, onChange: (address: string) => void }} props
 */
export default function SensorSelector({ rawSensors = [], value, onChange, label = "Датчик температуры" }) {
    // Auto-select first sensor if none selected
    React.useEffect(() => {
        if (!value && rawSensors.length > 0) {
            onChange(rawSensors[0].address);
        }
    }, [rawSensors, value]);

    const selectedSensor = rawSensors.find(s => s.address === value);

    if (rawSensors.length === 0) {
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
                <div style={{
                    padding: '0.8rem 1rem',
                    background: 'rgba(255,255,255,0.03)',
                    border: '1px solid #333',
                    borderRadius: '8px',
                    color: '#666',
                    fontSize: '0.85rem'
                }}>
                    Нет подключённых датчиков
                </div>
            </div>
        );
    }

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
                        border: '1px solid var(--primary-color)',
                        borderRadius: '8px',
                        color: '#fff',
                        appearance: 'none',
                        cursor: 'pointer',
                        fontSize: '0.9rem',
                        outline: 'none',
                        transition: 'border-color 0.2s'
                    }}
                >
                    {rawSensors.map((s, i) => (
                        <option key={s.address} value={s.address}>
                            Датчик {i + 1}: {s.temp?.toFixed(1) ?? '?'}°C ({s.address.slice(-5)})
                        </option>
                    ))}
                </select>
                <Thermometer
                    size={16}
                    style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--primary-color)' }}
                />
                <ChevronDown
                    size={16}
                    style={{ position: 'absolute', right: '1rem', top: '50%', transform: 'translateY(-50%)', color: '#666', pointerEvents: 'none' }}
                />
            </div>
            {selectedSensor && (
                <div style={{ fontSize: '0.7rem', color: 'var(--primary-color)', marginTop: '0.3rem' }}>
                    Текущая температура: {selectedSensor.temp?.toFixed(1) ?? '?'}°C
                </div>
            )}
            {rawSensors.length > 1 && (
                <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
                    Подключено датчиков: {rawSensors.length}
                </div>
            )}
        </div>
    );
}
