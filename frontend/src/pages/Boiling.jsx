import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useNavigate, useParams } from 'react-router-dom';
import { Droplets, Zap, Timer } from 'lucide-react';
import { useSensors } from '../hooks/useSensors';
import { useControl } from '../hooks/useControl';

import { PageHeader } from '../components/PageHeader';
import { ProcessChart } from '../components/ProcessChart';
import { StartButton } from '../components/StartButton';
import { formatTime } from '../utils/formatTime';
import './pages.css';

const CHART_LINES = [
    { dataKey: 'temp', color: 'var(--accent-red)', name: 'Температура', width: 2 },
];

const Boiling = () => {
    const navigate = useNavigate();
    const { sessionId } = useParams();

    const { sensors } = useSensors();
    const { control, setHeater, setPump } = useControl();

    const [isStarted, setIsStarted] = useState(false);
    const temperature = sensors.boiler?.value || 20;
    const heaterPower = control.heater;
    const pumpOn = control.pump;

    const [elapsedTime, setElapsedTime] = useState(0);
    const [boilTimer, setBoilTimer] = useState(60 * 60);
    const [history, setHistory] = useState([]);

    // Chart history
    useEffect(() => {
        setHistory(h => [...h.slice(-50), {
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
            temp: temperature,
        }]);
    }, [temperature]);

    // Timer
    useEffect(() => {
        if (!isStarted) return;
        const interval = setInterval(() => {
            setElapsedTime(p => p + 1);
            if (temperature >= 99 && boilTimer > 0) setBoilTimer(p => p - 1);
        }, 1000);
        return () => clearInterval(interval);
    }, [isStarted, temperature, boilTimer]);

    return (
        <div className="page-container" style={{ maxWidth: '1200px' }}>
            <PageHeader title="Кипячение" color="var(--accent-red)" backTo="/brewing" elapsed={elapsedTime}>
                <div className="industrial-panel" style={{ padding: '0.5rem 1.5rem', display: 'flex', alignItems: 'center', gap: '0.8rem', borderColor: 'var(--accent-red)' }}>
                    <Timer size={20} color="var(--accent-red)" />
                    <span className="text-mono" style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>{formatTime(boilTimer)}</span>
                </div>
            </PageHeader>

            <div className="layout-2col layout-2col--narrow">
                {/* ─── Left Column ─── */}
                <div className="col-main">
                    <div className="sensor-grid sensor-grid--3">
                        {/* Temperature */}
                        <div className="industrial-panel" style={{ padding: '2rem', textAlign: 'center', borderBottom: temperature >= 99 ? '4px solid var(--accent-red)' : 'none' }}>
                            <div className="sensor-card__label" style={{ fontSize: '0.9rem' }}>ТЕМПЕРАТУРА</div>
                            <div className="sensor-card__value sensor-card__value--lg text-mono"
                                style={{ color: temperature >= 95 ? 'var(--accent-red)' : 'var(--text-primary)' }}>
                                {temperature.toFixed(1)}°
                            </div>
                            <div className="sensor-card__sub">{temperature >= 99 ? 'КИПЕНИЕ' : 'НАГРЕВ...'}</div>
                        </div>

                        {/* Heater */}
                        <div className="industrial-panel control-panel" style={{ padding: '2rem' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
                                <span className="control-panel__label" style={{ marginBottom: 0 }}>МОЩНОСТЬ ТЭН</span>
                                <Zap size={18} color="var(--accent-red)" />
                            </div>
                            <input type="range" min="0" max="100" value={heaterPower}
                                className="control-slider" style={{ accentColor: 'var(--accent-red)' }}
                                onChange={e => setHeater(parseInt(e.target.value))} />
                            <div className="control-value text-mono" style={{ fontSize: '1.5rem' }}>{heaterPower}%</div>
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
                            <button className={`btn-pump ${pumpOn ? 'btn-pump--on' : ''}`} onClick={() => setPump(!pumpOn)}>
                                НАСОС {pumpOn ? 'ВКЛ' : 'ВЫКЛ'}
                            </button>
                        </div>
                    </div>

                    <ProcessChart
                        data={history} lines={CHART_LINES}
                        defaultYMin={70} defaultYMax={105}
                        height="chart-panel--lg"
                    />
                </div>

                {/* ─── Right Column ─── */}
                <div className="col-side">
                    {/* Hops / Additions */}
                    <div className="industrial-panel" style={{ padding: '1.5rem' }}>
                        <h3 className="phase-list__title">ХМЕЛЬ / ДОБАВКИ</h3>
                        <div className="phase-list">
                            <div className="phase-item" style={{ padding: '1rem', background: 'rgba(255,255,255,0.02)' }}>
                                <div className="phase-item__info">
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.3rem' }}>
                                        <span style={{ fontWeight: 'bold' }}>Magnum (Горький)</span>
                                        <span className="text-mono" style={{ color: 'var(--accent-red)' }}>60 мин</span>
                                    </div>
                                    <div className="phase-item__desc">Внесено при закипании</div>
                                </div>
                            </div>
                            <div className="phase-item" style={{ padding: '1rem', opacity: 0.6 }}>
                                <div className="phase-item__info">
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.3rem' }}>
                                        <span style={{ fontWeight: 'bold' }}>Citra (Аромат)</span>
                                        <span className="text-mono">15 мин</span>
                                    </div>
                                    <div className="phase-item__desc">Ожидание: 45:00</div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Start / Stop */}
                    <div className="industrial-panel" style={{ padding: '1.5rem' }}>
                        <StartButton
                            isStarted={isStarted}
                            onClick={() => setIsStarted(!isStarted)}
                            startLabel="СТАРТ КИПЯЧЕНИЯ"
                            startColor="var(--primary-color)"
                        />
                    </div>

                    <button
                        onClick={() => navigate('/brewing/history')}
                        className="btn-start"
                        style={{ background: '#333', color: '#fff' }}
                    >
                        ЗАВЕРШИТЬ ВАРКУ
                    </button>
                </div>
            </div>
        </div>
    );
};

export default Boiling;
