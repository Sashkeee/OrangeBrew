import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Search, X, Loader, Heart, MessageSquare } from 'lucide-react';
import { recipesApi } from '../api/client.js';

/**
 * RecipeSearch — searchable public recipe library with style filter.
 *
 * Props:
 *   onSelect(recipe) — called when user clicks on a recipe card
 */
export default function RecipeSearch({ onSelect }) {
    const [query, setQuery]     = useState('');
    const [style, setStyle]     = useState('');
    const [styles, setStyles]   = useState([]);
    const [results, setResults] = useState([]);
    const [loading, setLoading] = useState(false);
    const debounceRef = useRef(null);

    // Load style options once
    useEffect(() => {
        recipesApi.getStyles()
            .then(setStyles)
            .catch(() => {});
    }, []);

    const doSearch = useCallback(async (q, s) => {
        setLoading(true);
        try {
            const params = { limit: 20 };
            if (q.trim()) params.q = q.trim();
            if (s) params.style = s;
            const data = await recipesApi.search(params);
            setResults(data);
        } catch {
            setResults([]);
        } finally {
            setLoading(false);
        }
    }, []);

    // Initial load + debounced re-search on query change
    useEffect(() => {
        clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => doSearch(query, style), 300);
        return () => clearTimeout(debounceRef.current);
    }, [query, style, doSearch]);

    const clearSearch = () => { setQuery(''); setStyle(''); };

    return (
        <div className="recipe-search">
            {/* Search bar + style filter */}
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
                <div style={{ flex: '1 1 240px', position: 'relative' }}>
                    <Search size={16} style={{
                        position: 'absolute', left: '0.6rem', top: '50%', transform: 'translateY(-50%)',
                        color: 'var(--text-secondary)', pointerEvents: 'none',
                    }} />
                    <input
                        type="text"
                        value={query}
                        onChange={e => setQuery(e.target.value)}
                        placeholder="Найти рецепт..."
                        style={{
                            width: '100%',
                            paddingLeft: '2rem',
                            paddingRight: query ? '2rem' : '0.6rem',
                            paddingTop: '0.5rem',
                            paddingBottom: '0.5rem',
                            background: 'rgba(255,255,255,0.05)',
                            border: '1px solid #444',
                            borderRadius: '4px',
                            color: 'var(--text-primary)',
                            fontSize: '0.9rem',
                            boxSizing: 'border-box',
                        }}
                    />
                    {query && (
                        <button onClick={clearSearch} style={{
                            position: 'absolute', right: '0.5rem', top: '50%', transform: 'translateY(-50%)',
                            background: 'none', border: 'none', cursor: 'pointer',
                            color: 'var(--text-secondary)', padding: 0,
                        }}>
                            <X size={14} />
                        </button>
                    )}
                </div>

                {styles.length > 0 && (
                    <select
                        value={style}
                        onChange={e => setStyle(e.target.value)}
                        style={{
                            padding: '0.5rem 0.75rem',
                            background: 'rgba(255,255,255,0.05)',
                            border: '1px solid #444',
                            borderRadius: '4px',
                            color: 'var(--text-primary)',
                            fontSize: '0.9rem',
                            minWidth: '120px',
                        }}
                    >
                        <option value="">Все стили</option>
                        {styles.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                )}

                {loading && <Loader size={18} className="spin" style={{ alignSelf: 'center', opacity: 0.6 }} />}
            </div>

            {/* Results */}
            {results.length === 0 && !loading && (
                <p style={{ color: 'var(--text-secondary)', opacity: 0.6, fontSize: '0.9rem', padding: '1rem 0' }}>
                    {query || style ? 'Ничего не найдено' : 'Нет публичных рецептов'}
                </p>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {results.map(recipe => (
                    <div
                        key={recipe.id}
                        className="industrial-panel"
                        onClick={() => onSelect?.(recipe)}
                        style={{
                            padding: '1rem 1.25rem',
                            cursor: onSelect ? 'pointer' : 'default',
                            borderLeft: '3px solid var(--primary-color)',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            gap: '1rem',
                            transition: 'background 0.15s',
                        }}
                        onMouseEnter={e => onSelect && (e.currentTarget.style.background = 'var(--surface-lighter)')}
                        onMouseLeave={e => onSelect && (e.currentTarget.style.background = '')}
                    >
                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                                <span style={{ fontWeight: 600 }}>{recipe.name}</span>
                                {recipe.style && (
                                    <span style={{ fontSize: '0.75rem', color: 'var(--primary-color)', opacity: 0.8 }}>
                                        {recipe.style}
                                    </span>
                                )}
                            </div>
                            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', opacity: 0.7 }}>
                                {recipe.author} · {recipe.batch_size}л
                                {recipe.og > 0 && ` · OG ${recipe.og.toFixed(3)}`}
                            </div>
                        </div>
                        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', fontSize: '0.8rem', color: 'var(--text-secondary)', flexShrink: 0 }}>
                            {recipe.likes_count > 0 && (
                                <span style={{ display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
                                    <Heart size={13} fill="currentColor" style={{ color: '#e53935' }} />
                                    {recipe.likes_count}
                                </span>
                            )}
                            {recipe.comments_count > 0 && (
                                <span style={{ display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
                                    <MessageSquare size={13} />
                                    {recipe.comments_count}
                                </span>
                            )}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
