import React from 'react';
import { Play, Pause } from 'lucide-react';
import '../pages/pages.css';

/**
 * Start/Stop button.
 *
 * @param {{ isStarted: boolean, onClick: () => void, disabled?: boolean, startLabel?: string, stopLabel?: string, startColor?: string }} props
 */
export function StartButton({
    isStarted, onClick, disabled = false,
    startLabel = 'СТАРТ', stopLabel = 'СТОП',
    startColor = 'var(--accent-green)',
}) {
    return (
        <button
            className={`btn-start ${isStarted ? 'btn-start--stop' : ''}`}
            style={isStarted ? undefined : { background: startColor, color: '#000' }}
            onClick={onClick}
            disabled={disabled}
        >
            {isStarted
                ? <><Pause size={24} aria-hidden="true" /> {stopLabel}</>
                : <><Play size={24} aria-hidden="true" /> {startLabel}</>
            }
        </button>
    );
}
