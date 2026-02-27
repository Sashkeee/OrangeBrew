import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Clock, Calendar, Plus, X, Save, Play, Loader, AlertTriangle, Trash2, Beaker, Thermometer } from 'lucide-react';
import { recipesApi, sessionsApi } from '../api/client.js';
import { DEFAULT_HOPS, DEFAULT_MALTS, DEFAULT_YEASTS, getIngredientsFromStorage } from '../utils/ingredients';

const RecipeConstructor = () => {
    const navigate = useNavigate();
    const [saving, setSaving] = useState(false);

    // Load ingredients from Dictionary for dropdowns
    const [dictionary, setDictionary] = useState({ malt: [], hop: [], yeast: [] });

    useEffect(() => {
        const custom = getIngredientsFromStorage();
        setDictionary({
            malt: [...DEFAULT_MALTS, ...custom.malt],
            hop: [...DEFAULT_HOPS, ...custom.hop],
            yeast: [...DEFAULT_YEASTS, ...custom.yeast]
        });
    }, []);

    const [recipe, setRecipe] = useState({
        name: '',
        style: '',
        notes: '',
        og: 0,
        fg: 0,
        ibu: 0,
        abv: 0,
        batch_size: 40,
        boil_time: 60,
        mash_steps: [
            { id: '1', name: 'Пауза осахаривания', temp: 62, duration: 60 }
        ],
        ingredients: [],
        hop_additions: [],
    });

    const addStep = () => {
        const newStep = {
            id: Date.now().toString(),
            name: 'Новая пауза',
            temp: 72,
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

    const addIngredient = () => {
        setRecipe({
            ...recipe,
            ingredients: [...recipe.ingredients, { id: Date.now().toString(), name: '', amount: '', unit: 'кг', type: 'Солод' }]
        });
    };

    const removeIngredient = (id) => setRecipe({ ...recipe, ingredients: recipe.ingredients.filter(i => i.id !== id) });

    const updateIngredient = (id, field, value) => {
        setRecipe({
            ...recipe,
            ingredients: recipe.ingredients.map(i => {
                if (i.id === id) {
                    const updated = { ...i, [field]: value };

                    // Auto-update unit and placeholder for Water
                    if (field === 'type' && value === 'Вода') {
                        updated.unit = 'л';
                        if (!updated.name) updated.name = 'Покупная/родниковая';
                    } else if (field === 'type' && value !== 'Вода' && i.unit === 'л') {
                        updated.unit = 'кг';
                    }

                    return updated;
                }
                return i;
            })
        });
    };

    const addHop = () => {
        setRecipe({
            ...recipe,
            hop_additions: [...recipe.hop_additions, { id: Date.now().toString(), name: '', amount: 10, time: 10 }]
        });
    };
    const removeHop = (id) => setRecipe({ ...recipe, hop_additions: recipe.hop_additions.filter(i => i.id !== id) });
    const updateHop = (id, field, value) => {
        setRecipe({ ...recipe, hop_additions: recipe.hop_additions.map(i => i.id === id ? { ...i, [field]: value } : i) });
    };

    const validateRecipe = () => {
        if (!recipe.name.trim()) {
            alert('Введите название рецепта');
            return false;
        }

        for (let i = 0; i < recipe.mash_steps.length - 1; i++) {
            if (parseFloat(recipe.mash_steps[i].temp) >= parseFloat(recipe.mash_steps[i + 1].temp)) {
                alert(`Ошибка: Температура паузы #${i + 2} (${recipe.mash_steps[i + 1].temp}°C) должна быть выше температуры паузы #${i + 1} (${recipe.mash_steps[i].temp}°C).`);
                return false;
            }
        }
        return true;
    };

    const handleSave = async () => {
        if (!validateRecipe()) return;
        try {
            setSaving(true);
            const created = await recipesApi.create(recipe);
            localStorage.setItem('currentRecipe', JSON.stringify({
                ...created,
                steps: recipe.mash_steps,
            }));
            navigate('/brewing/recipes');
        } catch (e) {
            console.error('[RecipeConstructor] Save failed:', e);
            alert('Ошибка сохранения: ' + e.message);
        } finally {
            setSaving(false);
        }
    };

    const handleStartBrew = async () => {
        if (!validateRecipe()) return;
        try {
            setSaving(true);
            const created = await recipesApi.create(recipe);
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

    const ingredientTypes = ['Солод', 'Хмель', 'Дрожжи', 'Вода', 'Добавка'];

    return (
        <div style={{ padding: '2rem 1rem', maxWidth: '900px', margin: '0 auto', color: '#fff' }}>
            <header style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '2rem' }}>
                <button
                    onClick={() => navigate('/brewing')}
                    style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid #333', color: '#fff', padding: '0.6rem', borderRadius: '8px', cursor: 'pointer' }}
                >
                    <ArrowLeft size={20} />
                </button>
                <h1 style={{ margin: 0, fontSize: '2rem', fontWeight: '800', background: 'linear-gradient(90deg, #ff9800, #ff5722)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                    Конструктор Рецепта
                </h1>
            </header>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>

                {/* ─── Layout Section: Basic Info ───────────────── */}
                <section className="industrial-panel" style={{ padding: '2rem', background: '#111', borderRadius: '12px', border: '1px solid #222' }}>
                    <h3 style={{ marginTop: 0, marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#ff9800' }}>
                        <Beaker size={20} /> Основная информация
                    </h3>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.5rem' }}>
                        <div className="form-group">
                            <label style={{ display: 'block', marginBottom: '0.5rem', color: '#888', fontSize: '0.9rem' }}>Название рецепта *</label>
                            <input
                                type="text"
                                value={recipe.name}
                                onChange={(e) => setRecipe({ ...recipe, name: e.target.value })}
                                style={{ width: '100%', padding: '1rem', background: '#000', border: '1px solid #333', color: '#fff', borderRadius: '8px', outline: 'none' }}
                                placeholder="Напр: Жигулевское"
                            />
                        </div>
                        <div className="form-group">
                            <label style={{ display: 'block', marginBottom: '0.5rem', color: '#888', fontSize: '0.9rem' }}>Стиль</label>
                            <input
                                type="text"
                                value={recipe.style}
                                onChange={(e) => setRecipe({ ...recipe, style: e.target.value })}
                                style={{ width: '100%', padding: '1rem', background: '#000', border: '1px solid #333', color: '#fff', borderRadius: '8px', outline: 'none' }}
                                placeholder="Напр: American IPA"
                            />
                        </div>
                        <div className="form-group">
                            <label style={{ display: 'block', marginBottom: '0.5rem', color: '#888', fontSize: '0.9rem' }}>Объём варки (л)</label>
                            <input
                                type="number"
                                value={recipe.batch_size}
                                onChange={(e) => setRecipe({ ...recipe, batch_size: parseFloat(e.target.value) || 0 })}
                                style={{ width: '100%', padding: '1rem', background: '#000', border: '1px solid #333', color: '#fff', borderRadius: '8px', outline: 'none' }}
                            />
                        </div>
                        <div className="form-group">
                            <label style={{ display: 'block', marginBottom: '0.5rem', color: '#888', fontSize: '0.9rem' }}>Время кипячения (мин)</label>
                            <input
                                type="number"
                                value={recipe.boil_time}
                                onChange={(e) => setRecipe({ ...recipe, boil_time: parseInt(e.target.value) || 0 })}
                                style={{ width: '100%', padding: '1rem', background: '#000', border: '1px solid #333', color: '#fff', borderRadius: '8px', outline: 'none' }}
                            />
                        </div>
                    </div>

                    <div style={{ marginTop: '1.5rem' }}>
                        <label style={{ display: 'block', marginBottom: '0.5rem', color: '#888', fontSize: '0.9rem' }}>Заметки</label>
                        <textarea
                            value={recipe.notes}
                            onChange={(e) => setRecipe({ ...recipe, notes: e.target.value })}
                            rows={2}
                            style={{ width: '100%', padding: '1rem', background: '#000', border: '1px solid #333', color: '#fff', borderRadius: '8px', outline: 'none', resize: 'vertical' }}
                            placeholder="Дополнительные заметки к рецепту..."
                        />
                    </div>
                </section>

                {/* ─── Layout Section: Mash Steps ───────────────── */}
                <section className="industrial-panel" style={{ padding: '2rem', background: '#111', borderRadius: '12px', border: '1px solid #222' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                        <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#2196f3' }}>
                            <Thermometer size={20} /> Температурные паузы
                        </h3>
                        <button
                            onClick={addStep}
                            style={{ background: 'rgba(33, 150, 243, 0.1)', border: '1px solid #2196f3', color: '#2196f3', padding: '0.6rem 1.2rem', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontWeight: '600' }}
                        >
                            <Plus size={18} /> Добавить паузу
                        </button>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        {recipe.mash_steps.map((step, idx) => (
                            <div key={step.id} style={{ display: 'grid', gridTemplateColumns: 'minmax(150px, 2fr) 120px 120px 48px', gap: '1rem', alignItems: 'center', background: '#000', padding: '1rem', borderRadius: '10px', border: '1px solid #222' }}>
                                <input
                                    type="text"
                                    value={step.name}
                                    onChange={(e) => updateStep(step.id, 'name', e.target.value)}
                                    placeholder="Название паузы"
                                    style={{ background: 'transparent', border: 'none', borderBottom: '1px solid #333', color: '#fff', padding: '0.5rem' }}
                                />
                                <div style={{ position: 'relative' }}>
                                    <input
                                        type="number"
                                        value={step.temp}
                                        onChange={(e) => updateStep(step.id, 'temp', parseInt(e.target.value))}
                                        style={{ background: 'transparent', border: 'none', borderBottom: '1px solid #333', color: '#fff', padding: '0.5rem', width: '100%' }}
                                    />
                                    <span style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', color: '#555', fontSize: '0.8rem' }}>°C</span>
                                </div>
                                <div style={{ position: 'relative' }}>
                                    <input
                                        type="number"
                                        value={step.duration}
                                        onChange={(e) => updateStep(step.id, 'duration', parseInt(e.target.value))}
                                        style={{ background: 'transparent', border: 'none', borderBottom: '1px solid #333', color: '#fff', padding: '0.5rem', width: '100%' }}
                                    />
                                    <span style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', color: '#555', fontSize: '0.8rem' }}>мин</span>
                                </div>
                                <button
                                    onClick={() => removeStep(step.id)}
                                    disabled={recipe.mash_steps.length === 1}
                                    style={{ background: 'rgba(244, 67, 54, 0.1)', border: 'none', color: '#f44336', padding: '0.6rem', borderRadius: '8px', cursor: 'pointer', display: 'flex', justifyContent: 'center', opacity: recipe.mash_steps.length === 1 ? 0.3 : 1 }}
                                >
                                    <Trash2 size={18} />
                                </button>
                            </div>
                        ))}
                    </div>
                </section>

                {/* ─── Layout Section: Ingredients ───────────────── */}
                <section className="industrial-panel" style={{ padding: '2rem', background: '#111', borderRadius: '12px', border: '1px solid #222' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                        <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#4caf50' }}>
                            <Plus size={20} /> Ингредиенты
                        </h3>
                        <button
                            onClick={addIngredient}
                            style={{ background: 'rgba(76, 175, 80, 0.1)', border: '1px solid #4caf50', color: '#4caf50', padding: '0.6rem 1.2rem', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontWeight: '600' }}
                        >
                            <Plus size={18} /> Добавить
                        </button>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        {recipe.ingredients.length === 0 && (
                            <div style={{ textAlign: 'center', padding: '2rem', border: '1px dashed #333', borderRadius: '10px', color: '#555' }}>
                                Ингредиенты не добавлены
                            </div>
                        )}
                        {recipe.ingredients.map((ing) => (
                            <div key={ing.id} style={{ display: 'grid', gridTemplateColumns: '140px minmax(200px, 1fr) 100px 80px 48px', gap: '1rem', alignItems: 'center', background: '#000', padding: '1rem', borderRadius: '10px', border: '1px solid #222' }}>
                                <select
                                    value={ing.type}
                                    onChange={(e) => updateIngredient(ing.id, 'type', e.target.value)}
                                    style={{ background: '#111', border: '1px solid #333', color: '#fff', padding: '0.6rem', borderRadius: '6px', outline: 'none' }}
                                >
                                    {ingredientTypes.map(t => <option key={t} value={t}>{t}</option>)}
                                </select>

                                {['Солод', 'Хмель', 'Дрожжи'].includes(ing.type) ? (
                                    <select
                                        value={ing.name}
                                        onChange={(e) => updateIngredient(ing.id, 'name', e.target.value)}
                                        style={{ background: '#111', border: '1px solid #333', color: '#fff', padding: '0.6rem', borderRadius: '6px', outline: 'none' }}
                                    >
                                        <option value="">Выберите...</option>
                                        {ing.type === 'Солод' && dictionary.malt.map(m => <option key={m.id} value={m.name}>{m.name}</option>)}
                                        {ing.type === 'Хмель' && dictionary.hop.map(h => <option key={h.id} value={h.name}>{h.name}</option>)}
                                        {ing.type === 'Дрожжи' && dictionary.yeast.map(y => <option key={y.id} value={y.name}>{y.name}</option>)}
                                    </select>
                                ) : (
                                    <input
                                        type="text"
                                        value={ing.name}
                                        onChange={(e) => updateIngredient(ing.id, 'name', e.target.value)}
                                        placeholder={ing.type === 'Вода' ? 'Покупная/родниковая' : 'Название'}
                                        style={{ background: 'transparent', border: 'none', borderBottom: '1px solid #333', color: '#fff', padding: '0.6rem' }}
                                    />
                                )}

                                <input
                                    type="number"
                                    value={ing.amount}
                                    onChange={(e) => updateIngredient(ing.id, 'amount', parseFloat(e.target.value) || '')}
                                    placeholder="Кол-во"
                                    style={{ background: 'transparent', border: 'none', borderBottom: '1px solid #333', color: '#fff', padding: '0.6rem', width: '100%' }}
                                />
                                <input
                                    type="text"
                                    value={ing.unit}
                                    onChange={(e) => updateIngredient(ing.id, 'unit', e.target.value)}
                                    style={{ background: 'transparent', border: 'none', borderBottom: '1px solid #333', color: '#fff', padding: '0.6rem', width: '100%', textAlign: 'center' }}
                                />
                                <button
                                    onClick={() => removeIngredient(ing.id)}
                                    style={{ background: 'none', border: 'none', color: '#f44336', padding: '0.6rem', cursor: 'pointer', display: 'flex', justifyContent: 'center' }}
                                >
                                    <Trash2 size={18} />
                                </button>
                            </div>
                        ))}
                    </div>
                </section>

                {/* ─── Layout Section: Hops (Boil) ───────────────── */}
                <section className="industrial-panel" style={{ padding: '2rem', background: '#111', borderRadius: '12px', border: '1px solid #222' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                        <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#9c27b0' }}>
                            <Clock size={20} /> Внесение хмеля на варке
                        </h3>
                        <button
                            onClick={addHop}
                            style={{ background: 'rgba(156, 39, 176, 0.1)', border: '1px solid #9c27b0', color: '#e040fb', padding: '0.6rem 1.2rem', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontWeight: '600' }}
                        >
                            <Plus size={18} /> Внести хмель
                        </button>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        {recipe.hop_additions.length === 0 && (
                            <div style={{ textAlign: 'center', padding: '2rem', border: '1px dashed #333', borderRadius: '10px', color: '#555' }}>
                                График внесения хмеля пуст
                            </div>
                        )}
                        {recipe.hop_additions.map((hop) => (
                            <div key={hop.id} style={{ display: 'grid', gridTemplateColumns: 'minmax(200px, 1fr) 120px 150px 48px', gap: '1rem', alignItems: 'center', background: '#000', padding: '1rem', borderRadius: '10px', border: '1px solid #222' }}>
                                <select
                                    value={hop.name}
                                    onChange={(e) => updateHop(hop.id, 'name', e.target.value)}
                                    style={{ background: '#111', border: '1px solid #333', color: '#fff', padding: '0.6rem', borderRadius: '6px', outline: 'none' }}
                                >
                                    <option value="">Выберите сорт...</option>
                                    {dictionary.hop.map(h => <option key={h.id} value={h.name}>{h.name}</option>)}
                                    <option value="Custom">Другой...</option>
                                </select>

                                <div style={{ position: 'relative' }}>
                                    <input
                                        type="number"
                                        value={hop.amount}
                                        onChange={(e) => updateHop(hop.id, 'amount', parseFloat(e.target.value) || 0)}
                                        style={{ background: 'transparent', border: 'none', borderBottom: '1px solid #333', color: '#fff', padding: '0.6rem', width: '100%' }}
                                    />
                                    <span style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', color: '#555', fontSize: '0.8rem' }}>г.</span>
                                </div>
                                <div style={{ position: 'relative' }}>
                                    <input
                                        type="number"
                                        value={hop.time}
                                        onChange={(e) => updateHop(hop.id, 'time', parseInt(e.target.value) || 0)}
                                        style={{ background: 'transparent', border: 'none', borderBottom: '1px solid #333', color: '#fff', padding: '0.6rem', width: '100%' }}
                                    />
                                    <span style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', color: '#555', fontSize: '0.7rem', textAlign: 'right', lineHeight: '1.1' }}>мин до конца</span>
                                </div>
                                <button
                                    onClick={() => removeHop(hop.id)}
                                    style={{ background: 'none', border: 'none', color: '#f44336', padding: '0.6rem', cursor: 'pointer', display: 'flex', justifyContent: 'center' }}
                                >
                                    <Trash2 size={18} />
                                </button>
                            </div>
                        ))}
                    </div>
                </section>
            </div>

            {/* ─── Footer Action Bar ──────────────────── */}
            <div style={{ display: 'flex', gap: '1.5rem', marginTop: '3rem', padding: '1rem 0', borderTop: '1px solid #222' }}>
                <button
                    onClick={() => navigate('/brewing')}
                    style={{ flex: 1, padding: '1.2rem', background: 'transparent', border: '1px solid #333', color: '#888', borderRadius: '12px', cursor: 'pointer', fontWeight: 'bold' }}
                >
                    Отмена
                </button>
                <button
                    onClick={handleSave}
                    disabled={saving || !recipe.name.trim()}
                    style={{ flex: 1, padding: '1.2rem', background: '#222', border: '1px solid #444', color: '#fff', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.7rem', cursor: saving ? 'wait' : 'pointer', fontWeight: 'bold', opacity: saving ? 0.5 : 1 }}
                >
                    <Save size={22} /> {saving ? '...' : 'Сохранить'}
                </button>
                <button
                    onClick={handleStartBrew}
                    disabled={saving || !recipe.name.trim()}
                    style={{ flex: 2, padding: '1.2rem', background: 'linear-gradient(90deg, #ff9800, #ff5722)', border: 'none', color: '#000', fontWeight: '900', fontSize: '1.1rem', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.7rem', cursor: saving ? 'wait' : 'pointer', transition: 'transform 0.2s', boxShadow: '0 4px 15px rgba(255,152,0,0.3)' }}
                >
                    <Play size={24} fill="black" /> {saving ? 'ЗАГРУЗКА...' : 'НАЧАТЬ ВАРКУ'}
                </button>
            </div>
        </div>
    );
};

export default RecipeConstructor;
