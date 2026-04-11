import React, { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate, useParams } from 'react-router-dom';
import { Play, Pause, Droplets, Zap, Thermometer, CheckCircle, ZoomIn, ZoomOut, SkipForward, AlertTriangle } from 'lucide-react';
import { ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { useSensors } from '../hooks/useSensors';
import { useControl } from '../hooks/useControl';
import { useProcess } from '../hooks/useProcess';

import { sessionsApi, recipesApi } from '../api/client.js';
import { PageHeader } from '../components/PageHeader';
import { SafetyCheck } from '../components/SafetyCheck';
import { StartButton } from '../components/StartButton';
import DeviceSelector from '../components/DeviceSelector';
import SensorSelector from '../components/SensorSelector';
import { formatTime } from '../utils/formatTime';

import './pages.css';

const DEFAULT_STEPS = [
    { name: 'Пауза осахаривания', temp: 65, duration: 60 }
];

const Mashing = () => {
    const navigate = useNavigate();
    const { sessionId } = useParams();

    const { sensors, rawSensors, namedSensors } = useSensors();
    const { control, setHeater, setPump } = useControl();

    // New backend process hook
    const {
        processState, status, currentStep, activeStepIndex,
        stepPhase, remainingTime, elapsedTime,
        start, stop, pause, resume, skip, isLoading
    } = useProcess();

    // Recipe — загружаем из API по sessionId
    const [recipeData, setRecipeData] = useState(null);
    useEffect(() => {
        if (!sessionId || sessionId === 'new') return;
        sessionsApi.getById(sessionId)
            .then(s => s?.recipe_id ? recipesApi.getById(s.recipe_id) : null)
            .then(r => {
                if (!r) return;
                const recipeSteps = r.mash_steps || r.steps || [];
                setRecipeData({ ...r, steps: recipeSteps });
            })
            .catch(e => console.warn('[Mashing] Could not load recipe', e));
    }, [sessionId]);

    const steps = useMemo(() => recipeData?.steps?.map(s => ({
        name: s.name, temp: s.temp, duration: s.duration
    })) || DEFAULT_STEPS, [recipeData]);

    const recipeName = recipeData?.name || 'IPA "Orange Sunshine"';

    // Core state
    const [isHeaterCovered, setIsHeaterCovered] = useState(false);
    const [history, setHistory] = useState([]);
    const [uiError, setUiError] = useState(null);

    // Graph scale
    const [graphYMin, setGraphYMin] = useState(20);
    const [graphYMax, setGraphYMax] = useState(100);
    const [mounted, setMounted] = useState(false);
    const [selectedDeviceId, setSelectedDeviceId] = useState(null);
    const [selectedSensorAddress, setSelectedSensorAddress] = useState(null);

    // Chart layer toggles
    const [showHeaterPower, setShowHeaterPower] = useState(false);
    const [showPrevSession, setShowPrevSession] = useState(false);
    const [prevHistory, setPrevHistory] = useState([]);
    const [periodMinutes, setPeriodMinutes] = useState(null);


    // Derived - use selected named sensor temp if available, fallback to mapped boiler
    const selectedNamedSensor = namedSensors.find(s => s.address === selectedSensorAddress);
    const sensorColor = selectedNamedSensor?.color || 'var(--primary-color)';

    const temperature = (() => {
        if (selectedSensorAddress) {
            // Try namedSensors first (already has applied calibration from useSensors)
            if (selectedNamedSensor && selectedNamedSensor.temp != null) return selectedNamedSensor.temp;
            // Fallback to rawSensors
            const rawSelected = rawSensors.find(s => s.address === selectedSensorAddress);
            if (rawSelected && rawSelected.temp !== undefined) return rawSelected.temp;
        }
        return sensors.boiler?.value || 20;
    })();
    const heaterPower = control.heater;
    const pumpOn = control.pump;
    const isStarted = status !== 'IDLE' && status !== 'COMPLETED' && processState?.mode === 'mash';
    const isPaused = status === 'PAUSED' && processState?.mode === 'mash';
    const allDone = status === 'COMPLETED' && processState?.mode === 'mash';

    // Target depends on backend state usually, but for visualization we use currentStep from known stairs
    // If backend doesn't send "currentStep" object fully, we find it by index. Before start, use index 0.
    const targetTemp = currentStep?.temp || steps[Math.max(0, activeStepIndex)]?.temp || 65;

    useEffect(() => { setMounted(true); }, []);

    // Load history from DB
    useEffect(() => {
        if (!sessionId || sessionId === 'new') return;
        sessionsApi.getTemperatures(sessionId, 5000).then(res => {
            if (res && res.length > 0) {
                const formatted = res.map(row => ({
                    time: new Date(row.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
                    temp: row.value,
                    target: targetTemp,
                    unix: new Date(row.timestamp).getTime()
                }));
                setHistory(formatted.reverse());
            }
        }).catch(console.error);
    }, [sessionId, targetTemp]);

    // Load previous session for comparison
    useEffect(() => {
        if (!showPrevSession || !recipeData?.id || !sessionId || sessionId === 'new') {
            if (!showPrevSession) setPrevHistory([]);
            return;
        }
        sessionsApi.getAll('mash').then(sessions => {
            const prev = sessions
                .filter(s => s.recipe_id === recipeData.id && String(s.id) !== String(sessionId))
                .sort((a, b) => new Date(b.started_at) - new Date(a.started_at))[0];
            if (!prev) return null;
            return sessionsApi.getTemperatures(prev.id, 5000);
        }).then(res => {
            if (!res) return;
            const formatted = res.map(row => ({
                temp: row.value,
                unix: new Date(row.timestamp).getTime()
            })).reverse();
            setPrevHistory(formatted);
        }).catch(e => console.warn('[Mashing] Could not load prev session', e));
    }, [showPrevSession, recipeData?.id, sessionId]);

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
                target: targetTemp,
                heaterPower: heaterPower || 0,
                unix: now
            }];
        });
    }, [temperature, targetTemp, isStarted]);

    // Auto-clear error after 8 seconds
    useEffect(() => {
        if (uiError) {
            const t = setTimeout(() => setUiError(null), 8000);
            return () => clearTimeout(t);
        }
    }, [uiError]);

    // Handle Start / Stop / Pause
    const handleStartStop = async () => {
        setUiError(null);
        if (isStarted) {
            if (isPaused) {
                try { await resume(); } catch (e) { setUiError(`Ошибка возобновления: ${e.message}`); }
            } else {
                if (confirm("Вы уверены, что хотите поставить затирание на паузу?")) {
                    try { await pause(); } catch (e) { setUiError(`Ошибка паузы: ${e.message}`); }
                }
            }
        } else {
            // Start new process
            if (recipeData) {
                const firstStep = recipeData.mash_steps?.[0] || recipeData.steps?.[0];
                if (firstStep && temperature > firstStep.temp + 3) {
                    setUiError(`Температура сусла (${temperature.toFixed(1)}°C) выше первой паузы (${firstStep.temp}°C) на 3+ градуса. Остудите затор.`);
                    return;
                }
                const deviceToUse = selectedDeviceId || 'local_serial';
                console.log('[Mashing] Starting process with device:', deviceToUse, 'sensor:', selectedSensorAddress, 'recipe:', recipeData.name);
                try {
                    await start(recipeData, sessionId, 'mash', deviceToUse, selectedSensorAddress);
                    console.log('[Mashing] Process started successfully');
                } catch (e) {
                    console.error('[Mashing] Start failed:', e);
                    setUiError(`Ошибка запуска: ${e.message}`);
                }
            } else {
                setUiError("Рецепт не загружен! Вернитесь на страницу варки и выберите рецепт.");
            }
        }
    };

    const handleStopAbrupt = () => {
        if (confirm("Вы уверены, что хотите остановить процесс затирания? Это действие нельзя отменить.")) {
            stop();
        }
    };

    useEffect(() => {
        // Sync URL with actual session ID from backend to ensure data persistence
        if (processState?.sessionId && sessionId === 'new') {
            navigate(`/brewing/mash/${processState.sessionId}`, { replace: true });
        }
    }, [processState?.sessionId, sessionId, navigate]);

    // Navigate to boiling when done
    useEffect(() => {
        if (allDone) {
            const nextSessionId = processState?.sessionId || sessionId || 'new';
            const t = setTimeout(() => navigate(`/brewing/boil/${nextSessionId}`), 3000);
            return () => clearTimeout(t);
        }
    }, [allDone, navigate, sessionId, processState?.sessionId]);

    // Pump toggle
    const handlePumpToggle = async () => {
        const next = !pumpOn;
        try {
            await setPump(next);
        } catch (e) {
            console.error('[Mashing] Pump toggle failed:', e);
            setUiError(`Ошибка переключения насоса: ${e.message}`);
        }
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

    // Filter history by selected period
    const filteredHistory = useMemo(() => {
        if (!periodMinutes) return history;
        const cutoff = Date.now() - periodMinutes * 60 * 1000;
        return history.filter(p => p.unix >= cutoff);
    }, [history, periodMinutes]);

    // Merge current session with previous for comparison (normalised to relative minutes)
    const chartData = useMemo(() => {
        if (!showPrevSession || prevHistory.length === 0) return filteredHistory;

        const firstUnix = filteredHistory[0]?.unix || Date.now();
        const currentByMin = {};
        filteredHistory.forEach(p => {
            const relMin = Math.round((p.unix - firstUnix) / 60000);
            if (!currentByMin[relMin]) currentByMin[relMin] = p;
        });

        const prevFirstUnix = prevHistory[0]?.unix || 0;
        const prevByMin = {};
        prevHistory.forEach(p => {
            const relMin = Math.round((p.unix - prevFirstUnix) / 60000);
            if (prevByMin[relMin] === undefined) prevByMin[relMin] = p.temp;
        });

        const allMins = new Set([
            ...Object.keys(currentByMin).map(Number),
            ...Object.keys(prevByMin).map(Number),
        ]);

        return Array.from(allMins).sort((a, b) => a - b).map(min => ({
            relMin: min,
            time: `${min} мин`,
            temp: currentByMin[min]?.temp ?? null,
            target: currentByMin[min]?.target ?? null,
            heaterPower: currentByMin[min]?.heaterPower ?? null,
            prevTemp: prevByMin[min] ?? null,
        }));
    }, [showPrevSession, prevHistory, filteredHistory]);

    // Detect step transitions for annotations (vertical lines on target change)
    const stepAnnotations = useMemo(() => {
        if (!chartData.length) return [];
        const annotations = [];
        let lastTarget = null;
        chartData.forEach(p => {
            if (p.target == null) return;
            if (lastTarget !== null && p.target !== lastTarget) {
                annotations.push({ x: p.time, label: `→ ${p.target}°C` });
            }
            lastTarget = p.target;
        });
        return annotations;
    }, [chartData]);

    return (
        <div className="page-container" style={{ maxWidth: '1200px' }}>
            {/* Error Notification */}
            <AnimatePresence>
                {uiError && (
                    <motion.div
                        initial={{ opacity: 0, y: -20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                        style={{
                            background: 'rgba(244, 67, 54, 0.15)',
                            border: '1px solid var(--accent-red)',
                            borderRadius: '8px',
                            padding: '1rem 1.5rem',
                            marginBottom: '1rem',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.8rem',
                            cursor: 'pointer'
                        }}
                        onClick={() => setUiError(null)}
                    >
                        <AlertTriangle size={20} color="var(--accent-red)" />
                        <span style={{ color: 'var(--accent-red)', fontSize: '0.9rem', fontWeight: 500 }}>{uiError}</span>
                    </motion.div>
                )}
            </AnimatePresence>

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
                    <div className="industrial-panel chart-panel chart-panel--lg" style={{ height: '460px' }}>
                        {/* Toolbar: period selector + layer toggles + zoom controls */}
                        <div style={{
                            display: 'flex', gap: '0.3rem', flexWrap: 'wrap', alignItems: 'center',
                            marginBottom: '0.5rem', fontSize: '0.7rem', color: 'var(--text-secondary)',
                        }}>
                            <span style={{ letterSpacing: '0.05em' }}>ПЕРИОД:</span>
                            {[{ v: null, l: 'ВСЁ' }, { v: 30, l: '30м' }, { v: 60, l: '1ч' }, { v: 120, l: '2ч' }].map(({ v, l }) => (
                                <button key={l} className="chart-zoom__btn"
                                    onClick={() => setPeriodMinutes(v)}
                                    style={{
                                        padding: '0.2rem 0.45rem',
                                        background: periodMinutes === v ? 'rgba(255,152,0,0.2)' : undefined,
                                        color: periodMinutes === v ? 'var(--primary-color)' : undefined,
                                        borderColor: periodMinutes === v ? 'var(--primary-color)' : undefined,
                                        fontWeight: periodMinutes === v ? 'bold' : undefined,
                                    }}>
                                    {l}
                                </button>
                            ))}
                            <div style={{ flex: 1, minWidth: '0.5rem' }} />
                            <button className="chart-zoom__btn"
                                onClick={() => setShowHeaterPower(v => !v)}
                                title="Показать мощность нагревателя"
                                style={{
                                    padding: '0.2rem 0.5rem',
                                    background: showHeaterPower ? 'rgba(255,82,82,0.15)' : undefined,
                                    color: showHeaterPower ? '#ff5252' : undefined,
                                    borderColor: showHeaterPower ? '#ff5252' : undefined,
                                }}>
                                🔥 НАГРЕВ
                            </button>
                            <button className="chart-zoom__btn"
                                onClick={() => setShowPrevSession(v => !v)}
                                title="Сравнить с предыдущей варкой того же рецепта"
                                style={{
                                    padding: '0.2rem 0.5rem',
                                    background: showPrevSession ? 'rgba(100,181,246,0.15)' : undefined,
                                    color: showPrevSession ? 'var(--accent-blue)' : undefined,
                                    borderColor: showPrevSession ? 'var(--accent-blue)' : undefined,
                                }}>
                                📊 ПРОШЛАЯ
                            </button>
                            <div style={{ width: '0.4rem' }} />
                            <span>МАСШТАБ</span>
                            <button className="chart-zoom__btn" onClick={zoomIn}><ZoomIn size={14} /></button>
                            <button className="chart-zoom__btn" onClick={zoomOut}><ZoomOut size={14} /></button>
                            <button className="chart-zoom__btn chart-zoom__btn--text" onClick={() => { setGraphYMin(20); setGraphYMax(100); }}>СБРОС</button>
                        </div>

                        {mounted && (
                            <ResponsiveContainer width="100%" height={370} minWidth={0} minHeight={0}>
                                <ComposedChart data={chartData}>
                                    <defs>
                                        <linearGradient id="color-temp" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor={sensorColor} stopOpacity={0.4} />
                                            <stop offset="95%" stopColor={sensorColor} stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                                    <XAxis dataKey="time" stroke="#666" fontSize={10} interval="preserveStartEnd" minTickGap={30} tickMargin={5} />
                                    <YAxis yAxisId="left" domain={[graphYMin, graphYMax]} stroke="#888" fontSize={11} tickMargin={5} width={30} />
                                    {showHeaterPower && (
                                        <YAxis yAxisId="right" orientation="right" domain={[0, 100]} stroke="#ff5252" fontSize={10} tickMargin={5} width={28} tickFormatter={v => `${v}%`} />
                                    )}
                                    <Tooltip
                                        contentStyle={{
                                            background: 'rgba(20, 20, 20, 0.85)', border: '1px solid #444',
                                            borderRadius: '4px', backdropFilter: 'blur(4px)',
                                            boxShadow: '0 4px 12px rgba(0,0,0,0.5)', color: '#fff', fontSize: '0.85rem'
                                        }}
                                        itemStyle={{ fontWeight: 'bold' }}
                                        labelStyle={{ color: '#aaa', marginBottom: '0.3rem' }}
                                    />

                                    {/* Step transition annotations */}
                                    {stepAnnotations.map((a, i) => (
                                        <ReferenceLine key={i} x={a.x} yAxisId="left"
                                            stroke="rgba(76,175,80,0.5)" strokeDasharray="4 3"
                                            label={{ value: a.label, position: 'insideTopRight', fill: 'var(--accent-green)', fontSize: 10 }}
                                        />
                                    ))}

                                    <Area yAxisId="left"
                                        type="monotone" dataKey="temp" stroke={sensorColor} strokeWidth={2}
                                        fillOpacity={1} fill="url(#color-temp)" dot={false}
                                        activeDot={{ r: 4, fill: sensorColor, stroke: '#1e1e1e', strokeWidth: 2 }}
                                        name={selectedNamedSensor?.name || 'Температура'} isAnimationActive={false}
                                        connectNulls={false}
                                    />
                                    <Line yAxisId="left"
                                        type="stepAfter" dataKey="target" stroke="var(--accent-green)"
                                        strokeWidth={1.5} strokeDasharray="5 5" dot={false}
                                        name="Цель" isAnimationActive={false} connectNulls={false}
                                    />

                                    {/* Previous session overlay */}
                                    {showPrevSession && (
                                        <Line yAxisId="left"
                                            type="monotone" dataKey="prevTemp" stroke="rgba(100,181,246,0.65)"
                                            strokeWidth={1.5} strokeDasharray="3 3" dot={false}
                                            name="Прошлая варка" isAnimationActive={false} connectNulls={false}
                                        />
                                    )}

                                    {/* Heater power overlay (right axis, live only) */}
                                    {showHeaterPower && (
                                        <Line yAxisId="right"
                                            type="stepAfter" dataKey="heaterPower" stroke="#ff5252"
                                            strokeWidth={1.5} strokeDasharray="2 2" dot={false}
                                            name="Нагрев %" isAnimationActive={false} connectNulls={false}
                                        />
                                    )}
                                </ComposedChart>
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
                                disabled={(!isStarted && !isHeaterCovered) || isLoading}
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
                                <>
                                    <DeviceSelector value={selectedDeviceId} onChange={setSelectedDeviceId} />
                                    <SensorSelector namedSensors={namedSensors} rawSensors={rawSensors} value={selectedSensorAddress} onChange={setSelectedSensorAddress} />
                                    <SafetyCheck checked={isHeaterCovered} onChange={setIsHeaterCovered} />
                                </>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default Mashing;
