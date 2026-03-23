import React, { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
    ArrowLeft, Heart, MessageCircle, Play, Pencil,
    Globe, EyeOff, Loader, AlertTriangle, Send, Trash2,
} from 'lucide-react';
import { useRecipe } from '../hooks/useRecipes.js';
import { useRecipeLikes } from '../hooks/useRecipeLikes.js';
import { useRecipeComments } from '../hooks/useRecipeComments.js';
import { recipesApi, sessionsApi } from '../api/client.js';
import { useAuth } from '../contexts/AuthContext.jsx';

// ── Styles (module scope) ────────────────────────────────────
const sectionStyle = {
    padding: '1.25rem 1.5rem',
    marginBottom: '1rem',
};

const rowStyle = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '0.55rem 0.8rem',
    background: 'rgba(255,255,255,0.03)',
    borderRadius: '4px',
    border: '1px solid #2a2a2a',
};

const monoStyle = {
    fontFamily: 'monospace',
    color: 'var(--text-secondary)',
    fontSize: '0.9rem',
};

const inputStyle = {
    padding: '0.6rem 0.8rem',
    background: '#111',
    border: '1px solid var(--border-color)',
    color: '#fff',
    borderRadius: '4px',
    flex: 1,
    minWidth: 0,
};

// ── Component ────────────────────────────────────────────────
const RecipeDetail = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const { user } = useAuth();

    const { recipe, loading, error } = useRecipe(id);
    const { count: likeCount, isLiked, toggle: toggleLike } = useRecipeLikes(id);
    const {
        comments, total: commentsTotal,
        loading: commentsLoading, hasMore,
        addComment, deleteComment, loadMore,
    } = useRecipeComments(id);

    const [commentText, setCommentText] = useState('');
    const [submitting, setSubmitting]   = useState(false);
    const [publishing, setPublishing]   = useState(false);
    const [localPublic, setLocalPublic] = useState(null);
    const [starting, setStarting]       = useState(false);

    const handleStartBrew = async () => {
        setStarting(true);
        try {
            const session = await sessionsApi.create({ recipe_id: recipe.id, type: 'mash' });
            navigate(`/brewing/mash/${session.id}`);
        } catch (e) {
            alert('Ошибка: ' + e.message);
            setStarting(false);
        }
    };

    const handlePublish = async () => {
        if (!recipe) return;
        const current = localPublic !== null ? localPublic : !!recipe.is_public;
        setPublishing(true);
        try {
            await recipesApi.setPublic(id, !current);
            setLocalPublic(!current);
        } catch (e) {
            alert('Ошибка публикации: ' + e.message);
        } finally {
            setPublishing(false);
        }
    };

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

    // ── Loading / Error ──────────────────────────────────────
    if (loading) {
        return (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh', color: 'var(--text-secondary)', gap: '1rem' }}>
                <Loader size={28} className="spin" /> Загрузка...
            </div>
        );
    }

    if (error || !recipe) {
        return (
            <div style={{ padding: '2rem 1rem', maxWidth: '900px', margin: '0 auto' }}>
                <div className="industrial-panel" style={{ padding: '2rem', display: 'flex', gap: '1rem', color: 'var(--accent-red)', alignItems: 'center' }}>
                    <AlertTriangle size={28} />
                    <div>
                        <h3 style={{ margin: 0 }}>Рецепт не найден</h3>
                        <p style={{ margin: '0.5rem 0 0', opacity: 0.8 }}>{error}</p>
                    </div>
                </div>
                <button onClick={() => navigate('/brewing/recipes')}
                    style={{ marginTop: '1rem', padding: '0.5rem 1rem', background: 'none', border: '1px solid #444', color: '#fff', borderRadius: '4px', cursor: 'pointer' }}>
                    ← Назад
                </button>
            </div>
        );
    }

    const isPublic = localPublic !== null ? localPublic : !!recipe.is_public;

    // ── Stat items ───────────────────────────────────────────
    const stats = [
        recipe.og        > 0 ? { v: recipe.og.toFixed(3), l: 'OG' }           : null,
        recipe.fg        > 0 ? { v: recipe.fg.toFixed(3), l: 'FG' }           : null,
        recipe.ibu       > 0 ? { v: recipe.ibu,           l: 'IBU' }          : null,
        recipe.abv       > 0 ? { v: `${recipe.abv}%`,     l: 'ABV' }          : null,
        recipe.batch_size > 0 ? { v: `${recipe.batch_size}л`, l: 'Объём' }    : null,
        recipe.boil_time  > 0 ? { v: `${recipe.boil_time} мин`, l: 'Кипяч.' } : null,
    ].filter(Boolean);

    // ── Plural helper ────────────────────────────────────────
    const commentWord = (n) =>
        n === 1 ? 'комментарий' : n < 5 ? 'комментария' : 'комментариев';

    return (
        <div style={{ padding: '2rem 1rem', maxWidth: '900px', margin: '0 auto' }}>

            {/* ── Header ───────────────────────────────────── */}
            <header style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
                <button onClick={() => navigate('/brewing/recipes')}
                    style={{ background: 'none', border: '1px solid var(--border-color)', color: 'var(--text-primary)', padding: '0.5rem', borderRadius: '4px', cursor: 'pointer', flexShrink: 0 }}>
                    <ArrowLeft size={20} />
                </button>
                <div style={{ flex: 1, minWidth: 0 }}>
                    <h1 style={{ margin: 0, fontSize: '1.8rem', color: 'var(--primary-color)', wordBreak: 'break-word' }}>{recipe.name}</h1>
                    {recipe.style && <div style={{ color: 'var(--text-secondary)', marginTop: '0.25rem' }}>{recipe.style}</div>}
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0, flexWrap: 'wrap' }}>
                    <button onClick={handlePublish} disabled={publishing}
                        title={isPublic ? 'Снять с публикации' : 'Опубликовать в библиотеке'}
                        style={{ padding: '0.5rem 0.75rem', background: isPublic ? 'rgba(76,175,80,0.15)' : 'rgba(255,255,255,0.05)', border: `1px solid ${isPublic ? '#4caf50' : '#555'}`, color: isPublic ? '#4caf50' : 'var(--text-secondary)', borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.82rem' }}>
                        {isPublic ? <Globe size={15} /> : <EyeOff size={15} />}
                        {publishing ? '...' : isPublic ? 'Публичный' : 'Приватный'}
                    </button>
                    <button onClick={() => navigate(`/brewing/recipes/${id}/edit`)}
                        style={{ padding: '0.5rem 0.75rem', background: 'none', border: '1px solid #555', color: 'var(--text-secondary)', borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.82rem' }}>
                        <Pencil size={15} /> Изменить
                    </button>
                </div>
            </header>

            {/* ── Stats ────────────────────────────────────── */}
            {stats.length > 0 && (
                <div className="industrial-panel" style={{ ...sectionStyle, display: 'flex', flexWrap: 'wrap', gap: '1rem' }}>
                    {stats.map(({ v, l }) => (
                        <div key={l} style={{ textAlign: 'center', flex: '1 1 80px' }}>
                            <div style={{ fontSize: '1.35rem', fontWeight: 'bold', color: 'var(--primary-color)', fontFamily: 'monospace' }}>{v}</div>
                            <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '0.2rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{l}</div>
                        </div>
                    ))}
                </div>
            )}

            {/* ── Mash Steps ───────────────────────────────── */}
            {recipe.mash_steps?.length > 0 && (
                <div className="industrial-panel" style={sectionStyle}>
                    <h3 style={{ margin: '0 0 0.9rem', color: '#ff9800', fontSize: '1rem' }}>Температурные паузы</h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                        {recipe.mash_steps.map((step, i) => (
                            <div key={i} style={rowStyle}>
                                <span>{step.name || `Пауза ${i + 1}`}</span>
                                <span style={monoStyle}>{step.temp}°C · {step.duration} мин</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* ── Ingredients ──────────────────────────────── */}
            {recipe.ingredients?.length > 0 && (
                <div className="industrial-panel" style={sectionStyle}>
                    <h3 style={{ margin: '0 0 0.9rem', color: '#4caf50', fontSize: '1rem' }}>Ингредиенты</h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                        {recipe.ingredients.map((ing, i) => (
                            <div key={i} style={rowStyle}>
                                <span>{ing.name}</span>
                                <span style={monoStyle}>{ing.amount} {ing.unit}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* ── Hop Additions ────────────────────────────── */}
            {recipe.hop_additions?.length > 0 && (
                <div className="industrial-panel" style={sectionStyle}>
                    <h3 style={{ margin: '0 0 0.9rem', color: '#03a9f4', fontSize: '1rem' }}>Хмель</h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                        {recipe.hop_additions.map((hop, i) => (
                            <div key={i} style={rowStyle}>
                                <span>{hop.name}</span>
                                <span style={monoStyle}>{hop.amount} г · {hop.time} мин</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* ── Notes ────────────────────────────────────── */}
            {recipe.notes ? (
                <div className="industrial-panel" style={sectionStyle}>
                    <h3 style={{ margin: '0 0 0.75rem', color: 'var(--text-secondary)', fontSize: '1rem' }}>Заметки</h3>
                    <p style={{ margin: 0, lineHeight: '1.6', whiteSpace: 'pre-wrap' }}>{recipe.notes}</p>
                </div>
            ) : null}

            {/* ── Start Brew ───────────────────────────────── */}
            <button onClick={handleStartBrew} disabled={starting}
                style={{ width: '100%', padding: '1rem', background: 'var(--primary-color)', border: 'none', color: '#000', fontWeight: 'bold', borderRadius: '4px', cursor: starting ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', fontSize: '1rem', opacity: starting ? 0.7 : 1, marginBottom: '1.5rem' }}>
                <Play size={20} /> {starting ? 'Запуск...' : 'Начать варку'}
            </button>

            {/* ── Likes ────────────────────────────────────── */}
            <div className="industrial-panel" style={{ ...sectionStyle, display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <button onClick={toggleLike}
                    style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: isLiked ? 'rgba(244,67,54,0.12)' : 'none', border: `1px solid ${isLiked ? '#f44336' : '#444'}`, color: isLiked ? '#f44336' : 'var(--text-secondary)', padding: '0.5rem 1rem', borderRadius: '4px', cursor: 'pointer', transition: 'all 0.15s' }}>
                    <Heart size={17} fill={isLiked ? '#f44336' : 'none'} strokeWidth={2} />
                    <span style={{ fontFamily: 'monospace' }}>{likeCount}</span>
                </button>
                <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                    <MessageCircle size={14} />
                    {commentsTotal} {commentWord(commentsTotal)}
                </span>
            </div>

            {/* ── Comments ─────────────────────────────────── */}
            <div className="industrial-panel" style={sectionStyle}>
                <h3 style={{ margin: '0 0 1rem', fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <MessageCircle size={17} /> Комментарии
                </h3>

                {/* Input */}
                <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem' }}>
                    <input
                        value={commentText}
                        onChange={e => setCommentText(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAddComment(); } }}
                        placeholder="Написать комментарий..."
                        maxLength={1000}
                        style={inputStyle}
                    />
                    <button onClick={handleAddComment} disabled={submitting || !commentText.trim()}
                        style={{ padding: '0.6rem 1rem', background: 'rgba(255,152,0,0.15)', border: '1px solid var(--primary-color)', color: 'var(--primary-color)', borderRadius: '4px', cursor: 'pointer', opacity: submitting || !commentText.trim() ? 0.45 : 1, flexShrink: 0 }}>
                        <Send size={16} />
                    </button>
                </div>

                {/* List */}
                {commentsLoading && comments.length === 0 ? (
                    <div style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '1.5rem' }}>
                        <Loader size={20} className="spin" />
                    </div>
                ) : comments.length === 0 ? (
                    <div style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '1.5rem', opacity: 0.6 }}>
                        Комментариев пока нет
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                        {comments.map(comment => (
                            <div key={comment.id} style={{ padding: '0.75rem 1rem', background: 'rgba(255,255,255,0.03)', borderRadius: '4px', border: '1px solid #2a2a2a' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                                    <span style={{ color: 'var(--primary-color)', fontWeight: 600, fontSize: '0.88rem' }}>{comment.username}</span>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                        <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                                            {new Date(comment.created_at).toLocaleDateString('ru-RU')}
                                        </span>
                                        {comment.user_id === user?.id && (
                                            <button onClick={() => deleteComment(comment.id)}
                                                style={{ background: 'none', border: 'none', color: '#555', cursor: 'pointer', padding: '0 0.1rem', lineHeight: 1 }}
                                                title="Удалить">
                                                <Trash2 size={13} />
                                            </button>
                                        )}
                                    </div>
                                </div>
                                <p style={{ margin: 0, lineHeight: '1.55', whiteSpace: 'pre-wrap', fontSize: '0.92rem' }}>{comment.text}</p>
                            </div>
                        ))}
                        {hasMore && (
                            <button onClick={loadMore} disabled={commentsLoading}
                                style={{ padding: '0.5rem', background: 'none', border: '1px solid #333', color: 'var(--text-secondary)', borderRadius: '4px', cursor: 'pointer', fontSize: '0.85rem' }}>
                                {commentsLoading ? 'Загрузка...' : 'Загрузить ещё'}
                            </button>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

export default RecipeDetail;
