import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Wifi, CheckCircle, AlertCircle, RefreshCw, ArrowRight, Loader } from 'lucide-react';
import { API_BASE } from '../utils/constants';

const POLL_INTERVAL = 2000; // ms

export default function DevicePairing() {
    const navigate = useNavigate();

    // step: 'idle' | 'waiting' | 'paired' | 'expired'
    const [step, setStep]           = useState('idle');
    const [pairingCode, setPairingCode] = useState(null);
    const [expiresAt, setExpiresAt] = useState(null);
    const [timeLeft, setTimeLeft]   = useState(null);
    const [device, setDevice]       = useState(null);
    const [error, setError]         = useState(null);
    const [loadingInit, setLoadingInit] = useState(false);

    const pollRef    = useRef(null);
    const timerRef   = useRef(null);
    const token      = localStorage.getItem('orangebrew_token');

    const headers = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
    };

    // ── Countdown timer ──────────────────────────────────────
    useEffect(() => {
        if (!expiresAt) return;

        timerRef.current = setInterval(() => {
            const left = Math.max(0, Math.floor((new Date(expiresAt) - Date.now()) / 1000));
            setTimeLeft(left);
            if (left === 0) {
                clearInterval(timerRef.current);
                if (step === 'waiting') {
                    setStep('expired');
                    clearInterval(pollRef.current);
                }
            }
        }, 500);

        return () => clearInterval(timerRef.current);
    }, [expiresAt, step]);

    // ── Polling ───────────────────────────────────────────────
    useEffect(() => {
        if (step !== 'waiting' || !pairingCode) return;

        pollRef.current = setInterval(async () => {
            try {
                const res = await fetch(
                    `${API_BASE}/devices/pair/status?code=${pairingCode}`,
                    { headers }
                );
                const data = await res.json();
                if (data.status === 'paired') {
                    clearInterval(pollRef.current);
                    clearInterval(timerRef.current);
                    setDevice(data.device);
                    setStep('paired');
                }
            } catch {
                // silent — network hiccup
            }
        }, POLL_INTERVAL);

        return () => clearInterval(pollRef.current);
    }, [step, pairingCode]);

    // ── Generate code ─────────────────────────────────────────
    const initPairing = async () => {
        setError(null);
        setLoadingInit(true);
        try {
            const res = await fetch(`${API_BASE}/devices/pair/init`, {
                method: 'POST',
                headers,
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Ошибка генерации кода');

            setPairingCode(data.pairing_code);
            setExpiresAt(data.expires_at);
            setStep('waiting');
        } catch (err) {
            setError(err.message);
        } finally {
            setLoadingInit(false);
        }
    };

    const restart = () => {
        clearInterval(pollRef.current);
        clearInterval(timerRef.current);
        setStep('idle');
        setPairingCode(null);
        setExpiresAt(null);
        setTimeLeft(null);
        setDevice(null);
        setError(null);
    };

    const formatTime = (sec) => {
        if (sec === null) return '';
        const m = Math.floor(sec / 60).toString().padStart(2, '0');
        const s = (sec % 60).toString().padStart(2, '0');
        return `${m}:${s}`;
    };

    const panelStyle = {
        maxWidth: '480px',
        width: '100%',
        padding: '2.5rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '1.5rem',
        borderTop: '4px solid var(--accent-orange)',
    };

    // ── Step: idle ────────────────────────────────────────────
    if (step === 'idle') return (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem 1rem' }}>
            <div className="industrial-panel" style={panelStyle}>
                <h2 style={{ color: 'var(--text-primary)', margin: 0, display: 'flex', alignItems: 'center', gap: '0.7rem' }}>
                    <Wifi size={24} color="#ffa000" /> Подключить устройство
                </h2>

                <p style={{ color: 'var(--text-secondary)', lineHeight: '1.6', margin: 0 }}>
                    Чтобы привязать ESP32 к аккаунту:
                </p>

                <ol style={{ color: 'var(--text-secondary)', lineHeight: '2', paddingLeft: '1.2rem', margin: 0 }}>
                    <li>Нажмите «Создать код сопряжения»</li>
                    <li>Введите 6-значный код в веб-интерфейс ESP32 (<code>192.168.4.1</code>) или на дисплей устройства</li>
                    <li>Дождитесь подтверждения — устройство появится в списке</li>
                </ol>

                {error && (
                    <div style={{
                        background: 'rgba(244,67,54,0.1)',
                        border: '1px solid var(--state-error)',
                        padding: '0.8rem 1rem',
                        borderRadius: '4px',
                        color: 'var(--state-error)',
                        display: 'flex', gap: '0.5rem', alignItems: 'center', fontSize: '0.9rem',
                    }}>
                        <AlertCircle size={16} /> {error}
                    </div>
                )}

                <button
                    onClick={initPairing}
                    disabled={loadingInit}
                    style={{
                        background: '#ffa000', color: '#000', border: 'none',
                        padding: '1rem', borderRadius: '4px', fontWeight: 'bold',
                        fontSize: '1rem', cursor: loadingInit ? 'not-allowed' : 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        gap: '0.5rem', opacity: loadingInit ? 0.7 : 1,
                    }}
                >
                    {loadingInit ? <Loader size={18} className="spin" /> : <ArrowRight size={18} />}
                    {loadingInit ? 'ГЕНЕРАЦИЯ...' : 'СОЗДАТЬ КОД СОПРЯЖЕНИЯ'}
                </button>
            </div>
        </div>
    );

    // ── Step: waiting ─────────────────────────────────────────
    if (step === 'waiting') return (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem 1rem' }}>
            <div className="industrial-panel" style={panelStyle}>
                <h2 style={{ color: 'var(--text-primary)', margin: 0, display: 'flex', alignItems: 'center', gap: '0.7rem' }}>
                    <Wifi size={24} color="#ffa000" /> Ожидание устройства
                </h2>

                <p style={{ color: 'var(--text-secondary)', margin: 0 }}>
                    Введите этот код в устройство:
                </p>

                {/* Big code display */}
                <div style={{
                    background: '#111',
                    border: '2px solid #ffa000',
                    borderRadius: '8px',
                    padding: '1.5rem',
                    textAlign: 'center',
                }}>
                    <div style={{
                        fontSize: '2.8rem',
                        fontWeight: '900',
                        letterSpacing: '0.4rem',
                        color: '#ffa000',
                        fontFamily: 'monospace',
                    }}>
                        {pairingCode}
                    </div>
                    <div style={{ color: 'var(--text-secondary)', marginTop: '0.5rem', fontSize: '0.85rem' }}>
                        Действителен {formatTime(timeLeft)}
                    </div>
                </div>

                {/* Progress bar */}
                {timeLeft !== null && expiresAt && (
                    <div style={{ height: '4px', background: '#333', borderRadius: '2px', overflow: 'hidden' }}>
                        <div style={{
                            height: '100%',
                            background: '#ffa000',
                            borderRadius: '2px',
                            width: `${(timeLeft / 900) * 100}%`,
                            transition: 'width 0.5s linear',
                        }} />
                    </div>
                )}

                <div style={{
                    display: 'flex', alignItems: 'center', gap: '0.7rem',
                    color: 'var(--text-secondary)', fontSize: '0.9rem',
                }}>
                    <Loader size={16} style={{ animation: 'spin 1.5s linear infinite', flexShrink: 0 }} />
                    Ожидаем подключения ESP32...
                </div>

                <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', margin: 0, lineHeight: '1.5' }}>
                    Откройте браузер ESP32:&nbsp;<code style={{ color: '#ffa000' }}>192.168.4.1</code><br />
                    или введите код вручную, если на устройстве есть дисплей.
                </p>

                <button onClick={restart} style={{
                    background: 'transparent', color: 'var(--text-secondary)',
                    border: '1px solid var(--border-color)', padding: '0.6rem',
                    borderRadius: '4px', cursor: 'pointer', fontSize: '0.9rem',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem',
                }}>
                    <RefreshCw size={14} /> Отменить
                </button>
            </div>
            <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
        </div>
    );

    // ── Step: paired ──────────────────────────────────────────
    if (step === 'paired') return (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem 1rem' }}>
            <div className="industrial-panel" style={panelStyle}>
                <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
                    <CheckCircle size={56} color="#4caf50" />
                    <h2 style={{ color: '#4caf50', margin: 0 }}>Устройство подключено!</h2>
                    {device && (
                        <p style={{ color: 'var(--text-secondary)', margin: 0 }}>
                            <strong style={{ color: 'var(--text-primary)' }}>{device.name || device.id}</strong> успешно привязано к аккаунту.
                        </p>
                    )}
                </div>

                <div style={{ display: 'flex', gap: '0.8rem', flexDirection: 'column' }}>
                    <button
                        onClick={() => navigate('/settings')}
                        style={{
                            background: '#ffa000', color: '#000', border: 'none',
                            padding: '1rem', borderRadius: '4px', fontWeight: 'bold',
                            fontSize: '1rem', cursor: 'pointer',
                        }}
                    >
                        Перейти к настройкам
                    </button>
                    <button onClick={restart} style={{
                        background: 'transparent', color: 'var(--text-secondary)',
                        border: '1px solid var(--border-color)', padding: '0.7rem',
                        borderRadius: '4px', cursor: 'pointer', fontSize: '0.9rem',
                    }}>
                        Подключить ещё одно устройство
                    </button>
                </div>
            </div>
        </div>
    );

    // ── Step: expired ─────────────────────────────────────────
    return (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem 1rem' }}>
            <div className="industrial-panel" style={panelStyle}>
                <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
                    <AlertCircle size={48} color="var(--state-error)" />
                    <h2 style={{ color: 'var(--state-error)', margin: 0 }}>Код истёк</h2>
                    <p style={{ color: 'var(--text-secondary)', margin: 0 }}>
                        Код сопряжения действителен 15 минут. Создайте новый и попробуйте снова.
                    </p>
                </div>
                <button onClick={restart} style={{
                    background: '#ffa000', color: '#000', border: 'none',
                    padding: '1rem', borderRadius: '4px', fontWeight: 'bold',
                    fontSize: '1rem', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
                }}>
                    <RefreshCw size={18} /> Создать новый код
                </button>
            </div>
        </div>
    );
}
