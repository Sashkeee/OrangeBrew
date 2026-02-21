import React from 'react';
import { motion } from 'framer-motion';
import { Link, useNavigate } from 'react-router-dom';
import { ScrollText, Plus, BookOpen, ArrowLeft, Leaf, Calculator } from 'lucide-react';

const Brewing = () => {
    const navigate = useNavigate();
    const options = [
        { title: 'Выбрать рецепт', icon: <ScrollText size={40} />, path: '/brewing/recipes', description: 'Выбрать из существующих' },
        { title: 'Добавить рецепт', icon: <Plus size={40} />, path: '/brewing/recipes/new', description: 'Создать новый рецепт' },
        { title: 'История варок', icon: <BookOpen size={40} />, path: '/brewing/history', description: 'Просмотр прошлых сессий' },
        { title: 'Справочник', icon: <Leaf size={40} color="#4caf50" />, path: '/brewing/ingredients', description: 'Таблица солода, хмеля и дрожжей' },
        { title: 'Калькуляторы', icon: <Calculator size={40} color="#03a9f4" />, path: '/calculators', description: 'Крепость, дилюция, ареометр...' },
    ];

    return (
        <div style={{ padding: '2rem 1rem', maxWidth: '1200px', margin: '0 auto' }}>
            <header style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '3rem' }}>
                <button
                    onClick={() => navigate('/')}
                    aria-label="Назад на главную"
                    style={{
                        background: 'none',
                        border: '1px solid var(--border-color)',
                        color: 'var(--text-primary)',
                        padding: '0.5rem',
                        borderRadius: '4px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                    }}
                >
                    <ArrowLeft size={20} aria-hidden="true" />
                </button>
                <h1 style={{ margin: 0, fontSize: '2rem', color: 'var(--primary-color)' }}>Пивоварение</h1>
            </header>

            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                gap: '2rem'
            }}>
                {options.map((option, index) => (
                    <motion.div
                        key={option.path}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: index * 0.1 }}
                    >
                        <Link
                            to={option.path}
                            style={{ textDecoration: 'none' }}
                            aria-label={`Раздел: ${option.title}. ${option.description}`}
                        >
                            <div className="industrial-panel" style={{
                                padding: '2.5rem 1.5rem',
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                textAlign: 'center',
                                gap: '1.5rem',
                                height: '100%',
                                transition: 'all 0.3s ease',
                                border: '1px solid var(--border-color)',
                                position: 'relative',
                                overflow: 'hidden'
                            }}
                                onMouseEnter={(e) => {
                                    e.currentTarget.style.borderColor = 'var(--primary-color)';
                                    e.currentTarget.style.boxShadow = '0 0 20px rgba(255, 152, 0, 0.1)';
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.borderColor = 'var(--border-color)';
                                    e.currentTarget.style.boxShadow = 'var(--card-shadow)';
                                }}
                            >
                                <div style={{
                                    color: 'var(--primary-color)',
                                    background: 'rgba(255, 152, 0, 0.1)',
                                    padding: '1.5rem',
                                    borderRadius: '50%'
                                }} aria-hidden="true">
                                    {option.icon}
                                </div>
                                <div>
                                    <h2 style={{
                                        margin: '0 0 0.5rem 0',
                                        color: 'var(--text-primary)',
                                        fontSize: '1.5rem'
                                    }}>{option.title}</h2>
                                    <p style={{ color: 'var(--text-secondary)', margin: 0 }}>{option.description}</p>
                                </div>
                            </div>
                        </Link>
                    </motion.div>
                ))}
            </div>
        </div>
    );
};

export default Brewing;
