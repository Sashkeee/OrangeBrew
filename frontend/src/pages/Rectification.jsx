import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import {
    ArrowLeft, Play, Pause, Zap, Droplets, Plus, Trash2,
    Clock, FlaskConical, ZoomIn, ZoomOut, Thermometer,
    ChevronRight, AlertTriangle, CheckCircle, ShieldCheck,
    Gauge, Settings, Target
} from 'lucide-react';
import {
    LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
    ResponsiveContainer, ReferenceLine, Legend
} from 'recharts';

// Фазы ректификации
const PHASES = [
    { id: 'warmup', name: 'Разгон', color: '#ff9800', description: 'Нагрев и выход на режим' },
    { id: 'stabilize', name: 'Стабилизация', color: '#03a9f4', description: 'Работа "на себя", выход колонны на режим' },
    { id: 'heads', name: 'Головы', color: '#f44336', description: 'Покапельный отбор легких примесей' },
    { id: 'hearts', name: 'Тело', color: '#4caf50', description: 'Отбор спирта-ректификата' },
    { id: 'tails', name: 'Хвосты', color: '#9c27b0', description: 'Сивушные масла, остатки' },
];

const Rectification = () => {
    const navigate = useNavigate();

    // Основное состояние
    const [isStarted, setIsStarted] = useState(false);
    const [currentPhase, setCurrentPhase] = useState(0);
    const [heaterPower, setHeaterPower] = useState(100);
    const [isHeaterCovered, setIsHeaterCovered] = useState(false);
    const [elapsedSeconds, setElapsedSeconds] = useState(0);

    // Температуры (4 точки)
    const [tempBoiler, setTempBoiler] = useState(25.0);       // Куб
    const [tempColumn, setTempColumn] = useState(25.0);        // Верх колонны (царга)
    const [tempDephleg, setTempDephleg] = useState(20.0);      // После дефлегматора
    const [tempOutput, setTempOutput] = useState(18.0);        // Выход продукта

    // Дефлегматор
    const [dephlegPower, setDephlegPower] = useState(80);      // Мощность охлаждения дефлегматора (%)
    const [dephlegMode, setDephlegMode] = useState('auto');     // auto / manual

    // Охлаждение продукта
    const [coolingPower, setCoolingPower] = useState(50);

    // Флегмовое число
    const [refluxRatio, setRefluxRatio] = useState(3);         // Авто-расчёт или ручное

    // Целевая крепость
    const [targetAbv, setTargetAbv] = useState(96.0);

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

    useEffect(() => { setMounted(true); }, []);

    // Симуляция
    useEffect(() => {
        let interval;
        if (isStarted) {
            interval = setInterval(() => {
                setElapsedSeconds(prev => prev + 1);

                // Симуляция температуры куба
                setTempBoiler(prev => {
                    const powerEffect = (heaterPower / 100) * 0.4;
                    const loss = (prev - 20) * 0.003;
                    return parseFloat(Math.min(prev + powerEffect - loss, 100).toFixed(1));
                });

                // Верх колонны — стабилизируется за счёт дефлегматора
                setTempColumn(prev => {
                    const boilerInfluence = tempBoiler * 0.4;
                    const dephlegEffect = (dephlegPower / 100) * 15;
                    const target = boilerInfluence - dephlegEffect + 45;
                    const diff = target - prev;
                    return parseFloat(Math.max(20, prev + diff * 0.04).toFixed(1));
                });

                // После дефлегматора
                setTempDephleg(prev => {
                    const incoming = tempColumn * 0.6;
                    const cooling = (dephlegPower / 100) * 20;
                    const target = incoming - cooling + 20;
                    const diff = target - prev;
                    return parseFloat(Math.max(15, prev + diff * 0.06).toFixed(1));
                });

                // Выход продукта
                setTempOutput(prev => {
                    const incoming = tempDephleg * 0.3;
                    const cooling = (coolingPower / 100) * 8;
                    const target = incoming - cooling + 15;
                    const diff = target - prev;
                    return parseFloat(Math.max(12, prev + diff * 0.08).toFixed(1));
                });

                // Автоматический режим дефлегматора
                if (dephlegMode === 'auto') {
                    setDephlegPower(prev => {
                        // Стараемся держать верх колонны ~78.3°C для этанола
                        const targetColumnTemp = 78.3;
                        const error = tempColumn - targetColumnTemp;
                        const adjustment = error * 2;
                        return Math.max(0, Math.min(100, Math.round(prev + adjustment)));
                    });
                }

                // Скорость отбора — зависит от фазы и дефлегматора
                const phaseId = PHASES[currentPhase].id;
                if (tempBoiler > 78) {
                    if (phaseId === 'heads') {
                        setCollectSpeed(Math.round(1 + Math.random() * 2)); // капельный
                    } else if (phaseId === 'hearts') {
                        setCollectSpeed(Math.round((100 - dephlegPower) * 0.4 + Math.random() * 3));
                    } else if (phaseId === 'stabilize') {
                        setCollectSpeed(0); // работа на себя
                    } else {
                        setCollectSpeed(Math.round((tempBoiler - 78) * 5 + Math.random() * 3));
                    }
                } else {
                    setCollectSpeed(0);
                }

                // Запись в историю
                const now = new Date();
                setHistory(h => [...h.slice(-120), {
                    time: now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
                    boiler: tempBoiler,
                    column: tempColumn,
                    dephleg: tempDephleg,
                    output: tempOutput
                }]);
            }, 1000);
        }
        return () => clearInterval(interval);
    }, [isStarted, heaterPower, tempBoiler, tempColumn, tempDephleg, tempOutput, dephlegPower, dephlegMode, coolingPower, currentPhase]);

    // Форматирование
    const formatTime = (seconds) => {
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = seconds % 60;
        if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
        return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    };

    // Суммы
    const totalVolume = fractions.reduce((sum, f) => sum + (f.volume || 0), 0);
    const headsVolume = fractions.filter(f => f.phase === 'heads').reduce((s, f) => s + (f.volume || 0), 0);
    const heartsVolume = fractions.filter(f => f.phase === 'hearts').reduce((s, f) => s + (f.volume || 0), 0);
    const tailsVolume = fractions.filter(f => f.phase === 'tails').reduce((s, f) => s + (f.volume || 0), 0);

    // Проверка стабильности колонны
    const columnStable = history.length > 10 &&
        Math.abs(history[history.length - 1]?.column - history[history.length - 10]?.column) < 0.5;

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
            tempColumn: tempColumn,
            note: newFraction.note
        };
        setFractions(prev => [...prev, f]);
        setNewFraction({ volume: '', abv: '', note: '' });
        setShowAddFraction(false);
    };

    const deleteFraction = (id) => setFractions(prev => prev.filter(f => f.id !== id));
    const advancePhase = () => { if (currentPhase < PHASES.length - 1) setCurrentPhase(prev => prev + 1); };
    const handleStartStop = () => setIsStarted(!isStarted);

    // Зум
    const zoomIn = () => { const mid = (graphYMin + graphYMax) / 2, r = Math.max((graphYMax - graphYMin) / 2 * 0.7, 5); setGraphYMin(Math.round(mid - r)); setGraphYMax(Math.round(mid + r)); };
    const zoomOut = () => { const mid = (graphYMin + graphYMax) / 2, r = Math.min((graphYMax - graphYMin) / 2 * 1.4, 60); setGraphYMin(Math.round(mid - r)); setGraphYMax(Math.round(mid + r)); };
    const zoomReset = () => { setGraphYMin(0); setGraphYMax(100); };

    const phase = PHASES[currentPhase];

    return (
        <div style={{ padding: '2rem', maxWidth: '1400px', margin: '0 auto' }}>
            {/* Header */}
            <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <button onClick={() => navigate('/')} aria-label="Назад"
                        style={{ background: 'none', border: '1px solid var(--border-color)', color: 'var(--text-primary)', padding: '0.5rem', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <ArrowLeft size={20} />
                    </button>
                    <h1 style={{ margin: 0, fontSize: '1.8rem', color: '#ce93d8' }}>
                        <Gauge size={28} style={{ verticalAlign: 'middle', marginRight: '0.5rem' }} />
                        Ректификация
                    </h1>
                </div>
                <div className="text-mono" style={{ fontSize: '1.5rem', padding: '0.5rem 1.5rem', border: '2px solid #ce93d8', borderRadius: '30px', color: '#ce93d8' }}>
                    <Clock size={18} style={{ verticalAlign: 'middle', marginRight: '0.3rem' }} />
                    {formatTime(elapsedSeconds)}
                </div>
            </header>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: '1.5rem', alignItems: 'start' }}>
                {/* Left column */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                    {/* 4 temp sensors */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.8rem' }}>
                        {[
                            { label: '🔥 КУБ', value: tempBoiler, color: '#ff9800', warn: 100 },
                            { label: '🌡 КОЛОННА', value: tempColumn, color: '#03a9f4', warn: 82 },
                            { label: '❄️ ДЕФЛЕГМАТОР', value: tempDephleg, color: '#ce93d8', warn: null },
                            { label: '💧 ВЫХОД', value: tempOutput, color: '#4caf50', warn: null },
                        ].map((s, idx) => (
                            <div key={idx} className="industrial-panel" style={{ padding: '1rem', textAlign: 'center', borderTop: `3px solid ${s.color}` }}>
                                <div style={{ fontSize: '0.65rem', letterSpacing: '0.1em', color: 'var(--text-secondary)', marginBottom: '0.2rem' }}>{s.label}</div>
                                <div className="text-mono" style={{ fontSize: '2.2rem', fontWeight: 700, color: s.warn && s.value > s.warn ? 'var(--accent-red)' : s.color }}>
                                    {s.value.toFixed(1)}°
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Controls: Heater + Dephlegmator + Product cooling + Speed */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr 1fr 0.8fr', gap: '0.8rem' }}>
                        {/* Heater */}
                        <div className="industrial-panel" style={{ padding: '1rem' }}>
                            <div style={{ fontSize: '0.65rem', letterSpacing: '0.1em', color: 'var(--text-secondary)', marginBottom: '0.4rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                                ТЭН <Zap size={11} color="var(--primary-color)" />
                            </div>
                            <input type="range" min={0} max={100} value={heaterPower}
                                onChange={e => setHeaterPower(parseInt(e.target.value))} disabled={!isStarted}
                                style={{ width: '100%', accentColor: 'var(--primary-color)', opacity: isStarted ? 1 : 0.3 }} />
                            <div className="text-mono" style={{ textAlign: 'center', fontSize: '1.1rem' }}>{heaterPower}%</div>
                        </div>

                        {/* Dephlegmator */}
                        <div className="industrial-panel" style={{ padding: '1rem', borderTop: '2px solid #ce93d8' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                                <span style={{ fontSize: '0.65rem', letterSpacing: '0.1em', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                                    ДЕФЛЕГМАТОР <Droplets size={11} color="#ce93d8" />
                                </span>
                                <button onClick={() => setDephlegMode(m => m === 'auto' ? 'manual' : 'auto')} disabled={!isStarted}
                                    style={{
                                        fontSize: '0.6rem', padding: '0.15rem 0.5rem', borderRadius: '10px', cursor: isStarted ? 'pointer' : 'default',
                                        background: dephlegMode === 'auto' ? 'rgba(3,169,244,0.2)' : 'rgba(255,255,255,0.05)',
                                        border: `1px solid ${dephlegMode === 'auto' ? '#03a9f4' : '#555'}`,
                                        color: dephlegMode === 'auto' ? '#03a9f4' : 'var(--text-secondary)',
                                        opacity: isStarted ? 1 : 0.4
                                    }}>
                                    {dephlegMode === 'auto' ? 'АВТО' : 'РУЧН'}
                                </button>
                            </div>
                            <input type="range" min={0} max={100} value={dephlegPower}
                                onChange={e => { if (dephlegMode === 'manual') setDephlegPower(parseInt(e.target.value)); }}
                                disabled={!isStarted || dephlegMode === 'auto'}
                                style={{ width: '100%', accentColor: '#ce93d8', opacity: (isStarted && dephlegMode === 'manual') ? 1 : 0.3 }} />
                            <div className="text-mono" style={{ textAlign: 'center', fontSize: '1.1rem', color: '#ce93d8' }}>{dephlegPower}%</div>
                        </div>

                        {/* Product cooling */}
                        <div className="industrial-panel" style={{ padding: '1rem' }}>
                            <div style={{ fontSize: '0.65rem', letterSpacing: '0.1em', color: 'var(--text-secondary)', marginBottom: '0.4rem' }}>ОХЛАЖДЕНИЕ</div>
                            <input type="range" min={0} max={100} value={coolingPower}
                                onChange={e => setCoolingPower(parseInt(e.target.value))} disabled={!isStarted}
                                style={{ width: '100%', accentColor: 'var(--accent-blue)', opacity: isStarted ? 1 : 0.3 }} />
                            <div className="text-mono" style={{ textAlign: 'center', fontSize: '1.1rem' }}>{coolingPower}%</div>
                        </div>

                        {/* Speed */}
                        <div className="industrial-panel" style={{ padding: '1rem', textAlign: 'center' }}>
                            <div style={{ fontSize: '0.65rem', letterSpacing: '0.1em', color: 'var(--text-secondary)', marginBottom: '0.4rem' }}>СКОРОСТЬ</div>
                            <div className="text-mono" style={{ fontSize: '1.8rem', fontWeight: 700, color: collectSpeed > 0 ? 'var(--accent-green)' : 'var(--text-secondary)' }}>
                                {collectSpeed}
                            </div>
                            <div style={{ fontSize: '0.6rem', color: 'var(--text-secondary)' }}>мл/мин</div>
                        </div>
                    </div>

                    {/* Chart */}
                    <div className="industrial-panel" style={{ padding: '1.5rem', height: '280px', position: 'relative' }}>
                        <div style={{ position: 'absolute', top: '0.5rem', right: '0.5rem', zIndex: 10, display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                            <span>МАСШТАБ</span>
                            <button onClick={zoomIn} style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid #444', borderRadius: '4px', padding: '0.2rem', cursor: 'pointer', display: 'flex' }}><ZoomIn size={14} color="var(--text-secondary)" /></button>
                            <button onClick={zoomOut} style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid #444', borderRadius: '4px', padding: '0.2rem', cursor: 'pointer', display: 'flex' }}><ZoomOut size={14} color="var(--text-secondary)" /></button>
                            <button onClick={zoomReset} style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid #444', borderRadius: '4px', padding: '0.2rem 0.5rem', cursor: 'pointer', fontSize: '0.65rem', color: 'var(--text-secondary)' }}>СБРОС</button>
                        </div>
                        {mounted && (
                            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                                <LineChart data={history}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                                    <XAxis dataKey="time" stroke="#666" fontSize={10} interval="preserveStartEnd" />
                                    <YAxis domain={[graphYMin, graphYMax]} stroke="#666" fontSize={12} />
                                    <Tooltip contentStyle={{ background: '#1e1e1e', border: '1px solid #444', borderRadius: '4px' }} labelStyle={{ color: '#999' }} />
                                    <ReferenceLine y={78.3} stroke="#4caf50" strokeDasharray="6 3" label={{ value: '78.3° этанол', fill: '#4caf50', fontSize: 10, position: 'insideTopRight' }} />
                                    <Line type="monotone" dataKey="boiler" stroke="#ff9800" strokeWidth={2} dot={false} name="Куб" />
                                    <Line type="monotone" dataKey="column" stroke="#03a9f4" strokeWidth={2} dot={false} name="Колонна" />
                                    <Line type="monotone" dataKey="dephleg" stroke="#ce93d8" strokeWidth={1.5} dot={false} name="Дефлегматор" />
                                    <Line type="monotone" dataKey="output" stroke="#4caf50" strokeWidth={1.5} dot={false} name="Выход" />
                                    <Legend wrapperStyle={{ fontSize: '0.7rem' }} />
                                </LineChart>
                            </ResponsiveContainer>
                        )}
                    </div>

                    {/* Fraction log */}
                    <div className="industrial-panel" style={{ padding: '1.5rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                            <h3 style={{ margin: 0, fontSize: '1rem', letterSpacing: '0.05em', color: 'var(--text-secondary)' }}>🧪 ЛОГ ОТБОРА</h3>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                                    Всего: <span className="text-mono" style={{ color: 'var(--text-primary)' }}>{totalVolume} мл</span>
                                </span>
                                <button onClick={() => setShowAddFraction(!showAddFraction)} disabled={!isStarted}
                                    style={{
                                        background: 'rgba(206,147,216,0.1)', border: '1px solid #ce93d8', borderRadius: '4px',
                                        padding: '0.4rem 0.8rem', cursor: isStarted ? 'pointer' : 'not-allowed',
                                        color: '#ce93d8', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.3rem',
                                        opacity: isStarted ? 1 : 0.4
                                    }}>
                                    <Plus size={14} /> Записать
                                </button>
                            </div>
                        </div>

                        <AnimatePresence>
                            {showAddFraction && (
                                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} style={{ overflow: 'hidden', marginBottom: '1rem' }}>
                                    <div style={{ display: 'grid', gridTemplateColumns: '100px 100px 1fr auto', gap: '0.5rem', padding: '1rem', background: 'rgba(255,255,255,0.02)', borderRadius: '4px', border: '1px solid #333' }}>
                                        <div>
                                            <label style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>Объём (мл)</label>
                                            <input type="number" placeholder="100" value={newFraction.volume}
                                                onChange={e => setNewFraction(p => ({ ...p, volume: e.target.value }))}
                                                style={{ width: '100%', padding: '0.5rem', background: 'var(--surface-lighter)', border: '1px solid #444', borderRadius: '4px', color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }} />
                                        </div>
                                        <div>
                                            <label style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>ABV %</label>
                                            <input type="number" step="0.1" placeholder="96.0" value={newFraction.abv}
                                                onChange={e => setNewFraction(p => ({ ...p, abv: e.target.value }))}
                                                style={{ width: '100%', padding: '0.5rem', background: 'var(--surface-lighter)', border: '1px solid #444', borderRadius: '4px', color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }} />
                                        </div>
                                        <div>
                                            <label style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>Заметка</label>
                                            <input type="text" placeholder="Чистый, без запаха..." value={newFraction.note}
                                                onChange={e => setNewFraction(p => ({ ...p, note: e.target.value }))}
                                                style={{ width: '100%', padding: '0.5rem', background: 'var(--surface-lighter)', border: '1px solid #444', borderRadius: '4px', color: 'var(--text-primary)' }} />
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                                            <button onClick={addFraction} style={{ padding: '0.5rem 1rem', background: '#ce93d8', border: 'none', borderRadius: '4px', color: '#000', fontWeight: 'bold', cursor: 'pointer' }}>OK</button>
                                        </div>
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>

                        <div style={{ overflowX: 'auto', maxHeight: '220px', overflowY: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                                <thead>
                                    <tr style={{ borderBottom: '1px solid #333', position: 'sticky', top: 0, background: 'var(--surface-color)' }}>
                                        {['Время', 'Фаза', 'Объём', 'ABV', 'T колонны', 'Заметка', ''].map((h, i) => (
                                            <th key={i} style={{ padding: '0.4rem', textAlign: i === 0 || i === 5 ? 'left' : 'center', color: 'var(--text-secondary)', fontWeight: 500 }}>{h}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {fractions.length === 0 && (
                                        <tr><td colSpan={7} style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>Нет записей</td></tr>
                                    )}
                                    {fractions.map(f => (
                                        <tr key={f.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                                            <td style={{ padding: '0.4rem' }} className="text-mono">{f.time}</td>
                                            <td style={{ padding: '0.4rem', textAlign: 'center' }}>
                                                <span style={{ fontSize: '0.7rem', padding: '0.15rem 0.5rem', borderRadius: '10px', background: `${f.phaseColor}20`, color: f.phaseColor, fontWeight: 'bold' }}>{f.phaseName}</span>
                                            </td>
                                            <td style={{ padding: '0.4rem', textAlign: 'center' }} className="text-mono">{f.volume} мл</td>
                                            <td style={{ padding: '0.4rem', textAlign: 'center', color: f.abv && f.abv >= 96 ? '#4caf50' : (f.abv ? '#ce93d8' : 'var(--text-secondary)') }} className="text-mono">
                                                {f.abv ? `${f.abv}%` : '—'}
                                            </td>
                                            <td style={{ padding: '0.4rem', textAlign: 'center', color: '#03a9f4' }} className="text-mono">{f.tempColumn.toFixed(1)}°</td>
                                            <td style={{ padding: '0.4rem', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{f.note || '—'}</td>
                                            <td style={{ padding: '0.4rem' }}>
                                                <button onClick={() => deleteFraction(f.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: '0.1rem', opacity: 0.4 }}
                                                    onMouseEnter={e => e.currentTarget.style.opacity = 1} onMouseLeave={e => e.currentTarget.style.opacity = 0.4}>
                                                    <Trash2 size={13} />
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {fractions.length > 0 && (
                            <div style={{ display: 'flex', gap: '1.5rem', marginTop: '0.8rem', paddingTop: '0.8rem', borderTop: '1px solid #333', fontSize: '0.75rem' }}>
                                <span style={{ color: PHASES[2].color }}>Головы: <b>{headsVolume} мл</b></span>
                                <span style={{ color: PHASES[3].color }}>Тело: <b>{heartsVolume} мл</b></span>
                                <span style={{ color: PHASES[4].color }}>Хвосты: <b>{tailsVolume} мл</b></span>
                                <span style={{ color: 'var(--text-secondary)', marginLeft: 'auto' }}>Итого: <b className="text-mono">{totalVolume} мл</b></span>
                            </div>
                        )}
                    </div>
                </div>

                {/* Right column */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                    {/* Phases */}
                    <div className="industrial-panel" style={{ padding: '1.5rem' }}>
                        <h3 style={{ margin: '0 0 1rem', fontSize: '0.85rem', letterSpacing: '0.1em', color: 'var(--text-secondary)' }}>ФАЗЫ РЕКТИФИКАЦИИ</h3>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                            {PHASES.map((p, idx) => {
                                const isActive = idx === currentPhase;
                                const isComplete = idx < currentPhase;
                                return (
                                    <div key={p.id} style={{
                                        display: 'flex', alignItems: 'center', gap: '0.8rem', padding: '0.6rem',
                                        background: isActive ? `${p.color}15` : isComplete ? 'rgba(76,175,80,0.05)' : 'transparent',
                                        border: isActive ? `1px solid ${p.color}` : isComplete ? '1px solid var(--accent-green)' : '1px solid #333',
                                        borderRadius: '4px', opacity: isComplete ? 0.6 : 1
                                    }}>
                                        <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: isComplete ? 'var(--accent-green)' : isActive ? p.color : '#444', boxShadow: isActive ? `0 0 8px ${p.color}` : 'none' }} />
                                        <div style={{ flex: 1 }}>
                                            <div style={{ fontSize: '0.85rem', fontWeight: isActive ? 'bold' : 'normal' }}>{p.name}</div>
                                            <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)' }}>{p.description}</div>
                                        </div>
                                        {isComplete && <CheckCircle size={14} color="var(--accent-green)" />}
                                        {isActive && <ChevronRight size={14} color={p.color} />}
                                    </div>
                                );
                            })}
                        </div>
                        {isStarted && currentPhase < PHASES.length - 1 && (
                            <button onClick={advancePhase} style={{
                                marginTop: '0.8rem', width: '100%', padding: '0.5rem', borderRadius: '6px',
                                border: `1px solid ${PHASES[currentPhase + 1].color}`, background: `${PHASES[currentPhase + 1].color}15`,
                                color: PHASES[currentPhase + 1].color, fontWeight: 'bold', fontSize: '0.8rem', cursor: 'pointer',
                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem'
                            }}>
                                <ChevronRight size={16} /> {PHASES[currentPhase + 1].name}
                            </button>
                        )}
                    </div>

                    {/* Reflux ratio + Target ABV */}
                    <div className="industrial-panel" style={{ padding: '1.2rem' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                            <div style={{ textAlign: 'center' }}>
                                <div style={{ fontSize: '0.65rem', letterSpacing: '0.1em', color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>ФЛЕГМОВОЕ ЧИСЛО</div>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                                    <button onClick={() => setRefluxRatio(r => Math.max(1, r - 1))} disabled={!isStarted}
                                        style={{ width: '30px', height: '30px', border: '1px solid #555', borderRadius: '4px', background: 'rgba(255,255,255,0.05)', color: 'var(--text-primary)', cursor: isStarted ? 'pointer' : 'default', fontSize: '1rem' }}>−</button>
                                    <span className="text-mono" style={{ fontSize: '1.8rem', fontWeight: 700, color: '#ce93d8', minWidth: '40px' }}>{refluxRatio}</span>
                                    <button onClick={() => setRefluxRatio(r => Math.min(20, r + 1))} disabled={!isStarted}
                                        style={{ width: '30px', height: '30px', border: '1px solid #555', borderRadius: '4px', background: 'rgba(255,255,255,0.05)', color: 'var(--text-primary)', cursor: isStarted ? 'pointer' : 'default', fontSize: '1rem' }}>+</button>
                                </div>
                                <div style={{ fontSize: '0.6rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>возврат:отбор</div>
                            </div>
                            <div style={{ textAlign: 'center' }}>
                                <div style={{ fontSize: '0.65rem', letterSpacing: '0.1em', color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>ЦЕЛЕВАЯ КРЕПОСТЬ</div>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                                    <button onClick={() => setTargetAbv(a => Math.max(90, +(a - 0.5).toFixed(1)))} disabled={!isStarted}
                                        style={{ width: '30px', height: '30px', border: '1px solid #555', borderRadius: '4px', background: 'rgba(255,255,255,0.05)', color: 'var(--text-primary)', cursor: isStarted ? 'pointer' : 'default', fontSize: '1rem' }}>−</button>
                                    <span className="text-mono" style={{ fontSize: '1.4rem', fontWeight: 700, color: '#4caf50', minWidth: '55px' }}>{targetAbv}%</span>
                                    <button onClick={() => setTargetAbv(a => Math.min(97, +(a + 0.5).toFixed(1)))} disabled={!isStarted}
                                        style={{ width: '30px', height: '30px', border: '1px solid #555', borderRadius: '4px', background: 'rgba(255,255,255,0.05)', color: 'var(--text-primary)', cursor: isStarted ? 'pointer' : 'default', fontSize: '1rem' }}>+</button>
                                </div>
                                <div style={{ fontSize: '0.6rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>ABV спирта</div>
                            </div>
                        </div>
                    </div>

                    {/* Start / Stop */}
                    <div className="industrial-panel" style={{ padding: '1.5rem' }}>
                        <button disabled={!isStarted && !isHeaterCovered} onClick={handleStartStop}
                            style={{
                                width: '100%', padding: '1.5rem', borderRadius: '8px', border: 'none',
                                background: isStarted ? 'var(--accent-red)' : '#ce93d8',
                                color: isStarted ? '#fff' : '#000', fontWeight: 'bold', fontSize: '1.2rem',
                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1rem',
                                cursor: (!isStarted && !isHeaterCovered) ? 'not-allowed' : 'pointer',
                                opacity: (!isStarted && !isHeaterCovered) ? 0.5 : 1
                            }}>
                            {isStarted ? <><Pause size={24} /> СТОП</> : <><Play size={24} /> СТАРТ РЕКТИФИКАЦИИ</>}
                        </button>
                        {!isStarted && (
                            <label style={{
                                display: 'flex', alignItems: 'center', gap: '1rem', cursor: 'pointer', padding: '1rem', marginTop: '1.5rem',
                                background: isHeaterCovered ? 'rgba(76,175,80,0.1)' : 'rgba(244,67,54,0.1)', borderRadius: '4px',
                                border: `1px solid ${isHeaterCovered ? 'var(--accent-green)' : 'var(--accent-red)'}`
                            }}>
                                <input type="checkbox" checked={isHeaterCovered} onChange={e => setIsHeaterCovered(e.target.checked)} style={{ width: '20px', height: '20px' }} />
                                <div style={{ flex: 1 }}>
                                    <div style={{ fontWeight: 'bold', fontSize: '0.9rem' }}>ТЭН покрыт водой</div>
                                    <div style={{ fontSize: '0.75rem', opacity: 0.8 }}>Блокировка нагрева без воды</div>
                                </div>
                                <ShieldCheck color={isHeaterCovered ? 'var(--accent-green)' : 'var(--accent-red)'} />
                            </label>
                        )}
                    </div>

                    {/* Status info */}
                    {isStarted && (
                        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                            className="industrial-panel" style={{ padding: '1rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.4rem' }}>
                                <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: phase.color, boxShadow: `0 0 6px ${phase.color}` }} />
                                <span style={{ fontWeight: 'bold', color: phase.color }}>{phase.name}</span>
                                {columnStable && (
                                    <span style={{ fontSize: '0.65rem', padding: '0.1rem 0.4rem', borderRadius: '8px', background: 'rgba(76,175,80,0.15)', color: '#4caf50', marginLeft: 'auto' }}>
                                        ● СТАБИЛЬНО
                                    </span>
                                )}
                            </div>
                            <div>{phase.description}</div>
                            <div style={{ marginTop: '0.3rem' }}>ТЭН: {heaterPower}% · Дефлегматор: {dephlegPower}% ({dephlegMode === 'auto' ? 'авто' : 'ручн'})</div>
                            <div>Флегмовое число: {refluxRatio} · Цель: {targetAbv}%</div>
                            {tempColumn > 82 && (
                                <div style={{ marginTop: '0.5rem', padding: '0.4rem', background: 'rgba(244,67,54,0.1)', borderRadius: '4px', color: 'var(--accent-red)', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
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
