import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import {
    ArrowLeft, Play, Pause, Thermometer, Snowflake, Plus, Trash2,
    TrendingDown, Clock, Beaker, CheckCircle, ZoomIn, ZoomOut,
    ChevronDown, ChevronUp, Edit3, Save
} from 'lucide-react';
import {
    LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
    ResponsiveContainer, ReferenceLine, Area, AreaChart
} from 'recharts';

// Стадии брожения
const STAGES = [
    { id: 'primary', name: 'Первичное брожение', color: '#ff9800', tempRange: [18, 22], daysTypical: '5-7 дней' },
    { id: 'secondary', name: 'Вторичное брожение', color: '#4caf50', tempRange: [18, 20], daysTypical: '7-14 дней' },
    { id: 'coldcrash', name: 'Cold Crash', color: '#03a9f4', tempRange: [0, 4], daysTypical: '2-3 дня' },
];

const Fermentation = () => {
    const navigate = useNavigate();

    // Основное состояние
    const [isStarted, setIsStarted] = useState(false);
    const [currentStage, setCurrentStage] = useState(0); // index in STAGES
    const [temperature, setTemperature] = useState(20.0);
    const [targetTemp, setTargetTemp] = useState(20);
    const [coolerPower, setCoolerPower] = useState(0);
    const [coolerAuto, setCoolerAuto] = useState(true);
    const [elapsedSeconds, setElapsedSeconds] = useState(0);

    // График
    const [history, setHistory] = useState([]);
    const [mounted, setMounted] = useState(false);
    const [graphYMin, setGraphYMin] = useState(-5);
    const [graphYMax, setGraphYMax] = useState(35);

    // Дневник замеров
    const [measurements, setMeasurements] = useState([
        { id: 1, date: new Date().toISOString().slice(0, 10), og: 1.050, fg: null, note: 'Начало брожения' }
    ]);
    const [showAddMeasurement, setShowAddMeasurement] = useState(false);
    const [newMeasurement, setNewMeasurement] = useState({ og: '', fg: '', note: '' });

    // Заметки
    const [stageNotes, setStageNotes] = useState({});

    useEffect(() => {
        setMounted(true);
    }, []);

    // Симуляция
    useEffect(() => {
        let interval;
        if (isStarted) {
            interval = setInterval(() => {
                setElapsedSeconds(prev => prev + 1);

                setTemperature(prev => {
                    const diff = targetTemp - prev;
                    // Автоматика кулера
                    if (coolerAuto) {
                        if (prev > targetTemp + 0.5) {
                            setCoolerPower(Math.min(100, Math.round((prev - targetTemp) * 30)));
                        } else if (prev < targetTemp - 0.5) {
                            setCoolerPower(0);
                        } else {
                            setCoolerPower(Math.round(Math.max(0, (prev - targetTemp + 0.2) * 20)));
                        }
                    }

                    // Симуляция: брожение выделяет тепло, кулер охлаждает
                    const fermentHeat = currentStage === 0 ? 0.15 : (currentStage === 1 ? 0.05 : 0);
                    const coolerEffect = (coolerPower / 100) * 0.3;
                    const ambient = 0.01 * (22 - prev); // к комнатной
                    const newVal = prev + fermentHeat - coolerEffect + ambient;

                    const now = new Date();
                    setHistory(h => [...h.slice(-120), {
                        time: now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
                        temp: parseFloat(newVal.toFixed(1)),
                        target: targetTemp
                    }]);

                    return parseFloat(newVal.toFixed(1));
                });
            }, 1000);
        }
        return () => clearInterval(interval);
    }, [isStarted, targetTemp, coolerPower, coolerAuto, currentStage]);

    // Форматирование времени
    const formatElapsed = (seconds) => {
        const days = Math.floor(seconds / 86400);
        const hours = Math.floor((seconds % 86400) / 3600);
        const mins = Math.floor((seconds % 3600) / 60);
        const secs = seconds % 60;
        if (days > 0) return `${days}д ${hours}ч ${mins}м`;
        if (hours > 0) return `${hours}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    };

    // Расчёт ABV
    const calculateABV = (og, fg) => {
        if (!og || !fg || fg >= og) return null;
        return ((og - fg) * 131.25).toFixed(1);
    };

    // Получить последний OG и FG
    const latestOG = measurements.find(m => m.og)?.og || null;
    const latestFG = [...measurements].reverse().find(m => m.fg)?.fg || null;
    const currentABV = calculateABV(latestOG, latestFG);

    // Добавить замер
    const addMeasurement = () => {
        const m = {
            id: Date.now(),
            date: new Date().toISOString().slice(0, 10),
            og: newMeasurement.og ? parseFloat(newMeasurement.og) : null,
            fg: newMeasurement.fg ? parseFloat(newMeasurement.fg) : null,
            note: newMeasurement.note
        };
        setMeasurements(prev => [...prev, m]);
        setNewMeasurement({ og: '', fg: '', note: '' });
        setShowAddMeasurement(false);
    };

    const deleteMeasurement = (id) => {
        setMeasurements(prev => prev.filter(m => m.id !== id));
    };

    // Смена стадии
    const advanceStage = () => {
        if (currentStage < STAGES.length - 1) {
            const next = currentStage + 1;
            setCurrentStage(next);
            setTargetTemp(STAGES[next].tempRange[1]);
        }
    };

    const handleStartStop = () => {
        if (!isStarted) {
            setTargetTemp(STAGES[currentStage].tempRange[1]);
        }
        setIsStarted(!isStarted);
    };

    // Зум графика
    const zoomIn = () => {
        const mid = (graphYMin + graphYMax) / 2;
        const range = (graphYMax - graphYMin) / 2;
        const newRange = Math.max(range * 0.7, 3);
        setGraphYMin(Math.round(mid - newRange));
        setGraphYMax(Math.round(mid + newRange));
    };
    const zoomOut = () => {
        const mid = (graphYMin + graphYMax) / 2;
        const range = (graphYMax - graphYMin) / 2;
        const newRange = Math.min(range * 1.4, 40);
        setGraphYMin(Math.round(mid - newRange));
        setGraphYMax(Math.round(mid + newRange));
    };
    const zoomReset = () => { setGraphYMin(-5); setGraphYMax(35); };

    const stage = STAGES[currentStage];

    return (
        <div style={{ padding: '2rem', maxWidth: '1400px', margin: '0 auto' }}>
            {/* Header */}
            <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <button
                        onClick={() => navigate('/')}
                        aria-label="Назад на главную"
                        style={{
                            background: 'none', border: '1px solid var(--border-color)',
                            color: 'var(--text-primary)', padding: '0.5rem', borderRadius: '4px',
                            display: 'flex', alignItems: 'center', justifyContent: 'center'
                        }}
                    >
                        <ArrowLeft size={20} aria-hidden="true" />
                    </button>
                    <h1 style={{ margin: 0, fontSize: '1.8rem', color: 'var(--primary-color)' }}>
                        <Beaker size={28} style={{ verticalAlign: 'middle', marginRight: '0.5rem' }} aria-hidden="true" />
                        Брожение
                    </h1>
                </div>
                <div className="text-mono" style={{
                    fontSize: '1.5rem', padding: '0.5rem 1.5rem', border: '2px solid var(--primary-color)',
                    borderRadius: '30px', color: 'var(--primary-color)'
                }}>
                    <Clock size={18} style={{ verticalAlign: 'middle', marginRight: '0.3rem' }} aria-hidden="true" />
                    {formatElapsed(elapsedSeconds)}
                </div>
            </header>

            {/* Main 2-column layout */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: '1.5rem', alignItems: 'start' }}>
                {/* Left column */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                    {/* Top info cards */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem' }}>
                        {/* Temperature card */}
                        <div className="industrial-panel" style={{ padding: '1.5rem', textAlign: 'center' }}>
                            <div style={{ fontSize: '0.75rem', letterSpacing: '0.1em', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
                                ТЕМПЕРАТУРА
                            </div>
                            <div className="text-mono" style={{
                                fontSize: '3rem', fontWeight: 700,
                                color: Math.abs(temperature - targetTemp) > 2 ? 'var(--accent-red)' : 'var(--text-primary)'
                            }}>
                                {temperature.toFixed(1)}°
                            </div>
                            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                                ЦЕЛЬ: {targetTemp}°C
                            </div>
                            {isStarted && (
                                <div style={{
                                    marginTop: '0.5rem', fontSize: '0.75rem', fontWeight: 'bold',
                                    padding: '0.2rem 0.5rem', borderRadius: '12px', display: 'inline-block',
                                    background: Math.abs(temperature - targetTemp) <= 0.5 ? 'rgba(76,175,80,0.2)' : 'rgba(255,152,0,0.2)',
                                    color: Math.abs(temperature - targetTemp) <= 0.5 ? 'var(--accent-green)' : 'var(--primary-color)'
                                }}>
                                    {Math.abs(temperature - targetTemp) <= 0.5 ? '✓ СТАБИЛЬНО' : temperature > targetTemp ? '❄ ОХЛАЖДЕНИЕ' : '🔥 НАГРЕВ'}
                                </div>
                            )}
                        </div>

                        {/* Cooler card */}
                        <div className="industrial-panel" style={{ padding: '1.5rem', textAlign: 'center' }}>
                            <div style={{ fontSize: '0.75rem', letterSpacing: '0.1em', color: 'var(--text-secondary)', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.3rem' }}>
                                ОХЛАЖДЕНИЕ <Snowflake size={14} color="var(--accent-blue)" />
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', justifyContent: 'center' }}>
                                <input
                                    type="range" min={0} max={100}
                                    value={coolerPower}
                                    onChange={e => { setCoolerPower(parseInt(e.target.value)); setCoolerAuto(false); }}
                                    disabled={!isStarted}
                                    style={{
                                        width: '100%', accentColor: 'var(--accent-blue)',
                                        opacity: isStarted ? 1 : 0.3
                                    }}
                                />
                            </div>
                            <div className="text-mono" style={{ fontSize: '1.5rem', marginTop: '0.3rem' }}>{coolerPower}%</div>
                            <button
                                onClick={() => setCoolerAuto(!coolerAuto)}
                                disabled={!isStarted}
                                style={{
                                    marginTop: '0.3rem', fontSize: '0.7rem', padding: '0.2rem 0.8rem',
                                    borderRadius: '12px', border: 'none', cursor: 'pointer',
                                    background: coolerAuto ? 'rgba(3, 169, 244, 0.2)' : 'rgba(255,255,255,0.05)',
                                    color: coolerAuto ? 'var(--accent-blue)' : 'var(--text-secondary)',
                                    opacity: isStarted ? 1 : 0.4
                                }}
                            >
                                {coolerAuto ? 'АВТО' : 'РУЧНОЙ'}
                            </button>
                        </div>

                        {/* ABV Card */}
                        <div className="industrial-panel" style={{ padding: '1.5rem', textAlign: 'center' }}>
                            <div style={{ fontSize: '0.75rem', letterSpacing: '0.1em', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
                                РАСЧЁТ ABV
                            </div>
                            <div className="text-mono" style={{
                                fontSize: '2.5rem', fontWeight: 700,
                                color: currentABV ? 'var(--accent-green)' : 'var(--text-secondary)'
                            }}>
                                {currentABV ? `${currentABV}%` : '—'}
                            </div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.3rem' }}>
                                {latestOG ? `OG: ${latestOG.toFixed(3)}` : 'OG: —'}
                                {' / '}
                                {latestFG ? `FG: ${latestFG.toFixed(3)}` : 'FG: —'}
                            </div>
                        </div>
                    </div>

                    {/* Temperature Chart */}
                    <div className="industrial-panel" style={{ padding: '1.5rem', height: '320px', position: 'relative' }}>
                        <div style={{
                            position: 'absolute', top: '0.5rem', right: '0.5rem', zIndex: 10,
                            display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.7rem', color: 'var(--text-secondary)'
                        }}>
                            <span>МАСШТАБ</span>
                            <button onClick={zoomIn} style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid #444', borderRadius: '4px', padding: '0.2rem', cursor: 'pointer', display: 'flex' }}>
                                <ZoomIn size={14} color="var(--text-secondary)" />
                            </button>
                            <button onClick={zoomOut} style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid #444', borderRadius: '4px', padding: '0.2rem', cursor: 'pointer', display: 'flex' }}>
                                <ZoomOut size={14} color="var(--text-secondary)" />
                            </button>
                            <button onClick={zoomReset} style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid #444', borderRadius: '4px', padding: '0.2rem 0.5rem', cursor: 'pointer', fontSize: '0.65rem', color: 'var(--text-secondary)' }}>
                                СБРОС
                            </button>
                        </div>
                        {mounted && (
                            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                                <LineChart data={history}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                                    <XAxis dataKey="time" stroke="#666" fontSize={10} interval="preserveStartEnd" />
                                    <YAxis domain={[graphYMin, graphYMax]} stroke="#666" fontSize={12} />
                                    <Tooltip
                                        contentStyle={{ background: '#1e1e1e', border: '1px solid #444', borderRadius: '4px' }}
                                        labelStyle={{ color: '#999' }}
                                    />
                                    <ReferenceLine y={targetTemp} stroke="var(--accent-blue)" strokeDasharray="5 5" label={{ value: `Цель ${targetTemp}°C`, fill: 'var(--accent-blue)', fontSize: 11, position: 'insideTopLeft' }} />
                                    <Line type="monotone" dataKey="temp" stroke="var(--primary-color)" strokeWidth={2} dot={false} name="Температура" />
                                </LineChart>
                            </ResponsiveContainer>
                        )}
                    </div>

                    {/* Measurement diary */}
                    <div className="industrial-panel" style={{ padding: '1.5rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                            <h3 style={{ margin: 0, fontSize: '1rem', letterSpacing: '0.05em', color: 'var(--text-secondary)' }}>
                                📝 ДНЕВНИК ЗАМЕРОВ
                            </h3>
                            <button
                                onClick={() => setShowAddMeasurement(!showAddMeasurement)}
                                style={{
                                    background: 'rgba(255,152,0,0.1)', border: '1px solid var(--primary-color)',
                                    borderRadius: '4px', padding: '0.4rem 0.8rem', cursor: 'pointer',
                                    color: 'var(--primary-color)', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.3rem'
                                }}
                            >
                                <Plus size={14} /> Добавить
                            </button>
                        </div>

                        {/* Add measurement form */}
                        <AnimatePresence>
                            {showAddMeasurement && (
                                <motion.div
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: 'auto', opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    style={{ overflow: 'hidden', marginBottom: '1rem' }}
                                >
                                    <div style={{
                                        display: 'grid', gridTemplateColumns: '1fr 1fr 2fr auto', gap: '0.5rem',
                                        padding: '1rem', background: 'rgba(255,255,255,0.02)', borderRadius: '4px',
                                        border: '1px solid #333'
                                    }}>
                                        <div>
                                            <label style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>OG</label>
                                            <input
                                                type="number" step="0.001" placeholder="1.050"
                                                value={newMeasurement.og}
                                                onChange={e => setNewMeasurement(p => ({ ...p, og: e.target.value }))}
                                                style={{
                                                    width: '100%', padding: '0.5rem', background: 'var(--surface-lighter)',
                                                    border: '1px solid #444', borderRadius: '4px', color: 'var(--text-primary)',
                                                    fontSize: '0.9rem', fontFamily: 'var(--font-mono)'
                                                }}
                                            />
                                        </div>
                                        <div>
                                            <label style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>FG</label>
                                            <input
                                                type="number" step="0.001" placeholder="1.010"
                                                value={newMeasurement.fg}
                                                onChange={e => setNewMeasurement(p => ({ ...p, fg: e.target.value }))}
                                                style={{
                                                    width: '100%', padding: '0.5rem', background: 'var(--surface-lighter)',
                                                    border: '1px solid #444', borderRadius: '4px', color: 'var(--text-primary)',
                                                    fontSize: '0.9rem', fontFamily: 'var(--font-mono)'
                                                }}
                                            />
                                        </div>
                                        <div>
                                            <label style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>Заметка</label>
                                            <input
                                                type="text" placeholder="Активное брожение..."
                                                value={newMeasurement.note}
                                                onChange={e => setNewMeasurement(p => ({ ...p, note: e.target.value }))}
                                                style={{
                                                    width: '100%', padding: '0.5rem', background: 'var(--surface-lighter)',
                                                    border: '1px solid #444', borderRadius: '4px', color: 'var(--text-primary)',
                                                    fontSize: '0.9rem'
                                                }}
                                            />
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                                            <button
                                                onClick={addMeasurement}
                                                style={{
                                                    padding: '0.5rem 1rem', background: 'var(--accent-green)',
                                                    border: 'none', borderRadius: '4px', color: '#000',
                                                    fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.3rem'
                                                }}
                                            >
                                                <Save size={14} /> OK
                                            </button>
                                        </div>
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>

                        {/* Measurements table */}
                        <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                                <thead>
                                    <tr style={{ borderBottom: '1px solid #333' }}>
                                        <th style={{ padding: '0.5rem', textAlign: 'left', color: 'var(--text-secondary)', fontWeight: 500 }}>Дата</th>
                                        <th style={{ padding: '0.5rem', textAlign: 'center', color: 'var(--text-secondary)', fontWeight: 500 }}>OG</th>
                                        <th style={{ padding: '0.5rem', textAlign: 'center', color: 'var(--text-secondary)', fontWeight: 500 }}>FG</th>
                                        <th style={{ padding: '0.5rem', textAlign: 'center', color: 'var(--text-secondary)', fontWeight: 500 }}>ABV</th>
                                        <th style={{ padding: '0.5rem', textAlign: 'left', color: 'var(--text-secondary)', fontWeight: 500 }}>Заметка</th>
                                        <th style={{ padding: '0.5rem', width: '30px' }}></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {measurements.map(m => {
                                        const abv = calculateABV(m.og, m.fg);
                                        return (
                                            <tr key={m.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                                                <td style={{ padding: '0.5rem' }} className="text-mono">{m.date}</td>
                                                <td style={{ padding: '0.5rem', textAlign: 'center', color: 'var(--primary-color)' }} className="text-mono">
                                                    {m.og ? m.og.toFixed(3) : '—'}
                                                </td>
                                                <td style={{ padding: '0.5rem', textAlign: 'center', color: 'var(--accent-blue)' }} className="text-mono">
                                                    {m.fg ? m.fg.toFixed(3) : '—'}
                                                </td>
                                                <td style={{ padding: '0.5rem', textAlign: 'center', color: abv ? 'var(--accent-green)' : 'var(--text-secondary)', fontWeight: abv ? 'bold' : 'normal' }} className="text-mono">
                                                    {abv ? `${abv}%` : '—'}
                                                </td>
                                                <td style={{ padding: '0.5rem', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
                                                    {m.note || '—'}
                                                </td>
                                                <td style={{ padding: '0.5rem' }}>
                                                    <button
                                                        onClick={() => deleteMeasurement(m.id)}
                                                        style={{
                                                            background: 'none', border: 'none', cursor: 'pointer',
                                                            color: 'var(--text-secondary)', padding: '0.2rem',
                                                            opacity: 0.5, transition: 'opacity 0.2s'
                                                        }}
                                                        onMouseEnter={e => e.currentTarget.style.opacity = 1}
                                                        onMouseLeave={e => e.currentTarget.style.opacity = 0.5}
                                                    >
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

                {/* Right column */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                    {/* Stages */}
                    <div className="industrial-panel" style={{ padding: '1.5rem' }}>
                        <h3 style={{ margin: '0 0 1rem', fontSize: '0.85rem', letterSpacing: '0.1em', color: 'var(--text-secondary)' }}>
                            СТАДИИ БРОЖЕНИЯ
                        </h3>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                            {STAGES.map((s, idx) => {
                                const isActive = idx === currentStage;
                                const isComplete = idx < currentStage;
                                return (
                                    <div key={s.id} style={{
                                        display: 'flex', alignItems: 'center', gap: '0.8rem',
                                        padding: '0.8rem',
                                        background: isActive ? `${s.color}15` : (isComplete ? 'rgba(76,175,80,0.05)' : 'transparent'),
                                        border: isActive ? `1px solid ${s.color}` : (isComplete ? '1px solid var(--accent-green)' : '1px solid #333'),
                                        borderRadius: '4px',
                                        transition: 'all 0.3s ease',
                                        cursor: (!isStarted && !isComplete) ? 'pointer' : 'default',
                                        opacity: isComplete ? 0.6 : 1
                                    }}
                                        onClick={() => { if (!isStarted && !isComplete) { setCurrentStage(idx); setTargetTemp(s.tempRange[1]); } }}
                                    >
                                        <div style={{
                                            width: '10px', height: '10px', borderRadius: '50%',
                                            background: isComplete ? 'var(--accent-green)' : (isActive ? s.color : '#444'),
                                            boxShadow: isActive ? `0 0 8px ${s.color}` : 'none'
                                        }} />
                                        <div style={{ flex: 1 }}>
                                            <div style={{ fontSize: '0.9rem', fontWeight: isActive ? 'bold' : 'normal', color: isComplete ? 'var(--text-secondary)' : 'inherit' }}>
                                                {s.name}
                                            </div>
                                            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                                                {s.tempRange[0]}—{s.tempRange[1]}°C · {s.daysTypical}
                                            </div>
                                        </div>
                                        {isComplete && <CheckCircle size={18} color="var(--accent-green)" style={{ flexShrink: 0 }} />}
                                    </div>
                                );
                            })}
                        </div>
                        {isStarted && currentStage < STAGES.length - 1 && (
                            <button
                                onClick={advanceStage}
                                style={{
                                    marginTop: '1rem', width: '100%', padding: '0.7rem',
                                    borderRadius: '6px', border: '1px solid var(--primary-color)',
                                    background: 'rgba(255,152,0,0.1)', color: 'var(--primary-color)',
                                    fontWeight: 'bold', fontSize: '0.85rem', cursor: 'pointer',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem'
                                }}
                            >
                                <ChevronDown size={16} />
                                Перейти к: {STAGES[currentStage + 1].name}
                            </button>
                        )}
                    </div>

                    {/* Target temperature control */}
                    <div className="industrial-panel" style={{ padding: '1.5rem' }}>
                        <h3 style={{ margin: '0 0 1rem', fontSize: '0.85rem', letterSpacing: '0.1em', color: 'var(--text-secondary)' }}>
                            <Thermometer size={14} style={{ verticalAlign: 'middle', marginRight: '0.3rem' }} />
                            ЦЕЛЕВАЯ ТЕМПЕРАТУРА
                        </h3>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <button
                                onClick={() => setTargetTemp(prev => Math.max(-2, prev - 1))}
                                disabled={!isStarted}
                                style={{
                                    width: '40px', height: '40px', borderRadius: '50%',
                                    border: '1px solid #444', background: 'rgba(255,255,255,0.05)',
                                    color: 'var(--text-primary)', fontSize: '1.2rem', cursor: 'pointer',
                                    opacity: isStarted ? 1 : 0.3
                                }}
                            >−</button>
                            <div className="text-mono" style={{
                                flex: 1, textAlign: 'center', fontSize: '2rem', fontWeight: 'bold',
                                color: 'var(--accent-blue)'
                            }}>
                                {targetTemp}°C
                            </div>
                            <button
                                onClick={() => setTargetTemp(prev => Math.min(30, prev + 1))}
                                disabled={!isStarted}
                                style={{
                                    width: '40px', height: '40px', borderRadius: '50%',
                                    border: '1px solid #444', background: 'rgba(255,255,255,0.05)',
                                    color: 'var(--text-primary)', fontSize: '1.2rem', cursor: 'pointer',
                                    opacity: isStarted ? 1 : 0.3
                                }}
                            >+</button>
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textAlign: 'center', marginTop: '0.5rem' }}>
                            Рекомендуемо: {stage.tempRange[0]}—{stage.tempRange[1]}°C
                        </div>
                    </div>

                    {/* Start/Stop */}
                    <div className="industrial-panel" style={{ padding: '1.5rem' }}>
                        <button
                            onClick={handleStartStop}
                            style={{
                                width: '100%', padding: '1.5rem', borderRadius: '8px', border: 'none',
                                background: isStarted ? 'var(--accent-red)' : 'var(--accent-green)',
                                color: '#000', fontWeight: 'bold', fontSize: '1.2rem',
                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1rem',
                                cursor: 'pointer'
                            }}
                        >
                            {isStarted ? <><Pause size={24} aria-hidden="true" /> СТОП</> : <><Play size={24} aria-hidden="true" /> СТАРТ БРОЖЕНИЯ</>}
                        </button>
                    </div>

                    {/* Info panel */}
                    {isStarted && (
                        <motion.div
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="industrial-panel"
                            style={{ padding: '1rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}
                        >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                                <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: stage.color, animation: 'pulse 2s infinite' }} />
                                <span style={{ fontWeight: 'bold', color: stage.color }}>{stage.name}</span>
                            </div>
                            <div>
                                Целевой диапазон: {stage.tempRange[0]}—{stage.tempRange[1]}°C
                            </div>
                            <div>
                                Типичная длительность: {stage.daysTypical}
                            </div>
                            <div style={{ marginTop: '0.3rem' }}>
                                Охлаждение: {coolerAuto ? 'автоматическое' : 'ручное'} ({coolerPower}%)
                            </div>
                        </motion.div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default Fermentation;
