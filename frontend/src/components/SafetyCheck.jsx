import React from 'react';
import { ShieldCheck } from 'lucide-react';
import '../pages/pages.css';

/**
 * Safety checkbox for heater coverage confirmation.
 *
 * @param {{ checked: boolean, onChange: (checked: boolean) => void }} props
 */
export function SafetyCheck({ checked, onChange }) {
    return (
        <label className={`safety-check ${checked ? 'safety-check--checked' : ''}`}>
            <input
                type="checkbox"
                className="safety-check__input"
                checked={checked}
                onChange={e => onChange(e.target.checked)}
            />
            <div className="safety-check__text">
                <div className="safety-check__title">ТЭН покрыт водой</div>
                <div className="safety-check__subtitle">Блокировка нагрева без воды</div>
            </div>
            <ShieldCheck color={checked ? 'var(--accent-green)' : 'var(--accent-red)'} />
        </label>
    );
}
