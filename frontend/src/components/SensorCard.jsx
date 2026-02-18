import React from 'react';
import '../pages/pages.css';

/**
 * Temperature sensor display card.
 *
 * @param {{ label: string, value: number, color: string, warnAbove?: number, size?: 'sm'|'lg' }} props
 */
export function SensorCard({ label, value, color, warnAbove, size = 'sm' }) {
    const isWarning = warnAbove != null && value > warnAbove;
    const displayColor = isWarning ? 'var(--accent-red)' : color;

    return (
        <div className="industrial-panel sensor-card" style={{ borderTopColor: color }}>
            <div className="sensor-card__label">{label}</div>
            <div
                className={`sensor-card__value ${size === 'lg' ? 'sensor-card__value--lg' : ''}`}
                style={{ color: displayColor }}
            >
                {value.toFixed(1)}°
            </div>
        </div>
    );
}
