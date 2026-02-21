import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Calendar, Clock, Beer, Loader, AlertTriangle, Trash2, Filter, Eye } from 'lucide-react';
import { sessionsApi } from '../api/client.js';

import { ProcessChart } from '../components/ProcessChart.jsx';

const TYPE_LABELS = {
    brewing: { label: 'Пивоварение', color: '#ff9800', emoji: '🍻' },
    mash: { label: 'Затирание (устар.)', color: '#ff9800', emoji: '🌡' },
    boil: { label: 'Кипячение (устар.)', color: '#f44336', emoji: '🔥' },
    fermentation: { label: 'Брожение', color: '#4caf50', emoji: '🫧' },
    distillation: { label: 'Дистилляция', color: '#03a9f4', emoji: '💧' },
    rectification: { label: 'Ректификация', color: '#7c4dff', emoji: '⚗️' },
};

const STATUS_LABELS = {
    active: { label: 'Активна', color: '#4caf50' },
    paused: { label: 'Пауза', color: '#ff9800' },
    completed: { label: 'Завершена', color: '#78909c' },
    cancelled: { label: 'Отменена', color: '#f44336' },
};

const History = () => {
    const navigate = useNavigate();
    const [sessions, setSessions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [filter, setFilter] = useState('');  // '' = all

    const [expandedId, setExpandedId] = useState(null);
    const [chartData, setChartData] = useState({});
    const [loadingGraph, setLoadingGraph] = useState(false);

    useEffect(() => {
        (async () => {
            try {
                setLoading(true);
                const data = await sessionsApi.getAll(filter || undefined);
                setSessions(data);
                setError(null);
            } catch (e) {
                setError(e.message);
            } finally {
                setLoading(false);
            }
        })();
    }, [filter]);

    const handleDelete = async (e, id) => {
        e.stopPropagation();
        if (!confirm('Удалить сессию?')) return;
        try {
            await sessionsApi.delete(id);
            setSessions(prev => prev.filter(s => s.id !== id));
        } catch (err) {
            console.error('[History] Delete failed:', err);
        }
    };

    const formatDate = (dateStr) => {
        if (!dateStr) return '—';
        try {
            const d = new Date(dateStr);
            return d.toLocaleDateString('ru-RU', { day: '2-digit', month: 'long', year: 'numeric' });
        } catch { return dateStr; }
    };

    const formatDuration = (started, finished) => {
        if (!started) return '—';
        const start = new Date(started);
        const end = finished ? new Date(finished) : new Date();
        const diff = Math.floor((end - start) / 1000 / 60); // minutes
        if (diff < 60) return `${diff}м`;
        return `${Math.floor(diff / 60)}ч ${diff % 60}м`;
    };

    const filterButtons = [
        { value: '', label: 'Все' },
        { value: 'brewing', label: '🍻 Пивоварение' },
        { value: 'fermentation', label: '🫧 Брожение' },
        { value: 'distillation', label: '💧 Дистилляция' },
        { value: 'rectification', label: '⚗️ Ректификация' },
    ];

    const toggleExpand = async (id) => {
        if (expandedId === id) {
            setExpandedId(null);
            return;
        }
        setExpandedId(id);
        if (!chartData[id]) {
            setLoadingGraph(true);
            try {
                // Fetch up to 5000 points
                const temps = await sessionsApi.getTemperatures(id, 5000);
                if (temps && temps.length > 0) {
                    const formatted = temps.map(row => ({
                        time: new Date(row.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
                        temp: row.value,
                        unix: new Date(row.timestamp).getTime()
                    }));
                    setChartData(prev => ({ ...prev, [id]: formatted.sort((a, b) => a.unix - b.unix) }));
                } else {
                    setChartData(prev => ({ ...prev, [id]: [] }));
                }
            } catch (err) {
                console.error('[History] Failed to load chart:', err);
            } finally {
                setLoadingGraph(false);
            }
        }
    };

    return (
        <div style={{ padding: '2rem 1rem', maxWidth: '1000px', margin: '0 auto' }}>
            <header style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '2rem' }}>
                <button
                    onClick={() => navigate('/brewing')}
                    aria-label="Назад"
                    style={{ background: 'none', border: '1px solid var(--border-color)', color: 'var(--text-primary)', padding: '0.5rem', borderRadius: '4px' }}
                >
                    <ArrowLeft size={20} aria-hidden="true" />
                </button>
                <h1 style={{ margin: 0, fontSize: '1.8rem', color: 'var(--primary-color)' }}>История сессий</h1>
            </header>

            {/* ─── Filter Bar ────────────────────────────── */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1.5rem' }}>
                {filterButtons.map(f => (
                    <button key={f.value} onClick={() => setFilter(f.value)}
                        style={{
                            padding: '0.4rem 0.8rem', borderRadius: '20px', fontSize: '0.8rem',
                            background: filter === f.value ? 'rgba(255,152,0,0.15)' : 'rgba(255,255,255,0.03)',
                            border: `1px solid ${filter === f.value ? 'var(--primary-color)' : '#444'}`,
                            color: filter === f.value ? 'var(--primary-color)' : 'var(--text-secondary)',
                            cursor: 'pointer', transition: 'all 0.2s',
                        }}>
                        {f.label}
                    </button>
                ))}
            </div>

            {/* ─── States ────────────────────────────────── */}
            {loading && (
                <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>
                    <Loader size={32} className="spin" />
                    <span style={{ marginLeft: '1rem' }}>Загрузка...</span>
                </div>
            )}

            {error && (
                <div className="industrial-panel" style={{ padding: '1.5rem', display: 'flex', alignItems: 'center', gap: '1rem', color: 'var(--accent-red)' }}>
                    <AlertTriangle size={24} />
                    <div>
                        <div style={{ fontWeight: 'bold' }}>Ошибка загрузки</div>
                        <div style={{ fontSize: '0.9rem', opacity: 0.8 }}>{error}</div>
                    </div>
                </div>
            )}

            {!loading && !error && sessions.length === 0 && (
                <div className="industrial-panel" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                    <p style={{ fontSize: '1.1rem' }}>
                        {filter ? `Нет сессий типа "${TYPE_LABELS[filter]?.label || filter}"` : 'Нет записей. Начните первую варку!'}
                    </p>
                </div>
            )}

            {/* ─── Session List ──────────────────────────── */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {sessions.map((session, index) => {
                    const typeInfo = TYPE_LABELS[session.type] || { label: session.type, color: '#888', emoji: '📋' };
                    const statusInfo = STATUS_LABELS[session.status] || { label: session.status, color: '#888' };

                    return (
                        <motion.div
                            key={session.id}
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: index * 0.05 }}
                            className="industrial-panel"
                            style={{
                                display: 'flex',
                                flexDirection: 'column',
                                borderLeft: `4px solid ${typeInfo.color}`,
                                cursor: 'pointer',
                                overflow: 'hidden'
                            }}
                            onClick={() => toggleExpand(session.id)}
                        >
                            <div style={{
                                padding: '1.5rem',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                flexWrap: 'wrap',
                                gap: '1rem',
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', flex: '1 1 300px' }}>
                                    <div style={{
                                        background: `${typeInfo.color}15`,
                                        padding: '0.8rem',
                                        borderRadius: '8px',
                                        fontSize: '1.5rem',
                                        minWidth: '52px',
                                        textAlign: 'center'
                                    }}>
                                        {typeInfo.emoji}
                                    </div>
                                    <div>
                                        <h3 style={{ margin: '0 0 0.4rem 0', fontSize: '1.1rem' }}>
                                            {session.recipe_name || typeInfo.label}
                                        </h3>
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem 1.5rem', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                                            <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                                <Calendar size={14} aria-hidden="true" /> {formatDate(session.started_at)}
                                            </span>
                                            <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                                <Clock size={14} aria-hidden="true" /> {formatDuration(session.started_at, session.finished_at)}
                                            </span>
                                            <span style={{
                                                padding: '0.1rem 0.5rem', borderRadius: '10px', fontSize: '0.7rem',
                                                background: `${statusInfo.color}20`, color: statusInfo.color,
                                                border: `1px solid ${statusInfo.color}40`,
                                            }}>
                                                {statusInfo.label}
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <button
                                        onClick={(e) => handleDelete(e, session.id)}
                                        aria-label="Удалить сессию"
                                        style={{ background: 'none', border: '1px solid #444', color: '#f44336', padding: '0.3rem 0.5rem', borderRadius: '4px' }}
                                    >
                                        <Trash2 size={14} />
                                    </button>
                                </div>
                            </div>

                            {/* ─── Expanded Area ─── */}
                            {expandedId === session.id && (
                                <div style={{
                                    padding: '1.5rem',
                                    borderTop: '1px solid rgba(255,255,255,0.05)',
                                    background: 'rgba(0,0,0,0.2)'
                                }} onClick={e => e.stopPropagation()}>
                                    <div style={{ marginBottom: '1rem', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                                        <strong>Тип процесса:</strong> {typeInfo.label} <br />
                                        <strong>Начало:</strong> {new Date(session.started_at).toLocaleString('ru-RU')} <br />
                                        <strong>Окончание:</strong> {session.finished_at ? new Date(session.finished_at).toLocaleString('ru-RU') : '—'} <br />
                                        {session.recipe_id && (
                                            <><strong>ID Рецепта:</strong> #{session.recipe_id} <br /></>
                                        )}
                                        {(() => {
                                            try {
                                                const ing = session.recipe_ingredients ? JSON.parse(session.recipe_ingredients) : [];
                                                const hop = session.recipe_hop_additions ? JSON.parse(session.recipe_hop_additions) : [];
                                                return (
                                                    <>
                                                        {(ing.length > 0) && (
                                                            <div style={{ marginTop: '0.8rem', padding: '0.8rem', background: 'rgba(255,255,255,0.03)', borderRadius: '8px' }}>
                                                                <strong style={{ color: '#4caf50' }}>Ингредиенты:</strong>
                                                                <ul style={{ margin: '0.4rem 0 0 0', paddingLeft: '1.5rem', color: '#ccc', fontSize: '0.85rem' }}>
                                                                    {ing.map((i, idx) => <li key={idx}>[{i.type}] {i.name} — {i.amount} {i.unit}</li>)}
                                                                </ul>
                                                            </div>
                                                        )}
                                                        {(hop.length > 0) && (
                                                            <div style={{ marginTop: '0.5rem', padding: '0.8rem', background: 'rgba(255,255,255,0.03)', borderRadius: '8px' }}>
                                                                <strong style={{ color: '#e040fb' }}>Внесение хмеля:</strong>
                                                                <ul style={{ margin: '0.4rem 0 0 0', paddingLeft: '1.5rem', color: '#ccc', fontSize: '0.85rem' }}>
                                                                    {hop.map((h, idx) => <li key={idx}>{h.name} — {h.amount}г (за {h.time} мин до конца)</li>)}
                                                                </ul>
                                                            </div>
                                                        )}
                                                    </>
                                                )
                                            } catch (e) { return null; }
                                        })()}
                                        {session.notes && (
                                            <><div style={{ marginTop: '0.8rem' }}><strong>Заметки:</strong> {session.notes}</div></>
                                        )}
                                    </div>

                                    {loadingGraph ? (
                                        <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}>
                                            <Loader className="spin" size={24} /> <span style={{ marginLeft: '1rem' }}>Загрузка температур...</span>
                                        </div>
                                    ) : (
                                        chartData[session.id] && chartData[session.id].length > 0 ? (
                                            <div style={{ height: '300px', width: '100%', marginTop: '1rem' }}>
                                                <ProcessChart
                                                    data={chartData[session.id]}
                                                    lines={[{ dataKey: 'temp', color: typeInfo.color, name: 'Температура' }]}
                                                />
                                            </div>
                                        ) : (
                                            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)', fontStyle: 'italic', background: 'rgba(255,255,255,0.02)', borderRadius: '8px' }}>
                                                График сохраненных температур недоступен.
                                            </div>
                                        )
                                    )}
                                </div>
                            )}
                        </motion.div>
                    );
                })}
            </div>
        </div>
    );
};

export default History;
