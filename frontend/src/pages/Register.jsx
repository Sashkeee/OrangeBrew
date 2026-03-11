import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { UserPlus, ShieldAlert } from 'lucide-react';
import { API_BASE } from '../utils/constants';
import { useAuth } from '../contexts/AuthContext';

export default function Register() {
    const navigate = useNavigate();
    const { login } = useAuth();

    const [form, setForm] = useState({ username: '', email: '', password: '', passwordConfirm: '' });
    const [consent, setConsent] = useState(false);
    const [error, setError]   = useState(null);
    const [loading, setLoading] = useState(false);

    const set = (field) => (e) => setForm(prev => ({ ...prev, [field]: e.target.value }));

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError(null);

        if (form.password !== form.passwordConfirm) {
            return setError('Пароли не совпадают');
        }
        if (!consent) {
            return setError('Необходимо принять политику конфиденциальности');
        }

        setLoading(true);
        try {
            const res = await fetch(`${API_BASE}/auth/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    username: form.username,
                    email:    form.email,
                    password: form.password,
                    consent:  true,
                }),
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Ошибка регистрации');

            login(data.token, data.user);
            navigate('/');

        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const inputStyle = {
        width: '100%',
        padding: '0.8rem',
        background: '#111',
        border: '1px solid var(--border-color)',
        color: 'var(--text-primary)',
        borderRadius: '4px',
        boxSizing: 'border-box',
    };

    const labelStyle = {
        display: 'block',
        color: 'var(--text-secondary)',
        marginBottom: '0.3rem',
        fontSize: '0.9rem',
    };

    return (
        <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '100vh',
            padding: '2rem',
            background: 'var(--bg-color)',
            fontFamily: "'Roboto', 'Inter', sans-serif",
        }}>
            <div className="industrial-panel" style={{
                maxWidth: '420px',
                width: '100%',
                padding: '2.5rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '1.5rem',
                borderTop: '4px solid var(--accent-orange)',
            }}>
                {/* Logo */}
                <div style={{ textAlign: 'center' }}>
                    <div style={{
                        fontSize: '2.2rem',
                        fontWeight: '900',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '4px',
                        letterSpacing: '-1px',
                    }}>
                        <span style={{ color: '#ffffff' }}>ORANGE</span>
                        <span style={{
                            background: '#ffa000',
                            color: '#000000',
                            padding: '2px 8px',
                            borderRadius: '6px',
                        }}>BREW</span>
                    </div>
                    <p style={{ color: 'var(--text-secondary)', marginTop: '0.5rem', fontSize: '0.9rem' }}>
                        Создайте аккаунт — 14 дней бесплатно
                    </p>
                </div>

                {/* Error */}
                {error && (
                    <div style={{
                        background: 'rgba(244,67,54,0.1)',
                        border: '1px solid var(--state-error)',
                        padding: '1rem',
                        borderRadius: '4px',
                        color: 'var(--state-error)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        fontSize: '0.9rem',
                    }}>
                        <ShieldAlert size={18} /> {error}
                    </div>
                )}

                {/* Form */}
                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <div>
                        <label style={labelStyle}>Логин</label>
                        <input type="text" value={form.username} onChange={set('username')}
                            required minLength={3} maxLength={32}
                            placeholder="3–32 символа" style={inputStyle} />
                    </div>
                    <div>
                        <label style={labelStyle}>Email</label>
                        <input type="email" value={form.email} onChange={set('email')}
                            required style={inputStyle} />
                    </div>
                    <div>
                        <label style={labelStyle}>Пароль</label>
                        <input type="password" value={form.password} onChange={set('password')}
                            required minLength={8}
                            placeholder="Минимум 8 символов" style={inputStyle} />
                    </div>
                    <div>
                        <label style={labelStyle}>Подтвердите пароль</label>
                        <input type="password" value={form.passwordConfirm} onChange={set('passwordConfirm')}
                            required style={inputStyle} />
                    </div>

                    {/* Consent checkbox — 152-ФЗ обязательно */}
                    <label style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: '0.6rem',
                        cursor: 'pointer',
                        color: 'var(--text-secondary)',
                        fontSize: '0.85rem',
                        lineHeight: '1.4',
                    }}>
                        <input
                            type="checkbox"
                            checked={consent}
                            onChange={(e) => setConsent(e.target.checked)}
                            required
                            style={{ marginTop: '2px', accentColor: '#ffa000', flexShrink: 0 }}
                        />
                        <span>
                            Я принимаю{' '}
                            <a href="/offer" target="_blank" rel="noreferrer"
                               style={{ color: '#ffa000' }}>оферту</a>{' '}
                            и{' '}
                            <a href="/privacy" target="_blank" rel="noreferrer"
                               style={{ color: '#ffa000' }}>политику конфиденциальности</a>,
                            и даю согласие на обработку персональных данных в соответствии с 152-ФЗ
                        </span>
                    </label>

                    <button
                        type="submit"
                        disabled={loading}
                        style={{
                            marginTop: '0.5rem',
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
                            opacity: loading ? 0.7 : 1,
                        }}
                    >
                        <UserPlus size={18} /> {loading ? 'СОЗДАНИЕ...' : 'СОЗДАТЬ АККАУНТ'}
                    </button>
                </form>

                {/* Link to login */}
                <p style={{ textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                    Уже есть аккаунт?{' '}
                    <Link to="/login" style={{ color: '#ffa000', textDecoration: 'none', fontWeight: 'bold' }}>
                        Войти
                    </Link>
                </p>
            </div>
        </div>
    );
}
