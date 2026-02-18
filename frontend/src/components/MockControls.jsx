import React, { useState, useEffect } from 'react';
import { useSensors } from '../hooks/useSensors';

/**
 * Floating panel to control MockSerial simulation during development.
 * Allows toggling physics and manually setting temperatures.
 */
export function MockControls() {
    const { sensors } = useSensors();
    const [isOpen, setIsOpen] = useState(false);
    const [physicsEnabled, setPhysicsEnabled] = useState(true);

    // Local state for manual controls (initialized with current sensor values)
    const [manualTemps, setManualTemps] = useState({
        boiler: 25,
        column: 25,
        dephleg: 20,
        output: 20,
    });

    // Update local state when sensors change (only if physics is ON)
    useEffect(() => {
        if (physicsEnabled) {
            setManualTemps({
                boiler: sensors.boiler?.value || 0,
                column: sensors.column?.value || 0,
                dephleg: sensors.dephleg?.value || 0,
                output: sensors.output?.value || 0,
            });
        }
    }, [sensors, physicsEnabled]);

    const togglePhysics = async () => {
        try {
            const newState = !physicsEnabled;
            await fetch('http://localhost:3001/api/debug/mock/simulation', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ enabled: newState }),
            });
            setPhysicsEnabled(newState);
        } catch (e) {
            console.error('Failed to toggle physics:', e);
        }
    };

    const updateTemp = async (sensor, value) => {
        const newTemps = { ...manualTemps, [sensor]: parseFloat(value) };
        setManualTemps(newTemps);

        // Send update to backend
        try {
            await fetch('http://localhost:3001/api/debug/mock/temps', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ [sensor]: parseFloat(value) }),
            });
        } catch (e) {
            console.error('Failed to set temp:', e);
        }
    };

    if (!isOpen) {
        return (
            <button
                onClick={() => setIsOpen(true)}
                style={{
                    position: 'fixed',
                    bottom: '1rem',
                    left: '1rem',
                    zIndex: 9999,
                    background: '#f39c12',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '50%',
                    width: '40px',
                    height: '40px',
                    cursor: 'pointer',
                    boxShadow: '0 4px 6px rgba(0,0,0,0.3)',
                    fontSize: '1.2rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                }}
                title="Open Mock Controls"
            >
                🎛️
            </button>
        );
    }

    return (
        <div style={{
            position: 'fixed',
            bottom: '1rem',
            left: '1rem',
            zIndex: 9999,
            background: 'rgba(30, 30, 30, 0.95)',
            border: '1px solid #444',
            borderRadius: '8px',
            padding: '1rem',
            width: '280px',
            boxShadow: '0 8px 16px rgba(0,0,0,0.5)',
            color: '#eee',
            fontFamily: 'monospace',
            backdropFilter: 'blur(10px)',
        }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <h4 style={{ margin: 0, color: '#f39c12' }}>MOCK CONTROL</h4>
                <button
                    onClick={() => setIsOpen(false)}
                    style={{ background: 'none', border: 'none', color: '#999', cursor: 'pointer', fontSize: '1.2rem' }}
                >
                    ✕
                </button>
            </div>

            <div style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <input
                    type="checkbox"
                    checked={physicsEnabled}
                    onChange={togglePhysics}
                    id="physics-toggle"
                />
                <label htmlFor="physics-toggle" style={{ cursor: 'pointer', userSelect: 'none' }}>
                    Physics Simulation {physicsEnabled ? '(ON)' : '(OFF)'}
                </label>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                {['boiler', 'column', 'dephleg', 'output'].map(sensor => (
                    <div key={sensor}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.2rem', fontSize: '0.8rem' }}>
                            <span style={{ textTransform: 'capitalize' }}>{sensor}</span>
                            <span style={{ color: '#f39c12' }}>{manualTemps[sensor].toFixed(1)}°C</span>
                        </div>
                        <input
                            type="range"
                            min="0"
                            max="110"
                            step="0.1"
                            value={manualTemps[sensor]}
                            onChange={(e) => updateTemp(sensor, e.target.value)}
                            disabled={physicsEnabled}
                            style={{ width: '100%', cursor: physicsEnabled ? 'not-allowed' : 'pointer', opacity: physicsEnabled ? 0.5 : 1 }}
                        />
                    </div>
                ))}
            </div>

            <div style={{ marginTop: '1rem', fontSize: '0.7rem', color: '#666', textAlign: 'center' }}>
                {physicsEnabled ? 'Values follow thermal model' : 'Manual override active'}
            </div>
        </div>
    );
}
