import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import {
    ArrowLeft, Play, Pause, Zap, Droplets, Plus, Trash2,
    Clock, FlaskConical, ZoomIn, ZoomOut, Thermometer,
    ChevronRight, AlertTriangle, CheckCircle, ShieldCheck
} from 'lucide-react';
import {
    LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
    ResponsiveContainer, ReferenceLine, Legend
} from 'recharts';

// Фазы дистилляции
const PHASES = [
    { id: 'warmup', name: 'Разгон', color: '#ff9800', description: 'Нагрев до рабочей температуры', targetTemp: 78 },
    { id: 'heads', name: 'Головы', color: '#f44336', description: 'Отбор летучих фракций', targetTemp: 68 },
    { id: 'hearts', name: 'Тело', color: '#4caf50', description: 'Отбор основного продукта', targetTemp: 78 },
    { id: 'tails', name: 'Хвосты', color: '#9c27b0', description: 'Сивушные масла', targetTemp: 85 },
];

const Distillation = () => {
    const navigate = useNavigate();

    // Основное состояние
    const [isStarted, setIsStarted] = useState(false);
    const [currentPhase, setCurrentPhase] = useState(0);
    const [heaterPower, setHeaterPower] = useState(100);
    const [isHeaterCovered, setIsHeaterCovered] = useState(false);
    const [elapsedSeconds, setElapsedSeconds] = useState(0);

    // Температуры (несколько точек)
    const [tempBoiler, setTempBoiler] = useState(25.0);   // Куб
    const [tempColumn, setTempColumn] = useState(25.0);    // Верх колонны
    const [tempOutput, setTempOutput] = useState(20.0);    // Выход продукта

    // Охлаждение
    const [coolingPower, setCoolingPower] = useState(50);

    // График
    const [history, setHistory] = useState([]);
    const [mounted, setMounted] = useState(false);
    const [graphYMin, setGraphYMin] = useState(0);
    const [graphYMax, setGraphYMax] = useState(100);

    // Лог фракций
    const [fractions, setFractions] = useState([]);
    const [showAddFraction, setShowAddFraction] = useState(false);
    const [newFraction, setNewFraction] = useState({ volume: '', abv: '', note: '' });

    // Скорость отбора
    const [collectSpeed, setCollectSpeed] = useState(0);

    useEffect(() => {
        setMounted(true);
    }, []);

    // Симуляция
    useEffect(() => {
        let interval;
        if (isStarted) {
            interval = setInterval(() => {
                setElapsedSeconds(prev => prev + 1);

                // Симуляция температур
                setTempBoiler(prev => {
                    const powerEffect = (heaterPower / 100) * 0.5;
                    const loss = (prev - 20) * 0.003;
                    return parseFloat(Math.min(prev + powerEffect - loss, 100).toFixed(1));
                });

                setTempColumn(prev => {
                    // Верх колонны следует за кубом с задержкой
                    const target = tempBoiler * 0.85;
                    const diff = target - prev;
                    return parseFloat((prev + diff * 0.05).toFixed(1));
                });

                setTempOutput(prev => {
                    // Выход зависит от охлаждения
                    const incoming = tempColumn * 0.4;
                    const cooling = (coolingPower / 100) * 0.3;
                    const target = incoming - cooling * 20 + 15;
                    const diff = target - prev;
                    return parseFloat(Math.max(15, prev + diff * 0.08).toFixed(1));
                });

                // Скорость отбора (мл/мин) — растёт когда куб выше 78°C
                setCollectSpeed(tempBoiler > 78 ? Math.round((tempBoiler - 78) * 8 + Math.random() * 3) : 0);

                // Запись в историю
                const now = new Date();
                setHistory(h => [...h.slice(-120), {
                    time: now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
                    boiler: tempBoiler,
                    column: tempColumn,
                    output: tempOutput
                }]);
            }, 1000);
        }
        return () => clearInterval(interval);
    }, [isStarted, heaterPower, tempBoiler, tempColumn, tempOutput, coolingPower]);

    // Форматирование
    const formatTime = (seconds) => {
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = seconds % 60;
        if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
        return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    };

    // Общий объём
    const totalVolume = fractions.reduce((sum, f) => sum + (f.volume || 0), 0);
    const headsVolume = fractions.filter(f => f.phase === 'heads').reduce((s, f) => s + (f.volume || 0), 0);
    const heartsVolume = fractions.filter(f => f.phase === 'hearts').reduce((s, f) => s + (f.volume || 0), 0);
    const tailsVolume = fractions.filter(f => f.phase === 'tails').reduce((s, f) => s + (f.volume || 0), 0);

    // Добавление фракции
    const addFraction = () => {
        const f = {
            id: Date.now(),
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            phase: PHASES[currentPhase].id,
            phaseName: PHASES[currentPhase].name,
            phaseColor: PHASES[currentPhase].color,
            volume: newFraction.volume ? parseFloat(newFraction.volume) : 0,
            abv: newFraction.abv ? parseFloat(newFraction.abv) : null,
            tempBoiler: tempBoiler,
            note: newFraction.note
        };
        setFractions(prev => [...prev, f]);
        setNewFraction({ volume: '', abv: '', note: '' });
        setShowAddFraction(false);
    };

    const deleteFraction = (id) => {
        setFractions(prev => prev.filter(f => f.id !== id));
    };

    // Смена фазы
    const advancePhase = () => {
        if (currentPhase < PHASES.length - 1) {
            setCurrentPhase(prev => prev + 1);
        }
    };

    const handleStartStop = () => {
        setIsStarted(!isStarted);
    };

    // Зум
    const zoomIn = () => {
        const mid = (graphYMin + graphYMax) / 2;
        const range = (graphYMax - graphYMin) / 2;
        const newRange = Math.max(range * 0.7, 5);
        setGraphYMin(Math.round(mid - newRange));
        setGraphYMax(Math.round(mid + newRange));
    };
    const zoomOut = () => {
        const mid = (graphYMin + graphYMax) / 2;
        const range = (graphYMax - graphYMin) / 2;
        const newRange = Math.min(range * 1.4, 60);
        setGraphYMin(Math.round(mid - newRange));
        setGraphYMax(Math.round(mid + newRange));
    };
    const zoomReset = () => { setGraphYMin(0); setGraphYMax(100); };

    const phase = PHASES[currentPhase];

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
                    <h1 style={{ margin: 0, fontSize: '1.8rem', color: 'var(--accent-blue)' }}>
                        <FlaskConical size={28} style={{ verticalAlign: 'middle', marginRight: '0.5rem' }} aria-hidden="true" />
                        Дистилляция
                    </h1>
                </div>
                <div className="text-mono" style={{
                    fontSize: '1.5rem', padding: '0.5rem 1.5rem', border: '2px solid var(--accent-blue)',
                    borderRadius: '30px', color: 'var(--accent-blue)'
                }}>
                    <Clock size={18} style={{ verticalAlign: 'middle', marginRight: '0.3rem' }} aria-hidden="true" />
                    {formatTime(elapsedSeconds)}
                </div>
            </header>

            {/* 2-column layout */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: '1.5rem', alignItems: 'start' }}>
                {/* Left column */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                    {/* Temperature cards — 3 sensors */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem' }}>
                        {/* Куб */}
                        <div className="industrial-panel" style={{ padding: '1.2rem', textAlign: 'center', borderTop: '3px solid #ff9800' }}>
                            <div style={{ fontSize: '0.7rem', letterSpacing: '0.1em', color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>
                                🔥 КУБ
                            </div>
                            <div className="text-mono" style={{ fontSize: '2.5rem', fontWeight: 700, color: tempBoiler > 90 ? 'var(--accent-red)' : 'var(--primary-color)' }}>
                                {tempBoiler.toFixed(1)}°
                            </div>
                        </div>

                        {/* Верх колонны */}
                        <div className="industrial-panel" style={{ padding: '1.2rem', textAlign: 'center', borderTop: '3px solid var(--accent-blue)' }}>
                            <div style={{ fontSize: '0.7rem', letterSpacing: '0.1em', color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>
                                🌡 КОЛОННА
                            </div>
                            <div className="text-mono" style={{ fontSize: '2.5rem', fontWeight: 700, color: 'var(--accent-blue)' }}>
                                {tempColumn.toFixed(1)}°
                            </div>
                        </div>

                        {/* Выход */}
                        <div className="industrial-panel" style={{ padding: '1.2rem', textAlign: 'center', borderTop: '3px solid var(--accent-green)' }}>
                            <div style={{ fontSize: '0.7rem', letterSpacing: '0.1em', color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>
                                💧 ВЫХОД
                            </div>
                            <div className="text-mono" style={{ fontSize: '2.5rem', fontWeight: 700, color: 'var(--accent-green)' }}>
                                {tempOutput.toFixed(1)}°
                            </div>
                        </div>
                    </div>

                    {/* Control row: Heater + Cooling + Speed */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }}>
                        {/* Heater */}
                        <div className="industrial-panel" style={{ padding: '1.2rem' }}>
                            <div style={{ fontSize: '0.7rem', letterSpacing: '0.1em', color: 'var(--text-secondary)', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                                ТЭН <Zap size={12} color="var(--primary-color)" />
                            </div>
                            <input
                                type="range" min={0} max={100} value={heaterPower}
                                onChange={e => setHeaterPower(parseInt(e.target.value))}
                                disabled={!isStarted}
                                style={{ width: '100%', accentColor: 'var(--primary-color)', opacity: isStarted ? 1 : 0.3 }}
                            />
                            <div className="text-mono" style={{ textAlign: 'center', fontSize: '1.2rem' }}>{heaterPower}%</div>
                        </div>

                        {/* Cooling */}
                        <div className="industrial-panel" style={{ padding: '1.2rem' }}>
                            <div style={{ fontSize: '0.7rem', letterSpacing: '0.1em', color: 'var(--text-secondary)', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                                ОХЛАЖДЕНИЕ <Droplets size={12} color="var(--accent-blue)" />
                            </div>
                            <input
                                type="range" min={0} max={100} value={coolingPower}
                                onChange={e => setCoolingPower(parseInt(e.target.value))}
                                disabled={!isStarted}
                                style={{ width: '100%', accentColor: 'var(--accent-blue)', opacity: isStarted ? 1 : 0.3 }}
                            />
                            <div className="text-mono" style={{ textAlign: 'center', fontSize: '1.2rem' }}>{coolingPower}%</div>
                        </div>

                        {/* Speed */}
                        <div className="industrial-panel" style={{ padding: '1.2rem', textAlign: 'center' }}>
                            <div style={{ fontSize: '0.7rem', letterSpacing: '0.1em', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
                                СКОРОСТЬ ОТБОРА
                            </div>
                            <div className="text-mono" style={{ fontSize: '2rem', fontWeight: 700, color: collectSpeed > 0 ? 'var(--accent-green)' : 'var(--text-secondary)' }}>
                                {collectSpeed}
                            </div>
                            <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>мл/мин</div>
                        </div>
                    </div>

                    {/* Chart */}
                    <div className="industrial-panel" style={{ padding: '1.5rem', height: '300px', position: 'relative' }}>
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
                                    <Line type="monotone" dataKey="boiler" stroke="#ff9800" strokeWidth={2} dot={false} name="Куб" />
                                    <Line type="monotone" dataKey="column" stroke="#03a9f4" strokeWidth={2} dot={false} name="Колонна" />
                                    <Line type="monotone" dataKey="output" stroke="#4caf50" strokeWidth={1.5} dot={false} name="Выход" />
                                    <Legend wrapperStyle={{ fontSize: '0.75rem' }} />
                                </LineChart>
                            </ResponsiveContainer>
                        )}
                    </div>

                    {/* Fraction log */}
                    <div className="industrial-panel" style={{ padding: '1.5rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                            <h3 style={{ margin: 0, fontSize: '1rem', letterSpacing: '0.05em', color: 'var(--text-secondary)' }}>
                                🧪 ЛОГ ОТБОРА
                            </h3>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                                    Всего: <span className="text-mono" style={{ color: 'var(--text-primary)' }}>{totalVolume} мл</span>
                                </span>
                                <button
                                    onClick={() => setShowAddFraction(!showAddFraction)}
                                    disabled={!isStarted}
                                    style={{
                                        background: 'rgba(3,169,244,0.1)', border: '1px solid var(--accent-blue)',
                                        borderRadius: '4px', padding: '0.4rem 0.8rem', cursor: isStarted ? 'pointer' : 'not-allowed',
                                        color: 'var(--accent-blue)', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.3rem',
                                        opacity: isStarted ? 1 : 0.4
                                    }}
                                >
                                    <Plus size={14} /> Записать
                                </button>
                            </div>
                        </div>

                        {/* Add fraction form */}
                        <AnimatePresence>
                            {showAddFraction && (
                                <motion.div
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: 'auto', opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    style={{ overflow: 'hidden', marginBottom: '1rem' }}
                                >
                                    <div style={{
                                        display: 'grid', gridTemplateColumns: '100px 100px 1fr auto', gap: '0.5rem',
                                        padding: '1rem', background: 'rgba(255,255,255,0.02)', borderRadius: '4px', border: '1px solid #333'
                                    }}>
                                        <div>
                                            <label style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>Объём (мл)</label>
                                            <input
                                                type="number" placeholder="250"
                                                value={newFraction.volume}
                                                onChange={e => setNewFraction(p => ({ ...p, volume: e.target.value }))}
                                                style={{ width: '100%', padding: '0.5rem', background: 'var(--surface-lighter)', border: '1px solid #444', borderRadius: '4px', color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}
                                            />
                                        </div>
                                        <div>
                                            <label style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>ABV %</label>
                                            <input
                                                type="number" step="0.1" placeholder="65"
                                                value={newFraction.abv}
                                                onChange={e => setNewFraction(p => ({ ...p, abv: e.target.value }))}
                                                style={{ width: '100%', padding: '0.5rem', background: 'var(--surface-lighter)', border: '1px solid #444', borderRadius: '4px', color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}
                                            />
                                        </div>
                                        <div>
                                            <label style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>Заметка</label>
                                            <input
                                                type="text" placeholder="Прозрачный, без запаха..."
                                                value={newFraction.note}
                                                onChange={e => setNewFraction(p => ({ ...p, note: e.target.value }))}
                                                style={{ width: '100%', padding: '0.5rem', background: 'var(--surface-lighter)', border: '1px solid #444', borderRadius: '4px', color: 'var(--text-primary)' }}
                                            />
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                                            <button onClick={addFraction} style={{
                                                padding: '0.5rem 1rem', background: 'var(--accent-green)', border: 'none', borderRadius: '4px',
                                                color: '#000', fontWeight: 'bold', cursor: 'pointer'
                                            }}>OK</button>
                                        </div>
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>

                        {/* Fractions table */}
                        <div style={{ overflowX: 'auto', maxHeight: '250px', overflowY: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                                <thead>
                                    <tr style={{ borderBottom: '1px solid #333', position: 'sticky', top: 0, background: 'var(--surface-color)' }}>
                                        <th style={{ padding: '0.4rem', textAlign: 'left', color: 'var(--text-secondary)', fontWeight: 500 }}>Время</th>
                                        <th style={{ padding: '0.4rem', textAlign: 'center', color: 'var(--text-secondary)', fontWeight: 500 }}>Фаза</th>
                                        <th style={{ padding: '0.4rem', textAlign: 'center', color: 'var(--text-secondary)', fontWeight: 500 }}>Объём</th>
                                        <th style={{ padding: '0.4rem', textAlign: 'center', color: 'var(--text-secondary)', fontWeight: 500 }}>ABV</th>
                                        <th style={{ padding: '0.4rem', textAlign: 'center', color: 'var(--text-secondary)', fontWeight: 500 }}>T куба</th>
                                        <th style={{ padding: '0.4rem', textAlign: 'left', color: 'var(--text-secondary)', fontWeight: 500 }}>Заметка</th>
                                        <th style={{ padding: '0.4rem', width: '25px' }}></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {fractions.length === 0 && (
                                        <tr>
                                            <td colSpan={7} style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                                                Нет записей. Начните отбор и нажмите «Записать».
                                            </td>
                                        </tr>
                                    )}
                                    {fractions.map(f => (
                                        <tr key={f.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                                            <td style={{ padding: '0.4rem' }} className="text-mono">{f.time}</td>
                                            <td style={{ padding: '0.4rem', textAlign: 'center' }}>
                                                <span style={{
                                                    fontSize: '0.7rem', padding: '0.15rem 0.5rem', borderRadius: '10px',
                                                    background: `${f.phaseColor}20`, color: f.phaseColor, fontWeight: 'bold'
                                                }}>{f.phaseName}</span>
                                            </td>
                                            <td style={{ padding: '0.4rem', textAlign: 'center' }} className="text-mono">{f.volume} мл</td>
                                            <td style={{ padding: '0.4rem', textAlign: 'center', color: 'var(--accent-green)' }} className="text-mono">
                                                {f.abv ? `${f.abv}%` : '—'}
                                            </td>
                                            <td style={{ padding: '0.4rem', textAlign: 'center', color: 'var(--primary-color)' }} className="text-mono">
                                                {f.tempBoiler.toFixed(1)}°
                                            </td>
                                            <td style={{ padding: '0.4rem', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{f.note || '—'}</td>
                                            <td style={{ padding: '0.4rem' }}>
                                                <button onClick={() => deleteFraction(f.id)} style={{
                                                    background: 'none', border: 'none', cursor: 'pointer',
                                                    color: 'var(--text-secondary)', padding: '0.1rem', opacity: 0.4
                                                }}
                                                    onMouseEnter={e => e.currentTarget.style.opacity = 1}
                                                    onMouseLeave={e => e.currentTarget.style.opacity = 0.4}
                                                >
                                                    <Trash2 size={13} />
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {/* Volume summary */}
                        {fractions.length > 0 && (
                            <div style={{ display: 'flex', gap: '1.5rem', marginTop: '0.8rem', paddingTop: '0.8rem', borderTop: '1px solid #333', fontSize: '0.75rem' }}>
                                <span style={{ color: PHASES[1].color }}>Головы: <b>{headsVolume} мл</b></span>
                                <span style={{ color: PHASES[2].color }}>Тело: <b>{heartsVolume} мл</b></span>
                                <span style={{ color: PHASES[3].color }}>Хвосты: <b>{tailsVolume} мл</b></span>
                                <span style={{ color: 'var(--text-secondary)', marginLeft: 'auto' }}>Итого: <b className="text-mono">{totalVolume} мл</b></span>
                            </div>
                        )}
                    </div>
                </div>

                {/* Right column */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                    {/* Phases */}
                    <div className="industrial-panel" style={{ padding: '1.5rem' }}>
                        <h3 style={{ margin: '0 0 1rem', fontSize: '0.85rem', letterSpacing: '0.1em', color: 'var(--text-secondary)' }}>
                            ФАЗЫ ДИСТИЛЛЯЦИИ
                        </h3>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                            {PHASES.map((p, idx) => {
                                const isActive = idx === currentPhase;
                                const isComplete = idx < currentPhase;
                                return (
                                    <div key={p.id} style={{
                                        display: 'flex', alignItems: 'center', gap: '0.8rem',
                                        padding: '0.7rem',
                                        background: isActive ? `${p.color}15` : (isComplete ? 'rgba(76,175,80,0.05)' : 'transparent'),
                                        border: isActive ? `1px solid ${p.color}` : (isComplete ? '1px solid var(--accent-green)' : '1px solid #333'),
                                        borderRadius: '4px', transition: 'all 0.3s ease',
                                        opacity: isComplete ? 0.6 : 1
                                    }}>
                                        <div style={{
                                            width: '10px', height: '10px', borderRadius: '50%',
                                            background: isComplete ? 'var(--accent-green)' : (isActive ? p.color : '#444'),
                                            boxShadow: isActive ? `0 0 8px ${p.color}` : 'none'
                                        }} />
                                        <div style={{ flex: 1 }}>
                                            <div style={{ fontSize: '0.85rem', fontWeight: isActive ? 'bold' : 'normal' }}>{p.name}</div>
                                            <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>{p.description}</div>
                                        </div>
                                        {isComplete && <CheckCircle size={16} color="var(--accent-green)" />}
                                        {isActive && <ChevronRight size={16} color={p.color} />}
                                    </div>
                                );
                            })}
                        </div>
                        {isStarted && currentPhase < PHASES.length - 1 && (
                            <button onClick={advancePhase} style={{
                                marginTop: '1rem', width: '100%', padding: '0.6rem', borderRadius: '6px',
                                border: `1px solid ${PHASES[currentPhase + 1].color}`,
                                background: `${PHASES[currentPhase + 1].color}15`,
                                color: PHASES[currentPhase + 1].color,
                                fontWeight: 'bold', fontSize: '0.8rem', cursor: 'pointer',
                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem'
                            }}>
                                <ChevronRight size={16} />
                                {PHASES[currentPhase + 1].name}
                            </button>
                        )}
                    </div>

                    {/* Start / Stop */}
                    <div className="industrial-panel" style={{ padding: '1.5rem' }}>
                        <button
                            disabled={!isStarted && !isHeaterCovered}
                            onClick={handleStartStop}
                            style={{
                                width: '100%', padding: '1.5rem', borderRadius: '8px', border: 'none',
                                background: isStarted ? 'var(--accent-red)' : 'var(--accent-blue)',
                                color: '#fff', fontWeight: 'bold', fontSize: '1.2rem',
                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1rem',
                                cursor: (!isStarted && !isHeaterCovered) ? 'not-allowed' : 'pointer',
                                opacity: (!isStarted && !isHeaterCovered) ? 0.5 : 1
                            }}
                        >
                            {isStarted ? <><Pause size={24} /> СТОП</> : <><Play size={24} /> СТАРТ ДИСТИЛЛЯЦИИ</>}
                        </button>

                        {!isStarted && (
                            <label style={{
                                display: 'flex', alignItems: 'center', gap: '1rem',
                                cursor: 'pointer', padding: '1rem', marginTop: '1.5rem',
                                background: isHeaterCovered ? 'rgba(76, 175, 80, 0.1)' : 'rgba(244, 67, 54, 0.1)',
                                borderRadius: '4px',
                                border: `1px solid ${isHeaterCovered ? 'var(--accent-green)' : 'var(--accent-red)'}`
                            }}>
                                <input
                                    type="checkbox" checked={isHeaterCovered}
                                    onChange={(e) => setIsHeaterCovered(e.target.checked)}
                                    style={{ width: '20px', height: '20px' }}
                                />
                                <div style={{ flex: 1 }}>
                                    <div style={{ fontWeight: 'bold', fontSize: '0.9rem' }}>ТЭН покрыт водой</div>
                                    <div style={{ fontSize: '0.75rem', opacity: 0.8 }}>Блокировка нагрева без воды</div>
                                </div>
                                <ShieldCheck color={isHeaterCovered ? 'var(--accent-green)' : 'var(--accent-red)'} />
                            </label>
                        )}
                    </div>

                    {/* Active info */}
                    {isStarted && (
                        <motion.div
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="industrial-panel"
                            style={{ padding: '1rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}
                        >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                                <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: phase.color, boxShadow: `0 0 6px ${phase.color}` }} />
                                <span style={{ fontWeight: 'bold', color: phase.color }}>{phase.name}</span>
                            </div>
                            <div>{phase.description}</div>
                            <div style={{ marginTop: '0.3rem' }}>ТЭН: {heaterPower}% · Охлаждение: {coolingPower}%</div>
                            {tempBoiler > 95 && (
                                <div style={{ marginTop: '0.5rem', padding: '0.4rem', background: 'rgba(244,67,54,0.1)', borderRadius: '4px', color: 'var(--accent-red)', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
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
