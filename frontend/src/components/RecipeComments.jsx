import React, { useState } from 'react';
import { Trash2, Loader, MessageSquare } from 'lucide-react';
import { useRecipeComments } from '../hooks/useRecipeComments.js';

/**
 * RecipeComments — comment list + input form for a recipe.
 *
 * Props:
 *   recipeId    {number}  — recipe id
 *   currentUser {object}  — { id, username } from auth context
 */
export default function RecipeComments({ recipeId, currentUser }) {
    const { comments, total, loading, hasMore, addComment, deleteComment, loadMore } = useRecipeComments(recipeId);
    const [text, setText]     = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [error, setError]   = useState(null);

    const handleSubmit = async (e) => {
        e.preventDefault();
        const trimmed = text.trim();
        if (!trimmed || submitting) return;

        setSubmitting(true);
        setError(null);
        try {
            await addComment(trimmed);
            setText('');
        } catch (err) {
            setError(err.message || 'Ошибка при добавлении комментария');
        } finally {
            setSubmitting(false);
        }
    };

    const handleDelete = async (commentId) => {
        if (!confirm('Удалить комментарий?')) return;
        try {
            await deleteComment(commentId);
        } catch (err) {
            alert(err.message || 'Ошибка при удалении');
        }
    };

    const formatDate = (str) => {
        try {
            return new Date(str).toLocaleString('ru-RU', {
                day: '2-digit', month: '2-digit', year: 'numeric',
                hour: '2-digit', minute: '2-digit',
            });
        } catch { return str; }
    };

    return (
        <div className="recipe-comments">
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
                <MessageSquare size={16} style={{ opacity: 0.6 }} />
                <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                    Комментарии {total > 0 && `(${total})`}
                </span>
            </div>

            {/* Comment list */}
            {comments.length === 0 && !loading && (
                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', opacity: 0.7, marginBottom: '1rem' }}>
                    Нет комментариев. Будьте первым!
                </p>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1rem' }}>
                {comments.map(c => (
                    <div key={c.id} style={{
                        background: 'var(--surface-lighter, rgba(255,255,255,0.04))',
                        borderRadius: '6px',
                        padding: '0.75rem',
                        display: 'flex',
                        gap: '0.75rem',
                    }}>
                        {/* Avatar stub */}
                        <div style={{
                            width: 32, height: 32, borderRadius: '50%',
                            background: 'var(--primary-color)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: '0.8rem', fontWeight: 'bold', color: '#000',
                            flexShrink: 0,
                        }}>
                            {c.username?.[0]?.toUpperCase() || '?'}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
                                <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>{c.username}</span>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', opacity: 0.6 }}>
                                        {formatDate(c.created_at)}
                                    </span>
                                    {currentUser && c.user_id === currentUser.id && (
                                        <button
                                            onClick={() => handleDelete(c.id)}
                                            title="Удалить"
                                            style={{
                                                background: 'none', border: 'none',
                                                color: '#f44336', cursor: 'pointer',
                                                padding: '0.1rem', opacity: 0.7,
                                            }}
                                        >
                                            <Trash2 size={13} />
                                        </button>
                                    )}
                                </div>
                            </div>
                            <p style={{ margin: '0.3rem 0 0', fontSize: '0.875rem', lineHeight: 1.5, wordBreak: 'break-word' }}>
                                {c.text}
                            </p>
                        </div>
                    </div>
                ))}
            </div>

            {/* Load more */}
            {hasMore && (
                <button
                    onClick={loadMore}
                    disabled={loading}
                    style={{
                        background: 'none', border: '1px solid #444',
                        color: 'var(--text-secondary)', cursor: 'pointer',
                        padding: '0.4rem 1rem', borderRadius: '4px',
                        fontSize: '0.85rem', marginBottom: '1rem',
                        display: 'flex', alignItems: 'center', gap: '0.4rem',
                    }}
                >
                    {loading ? <Loader size={14} className="spin" /> : null}
                    Показать ещё
                </button>
            )}

            {/* Add comment form */}
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <textarea
                    value={text}
                    onChange={e => setText(e.target.value)}
                    placeholder="Написать комментарий..."
                    maxLength={1000}
                    rows={3}
                    style={{
                        width: '100%',
                        padding: '0.6rem',
                        background: 'var(--surface-lighter, rgba(255,255,255,0.04))',
                        border: '1px solid #444',
                        borderRadius: '6px',
                        color: 'var(--text-primary)',
                        fontSize: '0.875rem',
                        resize: 'vertical',
                        boxSizing: 'border-box',
                    }}
                />
                {error && (
                    <span style={{ fontSize: '0.8rem', color: '#f44336' }}>{error}</span>
                )}
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', opacity: 0.5, alignSelf: 'center' }}>
                        {text.length}/1000
                    </span>
                    <button
                        type="submit"
                        disabled={!text.trim() || submitting}
                        style={{
                            background: text.trim() && !submitting
                                ? 'rgba(255,152,0,0.15)'
                                : 'rgba(255,255,255,0.05)',
                            border: '1px solid',
                            borderColor: text.trim() && !submitting ? 'var(--primary-color)' : '#444',
                            color: text.trim() && !submitting ? 'var(--primary-color)' : 'var(--text-secondary)',
                            cursor: text.trim() && !submitting ? 'pointer' : 'default',
                            padding: '0.4rem 1.2rem',
                            borderRadius: '4px',
                            fontSize: '0.85rem',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.4rem',
                        }}
                    >
                        {submitting && <Loader size={13} className="spin" />}
                        Отправить
                    </button>
                </div>
            </form>
        </div>
    );
}
