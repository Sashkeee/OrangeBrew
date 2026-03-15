import React from 'react';
import { Thermometer, ChevronDown } from 'lucide-react';

/**
 * Dropdown to select which temperature sensor to use for the process.
 * Uses namedSensors (array of {address, name, color, temp, enabled}) from useSensors.
 */
export default function SensorSelector({ namedSensors = [], rawSensors = [], value, onChange, label = 'Датчик температуры' }) {
    const sensors = namedSensors.length > 0
        ? namedSensors
        : rawSensors.map((s, i) => ({
            address: s.address,
            temp: s.temp,
            name: 'Датчик ' + (i + 1),
            color: '#FF6B35',
            enabled: true,
        }));

    const enabledSensors = sensors.filter(s => s.enabled !== false);

    React.useEffect(() => {
        if (!value && enabledSensors.length > 0) {
            onChange(enabledSensors[0].address);
        }
    }, [enabledSensors.length, value]);

    const selectedSensor = enabledSensors.find(s => s.address === value) || sensors.find(s => s.address === value);

    const labelStyle = {
        display: 'block',
        fontSize: '0.75rem',
        color: 'var(--text-secondary)',
        marginBottom: '0.4rem',
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
    };

    if (enabledSensors.length === 0) {
        return (
            <div style={{ marginBottom: '1rem' }}>
                <label style={labelStyle}>{label}</label>
                <div style={{
                    padding: '0.8rem 1rem',
                    background: 'rgba(255,255,255,0.03)',
                    border: '1px solid #333',
                    borderRadius: '8px',
                    color: '#666',
                    fontSize: '0.85rem',
                }}>
                    Нет подключённых датчиков
                </div>
            </div>
        );
    }

    const accentColor = selectedSensor?.color || 'var(--primary-color)';

    return (
        <div style={{ marginBottom: '1rem' }}>
            <label style={labelStyle}>{label}</label>
            <div style={{ position: 'relative' }}>
                {selectedSensor && (
                    <div style={{
                        position: 'absolute',
                        left: '1rem',
                        top: '50%',
                        transform: 'translateY(-50%)',
                        width: '10px',
                        height: '10px',
                        borderRadius: '50%',
                        background: accentColor,
                    }} />
                )}
                <Thermometer
                    size={14}
                    style={{ position: 'absolute', left: '1.9rem', top: '50%', transform: 'translateY(-50%)', color: accentColor }}
                />
                <select
                    value={value || ''}
                    onChange={(e) => onChange(e.target.value)}
                    style={{
                        width: '100%',
                        padding: '0.8rem 2.5rem 0.8rem 3.5rem',
                        background: 'rgba(255,255,255,0.05)',
                        border: '1px solid ' + accentColor,
                        borderRadius: '8px',
                        color: '#fff',
                        appearance: 'none',
                        cursor: 'pointer',
                        fontSize: '0.9rem',
                        outline: 'none',
                        transition: 'border-color 0.2s',
                    }}
                >
                    {enabledSensors.map((s) => (
                        <option key={s.address} value={s.address}>
                            {s.name}{s.temp != null ? ' \u2014 ' + s.temp.toFixed(1) + '\u00b0C' : ''}
                        </option>
                    ))}
                </select>
                <ChevronDown
                    size={16}
                    style={{ position: 'absolute', right: '1rem', top: '50%', transform: 'translateY(-50%)', color: '#666', pointerEvents: 'none' }}
                />
            </div>
            {selectedSensor && (
                <div style={{ fontSize: '0.7rem', color: accentColor, marginTop: '0.3rem' }}>
                    {selectedSensor.temp != null ? 'Температура: ' + selectedSensor.temp.toFixed(1) + '\u00b0C' : 'Датчик не виден'}
                    {' \u00b7 '}{selectedSensor.address}
                </div>
            )}
            {sensors.length > 1 && (
                <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
                    Доступно: {enabledSensors.length} из {sensors.length} датчиков
                </div>
            )}
        </div>
    );
}
