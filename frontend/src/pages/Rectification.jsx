import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Gauge, Zap, Droplets, AlertTriangle } from 'lucide-react';
import { useSensors } from '../hooks/useSensors';
import { useControl } from '../hooks/useControl';

import { PageHeader } from '../components/PageHeader';
import { SensorCard } from '../components/SensorCard';
import { ProcessChart } from '../components/ProcessChart';
import { PhaseList } from '../components/PhaseList';
import { FractionLog } from '../components/FractionLog';
import { SafetyCheck } from '../components/SafetyCheck';
import { StartButton } from '../components/StartButton';
import DeviceSelector from '../components/DeviceSelector';
import './pages.css';


const ACCENT = '#ce93d8';

// Фазы ректификации
const PHASES = [
    { id: 'warmup', name: 'Разгон', color: '#ff9800', description: 'Нагрев и выход на режим' },
    { id: 'stabilize', name: 'Стабилизация', color: '#03a9f4', description: 'Работа "на себя", выход колонны на режим' },
    { id: 'heads', name: 'Головы', color: '#f44336', description: 'Покапельный отбор легких примесей' },
    { id: 'hearts', name: 'Тело', color: '#4caf50', description: 'Отбор спирта-ректификата' },
    { id: 'tails', name: 'Хвосты', color: '#9c27b0', description: 'Сивушные масла, остатки' },
];

const CHART_LINES = [
    { dataKey: 'boiler', color: '#ff9800', name: 'Куб', width: 2 },
    { dataKey: 'column', color: '#03a9f4', name: 'Колонна', width: 2 },
    { dataKey: 'dephleg', color: '#ce93d8', name: 'Дефлегматор', width: 1.5 },
    { dataKey: 'output', color: '#4caf50', name: 'Выход', width: 1.5 },
];

const CHART_REFS = [
    { y: 78.3, color: '#4caf50', label: '78.3° этанол' },
];

const Rectification = () => {
    const { sensors } = useSensors();
    const { control, setHeater, setDephleg, setCooler } = useControl();

    // State
    const [isStarted, setIsStarted] = useState(false);
    const [currentPhase, setCurrentPhase] = useState(0);
    const [isHeaterCovered, setIsHeaterCovered] = useState(false);
    const [elapsedSeconds, setElapsedSeconds] = useState(0);
    const [history, setHistory] = useState([]);
    const [fractions, setFractions] = useState([]);
    const [showAddFraction, setShowAddFraction] = useState(false);
    const [newFraction, setNewFraction] = useState({ volume: '', abv: '', note: '' });
    const [collectSpeed, setCollectSpeed] = useState(0);
    const [refluxRatio, setRefluxRatio] = useState(3);
    const [targetAbv, setTargetAbv] = useState(96.0);
    const [selectedDeviceId, setSelectedDeviceId] = useState('local_serial');


    // Derived
    const tempBoiler = sensors.boiler?.value || 0;
    const tempColumn = sensors.column?.value || 0;
    const tempDephleg = sensors.dephleg?.value || 0;
    const tempOutput = sensors.output?.value || 0;
    const heaterPower = control.heater;
    const dephlegPower = control.dephleg;
    const coolingPower = control.cooler;
    const dephlegMode = control.dephlegMode || 'manual';
    const phase = PHASES[currentPhase];

    const columnStable = history.length > 10 &&
        Math.abs((history[history.length - 1]?.column || 0) - (history[history.length - 10]?.column || 0)) < 0.5;

    // Timer
    useEffect(() => {
        if (!isStarted) return;
        const id = setInterval(() => setElapsedSeconds(p => p + 1), 1000);
        return () => clearInterval(id);
    }, [isStarted]);

    // Chart history
    useEffect(() => {
        setHistory(h => {
            const now = Date.now();
            const last = h[h.length - 1];
            if (last && now - (last.unix || 0) < 5000) return h;
            return [...h, {
                time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
                unix: now,
                boiler: tempBoiler, column: tempColumn, dephleg: tempDephleg, output: tempOutput,
            }];
        });
    }, [tempBoiler, tempColumn, tempDephleg, tempOutput]);

    // Fraction CRUD
    const addFraction = () => {
        setFractions(prev => [...prev, {
            id: Date.now(),
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            phase: PHASES[currentPhase].id,
            phaseName: PHASES[currentPhase].name,
            phaseColor: PHASES[currentPhase].color,
            volume: newFraction.volume ? parseFloat(newFraction.volume) : 0,
            abv: newFraction.abv ? parseFloat(newFraction.abv) : null,
            tempColumn,
            note: newFraction.note,
        }]);
        setNewFraction({ volume: '', abv: '', note: '' });
        setShowAddFraction(false);
    };

    const advancePhase = () => {
        if (currentPhase < PHASES.length - 1) setCurrentPhase(p => p + 1);
    };

    return (
        <div className="page-container">
            <PageHeader title="Ректификация" icon={Gauge} color={ACCENT} elapsed={elapsedSeconds} />

            <div className="layout-2col">
                {/* ─── Left Column ─── */}
                <div className="col-main">
                    {/* Sensors */}
                    <div className="sensor-grid sensor-grid--4">
                        <SensorCard label="🔥 КУБ" value={tempBoiler} color="#ff9800" warnAbove={100} />
                        <SensorCard label="🌡 КОЛОННА" value={tempColumn} color="#03a9f4" warnAbove={82} />
                        <SensorCard label="❄️ ДЕФЛЕГМАТОР" value={tempDephleg} color={ACCENT} />
                        <SensorCard label="💧 ВЫХОД" value={tempOutput} color="#4caf50" />
                    </div>

                    {/* Controls */}
                    <div className="controls-grid controls-grid--4">
                        {/* Heater */}
                        <div className="industrial-panel control-panel">
                            <div className="control-panel__label">
                                ТЭН <Zap size={11} color="var(--primary-color)" />
                            </div>
                            <input type="range" min={0} max={100} value={heaterPower}
                                className="control-slider" style={{ accentColor: 'var(--primary-color)' }}
                                onChange={e => setHeater(parseInt(e.target.value))}
                                disabled={!isStarted} />
                            <div className="control-value text-mono">{heaterPower}%</div>
                        </div>

                        {/* Dephlegmator */}
                        <div className="industrial-panel control-panel" style={{ borderTop: `2px solid ${ACCENT}` }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                                <span className="control-panel__label" style={{ marginBottom: 0 }}>
                                    ДЕФЛЕГМАТОР <Droplets size={11} color={ACCENT} />
                                </span>
                                <button
                                    className={`btn-mode ${dephlegMode === 'auto' ? 'btn-mode--active' : ''}`}
                                    onClick={() => setDephleg(dephlegPower, dephlegMode === 'auto' ? 'manual' : 'auto')}
                                    disabled={!isStarted}
                                >
                                    {dephlegMode === 'auto' ? 'АВТО' : 'РУЧН'}
                                </button>
                            </div>
                            <input type="range" min={0} max={100} value={dephlegPower}
                                className="control-slider" style={{ accentColor: ACCENT }}
                                onChange={e => { if (dephlegMode === 'manual') setDephleg(parseInt(e.target.value)); }}
                                disabled={!isStarted || dephlegMode === 'auto'} />
                            <div className="control-value text-mono" style={{ color: ACCENT }}>{dephlegPower}%</div>
                        </div>

                        {/* Cooling */}
                        <div className="industrial-panel control-panel">
                            <div className="control-panel__label">ОХЛАЖДЕНИЕ</div>
                            <input type="range" min={0} max={100} value={coolingPower}
                                className="control-slider" style={{ accentColor: 'var(--accent-blue)' }}
                                onChange={e => setCooler(parseInt(e.target.value))}
                                disabled={!isStarted} />
                            <div className="control-value text-mono">{coolingPower}%</div>
                        </div>

                        {/* Speed */}
                        <div className="industrial-panel control-panel" style={{ textAlign: 'center' }}>
                            <div className="control-panel__label" style={{ justifyContent: 'center' }}>СКОРОСТЬ</div>
                            <div className="control-value control-value--lg text-mono"
                                style={{ color: collectSpeed > 0 ? 'var(--accent-green)' : 'var(--text-secondary)' }}>
                                {collectSpeed}
                            </div>
                            <div style={{ fontSize: '0.6rem', color: 'var(--text-secondary)' }}>мл/мин</div>
                        </div>
                    </div>

                    {/* Chart */}
                    <ProcessChart
                        data={history} lines={CHART_LINES}
                        referenceLines={CHART_REFS} height="chart-panel--sm"
                    />

                    {/* Fraction Log */}
                    <FractionLog
                        fractions={fractions} phases={PHASES} isStarted={isStarted}
                        showForm={showAddFraction}
                        onToggleForm={() => setShowAddFraction(!showAddFraction)}
                        newFraction={newFraction}
                        onUpdateNew={u => setNewFraction(p => ({ ...p, ...u }))}
                        onAdd={addFraction}
                        onDelete={id => setFractions(prev => prev.filter(f => f.id !== id))}
                        tempColumn="tempColumn"
                        accentColor={ACCENT}
                        headsIndex={2} heartsIndex={3} tailsIndex={4}
                    />
                </div>

                {/* ─── Right Column ─── */}
                <div className="col-side">
                    <PhaseList
                        title="ФАЗЫ РЕКТИФИКАЦИИ"
                        phases={PHASES}
                        currentIndex={currentPhase}
                        isStarted={isStarted}
                        onAdvance={advancePhase}
                    />

                    {/* Reflux ratio + Target ABV */}
                    <div className="industrial-panel" style={{ padding: '1.2rem' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                            <div style={{ textAlign: 'center' }}>
                                <div className="control-panel__label" style={{ justifyContent: 'center', marginBottom: '0.3rem' }}>ФЛЕГМОВОЕ ЧИСЛО</div>
                                <div className="stepper">
                                    <button className="stepper__btn" onClick={() => setRefluxRatio(r => Math.max(1, r - 1))} disabled={!isStarted}>−</button>
                                    <span className="stepper__value" style={{ color: ACCENT }}>{refluxRatio}</span>
                                    <button className="stepper__btn" onClick={() => setRefluxRatio(r => Math.min(20, r + 1))} disabled={!isStarted}>+</button>
                                </div>
                                <div style={{ fontSize: '0.6rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>возврат:отбор</div>
                            </div>
                            <div style={{ textAlign: 'center' }}>
                                <div className="control-panel__label" style={{ justifyContent: 'center', marginBottom: '0.3rem' }}>ЦЕЛЕВАЯ КРЕПОСТЬ</div>
                                <div className="stepper">
                                    <button className="stepper__btn" onClick={() => setTargetAbv(a => Math.max(90, +(a - 0.5).toFixed(1)))} disabled={!isStarted}>−</button>
                                    <span className="stepper__value" style={{ color: '#4caf50', fontSize: '1.4rem' }}>{targetAbv}%</span>
                                    <button className="stepper__btn" onClick={() => setTargetAbv(a => Math.min(97, +(a + 0.5).toFixed(1)))} disabled={!isStarted}>+</button>
                                </div>
                                <div style={{ fontSize: '0.6rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>ABV спирта</div>
                            </div>
                        </div>
                    </div>

                    {/* Start / Stop */}
                    <div className="industrial-panel" style={{ padding: '1.5rem' }}>
                        {!isStarted && <DeviceSelector value={selectedDeviceId} onChange={setSelectedDeviceId} />}
                        <StartButton
                            isStarted={isStarted}
                            onClick={() => setIsStarted(!isStarted)}
                            disabled={!isStarted && !isHeaterCovered}
                            startLabel="СТАРТ РЕКТИФИКАЦИИ"
                            startColor={ACCENT}
                        />
                        {!isStarted && (
                            <SafetyCheck checked={isHeaterCovered} onChange={setIsHeaterCovered} />
                        )}
                    </div>


                    {/* Status info */}
                    {isStarted && (
                        <motion.div
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="industrial-panel info-panel"
                        >
                            <div className="info-panel__header">
                                <div className="info-panel__dot" style={{ background: phase.color, boxShadow: `0 0 6px ${phase.color}` }} />
                                <span style={{ fontWeight: 'bold', color: phase.color }}>{phase.name}</span>
                                {columnStable && (
                                    <span className="status-badge" style={{ marginLeft: 'auto', borderColor: '#4caf50', background: 'rgba(76,175,80,0.15)', color: '#4caf50', fontSize: '0.65rem', padding: '0.1rem 0.4rem' }}>
                                        ● СТАБИЛЬНО
                                    </span>
                                )}
                            </div>
                            <div>{phase.description}</div>
                            <div style={{ marginTop: '0.3rem' }}>ТЭН: {heaterPower}% · Дефлегматор: {dephlegPower}% ({dephlegMode === 'auto' ? 'авто' : 'ручн'})</div>
                            <div>Флегмовое число: {refluxRatio} · Цель: {targetAbv}%</div>
                            {tempColumn > 82 && (
                                <div className="info-panel__warning">
                                    <AlertTriangle size={14} /> Температура колонны ↑ — захват хвостов, увеличьте дефлегматор
                                </div>
                            )}
                        </motion.div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default Rectification;
