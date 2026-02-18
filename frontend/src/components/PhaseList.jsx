import React from 'react';
import { CheckCircle, ChevronRight } from 'lucide-react';
import '../pages/pages.css';

/**
 * Phase/stage list with active, complete, and upcoming states.
 *
 * @param {{
 *   title: string,
 *   phases: Array<{ id: string, name: string, color: string, description?: string }>,
 *   currentIndex: number,
 *   isStarted: boolean,
 *   onAdvance: () => void,
 *   onSelect?: (index: number) => void,
 * }} props
 */
export function PhaseList({ title, phases, currentIndex, isStarted, onAdvance, onSelect }) {
    return (
        <div className="industrial-panel" style={{ padding: '1.5rem' }}>
            <h3 className="phase-list__title">{title}</h3>
            <div className="phase-list">
                {phases.map((p, idx) => {
                    const isActive = idx === currentIndex;
                    const isComplete = idx < currentIndex;
                    return (
                        <div
                            key={p.id}
                            className={`phase-item ${isActive ? 'phase-item--active' : ''} ${isComplete ? 'phase-item--complete' : ''}`}
                            style={isActive ? {
                                background: `${p.color}15`,
                                borderColor: p.color,
                            } : undefined}
                            onClick={() => onSelect && !isStarted && !isComplete && onSelect(idx)}
                            role={onSelect && !isStarted && !isComplete ? 'button' : undefined}
                        >
                            <div
                                className="phase-dot"
                                style={{
                                    background: isComplete ? 'var(--accent-green)' : (isActive ? p.color : '#444'),
                                    boxShadow: isActive ? `0 0 8px ${p.color}` : 'none',
                                }}
                            />
                            <div className="phase-item__info">
                                <div className="phase-item__name">{p.name}</div>
                                {p.description && <div className="phase-item__desc">{p.description}</div>}
                            </div>
                            {isComplete && <CheckCircle size={16} color="var(--accent-green)" />}
                            {isActive && <ChevronRight size={16} color={p.color} />}
                        </div>
                    );
                })}
            </div>
            {isStarted && currentIndex < phases.length - 1 && (
                <button
                    className="btn-advance"
                    onClick={onAdvance}
                    style={{
                        borderColor: phases[currentIndex + 1].color,
                        background: `${phases[currentIndex + 1].color}15`,
                        color: phases[currentIndex + 1].color,
                    }}
                >
                    <ChevronRight size={16} />
                    {phases[currentIndex + 1].name}
                </button>
            )}
        </div>
    );
}
