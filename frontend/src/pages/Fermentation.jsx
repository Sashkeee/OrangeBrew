import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { Snowflake, Thermometer, Plus, Trash2, Beaker, CheckCircle, ChevronDown, Save } from 'lucide-react';

import { PageHeader } from '../components/PageHeader';
import { ProcessChart } from '../components/ProcessChart';
import { StartButton } from '../components/StartButton';
import DeviceSelector from '../components/DeviceSelector';
import { formatElapsed } from '../utils/formatTime';

import './pages.css';

// Стадии брожения
const STAGES = [
    { id: 'primary', name: 'Первичное брожение', color: '#ff9800', tempRange: [18, 22], daysTypical: '5-7 дней', description: '18–22°C · 5-7 дней' },
    { id: 'secondary', name: 'Вторичное брожение', color: '#4caf50', tempRange: [18, 20], daysTypical: '7-14 дней', description: '18–20°C · 7-14 дней' },
    { id: 'coldcrash', name: 'Cold Crash', color: '#03a9f4', tempRange: [0, 4], daysTypical: '2-3 дня', description: '0–4°C · 2-3 дня' },
];

const CHART_LINES = [
    { dataKey: 'temp', color: 'var(--primary-color)', name: 'Температура', width: 2 },
];

const Fermentation = () => {
    const navigate = useNavigate();

    // State
    const [isStarted, setIsStarted] = useState(false);
    const [currentStage, setCurrentStage] = useState(0);
    const [temperature, setTemperature] = useState(20.0);
    const [targetTemp, setTargetTemp] = useState(20);
    const [coolerPower, setCoolerPower] = useState(0);
    const [coolerAuto, setCoolerAuto] = useState(true);
    const [elapsedSeconds, setElapsedSeconds] = useState(0);
    const [history, setHistory] = useState([]);

    // Measurement diary
    const [measurements, setMeasurements] = useState([
        { id: 1, date: new Date().toISOString().slice(0, 10), og: 1.050, fg: null, note: 'Начало брожения' }
    ]);
    const [showAddMeasurement, setShowAddMeasurement] = useState(false);
    const [newMeasurement, setNewMeasurement] = useState({ og: '', fg: '', note: '' });
    const [selectedDeviceId, setSelectedDeviceId] = useState('local_serial');


    // Derived
    const stage = STAGES[currentStage];
    const calculateABV = (og, fg) => (!og || !fg || fg >= og) ? null : ((og - fg) * 131.25).toFixed(1);
    const latestOG = measurements.find(m => m.og)?.og || null;
    const latestFG = [...measurements].reverse().find(m => m.fg)?.fg || null;
    const currentABV = calculateABV(latestOG, latestFG);

    // Chart reference lines (dynamic based on target)
    const chartRefs = [{ y: targetTemp, color: 'var(--accent-blue)', label: `Цель ${targetTemp}°C` }];

    // Simulation
    useEffect(() => {
        if (!isStarted) return;
        const interval = setInterval(() => {
            setElapsedSeconds(p => p + 1);
            setTemperature(prev => {
                if (coolerAuto) {
                    if (prev > targetTemp + 0.5) setCoolerPower(Math.min(100, Math.round((prev - targetTemp) * 30)));
                    else if (prev < targetTemp - 0.5) setCoolerPower(0);
                    else setCoolerPower(Math.round(Math.max(0, (prev - targetTemp + 0.2) * 20)));
                }
                const fermentHeat = currentStage === 0 ? 0.15 : (currentStage === 1 ? 0.05 : 0);
                const coolerEffect = (coolerPower / 100) * 0.3;
                const ambient = 0.01 * (22 - prev);
                const newVal = parseFloat((prev + fermentHeat - coolerEffect + ambient).toFixed(1));

                setHistory(h => [...h.slice(-120), {
                    time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
                    temp: newVal, target: targetTemp,
                }]);
                return newVal;
            });
        }, 1000);
        return () => clearInterval(interval);
    }, [isStarted, targetTemp, coolerPower, coolerAuto, currentStage]);

    // Measurement CRUD
    const addMeasurement = () => {
        setMeasurements(prev => [...prev, {
            id: Date.now(),
            date: new Date().toISOString().slice(0, 10),
            og: newMeasurement.og ? parseFloat(newMeasurement.og) : null,
            fg: newMeasurement.fg ? parseFloat(newMeasurement.fg) : null,
            note: newMeasurement.note,
        }]);
        setNewMeasurement({ og: '', fg: '', note: '' });
        setShowAddMeasurement(false);
    };

    const advanceStage = () => {
        if (currentStage < STAGES.length - 1) {
            const next = currentStage + 1;
            setCurrentStage(next);
            setTargetTemp(STAGES[next].tempRange[1]);
        }
    };

    const handleStartStop = () => {
        if (!isStarted) setTargetTemp(STAGES[currentStage].tempRange[1]);
        setIsStarted(!isStarted);
    };

    return (
        <div className="page-container">
            <PageHeader title="Брожение" icon={Beaker} color="var(--primary-color)" elapsed={elapsedSeconds} />

            <div className="layout-2col">
                {/* ─── Left Column ─── */}
                <div className="col-main">
                    {/* Top cards */}
                    <div className="sensor-grid sensor-grid--3">
                        {/* Temperature */}
                        <div className="industrial-panel" style={{ padding: '1.5rem', textAlign: 'center' }}>
                            <div className="sensor-card__label">ТЕМПЕРАТУРА</div>
                            <div className="sensor-card__value sensor-card__value--lg text-mono"
                                style={{ color: Math.abs(temperature - targetTemp) > 2 ? 'var(--accent-red)' : 'var(--text-primary)', fontSize: '3rem' }}>
                                {temperature.toFixed(1)}°
                            </div>
                            <div className="sensor-card__sub">ЦЕЛЬ: {targetTemp}°C</div>
                            {isStarted && (
                                <div className="status-badge" style={{
                                    background: Math.abs(temperature - targetTemp) <= 0.5 ? 'rgba(76,175,80,0.2)' : 'rgba(255,152,0,0.2)',
                                    color: Math.abs(temperature - targetTemp) <= 0.5 ? 'var(--accent-green)' : 'var(--primary-color)',
                                    borderColor: Math.abs(temperature - targetTemp) <= 0.5 ? 'var(--accent-green)' : 'var(--primary-color)',
                                }}>
                                    {Math.abs(temperature - targetTemp) <= 0.5 ? '✓ СТАБИЛЬНО' : temperature > targetTemp ? '❄ ОХЛАЖДЕНИЕ' : '🔥 НАГРЕВ'}
                                </div>
                            )}
                        </div>

                        {/* Cooler */}
                        <div className="industrial-panel control-panel" style={{ padding: '1.5rem', textAlign: 'center' }}>
                            <div className="control-panel__label" style={{ justifyContent: 'center' }}>
                                ОХЛАЖДЕНИЕ <Snowflake size={14} color="var(--accent-blue)" />
                            </div>
                            <input type="range" min={0} max={100} value={coolerPower}
                                className="control-slider" style={{ accentColor: 'var(--accent-blue)' }}
                                onChange={e => { setCoolerPower(parseInt(e.target.value)); setCoolerAuto(false); }}
                                disabled={!isStarted} />
                            <div className="control-value text-mono" style={{ fontSize: '1.5rem' }}>{coolerPower}%</div>
                            <button
                                className={`btn-mode ${coolerAuto ? 'btn-mode--active' : ''}`}
                                onClick={() => setCoolerAuto(!coolerAuto)}
                                disabled={!isStarted}
                                style={{ marginTop: '0.3rem', fontSize: '0.7rem', padding: '0.2rem 0.8rem', borderRadius: '12px' }}
                            >
                                {coolerAuto ? 'АВТО' : 'РУЧНОЙ'}
                            </button>
                        </div>

                        {/* ABV */}
                        <div className="industrial-panel" style={{ padding: '1.5rem', textAlign: 'center' }}>
                            <div className="sensor-card__label">РАСЧЁТ ABV</div>
                            <div className="sensor-card__value text-mono"
                                style={{ color: currentABV ? 'var(--accent-green)' : 'var(--text-secondary)' }}>
                                {currentABV ? `${currentABV}%` : '—'}
                            </div>
                            <div className="sensor-card__sub">
                                {latestOG ? `OG: ${latestOG.toFixed(3)}` : 'OG: —'} / {latestFG ? `FG: ${latestFG.toFixed(3)}` : 'FG: —'}
                            </div>
                        </div>
                    </div>

                    {/* Chart */}
                    <ProcessChart
                        data={history} lines={CHART_LINES}
                        referenceLines={chartRefs}
                        defaultYMin={-5} defaultYMax={35}
                        minZoomRange={3} maxZoomRange={40}
                        height="chart-panel--md"
                    />

                    {/* Measurement diary */}
                    <div className="industrial-panel" style={{ padding: '1.5rem' }}>
                        <div className="fraction-header">
                            <h3 className="fraction-header__title">📝 ДНЕВНИК ЗАМЕРОВ</h3>
                            <button className="btn-add-fraction" onClick={() => setShowAddMeasurement(!showAddMeasurement)}
                                style={{ borderColor: 'var(--primary-color)', color: 'var(--primary-color)', background: 'rgba(255,152,0,0.1)' }}>
                                <Plus size={14} /> Добавить
                            </button>
                        </div>

                        <AnimatePresence>
                            {showAddMeasurement && (
                                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} style={{ overflow: 'hidden', marginBottom: '1rem' }}>
                                    <div className="fraction-form" style={{ gridTemplateColumns: '1fr 1fr 2fr auto' }}>
                                        <div>
                                            <label className="form-label">OG</label>
                                            <input type="number" step="0.001" placeholder="1.050" className="form-input"
                                                value={newMeasurement.og} onChange={e => setNewMeasurement(p => ({ ...p, og: e.target.value }))} />
                                        </div>
                                        <div>
                                            <label className="form-label">FG</label>
                                            <input type="number" step="0.001" placeholder="1.010" className="form-input"
                                                value={newMeasurement.fg} onChange={e => setNewMeasurement(p => ({ ...p, fg: e.target.value }))} />
                                        </div>
                                        <div>
                                            <label className="form-label">Заметка</label>
                                            <input type="text" placeholder="Активное брожение..." className="form-input" style={{ fontFamily: 'inherit' }}
                                                value={newMeasurement.note} onChange={e => setNewMeasurement(p => ({ ...p, note: e.target.value }))} />
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                                            <button className="btn-submit" onClick={addMeasurement}><Save size={14} /> OK</button>
                                        </div>
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>

                        <div className="fraction-table-wrap">
                            <table className="fraction-table">
                                <thead>
                                    <tr>
                                        <th style={{ textAlign: 'left' }}>Дата</th>
                                        <th>OG</th>
                                        <th>FG</th>
                                        <th>ABV</th>
                                        <th style={{ textAlign: 'left' }}>Заметка</th>
                                        <th style={{ width: '30px' }}></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {measurements.map(m => {
                                        const abv = calculateABV(m.og, m.fg);
                                        return (
                                            <tr key={m.id}>
                                                <td className="text-mono">{m.date}</td>
                                                <td className="text-mono" style={{ textAlign: 'center', color: 'var(--primary-color)' }}>{m.og ? m.og.toFixed(3) : '—'}</td>
                                                <td className="text-mono" style={{ textAlign: 'center', color: 'var(--accent-blue)' }}>{m.fg ? m.fg.toFixed(3) : '—'}</td>
                                                <td className="text-mono" style={{ textAlign: 'center', color: abv ? 'var(--accent-green)' : 'var(--text-secondary)', fontWeight: abv ? 'bold' : 'normal' }}>{abv ? `${abv}%` : '—'}</td>
                                                <td style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>{m.note || '—'}</td>
                                                <td>
                                                    <button className="btn-delete" onClick={() => setMeasurements(prev => prev.filter(x => x.id !== m.id))}>
                                                        <Trash2 size={14} />
                                                    </button>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>

                {/* ─── Right Column ─── */}
                <div className="col-side">
                    {/* Stages */}
                    <div className="industrial-panel" style={{ padding: '1.5rem' }}>
                        <h3 className="phase-list__title">СТАДИИ БРОЖЕНИЯ</h3>
                        <div className="phase-list">
                            {STAGES.map((s, idx) => {
                                const isActive = idx === currentStage;
                                const isComplete = idx < currentStage;
                                return (
                                    <div key={s.id}
                                        className={`phase-item ${isActive ? 'phase-item--active' : ''} ${isComplete ? 'phase-item--complete' : ''}`}
                                        style={isActive ? { background: `${s.color}15`, borderColor: s.color } : undefined}
                                        onClick={() => { if (!isStarted && !isComplete) { setCurrentStage(idx); setTargetTemp(s.tempRange[1]); } }}
                                    >
                                        <div className="phase-dot" style={{
                                            background: isComplete ? 'var(--accent-green)' : (isActive ? s.color : '#444'),
                                            boxShadow: isActive ? `0 0 8px ${s.color}` : 'none',
                                        }} />
                                        <div className="phase-item__info">
                                            <div className="phase-item__name">{s.name}</div>
                                            <div className="phase-item__desc">{s.tempRange[0]}—{s.tempRange[1]}°C · {s.daysTypical}</div>
                                        </div>
                                        {isComplete && <CheckCircle size={18} color="var(--accent-green)" />}
                                    </div>
                                );
                            })}
                        </div>
                        {isStarted && currentStage < STAGES.length - 1 && (
                            <button className="btn-advance" onClick={advanceStage}
                                style={{ borderColor: 'var(--primary-color)', background: 'rgba(255,152,0,0.1)', color: 'var(--primary-color)' }}>
                                <ChevronDown size={16} /> Перейти к: {STAGES[currentStage + 1].name}
                            </button>
                        )}
                    </div>

                    {/* Target temperature */}
                    <div className="industrial-panel" style={{ padding: '1.5rem' }}>
                        <h3 className="phase-list__title">
                            <Thermometer size={14} style={{ verticalAlign: 'middle', marginRight: '0.3rem' }} />
                            ЦЕЛЕВАЯ ТЕМПЕРАТУРА
                        </h3>
                        <div className="stepper">
                            <button className="stepper__btn" onClick={() => setTargetTemp(p => Math.max(-2, p - 1))} disabled={!isStarted}>−</button>
                            <span className="stepper__value" style={{ color: 'var(--accent-blue)' }}>{targetTemp}°C</span>
                            <button className="stepper__btn" onClick={() => setTargetTemp(p => Math.min(30, p + 1))} disabled={!isStarted}>+</button>
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textAlign: 'center', marginTop: '0.5rem' }}>
                            Рекомендуемо: {stage.tempRange[0]}—{stage.tempRange[1]}°C
                        </div>
                    </div>

                    {/* Start / Stop */}
                    <div className="industrial-panel" style={{ padding: '1.5rem' }}>
                        {!isStarted && <DeviceSelector value={selectedDeviceId} onChange={setSelectedDeviceId} />}
                        <StartButton isStarted={isStarted} onClick={handleStartStop} startLabel="СТАРТ БРОЖЕНИЯ" />
                    </div>


                    {/* Info panel */}
                    {isStarted && (
                        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                            className="industrial-panel info-panel">
                            <div className="info-panel__header">
                                <div className="info-panel__dot" style={{ background: stage.color, boxShadow: `0 0 6px ${stage.color}` }} />
                                <span style={{ fontWeight: 'bold', color: stage.color }}>{stage.name}</span>
                            </div>
                            <div>Целевой диапазон: {stage.tempRange[0]}—{stage.tempRange[1]}°C</div>
                            <div>Типичная длительность: {stage.daysTypical}</div>
                            <div style={{ marginTop: '0.3rem' }}>Охлаждение: {coolerAuto ? 'автоматическое' : 'ручное'} ({coolerPower}%)</div>
                        </motion.div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default Fermentation;
