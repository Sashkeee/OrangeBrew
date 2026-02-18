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
    const [recipeData, setRecipeData] = useState(null);
    const [notifiedTimes, setNotifiedTimes] = useState(new Set()); // To avoid duplicate notifies

    const sendTelegramNotify = async (type, payload = {}) => {
        try {
            await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3001/api'}/telegram/${type}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
        } catch (e) { console.error('[Telegram] Notify failed:', e); }
    };

    useEffect(() => {
        try {
            const saved = localStorage.getItem('currentRecipe');
            if (saved) {
                const parsed = JSON.parse(saved);
                setRecipeData(parsed);
                if (parsed.boil_time) setBoilTimer(parsed.boil_time * 60);
            }
        } catch (e) { console.warn('Could not load recipe', e); }

        sendTelegramNotify('set-process-type', { type: 'boil' });
    }, []);
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

            if (temperature >= 99 && boilTimer > 0) {
                // If just started boiling
                if (!notifiedTimes.has('boil_start')) {
                    sendTelegramNotify('notify-boil', { type: 'start', details: `Кипение достигнуто (${temperature.toFixed(1)}°C). Начинаем отсчёт времени.` });
                    setNotifiedTimes(prev => new Set(prev).add('boil_start'));
                }

                const nextTimer = boilTimer - 1;
                setBoilTimer(nextTimer);

                // Hop additions reminders
                const boilTimeMins = Math.floor(nextTimer / 60);
                const boilTimeSecs = nextTimer % 60;

                if (recipeData?.hop_additions) {
                    recipeData.hop_additions.forEach(hop => {
                        const hopKey = `hop_${hop.name}_${hop.time}`;
                        if (boilTimeMins === hop.time && boilTimeSecs === 0 && !notifiedTimes.has(hopKey)) {
                            sendTelegramNotify('notify-boil', { type: 'hop', details: `📥 *Время внесения хмеля!*\n\nХмель: *${hop.name}*\nКоличество: *${hop.amount}г*\nВремя: *${hop.time} мин*` });
                            setNotifiedTimes(prev => new Set(prev).add(hopKey));
                        }
                    });
                }

                // Time reminders: 10, 5, 3 minutes
                [10, 5, 3].forEach(min => {
                    const remKey = `rem_${min}`;
                    if (boilTimeMins === min && boilTimeSecs === 0 && !notifiedTimes.has(remKey)) {
                        sendTelegramNotify('notify-boil', { type: 'reminder', details: `⏳ До конца кипячения осталось *${min} минут*` });
                        setNotifiedTimes(prev => new Set(prev).add(remKey));
                    }
                });

                // Complete
                if (nextTimer === 0 && !notifiedTimes.has('boil_complete')) {
                    sendTelegramNotify('notify-boil', { type: 'complete', details: 'Кипячение завершено! 🍻' });
                    setNotifiedTimes(prev => new Set(prev).add('boil_complete'));
                }
            }
        }, 1000);
        return () => clearInterval(interval);
    }, [isStarted, temperature, boilTimer, recipeData, notifiedTimes]);

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
                            <button className={`btn-pump ${pumpOn ? 'btn-pump--on' : ''}`} onClick={() => {
                                const next = !pumpOn;
                                setPump(next);
                                sendTelegramNotify('notify-pump', { value: next });
                            }}>
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
                            {recipeData?.hop_additions?.length > 0 ? (
                                recipeData.hop_additions.sort((a, b) => b.time - a.time).map((hop, i) => {
                                    const boilTimeMins = Math.floor(boilTimer / 60);
                                    const isAdded = boilTimeMins < hop.time;
                                    const isPending = !isAdded && isStarted;

                                    return (
                                        <div key={i} className="phase-item" style={{
                                            padding: '1rem',
                                            background: isAdded ? 'rgba(76,175,80,0.05)' : 'rgba(255,255,255,0.02)',
                                            borderColor: isAdded ? 'var(--accent-green)' : '#333',
                                            opacity: isAdded ? 1 : 0.6
                                        }}>
                                            <div className="phase-item__info">
                                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.3rem' }}>
                                                    <span style={{ fontWeight: 'bold', color: isAdded ? 'var(--accent-green)' : '#fff' }}>
                                                        {hop.name} {isAdded && '✓'}
                                                    </span>
                                                    <span className="text-mono" style={{ color: isAdded ? 'var(--accent-green)' : 'var(--accent-red)' }}>
                                                        {hop.time} мин
                                                    </span>
                                                </div>
                                                <div className="phase-item__desc">
                                                    {hop.amount}г {isAdded ? '· Внесено' : `· Ожидание: ${formatTime(Math.max(0, (boilTimeMins - hop.time) * 60 + (boilTimer % 60)))}`}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })
                            ) : (
                                <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', textAlign: 'center', padding: '1rem' }}>
                                    Нет данных о хмеле
                                </div>
                            )}
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
