import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Thermometer, Lock, ShieldAlert } from 'lucide-react';
import { API_BASE } from '../utils/constants';

export default function Login() {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState(null);
    const [loading, setLoading] = useState(false);

    const handleLogin = async (e) => {
        e.preventDefault();
        setError(null);
        setLoading(true);

        try {
            const res = await fetch(`${API_BASE}/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || 'Ошибка авторизации');
            }

            // Save token
            localStorage.setItem('orangebrew_token', data.token);
            window.location.href = '/'; // Reload to start authenticated session

        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '100vh',
            padding: '2rem',
            background: 'var(--bg-color)',
            fontFamily: "'Roboto', 'Inter', sans-serif"
        }}>
            <div className="industrial-panel" style={{
                maxWidth: '400px',
                width: '100%',
                padding: '2.5rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '1.5rem',
                borderTop: '4px solid var(--accent-orange)'
            }}>
                <div style={{ textAlign: 'center' }}>
                    <div style={{
                        fontSize: '2.2rem',
                        fontWeight: '900',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '4px',
                        letterSpacing: '-1px'
                    }}>
                        <span style={{ color: '#ffffff' }}>ORANGE</span>
                        <span style={{
                            background: '#ffa000',
                            color: '#000000',
                            padding: '2px 8px',
                            borderRadius: '6px',
                            display: 'inline-block'
                        }}>BREW</span>
                    </div>
                </div>

                {error && (
                    <div style={{
                        background: 'rgba(244, 67, 54, 0.1)',
                        border: '1px solid var(--state-error)',
                        padding: '1rem',
                        borderRadius: '4px',
                        color: 'var(--state-error)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        fontSize: '0.9rem'
                    }}>
                        <ShieldAlert size={18} /> {error}
                    </div>
                )}

                <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <div>
                        <label style={{ display: 'block', color: 'var(--text-secondary)', marginBottom: '0.3rem', fontSize: '0.9rem' }}>Логин</label>
                        <input
                            type="text"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            required
                            style={{
                                width: '100%',
                                padding: '0.8rem',
                                background: '#111',
                                border: '1px solid var(--border-color)',
                                color: 'var(--text-primary)',
                                borderRadius: '4px'
                            }}
                        />
                    </div>
                    <div>
                        <label style={{ display: 'block', color: 'var(--text-secondary)', marginBottom: '0.3rem', fontSize: '0.9rem' }}>Пароль</label>
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                            style={{
                                width: '100%',
                                padding: '0.8rem',
                                background: '#111',
                                border: '1px solid var(--border-color)',
                                color: 'var(--text-primary)',
                                borderRadius: '4px'
                            }}
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        style={{
                            marginTop: '1rem',
                            width: '100%',
                            background: '#ffa000',
                            color: '#000',
                            border: 'none',
                            padding: '1rem',
                            borderRadius: '4px',
                            fontWeight: 'bold',
                            fontSize: '1rem',
                            cursor: loading ? 'not-allowed' : 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '0.5rem',
                            opacity: loading ? 0.7 : 1
                        }}
                    >
                        <Lock size={18} /> {loading ? 'ВХОД...' : 'ВОЙТИ'}
                    </button>
                </form>
            </div>
        </div>
    );
}
