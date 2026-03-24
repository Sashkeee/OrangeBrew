import React, { useState, useEffect, useRef } from 'react';
import { Play, Square, Settings as SettingsIcon, AlertCircle, LineChart as ChartIcon, CheckCircle } from 'lucide-react';
import { processApi } from '../api/client';
import { useSensors } from '../hooks/useSensors';
import { ProcessChart } from './ProcessChart';
import SensorSelector from './SensorSelector';

export default function PidTuningPanel({ onTuningComplete }) {
    const [status, setStatus] = useState(null);
    const [targetTemp, setTargetTemp] = useState(65);
    const [error, setError] = useState(null);
    const [loading, setLoading] = useState(false);
    const [successMsg, setSuccessMsg] = useState('');
    const [selectedSensorAddress, setSelectedSensorAddress] = useState(null);

    // Live sensor data for graphing
    const { sensors, rawSensors } = useSensors();
    const [chartData, setChartData] = useState([]);
    const chartDataRef = useRef([]);

    // Poll tuner status every 1 second
    // Update local chart data when brewing
    useEffect(() => {
        if (!status?.tuning || !sensors.boiler) return;

        // If a valid sensor address is set, use that, otherwise default to boiler mapped
        let valToUse = sensors.boiler?.value ?? sensors.boiler;
        if (selectedSensorAddress && rawSensors && rawSensors.length > 0) {
            const tgt = rawSensors.find(s => s.address === selectedSensorAddress);
            if (tgt) valToUse = tgt.temp ?? tgt.value;
        }

        if (valToUse === undefined || isNaN(valToUse)) return;

        const nowMs = Date.now();
        const newPoint = {
            unix: nowMs,
            time: new Date(nowMs).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
            temp: parseFloat(valToUse)
        };

        const prevData = chartDataRef.current;
        const updated = [...prevData.slice(-599), newPoint];
        chartDataRef.current = updated;
        setChartData(updated);
    }, [sensors.boiler, rawSensors, status?.tuning, selectedSensorAddress]);

    // Poll tuner status every 1 second
    useEffect(() => {
        const interval = setInterval(async () => {
            try {
                const data = await processApi.tuneStatus();
                setStatus(prev => {
                    if (prev?.tuning && !data.tuning && data.state === 'DONE') {
                        setSuccessMsg('Калибровка успешно завершена! Настройки применены.');
                        if (onTuningComplete) onTuningComplete();
                    }
                    return data;
                });
            } catch (err) {
                console.error("Failed to fetch tuning status:", err);
            }
        }, 1000);
        return () => clearInterval(interval);
    }, [onTuningComplete]);

    const handleStartTuning = async () => {
        if (!window.confirm(`Вы уверены, что хотите запустить автокалибровку ПИД-регулятора на целевой температуре ${targetTemp}°C?\n\nВнимание: ТЭН будет периодически включаться на 100%! Убедитесь, что в кубе есть жидкость!`)) {
            return;
        }

        setLoading(true);
        setError(null);
        setSuccessMsg('');
        setChartData([]);
        chartDataRef.current = [];

        try {
            await processApi.tuneStart({ target: targetTemp, sensorAddress: selectedSensorAddress });
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleStopTuning = async () => {
        setLoading(true);
        try {
            await processApi.tuneStop();
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const isTuning = status?.tuning;

    // Map state constants to user-friendly text
    const stateMap = {
        'IDLE': 'Ожидание',
        'HEATING_INITIAL': 'Первоначальный нагрев',
        'COOLING': 'Охлаждение (Выбег температуры)',
        'HEATING': 'Нагрев (Измерение амплитуды)',
        'DONE': 'Завершено'
    };

    const stateDesc = stateMap[status?.state] || status?.state || 'Неизвестно';
    const progressPercent = isTuning ? Math.min(100, (status.cycle / status.maxCycles) * 100) : 0;

    return (
        <div style={{
            padding: '1.5rem',
            background: 'rgba(255,152,0,0.05)',
            border: '1px solid rgba(255,152,0,0.3)',
            borderRadius: '8px',
            marginTop: '1.5rem',
            fontFamily: 'var(--font-primary)'
        }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', marginBottom: '1rem' }}>
                <SettingsIcon size={24} color="#ff9800" />
                <h3 style={{ margin: 0, fontSize: '1.1rem', color: '#ff9800' }}>Автоматическая Калибровка ПИД (Auto-Tuning)</h3>
            </div>

            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1.5rem', lineHeight: '1.5' }}>
                Метод релейного тюнинга позволяет системе самой рассчитать идеальные коэффициенты <b>Kp, Ki, Kd</b> для вашего куба.
                После запуска система нагреет жидкость, а затем произведет несколько циклов включения/выключения ТЭНа для изучения инерции.
            </p>

            {error && (
                <div style={{ padding: '0.8rem', background: 'rgba(244,67,54,0.1)', color: '#f44336', borderRadius: '4px', marginBottom: '1rem', fontSize: '0.85rem', display: 'flex', alignItems: 'center' }}>
                    <AlertCircle size={16} style={{ marginRight: '0.5rem' }} />
                    {error}
                </div>
            )}

            {successMsg && !isTuning && (
                <div style={{ padding: '0.8rem', background: 'rgba(76,175,80,0.1)', color: '#4caf50', borderRadius: '4px', marginBottom: '1rem', fontSize: '0.85rem', display: 'flex', alignItems: 'center' }}>
                    <CheckCircle size={16} style={{ marginRight: '0.5rem' }} />
                    {successMsg}
                </div>
            )}

            {!isTuning ? (
                <div>
                    <SensorSelector rawSensors={rawSensors} value={selectedSensorAddress} onChange={setSelectedSensorAddress} label="Выберите датчик для калибровки" />

                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginTop: '1rem' }}>
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>Целевая Температура (°C)</label>
                            <input
                                type="number"
                                value={targetTemp}
                                onChange={(e) => setTargetTemp(parseFloat(e.target.value) || 0)}
                                style={{
                                    width: '120px', padding: '0.6rem', border: '1px solid #444',
                                    background: 'rgba(255,255,255,0.05)', color: '#fff', borderRadius: '4px', textAlign: 'center'
                                }}
                            />
                        </div>

                        <button
                            onClick={handleStartTuning}
                            disabled={loading}
                            style={{
                                marginTop: '1.2rem', padding: '0.6rem 1.2rem', background: '#ff9800',
                                color: '#000', fontWeight: 'bold', border: 'none', borderRadius: '4px',
                                cursor: loading ? 'wait' : 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem'
                            }}
                        >
                            <Play size={18} /> Начать Калибровку
                        </button>
                        <span style={{ fontSize: '0.75rem', color: '#999', marginTop: '1.2rem' }}>
                            *Займет около 15-20 минут
                        </span>
                    </div>
                </div>
            ) : (
                <div style={{ background: 'rgba(0,0,0,0.2)', padding: '1.5rem', borderRadius: '8px', border: '1px solid #444' }}>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                        <div>
                            <div style={{ fontSize: '0.85rem', color: '#ff9800', fontWeight: 'bold' }}>ИДЕТ РАСЧЕТ ИНЕРЦИИ КУБА</div>
                            <div style={{ fontSize: '1.2rem', marginTop: '0.3rem' }}>{stateDesc}</div>
                        </div>
                        <button
                            onClick={handleStopTuning}
                            disabled={loading}
                            style={{
                                padding: '0.6rem 1rem', background: 'rgba(244,67,54,0.1)', color: '#f44336',
                                border: '1px solid rgba(244,67,54,0.3)', borderRadius: '4px', cursor: 'pointer',
                                display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 'bold'
                            }}
                        >
                            <Square size={16} /> Прервать
                        </button>
                    </div>

                    <div style={{ marginBottom: '1rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: '#aaa', marginBottom: '0.5rem' }}>
                            <span>Цикл {status.cycle} из {status.maxCycles}</span>
                            <span>{Math.round(progressPercent)}%</span>
                        </div>
                        <div style={{ width: '100%', height: '8px', background: '#333', borderRadius: '4px', overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${progressPercent}%`, background: '#ff9800', transition: 'width 0.5s ease-out' }} />
                        </div>
                    </div>

                    <div style={{ height: '220px', marginBottom: '1rem', borderRadius: '4px', overflow: 'hidden', background: '#111' }}>
                        <ProcessChart
                            data={chartData}
                            lines={[
                                { dataKey: 'temp', color: '#ff9800', name: 'Температура куба (°C)' }
                            ]}
                        />
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', color: 'var(--text-secondary)', background: 'rgba(3,169,244,0.1)', border: '1px solid rgba(3,169,244,0.3)', padding: '0.8rem', borderRadius: '4px' }}>
                        <ChartIcon size={16} color="#03a9f4" />
                        Новые настройки автоматически применятся после завершения тюнинга. Следите за процессом.
                    </div>
                </div>
            )}
        </div>
    );
}
