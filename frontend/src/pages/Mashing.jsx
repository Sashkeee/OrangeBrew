import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Play, Pause, Droplets, Zap, ShieldCheck, Timer } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

const Mashing = () => {
    const navigate = useNavigate();
    const { sessionId } = useParams();

    // States
    const [isHeaterCovered, setIsHeaterCovered] = useState(false);
    const [isStarted, setIsStarted] = useState(false);
    const [heaterPower, setHeaterPower] = useState(0);
    const [pumpOn, setPumpOn] = useState(false);
    const [temperature, setTemperature] = useState(25.5);
    const [targetTemp, setTargetTemp] = useState(65);
    const [elapsedTime, setElapsedTime] = useState(0); // in seconds
    const [history, setHistory] = useState([]);
    const [activeStep, setActiveStep] = useState(0);
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    const steps = [
        { name: 'Кислотная пауза', temp: 40, duration: 15 },
        { name: 'Белковая пауза', temp: 52, duration: 20 },
        { name: 'Осахаривание 1', temp: 63, duration: 45 },
        { name: 'Осахаривание 2', temp: 72, duration: 15 },
        { name: 'Мэш-аут', temp: 78, duration: 10 },
    ];

    // Simulation effect
    useEffect(() => {
        let interval;
        if (isStarted) {
            interval = setInterval(() => {
                setElapsedTime(prev => prev + 1);

                // Temperature simulation
                setTemperature(prev => {
                    const powerEffect = (heaterPower / 100) * 0.5;
                    const heatLoss = (prev - 20) * 0.01;
                    const newVal = prev + powerEffect - heatLoss;

                    // Update history
                    const now = new Date();
                    setHistory(h => [...h.slice(-50), { time: now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }), temp: parseFloat(newVal.toFixed(1)) }]);

                    return newVal;
                });
            }, 1000);
        }
        return () => clearInterval(interval);
    }, [isStarted, heaterPower]);

    const formatTime = (seconds) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    return (
        <div style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto' }}>
            <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <button
                        onClick={() => navigate('/brewing')}
                        style={{ background: 'none', border: '1px solid var(--border-color)', color: 'var(--text-primary)', padding: '0.5rem', borderRadius: '4px' }}
                        aria-label="Назад к пивоварению"
                    >
                        <ArrowLeft size={20} aria-hidden="true" />
                    </button>
                    <h1 style={{ margin: 0, fontSize: '1.8rem', color: 'var(--primary-color)' }}>Затирание: <span style={{ color: '#fff' }}>IPA "Orange Sunshine"</span></h1>
                </div>
                <div className="industrial-panel" style={{ padding: '0.5rem 1.5rem', display: 'flex', alignItems: 'center', gap: '0.8rem', borderColor: 'var(--primary-color)' }}>
                    <Timer size={20} color="var(--primary-color)" aria-hidden="true" />
                    <span className="text-mono" style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>{formatTime(elapsedTime)}</span>
                </div>
            </header>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 350px', gap: '2rem' }}>
                {/* Left Column: Main Controls and Graph */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1.5rem' }}>
                        {/* Temp Gauge */}
                        <div className="industrial-panel" style={{ padding: '2rem', textAlign: 'center' }}>
                            <div style={{ color: 'var(--text-secondary)', marginBottom: '0.5rem', fontSize: '0.9rem' }}>ТЕМПЕРАТУРА</div>
                            <div className="text-mono" style={{ fontSize: '3.5rem', fontWeight: '700', color: temperature > 70 ? 'var(--accent-red)' : 'var(--accent-green)' }}>
                                {temperature.toFixed(1)}°
                            </div>
                            <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>ЦЕЛЬ: {targetTemp}°C</div>
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
                                onChange={(e) => setHeaterPower(parseInt(e.target.value))}
                                disabled={!isStarted || !isHeaterCovered}
                                style={{ width: '100%', accentColor: 'var(--primary-color)' }}
                            />
                            <div className="text-mono" style={{ textAlign: 'center', marginTop: '0.5rem', fontSize: '1.5rem' }}>{heaterPower}%</div>
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
                                onClick={() => setPumpOn(!pumpOn)}
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
                    <div className="industrial-panel" style={{ padding: '1.5rem', height: '400px', width: '100%', minWidth: 0 }}>
                        {mounted && (
                            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                                <LineChart data={history}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                                    <XAxis dataKey="time" stroke="#666" fontSize={12} />
                                    <YAxis domain={[20, 100]} stroke="#666" fontSize={12} />
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
                            {steps.map((step, idx) => (
                                <div key={idx} style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '1rem',
                                    padding: '0.8rem',
                                    background: activeStep === idx ? 'rgba(255,152,0,0.1)' : 'transparent',
                                    border: activeStep === idx ? '1px solid var(--primary-color)' : '1px solid #333',
                                    borderRadius: '4px',
                                    opacity: idx < activeStep ? 0.5 : 1
                                }}>
                                    <div style={{
                                        width: '10px',
                                        height: '10px',
                                        borderRadius: '50%',
                                        background: idx < activeStep ? 'var(--accent-green)' : (idx === activeStep ? 'var(--primary-color)' : '#444')
                                    }} />
                                    <div style={{ flex: 1 }}>
                                        <div style={{ fontSize: '0.9rem', fontWeight: idx === activeStep ? 'bold' : 'normal' }}>{step.name}</div>
                                        <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{step.temp}°C / {step.duration} мин</div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="industrial-panel" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '1rem', cursor: 'pointer', padding: '1rem', background: isHeaterCovered ? 'rgba(76, 175, 80, 0.1)' : 'rgba(244, 67, 54, 0.1)', borderRadius: '4px', border: `1px solid ${isHeaterCovered ? 'var(--accent-green)' : 'var(--accent-red)'}` }}>
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

                        <button
                            disabled={!isHeaterCovered}
                            onClick={() => setIsStarted(!isStarted)}
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
                                cursor: isHeaterCovered ? 'pointer' : 'not-allowed',
                                opacity: isHeaterCovered ? 1 : 0.5
                            }}
                        >
                            {isStarted ? <><Pause size={24} aria-hidden="true" /> СТОП</> : <><Play size={24} aria-hidden="true" /> СТАРТ ЗАТИРАНИЯ</>}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Mashing;
