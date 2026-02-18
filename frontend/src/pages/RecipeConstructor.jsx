import React, { useState } from 'react';
import { motion, Reorder } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Save, Play, X, Plus, GripVertical } from 'lucide-react';

const RecipeConstructor = () => {
    const navigate = useNavigate();
    const [recipe, setRecipe] = useState({
        name: '',
        brewer: '',
        date: new Date().toISOString().split('T')[0],
        location: '',
        notes: '',
        steps: [
            { id: '1', name: 'Пауза осахаривания', temp: 65, duration: 60 }
        ]
    });

    const addStep = () => {
        const newStep = {
            id: Date.now().toString(),
            name: 'Новая пауза',
            temp: 65,
            duration: 15
        };
        setRecipe({ ...recipe, steps: [...recipe.steps, newStep] });
    };

    const removeStep = (id) => {
        if (recipe.steps.length > 1) {
            setRecipe({ ...recipe, steps: recipe.steps.filter(s => s.id !== id) });
        }
    };

    const updateStep = (id, field, value) => {
        setRecipe({
            ...recipe,
            steps: recipe.steps.map(s => s.id === id ? { ...s, [field]: value } : s)
        });
    };

    return (
        <div style={{ padding: '2rem 1rem', maxWidth: '800px', margin: '0 auto' }}>
            <header style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '2rem' }}>
                <button
                    onClick={() => navigate('/brewing')}
                    aria-label="Назад к пивоварению"
                    style={{ background: 'none', border: '1px solid var(--border-color)', color: 'var(--text-primary)', padding: '0.5rem', borderRadius: '4px' }}
                >
                    <ArrowLeft size={20} aria-hidden="true" />
                </button>
                <h1 style={{ margin: 0, fontSize: '1.8rem', color: 'var(--primary-color)' }}>Конструктор рецепта</h1>
            </header>

            <div className="industrial-panel" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem' }}>
                    <div className="form-group" style={{ flex: '1 1 300px' }}>
                        <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Название рецепта *</label>
                        <input
                            type="text"
                            value={recipe.name}
                            onChange={(e) => setRecipe({ ...recipe, name: e.target.value })}
                            style={{ width: '100%', padding: '0.8rem', background: '#000', border: '1px solid var(--border-color)', color: '#fff', borderRadius: '4px' }}
                            placeholder="Напр: Жигулевское"
                            aria-required="true"
                        />
                    </div>
                    <div className="form-group" style={{ flex: '1 1 300px' }}>
                        <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Пивовар *</label>
                        <input
                            type="text"
                            value={recipe.brewer}
                            onChange={(e) => setRecipe({ ...recipe, brewer: e.target.value })}
                            style={{ width: '100%', padding: '0.8rem', background: '#000', border: '1px solid var(--border-color)', color: '#fff', borderRadius: '4px' }}
                            aria-required="true"
                        />
                    </div>
                </div>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem' }}>
                    <div className="form-group" style={{ flex: '1 1 300px' }}>
                        <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Дата варки</label>
                        <input
                            type="date"
                            value={recipe.date}
                            onChange={(e) => setRecipe({ ...recipe, date: e.target.value })}
                            style={{ width: '100%', padding: '0.8rem', background: '#000', border: '1px solid var(--border-color)', color: '#fff', borderRadius: '4px' }}
                        />
                    </div>
                    <div className="form-group" style={{ flex: '1 1 300px' }}>
                        <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Место варки</label>
                        <input
                            type="text"
                            value={recipe.location}
                            onChange={(e) => setRecipe({ ...recipe, location: e.target.value })}
                            style={{ width: '100%', padding: '0.8rem', background: '#000', border: '1px solid var(--border-color)', color: '#fff', borderRadius: '4px' }}
                        />
                    </div>
                </div>

                <div style={{ marginTop: '1rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '1rem' }}>
                        <h3 style={{ margin: 0 }}>Температурные паузы</h3>
                        <button
                            onClick={addStep}
                            aria-label="Добавить температурную паузу"
                            style={{ background: 'rgba(255,152,0,0.1)', border: '1px dashed var(--primary-color)', color: 'var(--primary-color)', padding: '0.4rem 1rem', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                        >
                            <Plus size={16} aria-hidden="true" /> Добавить паузу
                        </button>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                        {recipe.steps.map((step, index) => (
                            <div key={step.id} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr)) 40px', gap: '0.8rem', alignItems: 'center', background: 'rgba(255,255,255,0.03)', padding: '0.8rem', borderRadius: '4px', border: '1px solid #333' }}>
                                <input
                                    type="text"
                                    value={step.name}
                                    onChange={(e) => updateStep(step.id, 'name', e.target.value)}
                                    placeholder="Название паузы"
                                    aria-label="Название паузы"
                                    style={{ background: 'transparent', border: 'none', borderBottom: '1px solid #444', color: '#fff', padding: '0.3rem' }}
                                />
                                <div style={{ position: 'relative' }}>
                                    <input
                                        type="number"
                                        value={step.temp}
                                        onChange={(e) => updateStep(step.id, 'temp', parseInt(e.target.value))}
                                        aria-label="Температура"
                                        style={{ background: 'transparent', border: 'none', borderBottom: '1px solid #444', color: '#fff', padding: '0.3rem', width: '100%' }}
                                    />
                                    <span style={{ position: 'absolute', right: 0, color: '#666', fontSize: '0.8rem' }}>°C</span>
                                </div>
                                <div style={{ position: 'relative' }}>
                                    <input
                                        type="number"
                                        value={step.duration}
                                        onChange={(e) => updateStep(step.id, 'duration', parseInt(e.target.value))}
                                        aria-label="Длительность"
                                        style={{ background: 'transparent', border: 'none', borderBottom: '1px solid #444', color: '#fff', padding: '0.3rem', width: '100%' }}
                                    />
                                    <span style={{ position: 'absolute', right: 0, color: '#666', fontSize: '0.8rem' }}>мин</span>
                                </div>
                                <button
                                    onClick={() => removeStep(step.id)}
                                    aria-label="Удалить паузу"
                                    style={{ background: 'none', border: 'none', color: '#f44336', cursor: 'pointer', display: 'flex', justifyContent: 'center' }}
                                >
                                    <X size={20} aria-hidden="true" />
                                </button>
                            </div>
                        ))}
                    </div>
                </div>

                <div style={{ display: 'flex', gap: '1rem', marginTop: '2rem', flexWrap: 'wrap' }}>
                    <button
                        onClick={() => navigate('/brewing')}
                        style={{ flex: '1 1 100px', padding: '1rem', background: 'transparent', border: '1px solid #444', color: '#fff', borderRadius: '4px' }}
                    >
                        Отмена
                    </button>
                    <button
                        aria-label="Сохранить рецепт"
                        style={{ flex: '1 1 150px', padding: '1rem', background: 'rgba(255,152,0,0.1)', border: '1px solid var(--primary-color)', color: 'var(--primary-color)', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}
                    >
                        <Save size={20} aria-hidden="true" /> Сохранить
                    </button>
                    <button
                        onClick={() => navigate('/brewing/mash/new')}
                        style={{ flex: '2 1 200px', padding: '1rem', background: 'var(--primary-color)', border: 'none', color: '#000', fontWeight: 'bold', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}
                    >
                        <Play size={20} aria-hidden="true" /> Начать варку
                    </button>
                </div>
            </div>
        </div>
    );
};

export default RecipeConstructor;
