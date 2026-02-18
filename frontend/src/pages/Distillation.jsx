import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { FlaskConical, Zap, Droplets, AlertTriangle } from 'lucide-react';
import { useSensors } from '../hooks/useSensors';
import { useControl } from '../hooks/useControl';

import { PageHeader } from '../components/PageHeader';
import { SensorCard } from '../components/SensorCard';
import { ProcessChart } from '../components/ProcessChart';
import { PhaseList } from '../components/PhaseList';
import { FractionLog } from '../components/FractionLog';
import { SafetyCheck } from '../components/SafetyCheck';
import { StartButton } from '../components/StartButton';
import { formatTime } from '../utils/formatTime';
import './pages.css';

// Фазы дистилляции
const PHASES = [
    { id: 'warmup', name: 'Разгон', color: '#ff9800', description: 'Нагрев до рабочей температуры', targetTemp: 78 },
    { id: 'heads', name: 'Головы', color: '#f44336', description: 'Отбор летучих фракций', targetTemp: 68 },
    { id: 'hearts', name: 'Тело', color: '#4caf50', description: 'Отбор основного продукта', targetTemp: 78 },
    { id: 'tails', name: 'Хвосты', color: '#9c27b0', description: 'Сивушные масла', targetTemp: 85 },
];

const CHART_LINES = [
    { dataKey: 'boiler', color: '#ff9800', name: 'Куб', width: 2 },
    { dataKey: 'column', color: '#03a9f4', name: 'Колонна', width: 2 },
    { dataKey: 'output', color: '#4caf50', name: 'Выход', width: 1.5 },
];

const Distillation = () => {
    const { sensors } = useSensors();
    const { control, setHeater, setCooler } = useControl();

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

    // Derived
    const tempBoiler = sensors.boiler?.value || 0;
    const tempColumn = sensors.column?.value || 0;
    const tempOutput = sensors.output?.value || 0;
    const heaterPower = control.heater;
    const coolingPower = control.cooler;
    const phase = PHASES[currentPhase];

    // Timer
    useEffect(() => {
        if (!isStarted) return;
        const id = setInterval(() => setElapsedSeconds(p => p + 1), 1000);
        return () => clearInterval(id);
    }, [isStarted]);

    // Chart history
    useEffect(() => {
        setHistory(h => [...h.slice(-120), {
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
            boiler: tempBoiler, column: tempColumn, output: tempOutput,
        }]);
    }, [tempBoiler, tempColumn, tempOutput]);

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
            tempBoiler,
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
            <PageHeader
                title="Дистилляция"
                icon={FlaskConical}
                color="var(--accent-blue)"
                elapsed={elapsedSeconds}
            />

            <div className="layout-2col">
                {/* ─── Left Column ─── */}
                <div className="col-main">
                    {/* Sensors */}
                    <div className="sensor-grid sensor-grid--3">
                        <SensorCard label="🔥 КУБ" value={tempBoiler} color="#ff9800" />
                        <SensorCard label="🌡 КОЛОННА" value={tempColumn} color="#03a9f4" />
                        <SensorCard label="💧 ВЫХОД" value={tempOutput} color="#4caf50" />
                    </div>

                    {/* Controls */}
                    <div className="controls-grid controls-grid--3">
                        <div className="industrial-panel control-panel">
                            <div className="control-panel__label">
                                ТЭН <Zap size={12} color="var(--primary-color)" />
                            </div>
                            <input type="range" min={0} max={100} value={heaterPower}
                                className="control-slider" style={{ accentColor: 'var(--primary-color)' }}
                                onChange={e => setHeater(parseInt(e.target.value))}
                                disabled={!isStarted} />
                            <div className="control-value text-mono">{heaterPower}%</div>
                        </div>

                        <div className="industrial-panel control-panel">
                            <div className="control-panel__label">
                                ОХЛАЖДЕНИЕ <Droplets size={12} color="var(--accent-blue)" />
                            </div>
                            <input type="range" min={0} max={100} value={coolingPower}
                                className="control-slider" style={{ accentColor: 'var(--accent-blue)' }}
                                onChange={e => setCooler(parseInt(e.target.value))}
                                disabled={!isStarted} />
                            <div className="control-value text-mono">{coolingPower}%</div>
                        </div>

                        <div className="industrial-panel control-panel" style={{ textAlign: 'center' }}>
                            <div className="control-panel__label" style={{ justifyContent: 'center' }}>
                                СКОРОСТЬ ОТБОРА
                            </div>
                            <div className="control-value control-value--lg text-mono"
                                style={{ color: collectSpeed > 0 ? 'var(--accent-green)' : 'var(--text-secondary)' }}>
                                {collectSpeed}
                            </div>
                            <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>мл/мин</div>
                        </div>
                    </div>

                    {/* Chart */}
                    <ProcessChart data={history} lines={CHART_LINES} height="chart-panel--md" />

                    {/* Fraction Log */}
                    <FractionLog
                        fractions={fractions} phases={PHASES} isStarted={isStarted}
                        showForm={showAddFraction}
                        onToggleForm={() => setShowAddFraction(!showAddFraction)}
                        newFraction={newFraction}
                        onUpdateNew={u => setNewFraction(p => ({ ...p, ...u }))}
                        onAdd={addFraction}
                        onDelete={id => setFractions(prev => prev.filter(f => f.id !== id))}
                        tempColumn="tempBoiler"
                        accentColor="var(--accent-blue)"
                    />
                </div>

                {/* ─── Right Column ─── */}
                <div className="col-side">
                    <PhaseList
                        title="ФАЗЫ ДИСТИЛЛЯЦИИ"
                        phases={PHASES}
                        currentIndex={currentPhase}
                        isStarted={isStarted}
                        onAdvance={advancePhase}
                    />

                    <div className="industrial-panel" style={{ padding: '1.5rem' }}>
                        <StartButton
                            isStarted={isStarted}
                            onClick={() => setIsStarted(!isStarted)}
                            disabled={!isStarted && !isHeaterCovered}
                            startLabel="СТАРТ ДИСТИЛЛЯЦИИ"
                            startColor="var(--accent-blue)"
                        />
                        {!isStarted && (
                            <SafetyCheck checked={isHeaterCovered} onChange={setIsHeaterCovered} />
                        )}
                    </div>

                    {/* Active info */}
                    {isStarted && (
                        <motion.div
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="industrial-panel info-panel"
                        >
                            <div className="info-panel__header">
                                <div className="info-panel__dot" style={{ background: phase.color, boxShadow: `0 0 6px ${phase.color}` }} />
                                <span style={{ fontWeight: 'bold', color: phase.color }}>{phase.name}</span>
                            </div>
                            <div>{phase.description}</div>
                            <div style={{ marginTop: '0.3rem' }}>ТЭН: {heaterPower}% · Охлаждение: {coolingPower}%</div>
                            {tempBoiler > 95 && (
                                <div className="info-panel__warning">
                                    <AlertTriangle size={14} /> Температура куба близка к 100°C — снизьте мощность
                                </div>
                            )}
                        </motion.div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default Distillation;
