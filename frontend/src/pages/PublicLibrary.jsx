import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    ArrowLeft, Search, TrendingUp, Heart, MessageCircle,
    ChevronDown, ChevronUp, Copy, Loader, Send, Trash2, X,
} from 'lucide-react';
import { recipesApi } from '../api/client.js';
import { useRecipeLikes } from '../hooks/useRecipeLikes.js';
import { useRecipeComments } from '../hooks/useRecipeComments.js';
import { useAuth } from '../contexts/AuthContext.jsx';

// ── Styles (module scope) ────────────────────────────────────
const rowStyle = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '0.5rem 0.75rem',
    background: 'rgba(255,255,255,0.03)',
    borderRadius: '4px',
    border: '1px solid #2a2a2a',
};

const monoStyle = { fontFamily: 'monospace', color: 'var(--text-secondary)', fontSize: '0.88rem' };

const commentInputStyle = {
    padding: '0.55rem 0.75rem',
    background: '#111',
    border: '1px solid var(--border-color)',
    color: '#fff',
    borderRadius: '4px',
    flex: 1,
    minWidth: 0,
    fontSize: '0.9rem',
};

// ── ExpandedRecipeView ───────────────────────────────────────
// Module-scope component — renders hooks only for the expanded recipe.
function ExpandedRecipeView({ recipe, currentUser, onCopy }) {
    const { count: likeCount, isLiked, toggle: toggleLike } = useRecipeLikes(recipe.id);
    const {
        comments, total, loading: commentsLoading,
        hasMore, addComment, deleteComment, loadMore,
    } = useRecipeComments(recipe.id);

    const [commentText, setCommentText] = useState('');
    const [submitting, setSubmitting]   = useState(false);

    const handleAddComment = async () => {
        if (!commentText.trim()) return;
        setSubmitting(true);
        try {
            await addComment(commentText.trim());
            setCommentText('');
        } catch (e) {
            alert('Ошибка: ' + e.message);
        } finally {
            setSubmitting(false);
        }
    };

    const stats = [
        recipe.og        > 0 ? { v: recipe.og.toFixed(3), l: 'OG' }           : null,
        recipe.fg        > 0 ? { v: recipe.fg.toFixed(3), l: 'FG' }           : null,
        recipe.ibu       > 0 ? { v: recipe.ibu,           l: 'IBU' }          : null,
        recipe.abv       > 0 ? { v: `${recipe.abv}%`,     l: 'ABV' }          : null,
        recipe.batch_size > 0 ? { v: `${recipe.batch_size}л`, l: 'Объём' }    : null,
        recipe.boil_time  > 0 ? { v: `${recipe.boil_time} мин`, l: 'Кипяч.' } : null,
    ].filter(Boolean);

    return (
        <div style={{ borderTop: '1px solid #2a2a2a', marginTop: '1rem', paddingTop: '1.25rem' }}>

            {/* Stats */}
            {stats.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.25rem', padding: '0.75rem', background: 'rgba(255,255,255,0.02)', borderRadius: '6px', border: '1px solid #2a2a2a' }}>
                    {stats.map(({ v, l }) => (
                        <div key={l} style={{ textAlign: 'center', flex: '1 1 70px' }}>
                            <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: 'var(--primary-color)', fontFamily: 'monospace' }}>{v}</div>
                            <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: '0.15rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{l}</div>
                        </div>
                    ))}
                </div>
            )}

            {/* Mash Steps */}
            {recipe.mash_steps?.length > 0 && (
                <div style={{ marginBottom: '1rem' }}>
                    <div style={{ fontSize: '0.82rem', color: '#ff9800', fontWeight: 600, marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Паузы затирания</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                        {recipe.mash_steps.map((step, i) => (
                            <div key={i} style={rowStyle}>
                                <span style={{ fontSize: '0.9rem' }}>{step.name || `Пауза ${i + 1}`}</span>
                                <span style={monoStyle}>{step.temp}°C · {step.duration} мин</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Ingredients */}
            {recipe.ingredients?.length > 0 && (
                <div style={{ marginBottom: '1rem' }}>
                    <div style={{ fontSize: '0.82rem', color: '#4caf50', fontWeight: 600, marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Ингредиенты</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                        {recipe.ingredients.map((ing, i) => (
                            <div key={i} style={rowStyle}>
                                <span style={{ fontSize: '0.9rem' }}>{ing.name}</span>
                                <span style={monoStyle}>{ing.amount} {ing.unit}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Hop Additions */}
            {recipe.hop_additions?.length > 0 && (
                <div style={{ marginBottom: '1rem' }}>
                    <div style={{ fontSize: '0.82rem', color: '#03a9f4', fontWeight: 600, marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Хмель</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                        {recipe.hop_additions.map((hop, i) => (
                            <div key={i} style={rowStyle}>
                                <span style={{ fontSize: '0.9rem' }}>{hop.name}</span>
                                <span style={monoStyle}>{hop.amount} г · {hop.time} мин</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Notes */}
            {recipe.notes ? (
                <div style={{ marginBottom: '1rem', padding: '0.75rem', background: 'rgba(255,255,255,0.02)', borderRadius: '4px', border: '1px solid #2a2a2a', fontSize: '0.9rem', lineHeight: 1.6, color: 'var(--text-secondary)', whiteSpace: 'pre-wrap' }}>
                    {recipe.notes}
                </div>
            ) : null}

            {/* Actions */}
            <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.25rem', alignItems: 'center', flexWrap: 'wrap' }}>
                <button onClick={toggleLike}
                    style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', background: isLiked ? 'rgba(244,67,54,0.12)' : 'none', border: `1px solid ${isLiked ? '#f44336' : '#444'}`, color: isLiked ? '#f44336' : 'var(--text-secondary)', padding: '0.45rem 0.9rem', borderRadius: '4px', cursor: 'pointer', transition: 'all 0.15s' }}>
                    <Heart size={15} fill={isLiked ? '#f44336' : 'none'} strokeWidth={2} />
                    <span style={{ fontFamily: 'monospace', fontSize: '0.9rem' }}>{likeCount}</span>
                </button>
                <button onClick={onCopy}
                    style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', background: 'rgba(255,152,0,0.1)', border: '1px solid var(--primary-color)', color: 'var(--primary-color)', padding: '0.45rem 0.9rem', borderRadius: '4px', cursor: 'pointer', fontSize: '0.85rem' }}>
                    <Copy size={14} /> Копировать к себе
                </button>
                <span style={{ color: 'var(--text-secondary)', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: '0.3rem', marginLeft: 'auto' }}>
                    <MessageCircle size={13} /> {total}
                </span>
            </div>

            {/* Comments */}
            <div>
                <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.9rem' }}>
                    <input
                        value={commentText}
                        onChange={e => setCommentText(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAddComment(); } }}
                        placeholder="Написать комментарий..."
                        maxLength={1000}
                        style={commentInputStyle}
                    />
                    <button onClick={handleAddComment} disabled={submitting || !commentText.trim()}
                        style={{ padding: '0.55rem 0.85rem', background: 'rgba(255,152,0,0.15)', border: '1px solid var(--primary-color)', color: 'var(--primary-color)', borderRadius: '4px', cursor: 'pointer', opacity: submitting || !commentText.trim() ? 0.45 : 1, flexShrink: 0 }}>
                        <Send size={14} />
                    </button>
                </div>

                {commentsLoading && comments.length === 0 ? (
                    <div style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '0.75rem' }}>
                        <Loader size={16} className="spin" />
                    </div>
                ) : comments.length === 0 ? (
                    <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', opacity: 0.6, padding: '0.25rem 0' }}>Комментариев нет</div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        {comments.map(comment => (
                            <div key={comment.id} style={{ padding: '0.6rem 0.8rem', background: 'rgba(255,255,255,0.03)', borderRadius: '4px', border: '1px solid #2a2a2a' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.3rem' }}>
                                    <span style={{ color: 'var(--primary-color)', fontWeight: 600, fontSize: '0.83rem' }}>{comment.username}</span>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                        <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                                            {new Date(comment.created_at).toLocaleDateString('ru-RU')}
                                        </span>
                                        {comment.user_id === currentUser?.id && (
                                            <button onClick={() => deleteComment(comment.id)}
                                                style={{ background: 'none', border: 'none', color: '#555', cursor: 'pointer', padding: 0, lineHeight: 1 }}>
                                                <Trash2 size={12} />
                                            </button>
                                        )}
                                    </div>
                                </div>
                                <p style={{ margin: 0, fontSize: '0.88rem', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{comment.text}</p>
                            </div>
                        ))}
                        {hasMore && (
                            <button onClick={loadMore} disabled={commentsLoading}
                                style={{ padding: '0.4rem', background: 'none', border: '1px solid #333', color: 'var(--text-secondary)', borderRadius: '4px', cursor: 'pointer', fontSize: '0.82rem' }}>
                                {commentsLoading ? 'Загрузка...' : 'Загрузить ещё'}
                            </button>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

// ── PublicLibrary ────────────────────────────────────────────
const PublicLibrary = () => {
    const navigate = useNavigate();
    const { user } = useAuth();

    const [query, setQuery]         = useState('');
    const [styleFilter, setStyle]   = useState('');
    const [styles, setStyles]       = useState([]);
    const [recipes, setRecipes]     = useState([]);
    const [trending, setTrending]   = useState([]);
    const [loading, setLoading]     = useState(false);
    const [expandedId, setExpandedId] = useState(null);
    const [copyFeedback, setCopyFeedback] = useState(null); // recipeId with success msg

    const searchTimeout = useRef(null);

    // Load styles + trending on mount
    useEffect(() => {
        recipesApi.getStyles()
            .then(data => setStyles(data.map(r => r.style).filter(Boolean)))
            .catch(() => {});
        recipesApi.trending(7)
            .then(data => setTrending(data.slice(0, 5)))
            .catch(() => {});
    }, []);

    // Load recipes (debounced 300ms)
    const loadRecipes = useCallback(async (q, s) => {
        setLoading(true);
        try {
            const data = (q || s)
                ? await recipesApi.search({ q, style: s || undefined, limit: 50 })
                : await recipesApi.getPublic({ limit: 50 });
            setRecipes(data);
        } catch (e) {
            console.error('[PublicLibrary] load failed:', e);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        clearTimeout(searchTimeout.current);
        searchTimeout.current = setTimeout(() => loadRecipes(query, styleFilter), 300);
        return () => clearTimeout(searchTimeout.current);
    }, [query, styleFilter, loadRecipes]);

    const handleCopy = async (recipe) => {
        // eslint-disable-next-line no-unused-vars
        const { id, created_at, updated_at, user_id, is_public, likes_count, comments_count, username, ...rest } = recipe;
        try {
            await recipesApi.create({ ...rest, name: `${rest.name} (копия)` });
            setCopyFeedback(recipe.id);
            setTimeout(() => setCopyFeedback(null), 2500);
        } catch (e) {
            alert('Ошибка копирования: ' + e.message);
        }
    };

    const toggleExpand = (id) => setExpandedId(prev => prev === id ? null : id);

    // ── Render ───────────────────────────────────────────────
    return (
        <div style={{ padding: '2rem 1rem', maxWidth: '900px', margin: '0 auto' }}>

            {/* ── Header ───────────────────────────────────── */}
            <header style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '2rem' }}>
                <button onClick={() => navigate('/brewing')}
                    style={{ background: 'none', border: '1px solid var(--border-color)', color: 'var(--text-primary)', padding: '0.5rem', borderRadius: '4px', cursor: 'pointer' }}>
                    <ArrowLeft size={20} />
                </button>
                <div>
                    <h1 style={{ margin: 0, fontSize: '1.8rem', color: 'var(--primary-color)' }}>Библиотека рецептов</h1>
                    <p style={{ margin: '0.2rem 0 0', color: 'var(--text-secondary)', fontSize: '0.88rem' }}>Публичные рецепты от сообщества</p>
                </div>
            </header>

            {/* ── Search + Filter ───────────────────────────── */}
            <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
                <div style={{ flex: '2 1 220px', position: 'relative' }}>
                    <Search size={16} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)', pointerEvents: 'none' }} />
                    <input
                        value={query}
                        onChange={e => setQuery(e.target.value)}
                        placeholder="Поиск рецептов..."
                        style={{ width: '100%', padding: '0.65rem 0.75rem 0.65rem 2.25rem', background: '#111', border: '1px solid var(--border-color)', color: '#fff', borderRadius: '4px', boxSizing: 'border-box' }}
                    />
                    {query && (
                        <button onClick={() => setQuery('')}
                            style={{ position: 'absolute', right: '0.5rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: '0.2rem' }}>
                            <X size={14} />
                        </button>
                    )}
                </div>
                <select
                    value={styleFilter}
                    onChange={e => setStyle(e.target.value)}
                    style={{ flex: '1 1 160px', padding: '0.65rem 0.75rem', background: '#111', border: '1px solid var(--border-color)', color: styleFilter ? '#fff' : 'var(--text-secondary)', borderRadius: '4px' }}
                >
                    <option value="">Все стили</option>
                    {styles.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
            </div>

            {/* ── Trending ──────────────────────────────────── */}
            {trending.length > 0 && !query && !styleFilter && (
                <div style={{ marginBottom: '2rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem', color: 'var(--text-secondary)', fontSize: '0.82rem', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                        <TrendingUp size={14} /> Сейчас популярно
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                        {trending.map(r => (
                            <button key={r.id} onClick={() => { setExpandedId(r.id); setQuery(r.name); }}
                                style={{ padding: '0.4rem 0.9rem', background: 'rgba(255,152,0,0.08)', border: '1px solid rgba(255,152,0,0.3)', color: 'var(--primary-color)', borderRadius: '20px', cursor: 'pointer', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.4rem', whiteSpace: 'nowrap' }}>
                                <Heart size={12} fill="currentColor" />
                                {r.name}
                                <span style={{ opacity: 0.6, fontFamily: 'monospace', fontSize: '0.78rem' }}>{r.likes_count}</span>
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* ── Recipe List ───────────────────────────────── */}
            {loading ? (
                <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem', color: 'var(--text-secondary)', gap: '1rem' }}>
                    <Loader size={24} className="spin" /> Загрузка...
                </div>
            ) : recipes.length === 0 ? (
                <div className="industrial-panel" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                    {query || styleFilter ? 'Рецептов не найдено' : 'Публичных рецептов пока нет'}
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    {recipes.map(recipe => {
                        const expanded = expandedId === recipe.id;
                        return (
                            <div key={recipe.id} className="industrial-panel" style={{ padding: '1.1rem 1.4rem', borderLeft: expanded ? '4px solid var(--primary-color)' : '4px solid transparent', transition: 'border-color 0.2s' }}>

                                {/* ── Card Header ────────────────────────── */}
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', cursor: 'pointer' }}
                                    onClick={() => toggleExpand(recipe.id)}>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '0.3rem', wordBreak: 'break-word' }}>
                                            {recipe.name}
                                            {copyFeedback === recipe.id && (
                                                <span style={{ marginLeft: '0.5rem', color: '#4caf50', fontSize: '0.8rem', fontWeight: 400 }}>✓ скопировано</span>
                                            )}
                                        </div>
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', color: 'var(--text-secondary)', fontSize: '0.84rem', alignItems: 'center' }}>
                                            {recipe.style && <span style={{ color: 'var(--primary-color)', opacity: 0.8 }}>{recipe.style}</span>}
                                            {recipe.username && <span>@{recipe.username}</span>}
                                            {recipe.batch_size > 0 && <span style={{ fontFamily: 'monospace' }}>{recipe.batch_size}л</span>}
                                            {recipe.abv > 0 && <span style={{ fontFamily: 'monospace' }}>{recipe.abv}% ABV</span>}
                                            {recipe.ibu > 0 && <span style={{ fontFamily: 'monospace' }}>{recipe.ibu} IBU</span>}
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexShrink: 0, color: 'var(--text-secondary)', fontSize: '0.84rem' }}>
                                        <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                                            <Heart size={13} fill={recipe.likes_count > 0 ? 'rgba(244,67,54,0.7)' : 'none'} stroke={recipe.likes_count > 0 ? '#f44336' : 'currentColor'} />
                                            {recipe.likes_count || 0}
                                        </span>
                                        <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                                            <MessageCircle size={13} /> {recipe.comments_count || 0}
                                        </span>
                                        {expanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                                    </div>
                                </div>

                                {/* ── Expanded view ──────────────────────── */}
                                {expanded && (
                                    <ExpandedRecipeView
                                        recipe={recipe}
                                        currentUser={user}
                                        onCopy={() => handleCopy(recipe)}
                                    />
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

export default PublicLibrary;
