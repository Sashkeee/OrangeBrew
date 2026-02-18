import React from 'react';
import { useSensors } from '../hooks/useSensors.js';

/**
 * Connection status indicator — shows whether backend is connected.
 * Placed in the global layout (header/footer).
 */
export function ConnectionIndicator() {
    const { connected } = useSensors();

    const style = {
        position: 'fixed',
        bottom: '1rem',
        right: '1rem',
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
        padding: '0.5rem 1rem',
        borderRadius: '2rem',
        fontSize: '0.75rem',
        fontWeight: 600,
        letterSpacing: '0.5px',
        textTransform: 'uppercase',
        background: connected
            ? 'rgba(46, 204, 113, 0.15)'
            : 'rgba(231, 76, 60, 0.15)',
        color: connected ? '#2ecc71' : '#e74c3c',
        border: `1px solid ${connected ? 'rgba(46,204,113,0.3)' : 'rgba(231,76,60,0.3)'}`,
        backdropFilter: 'blur(10px)',
        zIndex: 9999,
        transition: 'all 0.3s ease',
    };

    const dotStyle = {
        width: '8px',
        height: '8px',
        borderRadius: '50%',
        background: connected ? '#2ecc71' : '#e74c3c',
        boxShadow: connected
            ? '0 0 6px rgba(46,204,113,0.6)'
            : '0 0 6px rgba(231,76,60,0.6)',
        animation: connected ? 'pulse-green 2s infinite' : 'none',
    };

    return (
        <>
            <style>{`
                @keyframes pulse-green {
                    0%, 100% { opacity: 1; }
                    50% { opacity: 0.5; }
                }
            `}</style>
            <div style={style}>
                <div style={dotStyle} />
                {connected ? 'Online' : 'Offline'}
            </div>
        </>
    );
}
