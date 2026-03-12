import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Save, Play, X, Plus, Loader, AlertTriangle } from 'lucide-react';
import { recipesApi, sessionsApi } from '../api/client.js';

const RecipeEditor = () => {
    const navigate = useNavigate();
    const { id } = useParams();
    const [saving, setSaving] = useState(false);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
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
        mash_steps: [],
        ingredients: [],
        hop_additions: [],
    });

    // Load recipe from API
    useEffect(() => {
        if (!id) return;
        (async () => {
            try {
                setLoading(true);
                const data = await recipesApi.getById(id);
                setRecipe(data);
                setError(null);
            } catch (e) {
                setError(e.message);
            } finally {
                setLoading(false);
            }
        })();
    }, [id]);

    const addStep = () => {
        const newStep = {
            id: Date.now().toString(),
            name: 'Новая пауза',
            temp: 65,
            duration: 15
        };
        setRecipe({ ...recipe, mash_steps: [...(recipe.mash_steps || []), newStep] });
    };

    const removeStep = (stepId) => {
        if ((recipe.mash_steps || []).length > 1) {
            setRecipe({ ...recipe, mash_steps: recipe.mash_steps.filter(s => s.id !== stepId) });
        }
    };

    const updateStep = (stepId, field, value) => {
        setRecipe({
            ...recipe,
            mash_steps: recipe.mash_steps.map(s => s.id === stepId ? { ...s, [field]: value } : s)
        });
    };

    // ── Ingredients ──
    const addIngredient = () => {
        setRecipe({
            ...recipe,
            ingredients: [...(recipe.ingredients || []), { name: '', amount: 0, unit: 'kg' }]
        });
    };

    const removeIngredient = (index) => {
        setRecipe({ ...recipe, ingredients: recipe.ingredients.filter((_, i) => i !== index) });
    };

    const updateIngredient = (index, field, value) => {
        setRecipe({
            ...recipe,
            ingredients: recipe.ingredients.map((ing, i) => i === index ? { ...ing, [field]: value } : ing)
        });
    };

    // ── Hop additions ──
    const addHop = () => {
        setRecipe({
            ...recipe,
            hop_additions: [...(recipe.hop_additions || []), { name: '', amount: 0, time: 60 }]
        });
    };

    const removeHop = (index) => {
        setRecipe({ ...recipe, hop_additions: recipe.hop_additions.filter((_, i) => i !== index) });
    };

    const updateHop = (index, field, value) => {
        setRecipe({
            ...recipe,
            hop_additions: recipe.hop_additions.map((hop, i) => i === index ? { ...hop, [field]: value } : hop)
        });
    };

    const handleSave = async () => {
        if (!recipe.name.trim()) return;
        try {
            setSaving(true);
            const updated = await recipesApi.update(id, recipe);
            navigate('/brewing/recipes');
        } catch (e) {
            console.error('[RecipeEditor] Save failed:', e);
            alert('Ошибка сохранения: ' + e.message);
        } finally {
            setSaving(false);
        }
    };

    const handleStartBrew = async () => {
        if (!recipe.name.trim()) {
            alert('Введите название рецепта');
            return;
        }
        try {
            setSaving(true);
            const updated = await recipesApi.update(id, recipe);
            // Create a brew session
            const session = await sessionsApi.create({
                recipe_id: updated.id,
                type: 'brewing',
                status: 'active'
            });
            navigate(`/brewing/mash/${session.id}`);
        } catch (e) {
            alert('Ошибка сохранения: ' + e.message);
        } finally {
            setSaving(false);
        }
    };

    const inputStyle = {
        width: '100%', padding: '0.8rem', background: '#000',
        border: '1px solid var(--border-color)', color: '#fff', borderRadius: '4px',
    };

    const inlineInputStyle = {
        background: 'transparent', border: 'none', borderBottom: '1px solid #444',
        color: '#fff', padding: '0.3rem',
    };

    if (loading) {
        return (
            <div style={{ padding: '2rem', display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh', color: 'var(--text-secondary)' }}>
                <Loader size={32} className="spin" />
                <span style={{ marginLeft: '1rem' }}>Загрузка рецепта...</span>
            </div>
        );
    }

    if (error) {
        return (
            <div style={{ padding: '2rem 1rem', maxWidth: '800px', margin: '0 auto' }}>
                <div className="industrial-panel" style={{ padding: '2rem', display: 'flex', alignItems: 'center', gap: '1rem', color: 'var(--accent-red)' }}>
                    <AlertTriangle size={32} />
                    <div>
                        <h3 style={{ margin: 0 }}>Ошибка загрузки</h3>
                        <p style={{ margin: '0.5rem 0 0', opacity: 0.8 }}>{error}</p>
                    </div>
                </div>
                <button onClick={() => navigate('/brewing/recipes')} style={{ marginTop: '1rem', padding: '0.5rem 1rem', background: 'none', border: '1px solid #444', color: '#fff', borderRadius: '4px' }}>
                    ← Назад к рецептам
                </button>
            </div>
        );
    }

    return (
        <div style={{ padding: '2rem 1rem', maxWidth: '800px', margin: '0 auto' }}>
            <header style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '2rem' }}>
                <button
                    onClick={() => navigate('/brewing/recipes')}
                    aria-label="Назад к рецептам"
                    style={{ background: 'none', border: '1px solid var(--border-color)', color: 'var(--text-primary)', padding: '0.5rem', borderRadius: '4px' }}
                >
                    <ArrowLeft size={20} aria-hidden="true" />
                </button>
                <h1 style={{ margin: 0, fontSize: '1.8rem', color: 'var(--primary-color)' }}>
                    Редактирование рецепта
                </h1>
            </header>

            <div className="industrial-panel" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                {/* ─── Row 1: Name + Style ───────────────── */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem' }}>
                    <div className="form-group" style={{ flex: '1 1 300px' }}>
                        <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Название рецепта *</label>
                        <input type="text" value={recipe.name} onChange={(e) => setRecipe({ ...recipe, name: e.target.value })}
                            style={inputStyle} placeholder="Напр: Жигулевское" aria-required="true" />
                    </div>
                    <div className="form-group" style={{ flex: '1 1 300px' }}>
                        <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Стиль</label>
                        <input type="text" value={recipe.style} onChange={(e) => setRecipe({ ...recipe, style: e.target.value })}
                            style={inputStyle} placeholder="Напр: American IPA" />
                    </div>
                </div>

                {/* ─── Row 2: Numbers ────────────────────── */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem' }}>
                    <div className="form-group" style={{ flex: '1 1 120px' }}>
                        <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Объём (л)</label>
                        <input type="number" value={recipe.batch_size} onChange={(e) => setRecipe({ ...recipe, batch_size: parseFloat(e.target.value) || 0 })} style={inputStyle} />
                    </div>
                    <div className="form-group" style={{ flex: '1 1 120px' }}>
                        <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Кипячение (мин)</label>
                        <input type="number" value={recipe.boil_time} onChange={(e) => setRecipe({ ...recipe, boil_time: parseInt(e.target.value) || 0 })} style={inputStyle} />
                    </div>
                    <div className="form-group" style={{ flex: '1 1 100px' }}>
                        <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>OG</label>
                        <input type="number" step="0.001" value={recipe.og} onChange={(e) => setRecipe({ ...recipe, og: parseFloat(e.target.value) || 0 })} style={inputStyle} />
                    </div>
                    <div className="form-group" style={{ flex: '1 1 100px' }}>
                        <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>FG</label>
                        <input type="number" step="0.001" value={recipe.fg} onChange={(e) => setRecipe({ ...recipe, fg: parseFloat(e.target.value) || 0 })} style={inputStyle} />
                    </div>
                    <div className="form-group" style={{ flex: '1 1 80px' }}>
                        <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>IBU</label>
                        <input type="number" value={recipe.ibu} onChange={(e) => setRecipe({ ...recipe, ibu: parseFloat(e.target.value) || 0 })} style={inputStyle} />
                    </div>
                </div>

                {/* ─── Notes ─────────────────────────────── */}
                <div className="form-group">
                    <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Заметки</label>
                    <textarea value={recipe.notes || ''} onChange={(e) => setRecipe({ ...recipe, notes: e.target.value })}
                        rows={3} style={{ ...inputStyle, resize: 'vertical' }} placeholder="Заметки к рецепту..." />
                </div>

                {/* ─── Mash Steps ─────────────────────────── */}
                <div style={{ marginTop: '0.5rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '1rem' }}>
                        <h3 style={{ margin: 0, color: '#ff9800' }}>🌡 Температурные паузы</h3>
                        <button onClick={addStep} aria-label="Добавить паузу"
                            style={{ background: 'rgba(255,152,0,0.1)', border: '1px dashed var(--primary-color)', color: 'var(--primary-color)', padding: '0.4rem 1rem', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <Plus size={16} aria-hidden="true" /> Добавить
                        </button>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                        {(recipe.mash_steps || []).map((step) => (
                            <div key={step.id} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 40px', gap: '0.8rem', alignItems: 'center', background: 'rgba(255,255,255,0.03)', padding: '0.8rem', borderRadius: '4px', border: '1px solid #333' }}>
                                <input type="text" value={step.name} onChange={(e) => updateStep(step.id, 'name', e.target.value)}
                                    aria-label="Название паузы" style={inlineInputStyle} placeholder="Название" />
                                <div style={{ position: 'relative' }}>
                                    <input type="number" value={step.temp} onChange={(e) => updateStep(step.id, 'temp', parseInt(e.target.value))}
                                        aria-label="Температура" style={{ ...inlineInputStyle, width: '100%' }} />
                                    <span style={{ position: 'absolute', right: 0, color: '#666', fontSize: '0.8rem' }}>°C</span>
                                </div>
                                <div style={{ position: 'relative' }}>
                                    <input type="number" value={step.duration} onChange={(e) => updateStep(step.id, 'duration', parseInt(e.target.value))}
                                        aria-label="Длительность" style={{ ...inlineInputStyle, width: '100%' }} />
                                    <span style={{ position: 'absolute', right: 0, color: '#666', fontSize: '0.8rem' }}>мин</span>
                                </div>
                                <button onClick={() => removeStep(step.id)} aria-label="Удалить" style={{ background: 'none', border: 'none', color: '#f44336', cursor: 'pointer' }}>
                                    <X size={18} />
                                </button>
                            </div>
                        ))}
                    </div>
                </div>

                {/* ─── Ingredients ────────────────────────── */}
                <div style={{ marginTop: '0.5rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                        <h3 style={{ margin: 0, color: '#4caf50' }}>🌾 Ингредиенты</h3>
                        <button onClick={addIngredient} style={{ background: 'rgba(76,175,80,0.1)', border: '1px dashed #4caf50', color: '#4caf50', padding: '0.4rem 1rem', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem' }}>
                            <Plus size={16} /> Добавить
                        </button>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        {(recipe.ingredients || []).map((ing, i) => (
                            <div key={i} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 80px 40px', gap: '0.8rem', alignItems: 'center', background: 'rgba(255,255,255,0.03)', padding: '0.6rem 0.8rem', borderRadius: '4px', border: '1px solid #333' }}>
                                <input type="text" value={ing.name} onChange={(e) => updateIngredient(i, 'name', e.target.value)}
                                    placeholder="Название" style={inlineInputStyle} />
                                <input type="number" step="0.1" value={ing.amount} onChange={(e) => updateIngredient(i, 'amount', parseFloat(e.target.value) || 0)}
                                    placeholder="Кол-во" style={{ ...inlineInputStyle, textAlign: 'center' }} />
                                <select value={ing.unit || 'kg'} onChange={(e) => updateIngredient(i, 'unit', e.target.value)}
                                    style={{ ...inlineInputStyle, background: 'transparent', color: '#aaa', cursor: 'pointer' }}>
                                    <option value="kg">кг</option>
                                    <option value="g">г</option>
                                    <option value="l">л</option>
                                    <option value="ml">мл</option>
                                    <option value="pcs">шт</option>
                                </select>
                                <button onClick={() => removeIngredient(i)} style={{ background: 'none', border: 'none', color: '#f44336', cursor: 'pointer' }}>
                                    <X size={18} />
                                </button>
                            </div>
                        ))}
                    </div>
                </div>

                {/* ─── Hop Additions ──────────────────────── */}
                <div style={{ marginTop: '0.5rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                        <h3 style={{ margin: 0, color: '#03a9f4' }}>🌿 Хмель</h3>
                        <button onClick={addHop} style={{ background: 'rgba(3,169,244,0.1)', border: '1px dashed #03a9f4', color: '#03a9f4', padding: '0.4rem 1rem', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem' }}>
                            <Plus size={16} /> Добавить
                        </button>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        {(recipe.hop_additions || []).map((hop, i) => (
                            <div key={i} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 40px', gap: '0.8rem', alignItems: 'center', background: 'rgba(255,255,255,0.03)', padding: '0.6rem 0.8rem', borderRadius: '4px', border: '1px solid #333' }}>
                                <input type="text" value={hop.name} onChange={(e) => updateHop(i, 'name', e.target.value)}
                                    placeholder="Сорт хмеля" style={inlineInputStyle} />
                                <div style={{ position: 'relative' }}>
                                    <input type="number" value={hop.amount} onChange={(e) => updateHop(i, 'amount', parseFloat(e.target.value) || 0)}
                                        style={{ ...inlineInputStyle, width: '100%' }} />
                                    <span style={{ position: 'absolute', right: 0, color: '#666', fontSize: '0.75rem' }}>г</span>
                                </div>
                                <div style={{ position: 'relative' }}>
                                    <input type="number" value={hop.time} onChange={(e) => updateHop(i, 'time', parseInt(e.target.value) || 0)}
                                        style={{ ...inlineInputStyle, width: '100%' }} />
                                    <span style={{ position: 'absolute', right: 0, color: '#666', fontSize: '0.75rem' }}>мин</span>
                                </div>
                                <button onClick={() => removeHop(i)} style={{ background: 'none', border: 'none', color: '#f44336', cursor: 'pointer' }}>
                                    <X size={18} />
                                </button>
                            </div>
                        ))}
                    </div>
                </div>

                {/* ─── Actions ────────────────────────────── */}
                <div style={{ display: 'flex', gap: '1rem', marginTop: '2rem', flexWrap: 'wrap' }}>
                    <button onClick={() => navigate('/brewing/recipes')}
                        style={{ flex: '1 1 100px', padding: '1rem', background: 'transparent', border: '1px solid #444', color: '#fff', borderRadius: '4px' }}>
                        Отмена
                    </button>
                    <button onClick={handleSave} disabled={saving || !recipe.name?.trim()} aria-label="Сохранить рецепт"
                        style={{ flex: '1 1 150px', padding: '1rem', background: 'rgba(255,152,0,0.1)', border: '1px solid var(--primary-color)', color: 'var(--primary-color)', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', opacity: saving ? 0.5 : 1 }}>
                        <Save size={20} /> {saving ? 'Сохранение...' : 'Сохранить'}
                    </button>
                    <button onClick={handleStartBrew} disabled={saving || !recipe.name?.trim()}
                        style={{ flex: '2 1 200px', padding: '1rem', background: 'var(--primary-color)', border: 'none', color: '#000', fontWeight: 'bold', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', opacity: saving ? 0.5 : 1 }}>
                        <Play size={20} /> {saving ? 'Сохранение...' : 'Начать варку'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default RecipeEditor;
