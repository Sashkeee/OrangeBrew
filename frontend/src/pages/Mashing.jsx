import React, { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate, useParams } from 'react-router-dom';
import { Play, Pause, Droplets, Zap, Thermometer, CheckCircle, ZoomIn, ZoomOut, SkipForward } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useSensors } from '../hooks/useSensors';
import { useControl } from '../hooks/useControl';
import { useProcess } from '../hooks/useProcess';

import { PageHeader } from '../components/PageHeader';
import { SafetyCheck } from '../components/SafetyCheck';
import { StartButton } from '../components/StartButton';
import { formatTime } from '../utils/formatTime';
import './pages.css';

const DEFAULT_STEPS = [
    { name: 'Пауза осахаривания', temp: 65, duration: 60 }
];

const Mashing = () => {
    const navigate = useNavigate();
    const { sessionId } = useParams();

    const { sensors } = useSensors();
    const { control, setHeater, setPump } = useControl();

    // New backend process hook
    const {
        processState, status, currentStep, activeStepIndex,
        stepPhase, remainingTime, elapsedTime,
        start, stop, pause, resume, skip, isLoading
    } = useProcess();

    // Recipe
    const [recipeData, setRecipeData] = useState(null);
    useEffect(() => {
        try {
            const saved = localStorage.getItem('currentRecipe');
            if (saved) {
                const parsed = JSON.parse(saved);
                // Support both old 'steps' and new 'mash_steps' field names
                const recipeSteps = parsed?.steps || parsed?.mash_steps || [];
                if (recipeSteps.length > 0) setRecipeData({ ...parsed, steps: recipeSteps });
            }
        } catch (e) { console.warn('Could not load recipe', e); }
    }, []);

    const steps = useMemo(() => recipeData?.steps?.map(s => ({
        name: s.name, temp: s.temp, duration: s.duration
    })) || DEFAULT_STEPS, [recipeData]);

    const recipeName = recipeData?.name || 'IPA "Orange Sunshine"';

    // Core state
    const [isHeaterCovered, setIsHeaterCovered] = useState(false);
    const [history, setHistory] = useState([]);

    // Graph scale
    const [graphYMin, setGraphYMin] = useState(20);
    const [graphYMax, setGraphYMax] = useState(100);
    const [mounted, setMounted] = useState(false);

    // Derived
    const temperature = sensors.boiler?.value || 20;
    const heaterPower = control.heater;
    const pumpOn = control.pump;
    const isStarted = status !== 'IDLE' && status !== 'COMPLETED';
    const isPaused = status === 'PAUSED';
    const allDone = status === 'COMPLETED';

    // Target depends on backend state usually, but for visualization we use currentStep from known stairs
    // If backend doesn't send "currentStep" object fully, we find it by index
    const targetTemp = currentStep?.temp || steps[activeStepIndex]?.temp || 65;

    useEffect(() => { setMounted(true); }, []);

    // Chart history
    useEffect(() => {
        setHistory(h => [...h.slice(-50), {
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
            temp: temperature,
            target: targetTemp,
        }]);
    }, [temperature, targetTemp]);

    // Handle Start / Stop / Pause
    const handleStartStop = () => {
        if (isStarted) {
            if (isPaused) {
                resume();
            } else {
                if (confirm("Вы уверены, что хотите поставить затирание на паузу?")) {
                    pause();
                }
            }
        } else {
            // Start new process
            if (recipeData) {
                start(recipeData, sessionId, 'mash');
            } else {
                alert("Ошибка: рецепт не загружен");
            }
        }
    };

    const handleStopAbrupt = () => {
        if (confirm("Вы уверены, что хотите остановить процесс затирания? Это действие нельзя отменить.")) {
            stop();
        }
    };

    // Navigate to boiling when done
    useEffect(() => {
        if (allDone) {
            const t = setTimeout(() => navigate(`/brewing/boil/${sessionId || 'new'}`), 3000);
            return () => clearTimeout(t);
        }
    }, [allDone, navigate, sessionId]);

    // Pump toggle
    const handlePumpToggle = () => {
        const next = !pumpOn;
        setPump(next);
        // Telegram notify handled by backend for process, but manual pump toggle might not be?
        // Let's assume backend observes pump state or we just toggle it.
    };

    // Manual Heater (disabled if auto)
    const handleHeaterChange = (val) => {
        setHeater(val);
    };

    // Zoom helpers
    const zoomIn = () => {
        const mid = (graphYMin + graphYMax) / 2;
        const r = Math.max((graphYMax - graphYMin) * 0.35, 10);
        setGraphYMin(Math.max(0, Math.round(mid - r)));
        setGraphYMax(Math.min(120, Math.round(mid + r)));
    };
    const zoomOut = () => {
        const mid = (graphYMin + graphYMax) / 2;
        const r = Math.min((graphYMax - graphYMin) * 0.7, 60);
        setGraphYMin(Math.max(0, Math.round(mid - r)));
        setGraphYMax(Math.min(120, Math.round(mid + r)));
    };

    return (
        <div className="page-container" style={{ maxWidth: '1200px' }}>
            <PageHeader
                title={`Затирание: ${recipeName}`}
                color="var(--primary-color)"
                backTo="/brewing"
                elapsed={elapsedTime}
            >
                {/* Status Indicator in Header */}
                <div style={{ marginLeft: 'auto', display: 'flex', gap: '1rem', alignItems: 'center' }}>
                    {isPaused && <span className="status-badge" style={{ background: 'orange', color: 'black' }}>ПАУЗА</span>}
                    {stepPhase === 'holding' && <span className="status-badge" style={{ background: 'green', color: 'white' }}>УДЕРЖАНИЕ</span>}
                    {stepPhase === 'heating' && isStarted && !isPaused && <span className="status-badge" style={{ background: 'red', color: 'white' }}>НАГРЕВ</span>}
                </div>

                {stepPhase === 'holding' && (
                    <div className="industrial-panel" style={{ padding: '0.5rem 1.5rem', display: 'flex', alignItems: 'center', gap: '0.8rem', borderColor: 'var(--accent-green)' }}>
                        <Thermometer size={20} color="var(--accent-green)" />
                        <div>
                            <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>ПАУЗА</div>
                            <span className="text-mono" style={{ fontSize: '1.3rem', fontWeight: 'bold', color: 'var(--accent-green)' }}>{formatTime(remainingTime)}</span>
                        </div>
                    </div>
                )}
            </PageHeader>

            <div className="layout-2col layout-2col--narrow">
                {/* ─── Left Column ─── */}
                <div className="col-main">
                    <div className="sensor-grid sensor-grid--3">
                        {/* Temperature Gauge */}
                        <div className="industrial-panel" style={{ padding: '2rem', textAlign: 'center' }}>
                            <div className="sensor-card__label" style={{ fontSize: '0.9rem' }}>ТЕМПЕРАТУРА</div>
                            <div className="sensor-card__value sensor-card__value--lg text-mono" style={{
                                color: temperature > targetTemp ? 'var(--accent-red)' :
                                    (Math.abs(temperature - targetTemp) < 1 ? 'var(--accent-green)' : 'var(--text-primary)')
                            }}>
                                {temperature.toFixed(1)}°
                            </div>
                            <div className="sensor-card__sub">ЦЕЛЬ: {targetTemp}°C</div>
                            {isStarted && (
                                <div className="status-badge" style={{
                                    background: stepPhase === 'heating' ? 'rgba(255,152,0,0.2)' : 'rgba(76,175,80,0.2)',
                                    color: stepPhase === 'heating' ? 'var(--primary-color)' : 'var(--accent-green)',
                                    borderColor: stepPhase === 'heating' ? 'var(--primary-color)' : 'var(--accent-green)',
                                    marginTop: '1rem'
                                }}>
                                    {stepPhase === 'heating' ? '🔥 НАГРЕВ' : '⏸ УДЕРЖАНИЕ'}
                                </div>
                            )}
                        </div>

                        {/* Heater */}
                        <div className="industrial-panel control-panel" style={{ padding: '2rem', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
                            <div style={{ position: 'absolute', top: '10px', right: '10px' }}>
                                <span style={{ fontSize: '0.7rem', color: isStarted ? 'var(--accent-green)' : '#666' }}>
                                    {isStarted ? 'AUTO (PID)' : 'MANUAL'}
                                </span>
                            </div>
                            <motion.div
                                animate={{ height: `${heaterPower}%` }}
                                style={{
                                    position: 'absolute', bottom: 0, left: 0, right: 0,
                                    background: 'linear-gradient(to top, rgba(255,107,0,0.2), transparent)',
                                    zIndex: 0, pointerEvents: 'none'
                                }}
                            />
                            <Zap size={40} color={heaterPower > 0 ? "var(--primary-color)" : "#444"} style={{ zIndex: 1 }} />
                            <h3 style={{ margin: '1rem 0', zIndex: 1 }}>ТЭН</h3>
                            <input type="range" min="0" max="100" value={heaterPower || 0}
                                className="control-slider"
                                style={{ accentColor: 'var(--primary-color)', zIndex: 1 }}
                                onChange={e => handleHeaterChange(parseInt(e.target.value))}
                                disabled={isStarted} />
                            <div className="control-value text-mono" style={{ zIndex: 1, fontSize: '1.5rem' }}>{heaterPower}%</div>
                        </div>

                        {/* Pump */}
                        <div className="industrial-panel" style={{ padding: '2rem', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                            <motion.div
                                animate={{ rotate: pumpOn ? 360 : 0 }}
                                transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                                style={{ color: pumpOn ? 'var(--accent-blue)' : '#444' }}
                            >
                                <Droplets size={40} />
                            </motion.div>
                            <button
                                className={`btn-pump ${pumpOn ? 'btn-pump--on' : ''}`}
                                onClick={handlePumpToggle}
                            >
                                НАСОС {pumpOn ? 'ВКЛ' : 'ВЫКЛ'}
                            </button>
                        </div>
                    </div>

                    {/* Chart */}
                    <div className="industrial-panel chart-panel chart-panel--lg">
                        <div className="chart-zoom">
                            <span>МАСШТАБ</span>
                            <button className="chart-zoom__btn" onClick={zoomIn}><ZoomIn size={14} /></button>
                            <button className="chart-zoom__btn" onClick={zoomOut}><ZoomOut size={14} /></button>
                            <button className="chart-zoom__btn chart-zoom__btn--text" onClick={() => { setGraphYMin(20); setGraphYMax(100); }}>СБРОС</button>
                        </div>
                        {mounted && (
                            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                                <LineChart data={history}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                                    <XAxis dataKey="time" stroke="#666" fontSize={12} />
                                    <YAxis domain={[graphYMin, graphYMax]} stroke="#666" fontSize={12} />
                                    <Tooltip contentStyle={{ backgroundColor: '#1a1a1a', border: '1px solid #333', color: '#fff' }} />
                                    <Line type="monotone" dataKey="temp" stroke="var(--primary-color)" strokeWidth={2} dot={false} name="Температура" />
                                    <Line type="stepAfter" dataKey="target" stroke="var(--accent-green)" strokeWidth={1} strokeDasharray="5 5" dot={false} name="Цель" />
                                </LineChart>
                            </ResponsiveContainer>
                        )}
                    </div>
                </div>

                {/* ─── Right Column ─── */}
                <div className="col-side">
                    {/* Steps */}
                    <div className="industrial-panel" style={{ padding: '1.5rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                            <h3 className="phase-list__title" style={{ margin: 0 }}>ПАУЗЫ</h3>
                            {isStarted && (
                                <button onClick={skip} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', fontSize: '0.8rem' }}>
                                    <SkipForward size={14} style={{ marginRight: 4 }} /> ПРОПУСТИТЬ
                                </button>
                            )}
                        </div>

                        <div className="phase-list">
                            {steps.map((step, idx) => {
                                const isActive = activeStepIndex === idx;
                                const isCompleted = idx < activeStepIndex;
                                const isHolding = isActive && stepPhase === 'holding';
                                return (
                                    <div key={idx} className={`phase-item ${isActive ? 'phase-item--active' : ''} ${isCompleted ? 'phase-item--complete' : ''}`}
                                        style={isActive ? { background: 'rgba(255,152,0,0.1)', borderColor: 'var(--primary-color)' } : undefined}>
                                        <div className="phase-dot" style={{
                                            background: isCompleted ? 'var(--accent-green)' : (isActive ? 'var(--primary-color)' : '#444'),
                                            boxShadow: isActive ? '0 0 8px var(--primary-color)' : 'none',
                                        }} />
                                        <div className="phase-item__info">
                                            <div className="phase-item__name">{step.name}</div>
                                            <div className="phase-item__desc">{step.temp}°C / {step.duration} мин</div>
                                            {isHolding && (
                                                <div style={{ fontSize: '0.75rem', color: 'var(--accent-green)', marginTop: '0.2rem', fontWeight: 'bold' }}>
                                                    ⏱ Осталось: {formatTime(remainingTime)}
                                                </div>
                                            )}
                                        </div>
                                        {isCompleted && <CheckCircle size={20} color="var(--accent-green)" />}
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* Done notification */}
                    <AnimatePresence>
                        {allDone && (
                            <motion.div
                                initial={{ opacity: 0, scale: 0.9 }}
                                animate={{ opacity: 1, scale: 1 }}
                                className="industrial-panel"
                                style={{ padding: '1.5rem', textAlign: 'center', borderColor: 'var(--accent-green)', background: 'rgba(76,175,80,0.1)' }}
                            >
                                <CheckCircle size={40} color="var(--accent-green)" />
                                <div style={{ marginTop: '0.5rem', fontWeight: 'bold', fontSize: '1.1rem', color: 'var(--accent-green)' }}>
                                    Затирание завершено!
                                </div>
                                <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '0.3rem' }}>
                                    Переход к кипячению...
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* Start / Stop */}
                    {!allDone && (
                        <div className="industrial-panel" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            <button
                                className={`btn-start ${isStarted && !isPaused ? 'btn-start--active' : ''}`}
                                onClick={handleStartStop}
                                disabled={!isStarted && !isHeaterCovered}
                                style={{
                                    width: '100%',
                                    padding: '1.2rem',
                                    fontSize: '1.2rem',
                                    fontWeight: 'bold',
                                    borderRadius: '8px',
                                    border: 'none',
                                    background: isStarted
                                        ? (isPaused ? 'var(--accent-green)' : 'var(--accent-orange)') // Resume vs Pause
                                        : 'var(--primary-color)',
                                    color: '#000',
                                    cursor: (!isStarted && !isHeaterCovered) ? 'not-allowed' : 'pointer',
                                    opacity: (!isStarted && !isHeaterCovered) ? 0.5 : 1,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px'
                                }}
                            >
                                {isStarted ? (isPaused ? <><Play size={24} /> ПРОДОЛЖИТЬ</> : <><Pause size={24} /> ПАУЗА</>) : <><Play size={24} /> СТАРТ ЗАТИРАНИЯ</>}
                            </button>

                            {isStarted && (
                                <button
                                    onClick={handleStopAbrupt}
                                    style={{
                                        background: 'transparent',
                                        border: '1px solid var(--accent-red)',
                                        color: 'var(--accent-red)',
                                        padding: '0.8rem',
                                        borderRadius: '6px',
                                        cursor: 'pointer',
                                        fontWeight: 'bold'
                                    }}
                                >
                                    ОСТАНОВИТЬ
                                </button>
                            )}

                            {!isStarted && (
                                <SafetyCheck checked={isHeaterCovered} onChange={setIsHeaterCovered} />
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default Mashing;
