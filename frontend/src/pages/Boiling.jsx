import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Play, Pause, Droplets, Zap, ShieldCheck, Timer, AlertCircle } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useSensors } from '../hooks/useSensors';
import { useControl } from '../hooks/useControl';

const Boiling = () => {
    const navigate = useNavigate();
    const { sessionId } = useParams();

    // Hooks
    const { sensors } = useSensors();
    const { control, setHeater, setPump } = useControl();

    const [isStarted, setIsStarted] = useState(false);

    // Data from hooks
    const temperature = sensors.boiler?.value || 20;
    const heaterPower = control.heater;
    const pumpOn = control.pump;

    const [elapsedTime, setElapsedTime] = useState(0);
    const [boilTimer, setBoilTimer] = useState(60 * 60); // 60 mins default
    const [history, setHistory] = useState([]);
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    // Graph history update
    useEffect(() => {
        const now = new Date();
        setHistory(h => [...h.slice(-50), { time: now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }), temp: temperature }]);
    }, [temperature]);

    useEffect(() => {
        let interval;
        if (isStarted) {
            interval = setInterval(() => {
                setElapsedTime(prev => prev + 1);
                if (temperature >= 99 && boilTimer > 0) {
                    setBoilTimer(prev => prev - 1);
                }
            }, 1000);
        }
        return () => clearInterval(interval);
    }, [isStarted, temperature, boilTimer]);

    const formatTime = (seconds) => {
        const h = Math.floor(seconds / (60 * 60));
        const m = Math.floor((seconds % (60 * 60)) / 60);
        const s = seconds % 60;
        return `${h > 0 ? h + ':' : ''}${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
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
                    <h1 style={{ margin: 0, fontSize: '1.8rem', color: 'var(--accent-red)' }}>Кипячение</h1>
                </div>
                <div style={{ display: 'flex', gap: '1rem' }}>
                    <div className="industrial-panel" style={{ padding: '0.5rem 1.5rem', display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>ОБЩЕЕ ВРЕМЯ</span>
                        <span className="text-mono" style={{ fontSize: '1.2rem', fontWeight: 'bold' }}>{formatTime(elapsedTime + 5400)}</span>
                    </div>
                    <div className="industrial-panel" style={{ padding: '0.5rem 1.5rem', display: 'flex', alignItems: 'center', gap: '0.8rem', borderColor: 'var(--accent-red)' }}>
                        <Timer size={20} color="var(--accent-red)" aria-hidden="true" />
                        <span className="text-mono" style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>{formatTime(boilTimer)}</span>
                    </div>
                </div>
            </header>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 350px', gap: '2rem' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1.5rem' }}>
                        <div className="industrial-panel" style={{ padding: '2rem', textAlign: 'center', borderBottom: temperature >= 99 ? '4px solid var(--accent-red)' : 'none' }}>
                            <div style={{ color: 'var(--text-secondary)', marginBottom: '0.5rem', fontSize: '0.9rem' }}>ТЕМПЕРАТУРА</div>
                            <div className="text-mono" style={{ fontSize: '3.5rem', fontWeight: '700', color: temperature >= 95 ? 'var(--accent-red)' : 'var(--text-primary)' }}>
                                {temperature.toFixed(1)}°
                            </div>
                            <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>{temperature >= 99 ? 'КИПЕНИЕ' : 'НАГРЕВ...'}</div>
                        </div>

                        <div className="industrial-panel" style={{ padding: '2rem' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
                                <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>МОЩНОСТЬ ТЭН</span>
                                <Zap size={18} color="var(--accent-red)" aria-hidden="true" />
                            </div>
                            <input
                                type="range"
                                min="0"
                                max="100"
                                value={heaterPower}
                                onChange={(e) => setHeater(parseInt(e.target.value))}
                                style={{ width: '100%', accentColor: 'var(--accent-red)' }}
                            />
                            <div className="text-mono" style={{ textAlign: 'center', marginTop: '0.5rem', fontSize: '1.5rem' }}>{heaterPower}%</div>
                        </div>

                        <div className="industrial-panel" style={{ padding: '2rem', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                            <motion.div animate={{ rotate: pumpOn ? 360 : 0 }} transition={{ duration: 2, repeat: Infinity, ease: "linear" }} style={{ color: pumpOn ? 'var(--accent-blue)' : '#444' }}>
                                <Droplets size={40} aria-hidden="true" />
                            </motion.div>
                            <button onClick={() => setPump(!pumpOn)} style={{ marginTop: '0.5rem', padding: '0.5rem 2rem', borderRadius: '20px', background: pumpOn ? 'var(--accent-blue)' : 'transparent', border: `1px solid ${pumpOn ? 'var(--accent-blue)' : '#444'}`, color: pumpOn ? '#000' : '#fff', fontWeight: 'bold' }}>
                                НАСОС {pumpOn ? 'ВКЛ' : 'ВЫКЛ'}
                            </button>
                        </div>
                    </div>

                    <div className="industrial-panel" style={{ padding: '1.5rem', height: '400px', width: '100%', minWidth: 0 }}>
                        {mounted && (
                            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                                <LineChart data={history}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                                    <XAxis dataKey="time" stroke="#666" fontSize={12} />
                                    <YAxis domain={[70, 105]} stroke="#666" fontSize={12} />
                                    <Tooltip contentStyle={{ backgroundColor: '#1a1a1a', border: '1px solid #333', color: '#fff' }} />
                                    <Line type="monotone" dataKey="temp" stroke="var(--accent-red)" strokeWidth={2} dot={false} animationDuration={300} />
                                </LineChart>
                            </ResponsiveContainer>
                        )}
                    </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                    <div className="industrial-panel" style={{ padding: '1.5rem' }}>
                        <h3 style={{ margin: '0 0 1.5rem 0', fontSize: '1.1rem', color: 'var(--text-secondary)' }}>ХМЕЛЬ / ДОБАВКИ</h3>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            <div style={{ padding: '1rem', border: '1px solid #333', borderRadius: '4px', background: 'rgba(255,255,255,0.02)' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                                    <span style={{ fontWeight: 'bold' }}>Magnum (Горький)</span>
                                    <span className="text-mono" style={{ color: 'var(--accent-red)' }}>60 мин</span>
                                </div>
                                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Внесено при закипании</div>
                            </div>
                            <div style={{ padding: '1rem', border: '1px solid #333', borderRadius: '4px', opacity: 0.6 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                                    <span style={{ fontWeight: 'bold' }}>Citra (Аромат)</span>
                                    <span className="text-mono">15 мин</span>
                                </div>
                                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Ожидание: 45:00</div>
                            </div>
                        </div>
                    </div>

                    <div className="industrial-panel" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                        <button
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
                                cursor: 'pointer'
                            }}
                        >
                            {isStarted ? <><Pause size={24} aria-hidden="true" /> СТОП</> : <><Play size={24} aria-hidden="true" /> СТАРТ КИПЯЧЕНИЯ</>}
                        </button>
                    </div>

                    <button
                        onClick={() => navigate('/brewing/history')}
                        style={{
                            padding: '1.5rem',
                            borderRadius: '8px',
                            border: 'none',
                            background: '#333',
                            color: '#fff',
                            fontWeight: 'bold',
                            fontSize: '1.2rem',
                            cursor: 'pointer'
                        }}
                    >
                        ЗАВЕРШИТЬ ВАРКУ
                    </button>
                </div>
            </div>
        </div>
    );
};

export default Boiling;
