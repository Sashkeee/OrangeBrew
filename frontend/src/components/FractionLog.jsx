import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Plus, Trash2 } from 'lucide-react';
import '../pages/pages.css';

/**
 * Fraction log component for distillation/rectification.
 *
 * @param {{
 *   fractions: Array,
 *   phases: Array<{ id: string, name: string, color: string }>,
 *   isStarted: boolean,
 *   showForm: boolean,
 *   onToggleForm: () => void,
 *   newFraction: { volume: string, abv: string, note: string },
 *   onUpdateNew: (updates: object) => void,
 *   onAdd: () => void,
 *   onDelete: (id: number) => void,
 *   tempColumn: string,
 *   accentColor?: string,
 *   headsIndex?: number,
 *   heartsIndex?: number,
 *   tailsIndex?: number,
 * }} props
 */
export function FractionLog({
    fractions, phases, isStarted,
    showForm, onToggleForm, newFraction, onUpdateNew, onAdd, onDelete,
    tempColumn = 'tempBoiler',
    accentColor = 'var(--accent-blue)',
    headsIndex = 1, heartsIndex = 2, tailsIndex = 3,
}) {
    const totalVolume = fractions.reduce((s, f) => s + (f.volume || 0), 0);
    const headsVol = fractions.filter(f => f.phase === phases[headsIndex]?.id).reduce((s, f) => s + (f.volume || 0), 0);
    const heartsVol = fractions.filter(f => f.phase === phases[heartsIndex]?.id).reduce((s, f) => s + (f.volume || 0), 0);
    const tailsVol = fractions.filter(f => f.phase === phases[tailsIndex]?.id).reduce((s, f) => s + (f.volume || 0), 0);

    return (
        <div className="industrial-panel" style={{ padding: '1.5rem' }}>
            <div className="fraction-header">
                <h3 className="fraction-header__title">🧪 ЛОГ ОТБОРА</h3>
                <div className="fraction-header__actions">
                    <span className="fraction-total">
                        Всего: <span className="text-mono" style={{ color: 'var(--text-primary)' }}>{totalVolume} мл</span>
                    </span>
                    <button
                        className="btn-add-fraction"
                        onClick={onToggleForm}
                        disabled={!isStarted}
                        style={{ borderColor: accentColor, color: accentColor, background: `${accentColor}15` }}
                    >
                        <Plus size={14} /> Записать
                    </button>
                </div>
            </div>

            <AnimatePresence>
                {showForm && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        style={{ overflow: 'hidden', marginBottom: '1rem' }}
                    >
                        <div className="fraction-form">
                            <div>
                                <label className="form-label">Объём (мл)</label>
                                <input type="number" placeholder="250" className="form-input"
                                    value={newFraction.volume}
                                    onChange={e => onUpdateNew({ volume: e.target.value })} />
                            </div>
                            <div>
                                <label className="form-label">ABV %</label>
                                <input type="number" step="0.1" placeholder="65" className="form-input"
                                    value={newFraction.abv}
                                    onChange={e => onUpdateNew({ abv: e.target.value })} />
                            </div>
                            <div>
                                <label className="form-label">Заметка</label>
                                <input type="text" placeholder="Прозрачный, без запаха..."
                                    className="form-input" style={{ fontFamily: 'inherit' }}
                                    value={newFraction.note}
                                    onChange={e => onUpdateNew({ note: e.target.value })} />
                            </div>
                            <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                                <button className="btn-submit" onClick={onAdd}>OK</button>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            <div className="fraction-table-wrap">
                <table className="fraction-table">
                    <thead>
                        <tr>
                            <th style={{ textAlign: 'left' }}>Время</th>
                            <th>Фаза</th>
                            <th>Объём</th>
                            <th>ABV</th>
                            <th>Темп.</th>
                            <th style={{ textAlign: 'left' }}>Заметка</th>
                            <th style={{ width: '25px' }}></th>
                        </tr>
                    </thead>
                    <tbody>
                        {fractions.length === 0 && (
                            <tr><td colSpan={7} className="fraction-table__empty">Нет записей. Начните отбор и нажмите «Записать».</td></tr>
                        )}
                        {fractions.map(f => (
                            <tr key={f.id}>
                                <td className="text-mono">{f.time}</td>
                                <td style={{ textAlign: 'center' }}>
                                    <span className="phase-badge" style={{ background: `${f.phaseColor}20`, color: f.phaseColor }}>{f.phaseName}</span>
                                </td>
                                <td className="text-mono" style={{ textAlign: 'center' }}>{f.volume} мл</td>
                                <td className="text-mono" style={{ textAlign: 'center', color: 'var(--accent-green)' }}>
                                    {f.abv ? `${f.abv}%` : '—'}
                                </td>
                                <td className="text-mono" style={{ textAlign: 'center', color: accentColor }}>
                                    {f[tempColumn]?.toFixed?.(1) || f[tempColumn]}°
                                </td>
                                <td style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{f.note || '—'}</td>
                                <td>
                                    <button className="btn-delete" onClick={() => onDelete(f.id)}>
                                        <Trash2 size={13} />
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {fractions.length > 0 && (
                <div className="fraction-summary">
                    <span style={{ color: phases[headsIndex]?.color }}>Головы: <b>{headsVol} мл</b></span>
                    <span style={{ color: phases[heartsIndex]?.color }}>Тело: <b>{heartsVol} мл</b></span>
                    <span style={{ color: phases[tailsIndex]?.color }}>Хвосты: <b>{tailsVol} мл</b></span>
                    <span style={{ color: 'var(--text-secondary)', marginLeft: 'auto' }}>Итого: <b className="text-mono">{totalVolume} мл</b></span>
                </div>
            )}
        </div>
    );
}
