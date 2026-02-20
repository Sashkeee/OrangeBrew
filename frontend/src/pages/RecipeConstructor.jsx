import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Clock, Calendar, Plus, X, Save, Play, Loader, AlertTriangle } from 'lucide-react';
import { recipesApi, sessionsApi } from '../api/client.js';

const RecipeConstructor = () => {
    const navigate = useNavigate();
    const [saving, setSaving] = useState(false);
    const [recipe, setRecipe] = useState({
        name: '',
        style: '',
        notes: '',
        og: 0,
        fg: 0,
        ibu: 0,
        abv: 0,
        batch_size: 20,
        boil_time: 60,
        mash_steps: [
            { id: '1', name: 'Пауза осахаривания', temp: 65, duration: 60 }
        ],
        ingredients: [],
        hop_additions: [],
    });

    const addStep = () => {
        const newStep = {
            id: Date.now().toString(),
            name: 'Новая пауза',
            temp: 65,
            duration: 15
        };
        setRecipe({ ...recipe, mash_steps: [...recipe.mash_steps, newStep] });
    };

    const removeStep = (id) => {
        if (recipe.mash_steps.length > 1) {
            setRecipe({ ...recipe, mash_steps: recipe.mash_steps.filter(s => s.id !== id) });
        }
    };

    const updateStep = (id, field, value) => {
        setRecipe({
            ...recipe,
            mash_steps: recipe.mash_steps.map(s => s.id === id ? { ...s, [field]: value } : s)
        });
    };

    /**
     * Common Validation
     */
    const validateRecipe = () => {
        if (!recipe.name.trim()) {
            alert('Введите название рецепта');
            return false;
        }

        for (let i = 0; i < recipe.mash_steps.length - 1; i++) {
            if (parseFloat(recipe.mash_steps[i].temp) >= parseFloat(recipe.mash_steps[i + 1].temp)) {
                alert(`Ошибка: Температура паузы #${i + 2} (${recipe.mash_steps[i + 1].temp}°C) должна быть выше температуры паузы #${i + 1} (${recipe.mash_steps[i].temp}°C). Паузы должны идти по возрастанию температуры.`);
                return false;
            }
        }
        return true;
    };

    /**
     * Save recipe to the backend via REST API.
     */
    const handleSave = async () => {
        if (!validateRecipe()) return;
        try {
            setSaving(true);
            const created = await recipesApi.create(recipe);
            // Also save to localStorage for the mashing page
            localStorage.setItem('currentRecipe', JSON.stringify({
                ...created,
                steps: recipe.mash_steps, // backward compat for Mashing page
            }));
            navigate('/brewing/recipes');
        } catch (e) {
            console.error('[RecipeConstructor] Save failed:', e);
            alert('Ошибка сохранения: ' + e.message);
        } finally {
            setSaving(false);
        }
    };

    /**
     * Save + navigate directly to mashing.
     */
    const handleStartBrew = async () => {
        if (!validateRecipe()) return;
        try {
            setSaving(true);
            const created = await recipesApi.create(recipe);
            // Create a brew session
            const session = await sessionsApi.create({
                recipe_id: created.id,
                type: 'brewing',
                status: 'active'
            });
            localStorage.setItem('currentRecipe', JSON.stringify({
                ...created,
                steps: recipe.mash_steps,
            }));
            navigate(`/brewing/mash/${session.id}`);
        } catch (e) {
            console.error('[RecipeConstructor] Save+start failed:', e);
            alert('Ошибка сохранения: ' + e.message);
        } finally {
            setSaving(false);
        }
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
                {/* ─── Row 1: Name + Style ───────────────── */}
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
                        <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Стиль</label>
                        <input
                            type="text"
                            value={recipe.style}
                            onChange={(e) => setRecipe({ ...recipe, style: e.target.value })}
                            style={{ width: '100%', padding: '0.8rem', background: '#000', border: '1px solid var(--border-color)', color: '#fff', borderRadius: '4px' }}
                            placeholder="Напр: American IPA"
                        />
                    </div>
                </div>

                {/* ─── Row 2: Batch + Boil time ─────────── */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem' }}>
                    <div className="form-group" style={{ flex: '1 1 200px' }}>
                        <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Объём варки (л)</label>
                        <input
                            type="number"
                            value={recipe.batch_size}
                            onChange={(e) => setRecipe({ ...recipe, batch_size: parseFloat(e.target.value) || 0 })}
                            style={{ width: '100%', padding: '0.8rem', background: '#000', border: '1px solid var(--border-color)', color: '#fff', borderRadius: '4px' }}
                        />
                    </div>
                    <div className="form-group" style={{ flex: '1 1 200px' }}>
                        <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Время кипячения (мин)</label>
                        <input
                            type="number"
                            value={recipe.boil_time}
                            onChange={(e) => setRecipe({ ...recipe, boil_time: parseInt(e.target.value) || 0 })}
                            style={{ width: '100%', padding: '0.8rem', background: '#000', border: '1px solid var(--border-color)', color: '#fff', borderRadius: '4px' }}
                        />
                    </div>
                    <div className="form-group" style={{ flex: '1 1 200px' }}>
                        <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>OG</label>
                        <input
                            type="number"
                            step="0.001"
                            value={recipe.og}
                            onChange={(e) => setRecipe({ ...recipe, og: parseFloat(e.target.value) || 0 })}
                            style={{ width: '100%', padding: '0.8rem', background: '#000', border: '1px solid var(--border-color)', color: '#fff', borderRadius: '4px' }}
                            placeholder="1.050"
                        />
                    </div>
                </div>

                {/* ─── Row 3: Notes ─────────────────────── */}
                <div className="form-group">
                    <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Заметки</label>
                    <textarea
                        value={recipe.notes}
                        onChange={(e) => setRecipe({ ...recipe, notes: e.target.value })}
                        rows={3}
                        style={{ width: '100%', padding: '0.8rem', background: '#000', border: '1px solid var(--border-color)', color: '#fff', borderRadius: '4px', resize: 'vertical' }}
                        placeholder="Дополнительные заметки к рецепту..."
                    />
                </div>

                {/* ─── Mash Steps ───────────────────────── */}
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
                        {recipe.mash_steps.map((step) => (
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

                {/* ─── Action Buttons ──────────────────── */}
                <div style={{ display: 'flex', gap: '1rem', marginTop: '2rem', flexWrap: 'wrap' }}>
                    <button
                        onClick={() => navigate('/brewing')}
                        style={{ flex: '1 1 100px', padding: '1rem', background: 'transparent', border: '1px solid #444', color: '#fff', borderRadius: '4px' }}
                    >
                        Отмена
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={saving || !recipe.name.trim()}
                        aria-label="Сохранить рецепт"
                        style={{ flex: '1 1 150px', padding: '1rem', background: 'rgba(255,152,0,0.1)', border: '1px solid var(--primary-color)', color: 'var(--primary-color)', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', opacity: saving ? 0.5 : 1 }}
                    >
                        <Save size={20} aria-hidden="true" /> {saving ? 'Сохранение...' : 'Сохранить'}
                    </button>
                    <button
                        onClick={handleStartBrew}
                        disabled={saving || !recipe.name.trim()}
                        style={{ flex: '2 1 200px', padding: '1rem', background: 'var(--primary-color)', border: 'none', color: '#000', fontWeight: 'bold', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', opacity: saving ? 0.5 : 1 }}
                    >
                        <Play size={20} aria-hidden="true" /> {saving ? 'Сохранение...' : 'Начать варку'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default RecipeConstructor;
