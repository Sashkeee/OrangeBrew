import React, { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate, useParams } from 'react-router-dom';
import { Play, Pause, Droplets, Zap, Thermometer, CheckCircle, ZoomIn, ZoomOut } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useSensors } from '../hooks/useSensors';
import { useControl } from '../hooks/useControl';

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
    const { control, setHeater, setPump, setPidMode, setPidTarget } = useControl();

    // Recipe
    const [recipeData, setRecipeData] = useState(null);
    useEffect(() => {
        try {
            const saved = localStorage.getItem('currentRecipe');
            if (saved) {
                const parsed = JSON.parse(saved);
                if (parsed?.steps?.length > 0) setRecipeData(parsed);
            }
        } catch (e) { console.warn('Could not load recipe', e); }
    }, []);

    const steps = useMemo(() => recipeData?.steps?.map(s => ({
        name: s.name, temp: s.temp, duration: s.duration
    })) || DEFAULT_STEPS, [recipeData]);

    const recipeName = recipeData?.name || 'IPA "Orange Sunshine"';

    // Core state
    const [isHeaterCovered, setIsHeaterCovered] = useState(false);
    const [isStarted, setIsStarted] = useState(false);
    const [elapsedTime, setElapsedTime] = useState(0);
    const [history, setHistory] = useState([]);

    // Graph scale
    const [graphYMin, setGraphYMin] = useState(20);
    const [graphYMax, setGraphYMax] = useState(100);
    const [mounted, setMounted] = useState(false);

    // Step automation
    const [activeStep, setActiveStep] = useState(0);
    const [stepPhase, setStepPhase] = useState('heating');
    const [stepTimeRemaining, setStepTimeRemaining] = useState(0);
    const [completedSteps, setCompletedSteps] = useState([]);
    const [allDone, setAllDone] = useState(false);

    // Derived
    const temperature = sensors.boiler?.value || 20;
    const heaterPower = control.heater;
    const pumpOn = control.pump;
    const currentStep = steps[activeStep];
    const targetTemp = currentStep?.temp || 65;

    // Refs for interval access
    const temperatureRef = useRef(temperature);
    const activeStepRef = useRef(activeStep);
    const stepPhaseRef = useRef(stepPhase);
    useEffect(() => { temperatureRef.current = temperature; }, [temperature]);
    useEffect(() => { activeStepRef.current = activeStep; }, [activeStep]);
    useEffect(() => { stepPhaseRef.current = stepPhase; }, [stepPhase]);

    useEffect(() => { setMounted(true); }, []);

    // Set hold timer when entering holding phase
    useEffect(() => {
        if (steps.length > 0 && activeStep < steps.length && stepPhase === 'holding') {
            setStepTimeRemaining(steps[activeStep].duration * 60);
        }
    }, [activeStep, stepPhase, steps]);

    // Chart history
    useEffect(() => {
        setHistory(h => [...h.slice(-50), {
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
            temp: temperature,
            target: currentStep ? currentStep.temp : 0,
        }]);
    }, [temperature, activeStep, steps]);

    // ─── Automation Loop ───
    useEffect(() => {
        if (!isStarted || allDone) return;
        const interval = setInterval(() => {
            setElapsedTime(p => p + 1);
            const step = steps[activeStepRef.current];
            if (!step) return;

            if (stepPhaseRef.current === 'heating') {
                if (temperatureRef.current >= step.temp) {
                    setStepPhase('holding');
                    setStepTimeRemaining(step.duration * 60);
                }
            } else {
                setStepTimeRemaining(prev => {
                    if (prev - 1 <= 0) {
                        setCompletedSteps(cs => [...cs, activeStepRef.current]);
                        const next = activeStepRef.current + 1;
                        if (next < steps.length) {
                            setActiveStep(next);
                            setStepPhase('heating');
                        } else {
                            setAllDone(true);
                            setIsStarted(false);
                        }
                        return 0;
                    }
                    return prev - 1;
                });
            }
        }, 1000);
        return () => clearInterval(interval);
    }, [isStarted, allDone, steps]);

    // Navigate to boiling when done
    useEffect(() => {
        if (!allDone) return;
        const t = setTimeout(() => navigate(`/brewing/boil/${sessionId || 'new'}`), 2000);
        return () => clearTimeout(t);
    }, [allDone, navigate, sessionId]);

    // Auto toggle
    const toggleAuto = () => {
        const next = !isStarted;
        setIsStarted(next);
        setPidMode(next);
        if (next && currentStep) {
            setPidTarget(currentStep.temp);
        } else {
            setHeater(0);
        }
    };

    // Update PID target on step change
    useEffect(() => {
        if (isStarted && steps[activeStep]) setPidTarget(steps[activeStep].temp);
    }, [activeStep, isStarted, steps, setPidTarget]);

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
                {isStarted && stepPhase === 'holding' && (
                    <div className="industrial-panel" style={{ padding: '0.5rem 1.5rem', display: 'flex', alignItems: 'center', gap: '0.8rem', borderColor: 'var(--accent-green)' }}>
                        <Thermometer size={20} color="var(--accent-green)" />
                        <div>
                            <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>ПАУЗА</div>
                            <span className="text-mono" style={{ fontSize: '1.3rem', fontWeight: 'bold', color: 'var(--accent-green)' }}>{formatTime(stepTimeRemaining)}</span>
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
                                    (stepPhase === 'holding' && Math.abs(temperature - targetTemp) < 1 ? 'var(--accent-green)' : 'var(--text-primary)')
                            }}>
                                {temperature.toFixed(1)}°
                            </div>
                            <div className="sensor-card__sub">ЦЕЛЬ: {targetTemp}°C</div>
                            {isStarted && (
                                <div className="status-badge" style={{
                                    background: stepPhase === 'heating' ? 'rgba(255,152,0,0.2)' : 'rgba(76,175,80,0.2)',
                                    color: stepPhase === 'heating' ? 'var(--primary-color)' : 'var(--accent-green)',
                                    borderColor: stepPhase === 'heating' ? 'var(--primary-color)' : 'var(--accent-green)',
                                }}>
                                    {stepPhase === 'heating' ? '🔥 НАГРЕВ' : '⏸ ПАУЗА'}
                                </div>
                            )}
                        </div>

                        {/* Heater */}
                        <div className="industrial-panel control-panel" style={{ padding: '2rem', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
                            <div style={{ position: 'absolute', top: '10px', right: '10px' }}>
                                <button
                                    className={`btn-mode ${isStarted ? 'btn-mode--active' : ''}`}
                                    onClick={toggleAuto}
                                    style={{ fontSize: '0.8rem', padding: '0.2rem 0.5rem', borderRadius: '4px' }}
                                >
                                    AUTO
                                </button>
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
                                onChange={e => setHeater(parseInt(e.target.value))}
                                disabled={isStarted} />
                            <div className="control-value text-mono" style={{ zIndex: 1, fontSize: '1.5rem' }}>{heaterPower}%</div>
                            {isStarted && (
                                <div style={{ textAlign: 'center', fontSize: '0.8rem', color: 'var(--accent-green)', marginTop: '0.3rem', zIndex: 1 }}>
                                    PID: {steps[activeStep]?.temp}°C
                                </div>
                            )}
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
                                onClick={() => setPump(!pumpOn)}
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
                        <h3 className="phase-list__title">ПАУЗЫ ЗАТИРАНИЯ</h3>
                        <div className="phase-list">
                            {steps.map((step, idx) => {
                                const isActive = activeStep === idx;
                                const isCompleted = completedSteps.includes(idx);
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
                                                    ⏱ Осталось: {formatTime(stepTimeRemaining)}
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
                        <div className="industrial-panel" style={{ padding: '1.5rem' }}>
                            <StartButton
                                isStarted={isStarted}
                                onClick={toggleAuto}
                                disabled={!isStarted && !isHeaterCovered}
                                startLabel="СТАРТ ЗАТИРАНИЯ"
                                startColor="var(--primary-color)"
                            />
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
