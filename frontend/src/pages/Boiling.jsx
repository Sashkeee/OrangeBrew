import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useNavigate, useParams } from 'react-router-dom';
import { Droplets, Zap, Timer } from 'lucide-react';
import { useSensors } from '../hooks/useSensors';
import { useControl } from '../hooks/useControl';
import { useProcess } from '../hooks/useProcess';

import { PageHeader } from '../components/PageHeader';
import { ProcessChart } from '../components/ProcessChart';
import { StartButton } from '../components/StartButton';
import DeviceSelector from '../components/DeviceSelector';
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

    // Backend Process Hook
    const {
        processState, status, currentStep, activeStepIndex,
        stepPhase, remainingTime, elapsedTime,
        start, stop, pause, resume, isLoading
    } = useProcess();

    const [recipeData, setRecipeData] = useState(null);

    // Initial load
    useEffect(() => {
        try {
            const saved = localStorage.getItem('currentRecipe');
            if (saved) {
                setRecipeData(JSON.parse(saved));
            }
        } catch (e) { console.warn('Could not load recipe', e); }
    }, []);

    const temperature = sensors.boiler?.value || 20;
    const heaterPower = control.heater;
    const pumpOn = control.pump;

    // Derived State
    const isStarted = status !== 'IDLE' && status !== 'COMPLETED' && processState?.mode === 'boil';
    const isPaused = status === 'PAUSED' && processState?.mode === 'boil';
    const isBoiling = (status === 'HOLDING' || stepPhase === 'holding') && processState?.mode === 'boil';
    const allDone = status === 'COMPLETED' && processState?.mode === 'boil';

    const [history, setHistory] = useState([]);
    const [alertedHops, setAlertedHops] = useState(new Set());
    const [selectedDeviceId, setSelectedDeviceId] = useState('');


    // Load history from DB
    useEffect(() => {
        if (!sessionId || sessionId === 'new') return;
        import('../api/client.js').then(({ sessionsApi }) => {
            sessionsApi.getTemperatures(sessionId, 5000).then(res => {
                if (res && res.length > 0) {
                    const formatted = res.map(row => ({
                        time: new Date(row.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
                        temp: row.value,
                        unix: new Date(row.timestamp).getTime()
                    }));
                    setHistory(formatted.reverse());
                }
            }).catch(console.error);
        });
    }, [sessionId]);

    // Live Chart append
    useEffect(() => {
        if (!isStarted) return;
        setHistory(h => {
            const now = Date.now();
            const last = h[h.length - 1];
            if (last && now - last.unix < 9500) return h;

            return [...h, {
                time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
                temp: temperature,
                unix: now
            }];
        });
    }, [temperature, isStarted]);

    // Hop Additions Alerts
    useEffect(() => {
        if (!isBoiling || !recipeData?.hop_additions) return;

        const timeLeftMins = Math.floor(remainingTime / 60);

        recipeData.hop_additions.forEach(hop => {
            const hopTime = parseInt(hop.time);
            if (timeLeftMins === hopTime && !alertedHops.has(hop.id)) {
                alert(`🔔 ВРЕМЯ ВНОСИТЬ ХМЕЛЬ!\n\nСорт: ${hop.name}\nКоличество: ${hop.amount} г.`);
                setAlertedHops(prev => new Set(prev).add(hop.id));
            }
        });
    }, [remainingTime, recipeData, isBoiling, alertedHops]);

    const handleStartStop = () => {
        if (isStarted) {
            if (isPaused) {
                resume();
            }
            else {
                if (confirm("Вы уверены, что хотите поставить процесс на паузу?")) {
                    pause();
                }
            }
        } else {
            if (recipeData) {
                start(recipeData, sessionId, 'boil', selectedDeviceId);
            } else {
                alert("Ошибка: рецепт не загружен");
            }
        }
    };

    const handleStopAbrupt = () => {
        if (confirm("Вы уверены, что хотите остановить варку? Это действие нельзя отменить.")) {
            stop();
        }
    };

    useEffect(() => {
        // Sync URL with actual session ID from backend to ensure data persistence
        if (processState?.sessionId && sessionId === 'new') {
            navigate(`/brewing/boil/${processState.sessionId}`, { replace: true });
        }
    }, [processState?.sessionId, sessionId, navigate]);

    return (
        <div className="page-container" style={{ maxWidth: '1200px' }}>
            <PageHeader title="Кипячение" color="var(--accent-red)" backTo="/brewing" elapsed={elapsedTime}>
                <div className="industrial-panel" style={{ padding: '0.5rem 1.5rem', display: 'flex', alignItems: 'center', gap: '0.8rem', borderColor: 'var(--accent-red)' }}>
                    <Timer size={20} color="var(--accent-red)" />
                    <span className="text-mono" style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>
                        {isStarted ? formatTime(remainingTime) : (recipeData?.boil_time ? `${recipeData.boil_time}:00` : '60:00')}
                    </span>
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
                            <div className="sensor-card__sub">
                                {isBoiling ? 'КИПЕНИЕ' : (isStarted ? 'НАГРЕВ...' : 'ОЖИДАНИЕ')}
                            </div>
                        </div>

                        {/* Heater */}
                        <div className="industrial-panel control-panel" style={{ padding: '2rem' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
                                <span className="control-panel__label" style={{ marginBottom: 0 }}>МОЩНОСТЬ ТЭН</span>
                                <Zap size={18} color="var(--accent-red)" />
                            </div>
                            <input type="range" min="0" max="100" value={heaterPower}
                                className="control-slider" style={{ accentColor: 'var(--accent-red)' }}
                                onChange={e => setHeater(parseInt(e.target.value))}
                                disabled={isStarted && !isPaused} // Disable manual control if auto logic is running (ProcessManager controls heater in boil mode? Backend says it sets target, but boiling usually requires manual PWM or 100%. ProcessManager currently sets PID target to 100C. )
                            />
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
                                    // Use hook remainingTime to calculate status
                                    const boilDuration = recipeData.boil_time * 60;
                                    const currentBoilTime = boilDuration - remainingTime;
                                    const currentBoilMins = Math.floor(currentBoilTime / 60);

                                    // Backend counts DOWN remainingTime
                                    // Hop time is "mins from end" usually? 
                                    // "60 min" hop means boil for 60 mins. "10 min" hop means add when 10 mins LEFT.
                                    // ProcessManager implementation: if (hop.time === timeLeftMins)
                                    // So hop.time represents "Minutes Remaining"

                                    const timeLeftMins = Math.floor(remainingTime / 60);
                                    const isAdded = timeLeftMins < hop.time;

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
                                                    {hop.amount}г {isAdded ? '· Внесено' : (isStarted ? `· Через ${Math.max(0, timeLeftMins - hop.time)} мин` : '')}
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
                        {!isStarted && <DeviceSelector value={selectedDeviceId} onChange={setSelectedDeviceId} />}
                        <StartButton

                            isStarted={isStarted && !isPaused}
                            onClick={handleStartStop}
                            startLabel={isPaused ? "ПРОДОЛЖИТЬ" : "СТАРТ КИПЯЧЕНИЯ"}
                            stopLabel="ПАУЗА"
                            startColor={isPaused ? "var(--accent-green)" : "var(--accent-red)"}
                            stopColor="var(--accent-yellow)"
                        />
                        {isStarted && (
                            <button
                                onClick={handleStopAbrupt}
                                style={{
                                    marginTop: '1rem',
                                    width: '100%',
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
                    </div>

                    <button
                        onClick={() => {
                            stop();
                            navigate('/brewing');
                        }}
                        className="btn-start"
                        style={{ background: '#333', color: '#fff', marginTop: '1rem' }}
                    >
                        ЗАВЕРШИТЬ ВАРКУ
                    </button>
                </div>
            </div>
        </div>
    );
};

export default Boiling;
