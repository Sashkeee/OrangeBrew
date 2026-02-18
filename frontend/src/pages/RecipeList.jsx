import React from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Clock, User, Calendar } from 'lucide-react';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';

// Mock data based on plan
const mockRecipes = [
    { id: 1, name: 'IPA "Orange Sunshine"', brewer: 'Александр', date: new Date(), style: 'American IPA' },
    { id: 2, name: 'Stout "Deep Dark"', brewer: 'Иван', date: new Date('2026-02-10'), style: 'Oatmeal Stout' },
    { id: 3, name: 'Lager "Crystal Clear"', brewer: 'Александр', date: new Date('2026-02-05'), style: 'German Pilsner' },
];

const RecipeList = () => {
    const navigate = useNavigate();

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
                <h1 style={{ margin: 0, fontSize: '1.8rem', color: 'var(--primary-color)' }}>Выбор рецепта</h1>
            </header>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {mockRecipes.sort((a, b) => b.date - a.date).map((recipe, index) => (
                    <motion.div
                        key={recipe.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.05 }}
                        onClick={() => navigate(`/brewing/mash/${recipe.id}`)}
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
                                <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <User size={14} aria-hidden="true" /> {recipe.brewer}
                                </span>
                                <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <Calendar size={14} aria-hidden="true" /> {format(recipe.date, 'dd.MM.yyyy', { locale: ru })}
                                </span>
                                <span className="text-mono" style={{ color: 'var(--primary-color)', opacity: 0.8 }}>
                                    {recipe.style}
                                </span>
                            </div>
                        </div>
                        <div style={{ color: 'var(--primary-color)', display: 'flex', alignItems: 'center' }}>
                            <ArrowLeft size={24} style={{ transform: 'rotate(180deg)' }} aria-hidden="true" />
                        </div>
                    </motion.div>
                ))}
            </div>
        </div>
    );
};

export default RecipeList;
