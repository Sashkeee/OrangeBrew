import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Play, Pause, Droplets, Zap, ShieldCheck, Timer, CheckCircle, Flame, Thermometer, ZoomIn, ZoomOut } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { useSensors } from '../hooks/useSensors';
import { useControl } from '../hooks/useControl';

const DEFAULT_STEPS = [
    { name: 'Пауза осахаривания', temp: 65, duration: 60 }
];

const Mashing = () => {
    const navigate = useNavigate();
    const { sessionId } = useParams();

    // Hooks
    const { sensors } = useSensors();
    const { control, setHeater, setPump } = useControl();

    // Load recipe from localStorage
    const [recipeData, setRecipeData] = useState(null);
    useEffect(() => {
        try {
            const saved = localStorage.getItem('currentRecipe');
            if (saved) {
                const parsed = JSON.parse(saved);
                if (parsed && parsed.steps && parsed.steps.length > 0) {
                    setRecipeData(parsed);
                }
            }
        } catch (e) {
            console.warn('Could not load recipe from localStorage', e);
        }
    }, []);

    const steps = recipeData?.steps?.map(s => ({
        name: s.name,
        temp: s.temp,
        duration: s.duration
    })) || DEFAULT_STEPS;

    const recipeName = recipeData?.name || 'IPA "Orange Sunshine"';

    // Core states
    const [isHeaterCovered, setIsHeaterCovered] = useState(false);
    const [isStarted, setIsStarted] = useState(false);

    // Data from hooks
    const temperature = sensors.boiler?.value || 20;
    const heaterPower = control.heater;
    const pumpOn = control.pump;

    const [elapsedTime, setElapsedTime] = useState(0);
    const [history, setHistory] = useState([]);
    const [mounted, setMounted] = useState(false);

    // Graph scale state
    const [graphYMin, setGraphYMin] = useState(20);
    const [graphYMax, setGraphYMax] = useState(100);

    // Step automation states
    const [activeStep, setActiveStep] = useState(0);
    const [stepPhase, setStepPhase] = useState('heating'); // 'heating' | 'holding'
    const [stepTimeRemaining, setStepTimeRemaining] = useState(0); // seconds remaining in pause
    const [completedSteps, setCompletedSteps] = useState([]);
    const [allDone, setAllDone] = useState(false);

    // Refs for accessing latest state in interval
    const temperatureRef = useRef(temperature);
    const activeStepRef = useRef(activeStep);
    const stepPhaseRef = useRef(stepPhase);
    const stepTimeRemainingRef = useRef(stepTimeRemaining);

    useEffect(() => { temperatureRef.current = temperature; }, [temperature]);
    useEffect(() => { activeStepRef.current = activeStep; }, [activeStep]);
    useEffect(() => { stepPhaseRef.current = stepPhase; }, [stepPhase]);
    useEffect(() => { stepTimeRemainingRef.current = stepTimeRemaining; }, [stepTimeRemaining]);

    useEffect(() => { setMounted(true); }, []);

    // Set initial target and step time
    useEffect(() => {
        if (steps.length > 0 && activeStep < steps.length) {
            if (stepPhase === 'holding') {
                setStepTimeRemaining(steps[activeStep].duration * 60); // convert minutes to seconds
            }
        }
    }, [activeStep, stepPhase]);

    // Graph history update
    useEffect(() => {
        const now = new Date();
        const currentStep = steps[activeStep];
        const targetTemp = currentStep ? currentStep.temp : 0;

        setHistory(h => [...h.slice(-50), {
            time: now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
            temp: temperature,
            target: targetTemp
        }]);
    }, [temperature, activeStep, steps]);

    // Automation Loop (Client-side Logic for now)
    useEffect(() => {
        let interval;
        if (isStarted && !allDone) {
            interval = setInterval(() => {
                setElapsedTime(prev => prev + 1);

                const currentStep = steps[activeStepRef.current];
                if (!currentStep) return;

                const currentPhase = stepPhaseRef.current;
                const currentTemp = temperatureRef.current;
                const targetTemp = currentStep.temp;

                // Simple Bang-Bang / Hysteresis control for now (until PID)
                // Only if not already set manually? For now, let's override logic
                // logic: if heating, 100%. if holding, maintain.

                // Note: We are NOT setting heater power here automatically anymore
                // because we want the user to control it OR utilize the future PID.
                // For this interim step, let's just do phase transitions.

                // Phase transitions
                if (currentPhase === 'heating') {
                    if (currentTemp >= targetTemp) {
                        // Reached target — switch to holding
                        setStepPhase('holding');
                        setStepTimeRemaining(currentStep.duration * 60);
                    }
                } else {
                    // Holding — count down timer
                    setStepTimeRemaining(prev => {
                        const next = prev - 1;
                        if (next <= 0) {
                            // Pause complete → advance
                            setCompletedSteps(cs => [...cs, activeStepRef.current]);
                            const nextStep = activeStepRef.current + 1;
                            if (nextStep < steps.length) {
                                setActiveStep(nextStep);
                                setStepPhase('heating');
                            } else {
                                // All steps done — go to boiling
                                setAllDone(true);
                                setIsStarted(false);
                            }
                            return 0;
                        }
                        return next;
                    });
                }
            }, 1000);
        }
        return () => clearInterval(interval);
    }, [isStarted, allDone, steps]);

    // Navigate to boiling when all done
    useEffect(() => {
        if (allDone) {
            const timer = setTimeout(() => {
                navigate(`/brewing/boil/${sessionId || 'new'}`);
            }, 2000);
            return () => clearTimeout(timer);
        }
    }, [allDone, navigate, sessionId]);

    const formatTime = (seconds) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    const handleStart = () => {
        setIsStarted(!isStarted);
    };

    const currentStep = steps[activeStep];
    const targetTemp = currentStep?.temp || 65;

    return (
        <div style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto' }}>
            <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <button
                        onClick={() => navigate('/brewing')}
                        style={{ background: 'none', border: '1px solid var(--border-color)', color: 'var(--text-primary)', padding: '0.5rem', borderRadius: '4px' }}
                        aria-label="Назад к пивоварению"
                    >
                        <ArrowLeft size={20} aria-hidden="true" />
                    </button>
                    <h1 style={{ margin: 0, fontSize: '1.8rem', color: 'var(--primary-color)' }}>Затирание: <span style={{ color: '#fff' }}>{recipeName}</span></h1>
                </div>
                <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                    {isStarted && stepPhase === 'holding' && (
                        <div className="industrial-panel" style={{ padding: '0.5rem 1.5rem', display: 'flex', alignItems: 'center', gap: '0.8rem', borderColor: 'var(--accent-green)' }}>
                            <Thermometer size={20} color="var(--accent-green)" aria-hidden="true" />
                            <div>
                                <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>ПАУЗА</div>
                                <span className="text-mono" style={{ fontSize: '1.3rem', fontWeight: 'bold', color: 'var(--accent-green)' }}>{formatTime(stepTimeRemaining)}</span>
                            </div>
                        </div>
                    )}
                    <div className="industrial-panel" style={{ padding: '0.5rem 1.5rem', display: 'flex', alignItems: 'center', gap: '0.8rem', borderColor: 'var(--primary-color)' }}>
                        <Timer size={20} color="var(--primary-color)" aria-hidden="true" />
                        <span className="text-mono" style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>{formatTime(elapsedTime)}</span>
                    </div>
                </div>
            </header>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 350px', gap: '2rem' }}>
                {/* Left Column: Main Controls and Graph */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1.5rem' }}>
                        {/* Temp Gauge */}
                        <div className="industrial-panel" style={{ padding: '2rem', textAlign: 'center' }}>
                            <div style={{ color: 'var(--text-secondary)', marginBottom: '0.5rem', fontSize: '0.9rem' }}>ТЕМПЕРАТУРА</div>
                            <div className="text-mono" style={{
                                fontSize: '3.5rem',
                                fontWeight: '700',
                                color: temperature > targetTemp ? 'var(--accent-red)' : (
                                    stepPhase === 'holding' && Math.abs(temperature - targetTemp) < 1 ? 'var(--accent-green)' : 'var(--text-primary)'
                                )
                            }}>
                                {temperature.toFixed(1)}°
                            </div>
                            <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>ЦЕЛЬ: {targetTemp}°C</div>
                            {isStarted && (
                                <div style={{
                                    marginTop: '0.5rem',
                                    padding: '0.3rem 0.8rem',
                                    borderRadius: '12px',
                                    fontSize: '0.75rem',
                                    fontWeight: 'bold',
                                    display: 'inline-block',
                                    background: stepPhase === 'heating' ? 'rgba(255, 152, 0, 0.2)' : 'rgba(76, 175, 80, 0.2)',
                                    color: stepPhase === 'heating' ? 'var(--primary-color)' : 'var(--accent-green)',
                                    border: `1px solid ${stepPhase === 'heating' ? 'var(--primary-color)' : 'var(--accent-green)'}`
                                }}>
                                    {stepPhase === 'heating' ? '🔥 НАГРЕВ' : '⏸ ПАУЗА'}
                                </div>
                            )}
                        </div>

                        {/* Heater Control */}
                        <div className="industrial-panel" style={{ padding: '2rem', position: 'relative' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
                                <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>ТЭН</span>
                                <Zap size={18} color={heaterPower > 0 ? 'var(--primary-color)' : '#444'} aria-hidden="true" />
                            </div>
                            <input
                                type="range"
                                min="0"
                                max="100"
                                value={heaterPower}
                                onChange={(e) => setHeater(parseInt(e.target.value))}
                                disabled={isStarted} // Disabled during auto mode
                                style={{ width: '100%', accentColor: 'var(--primary-color)' }}
                            />
                            <div className="text-mono" style={{ textAlign: 'center', marginTop: '0.5rem', fontSize: '1.5rem' }}>{heaterPower}%</div>
                            {isStarted && (
                                <div style={{ textAlign: 'center', fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: '0.3rem' }}>АВТО</div>
                            )}
                        </div>

                        {/* Pump Control */}
                        <div className="industrial-panel" style={{ padding: '2rem', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                            <motion.div
                                animate={{ rotate: pumpOn ? 360 : 0 }}
                                transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                                style={{ color: pumpOn ? 'var(--accent-blue)' : '#444' }}
                            >
                                <Droplets size={40} aria-hidden="true" />
                            </motion.div>
                            <button
                                onClick={() => setPump(!pumpOn)}
                                style={{
                                    marginTop: '0.5rem',
                                    padding: '0.5rem 2rem',
                                    borderRadius: '20px',
                                    background: pumpOn ? 'var(--accent-blue)' : 'transparent',
                                    border: `1px solid ${pumpOn ? 'var(--accent-blue)' : '#444'}`,
                                    color: pumpOn ? '#000' : '#fff',
                                    fontWeight: 'bold'
                                }}
                            >
                                НАСОС {pumpOn ? 'ВКЛ' : 'ВЫКЛ'}
                            </button>
                        </div>
                    </div>

                    {/* Graph */}
                    <div className="industrial-panel" style={{ padding: '1.5rem', height: '400px', width: '100%', minWidth: 0, position: 'relative' }}>
                        {/* Graph scale controls */}
                        <div style={{
                            position: 'absolute',
                            top: '0.7rem',
                            right: '0.7rem',
                            zIndex: 10,
                            display: 'flex',
                            gap: '0.3rem',
                            alignItems: 'center'
                        }}>
                            <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginRight: '0.3rem' }}>МАСШТАБ</span>
                            <button
                                onClick={() => {
                                    const range = graphYMax - graphYMin;
                                    if (range > 20) {
                                        const mid = (graphYMin + graphYMax) / 2;
                                        const newHalf = range * 0.35;
                                        setGraphYMin(Math.max(0, Math.round(mid - newHalf)));
                                        setGraphYMax(Math.min(120, Math.round(mid + newHalf)));
                                    }
                                }}
                                aria-label="Приблизить график"
                                style={{
                                    width: '28px', height: '28px',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    background: 'rgba(255,152,0,0.1)', border: '1px solid #444',
                                    borderRadius: '4px', color: 'var(--primary-color)', cursor: 'pointer'
                                }}
                            >
                                <ZoomIn size={14} />
                            </button>
                            <button
                                onClick={() => {
                                    const range = graphYMax - graphYMin;
                                    if (range < 120) {
                                        const mid = (graphYMin + graphYMax) / 2;
                                        const newHalf = range * 0.7;
                                        setGraphYMin(Math.max(0, Math.round(mid - newHalf)));
                                        setGraphYMax(Math.min(120, Math.round(mid + newHalf)));
                                    }
                                }}
                                aria-label="Отдалить график"
                                style={{
                                    width: '28px', height: '28px',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    background: 'rgba(255,152,0,0.1)', border: '1px solid #444',
                                    borderRadius: '4px', color: 'var(--primary-color)', cursor: 'pointer'
                                }}
                            >
                                <ZoomOut size={14} />
                            </button>
                            <button
                                onClick={() => { setGraphYMin(20); setGraphYMax(100); }}
                                aria-label="Сбросить масштаб графика"
                                style={{
                                    height: '28px',
                                    padding: '0 8px',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    background: 'transparent', border: '1px solid #444',
                                    borderRadius: '4px', color: '#888', cursor: 'pointer',
                                    fontSize: '0.65rem'
                                }}
                            >
                                СБРОС
                            </button>
                        </div>
                        {mounted && (
                            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                                <LineChart data={history}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                                    <XAxis dataKey="time" stroke="#666" fontSize={12} />
                                    <YAxis domain={[graphYMin, graphYMax]} stroke="#666" fontSize={12} />
                                    <Tooltip
                                        contentStyle={{ backgroundColor: '#1a1a1a', border: '1px solid #333', color: '#fff' }}
                                        itemStyle={{ color: 'var(--primary-color)' }}
                                    />
                                    <Line
                                        type="monotone"
                                        dataKey="temp"
                                        stroke="var(--primary-color)"
                                        strokeWidth={2}
                                        dot={false}
                                        animationDuration={300}
                                        name="Температура"
                                    />
                                    <Line
                                        type="stepAfter"
                                        dataKey="target"
                                        stroke="var(--accent-green)"
                                        strokeWidth={1}
                                        strokeDasharray="5 5"
                                        dot={false}
                                        animationDuration={300}
                                        name="Цель"
                                    />
                                </LineChart>
                            </ResponsiveContainer>
                        )}
                    </div>
                </div>

                {/* Right Column: Steps and Master Start */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                    <div className="industrial-panel" style={{ padding: '1.5rem' }}>
                        <h3 style={{ margin: '0 0 1.5rem 0', fontSize: '1.1rem', color: 'var(--text-secondary)' }}>ПАУЗЫ ЗАТИРАНИЯ</h3>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            {steps.map((step, idx) => {
                                const isActive = activeStep === idx;
                                const isCompleted = completedSteps.includes(idx);
                                const isHolding = isActive && stepPhase === 'holding';
                                return (
                                    <div key={idx} style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '1rem',
                                        padding: '0.8rem',
                                        background: isActive ? 'rgba(255,152,0,0.1)' : (isCompleted ? 'rgba(76,175,80,0.05)' : 'transparent'),
                                        border: isActive ? '1px solid var(--primary-color)' : (isCompleted ? '1px solid var(--accent-green)' : '1px solid #333'),
                                        borderRadius: '4px',
                                        transition: 'all 0.3s ease'
                                    }}>
                                        <div style={{
                                            width: '10px',
                                            height: '10px',
                                            borderRadius: '50%',
                                            background: isCompleted ? 'var(--accent-green)' : (isActive ? 'var(--primary-color)' : '#444'),
                                            boxShadow: isActive ? '0 0 8px var(--primary-color)' : 'none'
                                        }} />
                                        <div style={{ flex: 1 }}>
                                            <div style={{
                                                fontSize: '0.9rem',
                                                fontWeight: isActive ? 'bold' : 'normal',
                                                color: isCompleted ? 'var(--text-secondary)' : 'inherit'
                                            }}>
                                                {step.name}
                                            </div>
                                            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                                                {step.temp}°C / {step.duration} мин
                                            </div>
                                            {isHolding && (
                                                <div style={{ fontSize: '0.75rem', color: 'var(--accent-green)', marginTop: '0.2rem', fontWeight: 'bold' }}>
                                                    ⏱ Осталось: {formatTime(stepTimeRemaining)}
                                                </div>
                                            )}
                                        </div>
                                        {isCompleted && (
                                            <CheckCircle size={20} color="var(--accent-green)" style={{ flexShrink: 0 }} />
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* All steps done notification */}
                    <AnimatePresence>
                        {allDone && (
                            <motion.div
                                initial={{ opacity: 0, scale: 0.9 }}
                                animate={{ opacity: 1, scale: 1 }}
                                className="industrial-panel"
                                style={{
                                    padding: '1.5rem',
                                    textAlign: 'center',
                                    borderColor: 'var(--accent-green)',
                                    background: 'rgba(76, 175, 80, 0.1)'
                                }}
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

                    {/* Safety & Start — only before/during process */}
                    {!allDone && (
                        <div className="industrial-panel" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column' }}>
                            {/* Button first — stays in place */}
                            <button
                                disabled={!isStarted && !isHeaterCovered}
                                onClick={handleStart}
                                style={{
                                    padding: '1.5rem',
                                    borderRadius: '8px',
                                    border: 'none',
                                    background: isStarted ? 'var(--accent-red)' : 'var(--primary-color)',
                                    color: '#000',
                                    fontWeight: 'bold',
                                    fontSize: '1.2rem',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '1rem',
                                    cursor: (!isStarted && !isHeaterCovered) ? 'not-allowed' : 'pointer',
                                    opacity: (!isStarted && !isHeaterCovered) ? 0.5 : 1
                                }}
                            >
                                {isStarted ? <><Pause size={24} aria-hidden="true" /> СТОП</> : <><Play size={24} aria-hidden="true" /> СТАРТ ЗАТИРАНИЯ</>}
                            </button>

                            {/* Safety checkbox below — hidden after start */}
                            {!isStarted && (
                                <label style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '1rem',
                                    cursor: 'pointer',
                                    padding: '1rem',
                                    marginTop: '1.5rem',
                                    background: isHeaterCovered ? 'rgba(76, 175, 80, 0.1)' : 'rgba(244, 67, 54, 0.1)',
                                    borderRadius: '4px',
                                    border: `1px solid ${isHeaterCovered ? 'var(--accent-green)' : 'var(--accent-red)'}`
                                }}>
                                    <input
                                        type="checkbox"
                                        checked={isHeaterCovered}
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
                    )}
                </div>
            </div>
        </div>
    );
};

export default Mashing;
