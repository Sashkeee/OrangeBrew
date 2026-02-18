import React from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Clock, User, Calendar, Loader, AlertTriangle, Plus } from 'lucide-react';
import { useRecipes } from '../hooks/useRecipes.js';

const RecipeList = () => {
    const navigate = useNavigate();
    const { recipes, loading, error, deleteRecipe } = useRecipes();

    const handleSelectRecipe = (recipe) => {
        // Save to localStorage for the Mashing page backward compat
        localStorage.setItem('currentRecipe', JSON.stringify({
            ...recipe,
            steps: recipe.mash_steps || [],
        }));
        navigate(`/brewing/mash/${recipe.id}`);
    };

    const handleDelete = async (e, id) => {
        e.stopPropagation();
        if (!confirm('Удалить рецепт?')) return;
        try {
            await deleteRecipe(id);
        } catch (err) {
            console.error('[RecipeList] Delete failed:', err);
        }
    };

    const formatDate = (dateStr) => {
        if (!dateStr) return '—';
        try {
            const d = new Date(dateStr);
            return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
        } catch { return dateStr; }
    };

    return (
        <div style={{ padding: '2rem 1rem', maxWidth: '1000px', margin: '0 auto' }}>
            <header style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '2rem' }}>
                <button
                    onClick={() => navigate('/brewing')}
                    aria-label="Назад к пивоварению"
                    style={{
                        background: 'none',
                        border: '1px solid var(--border-color)',
                        color: 'var(--text-primary)',
                        padding: '0.5rem',
                        borderRadius: '4px'
                    }}
                >
                    <ArrowLeft size={20} aria-hidden="true" />
                </button>
                <h1 style={{ margin: 0, fontSize: '1.8rem', color: 'var(--primary-color)', flex: 1 }}>Выбор рецепта</h1>
                <button
                    onClick={() => navigate('/brewing/recipes/new')}
                    aria-label="Добавить рецепт"
                    style={{
                        background: 'rgba(255,152,0,0.1)',
                        border: '1px solid var(--primary-color)',
                        color: 'var(--primary-color)',
                        padding: '0.5rem 1rem',
                        borderRadius: '4px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                    }}
                >
                    <Plus size={18} aria-hidden="true" /> Новый
                </button>
            </header>

            {/* Loading state */}
            {loading && (
                <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>
                    <Loader size={32} className="spin" /> <span style={{ marginLeft: '1rem' }}>Загрузка рецептов...</span>
                </div>
            )}

            {/* Error state */}
            {error && (
                <div className="industrial-panel" style={{ padding: '1.5rem', display: 'flex', alignItems: 'center', gap: '1rem', color: 'var(--accent-red)' }}>
                    <AlertTriangle size={24} />
                    <div>
                        <div style={{ fontWeight: 'bold' }}>Ошибка загрузки</div>
                        <div style={{ fontSize: '0.9rem', opacity: 0.8 }}>{error}</div>
                    </div>
                </div>
            )}

            {/* Empty state */}
            {!loading && !error && recipes.length === 0 && (
                <div className="industrial-panel" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                    <p style={{ fontSize: '1.1rem', marginBottom: '1rem' }}>Рецептов нет</p>
                    <button
                        onClick={() => navigate('/brewing/recipes/new')}
                        style={{
                            padding: '0.8rem 2rem',
                            background: 'var(--primary-color)',
                            border: 'none',
                            color: '#000',
                            fontWeight: 'bold',
                            borderRadius: '4px',
                        }}
                    >
                        Создать первый рецепт
                    </button>
                </div>
            )}

            {/* Recipe list */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {recipes.map((recipe, index) => (
                    <motion.div
                        key={recipe.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.05 }}
                        onClick={() => handleSelectRecipe(recipe)}
                        className="industrial-panel"
                        role="button"
                        aria-label={`Выбрать рецепт ${recipe.name}`}
                        style={{
                            padding: '1.5rem',
                            cursor: 'pointer',
                            display: 'flex',
                            flexWrap: 'wrap',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            gap: '1rem',
                            transition: 'background 0.2s',
                            borderLeft: '4px solid var(--primary-color)'
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.background = 'var(--surface-lighter)'}
                        onMouseLeave={(e) => e.currentTarget.style.background = 'var(--surface-color)'}
                    >
                        <div style={{ flex: '1 1 300px' }}>
                            <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '1.2rem' }}>{recipe.name}</h3>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem 1.5rem', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                                {recipe.style && (
                                    <span className="text-mono" style={{ color: 'var(--primary-color)', opacity: 0.8 }}>
                                        {recipe.style}
                                    </span>
                                )}
                                <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <Calendar size={14} aria-hidden="true" /> {formatDate(recipe.created_at)}
                                </span>
                                {recipe.batch_size > 0 && (
                                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                        {recipe.batch_size} л
                                    </span>
                                )}
                                {recipe.mash_steps?.length > 0 && (
                                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                        <Clock size={14} aria-hidden="true" /> {recipe.mash_steps.length} пауз
                                    </span>
                                )}
                            </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <button
                                onClick={(e) => handleDelete(e, recipe.id)}
                                aria-label="Удалить рецепт"
                                style={{ background: 'none', border: '1px solid #444', color: '#f44336', padding: '0.3rem 0.6rem', borderRadius: '4px', fontSize: '0.8rem' }}
                            >
                                ✕
                            </button>
                            <ArrowLeft size={24} style={{ transform: 'rotate(180deg)', color: 'var(--primary-color)' }} aria-hidden="true" />
                        </div>
                    </motion.div>
                ))}
            </div>
        </div>
    );
};

export default RecipeList;
