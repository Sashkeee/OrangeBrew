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

                    // Auto-update unit for Water (placeholder handles the rest)
                    if (field === 'type' && value === 'Вода') {
                        updated.unit = 'л';
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
            navigate(`/brewing/mash/${session.id}`);
        } catch (e) {
            console.error('[RecipeConstructor] Save+start failed:', e);
            alert('Ошибка сохранения: ' + e.message);
        } finally {
            setSaving(false);
        }
    };

    const BRAND_ORANGE = '#ff9800';
    const DANGER_RED = '#f44336';
    const TEXT_MUTED = '#737373';
    const BG_INPUT = '#141414';

    const s_input = {
        width: '100%',
        padding: '0.8rem 1rem',
        background: BG_INPUT,
        border: 'transparent 1px solid',
        color: '#fff',
        borderRadius: '8px',
        outline: 'none',
        fontSize: '0.95rem',
        transition: 'border-color 0.2s',
    };

    const s_label = {
        display: 'block',
        marginBottom: '0.5rem',
        color: TEXT_MUTED,
        fontSize: '0.85rem',
        fontWeight: '500'
    };

    const s_header = {
        margin: '0 0 1.5rem 0',
        display: 'flex',
        alignItems: 'center',
        gap: '0.6rem',
        color: BRAND_ORANGE,
        fontSize: '1.1rem',
        fontWeight: '600',
        textTransform: 'uppercase',
        letterSpacing: '1px',
        borderBottom: '1px solid rgba(255,255,255,0.05)',
        paddingBottom: '0.8rem'
    };

    const s_addBtn = {
        background: 'transparent',
        border: 'none',
        color: BRAND_ORANGE,
        display: 'flex',
        alignItems: 'center',
        gap: '0.4rem',
        cursor: 'pointer',
        fontWeight: '500',
        fontSize: '0.9rem',
        padding: '0.5rem 0',
        marginTop: '0.5rem'
    };

    const s_row = {
        display: 'grid',
        gap: '0.8rem',
        alignItems: 'center',
        marginBottom: '0.8rem'
    };

    const ingredientTypes = ['Солод', 'Хмель', 'Дрожжи', 'Вода', 'Добавка'];

    return (
        <div style={{ padding: '2rem 1rem', maxWidth: '800px', margin: '0 auto', color: '#fff' }}>

            <header style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '3rem' }}>
                <button
                    onClick={() => navigate('/brewing')}
                    style={{ background: 'transparent', border: 'none', color: TEXT_MUTED, cursor: 'pointer', padding: 0 }}
                >
                    <ArrowLeft size={24} />
                </button>
                <h1 style={{ margin: 0, fontSize: '1.8rem', fontWeight: '600', color: '#fff', letterSpacing: '0.5px' }}>
                    Создание рецепта
                </h1>
            </header>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '3.5rem' }}>

                {/* ─── Basic Info ───────────────── */}
                <section>
                    <h3 style={s_header}>
                        <Beaker size={18} /> Основная информация
                    </h3>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.5rem' }}>
                        <div>
                            <label style={s_label}>Название рецепта *</label>
                            <input
                                type="text"
                                value={recipe.name}
                                onChange={(e) => setRecipe({ ...recipe, name: e.target.value })}
                                style={s_input}
                                placeholder="Напр: Жигулевское"
                            />
                        </div>
                        <div>
                            <label style={s_label}>Стиль</label>
                            <input
                                type="text"
                                value={recipe.style}
                                onChange={(e) => setRecipe({ ...recipe, style: e.target.value })}
                                style={s_input}
                                placeholder="Напр: American IPA"
                            />
                        </div>
                        <div>
                            <label style={s_label}>Объём варки (л)</label>
                            <input
                                type="number"
                                value={recipe.batch_size}
                                onChange={(e) => setRecipe({ ...recipe, batch_size: parseFloat(e.target.value) || 0 })}
                                style={s_input}
                            />
                        </div>
                        <div>
                            <label style={s_label}>Время кипячения (мин)</label>
                            <input
                                type="number"
                                value={recipe.boil_time}
                                onChange={(e) => setRecipe({ ...recipe, boil_time: parseInt(e.target.value) || 0 })}
                                style={s_input}
                            />
                        </div>
                    </div>

                    <div style={{ marginTop: '1.5rem' }}>
                        <label style={s_label}>Заметки</label>
                        <textarea
                            value={recipe.notes}
                            onChange={(e) => setRecipe({ ...recipe, notes: e.target.value })}
                            rows={2}
                            style={{ ...s_input, resize: 'vertical' }}
                            placeholder="Дополнительные заметки к рецепту..."
                        />
                    </div>
                </section>

                {/* ─── Mash Steps ───────────────── */}
                <section>
                    <h3 style={s_header}>
                        <Thermometer size={18} /> Температурные паузы
                    </h3>

                    <div>
                        {recipe.mash_steps.map((step, idx) => (
                            <div key={step.id} style={{ ...s_row, gridTemplateColumns: 'minmax(150px, 2fr) 110px 110px 40px' }}>
                                <input
                                    type="text"
                                    value={step.name}
                                    onChange={(e) => updateStep(step.id, 'name', e.target.value)}
                                    placeholder="Название паузы"
                                    style={s_input}
                                />
                                <div style={{ position: 'relative' }}>
                                    <input
                                        type="number"
                                        value={step.temp}
                                        onChange={(e) => updateStep(step.id, 'temp', parseInt(e.target.value))}
                                        style={{ ...s_input, paddingRight: '2.5rem' }}
                                    />
                                    <span style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', color: TEXT_MUTED, fontSize: '0.85rem' }}>°C</span>
                                </div>
                                <div style={{ position: 'relative' }}>
                                    <input
                                        type="number"
                                        value={step.duration}
                                        onChange={(e) => updateStep(step.id, 'duration', parseInt(e.target.value))}
                                        style={{ ...s_input, paddingRight: '2.5rem' }}
                                    />
                                    <span style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', color: TEXT_MUTED, fontSize: '0.85rem' }}>мин</span>
                                </div>
                                <button
                                    onClick={() => removeStep(step.id)}
                                    disabled={recipe.mash_steps.length === 1}
                                    style={{ background: 'none', border: 'none', color: DANGER_RED, padding: '0.5rem', cursor: 'pointer', display: 'flex', justifyContent: 'center', opacity: recipe.mash_steps.length === 1 ? 0.3 : 1 }}
                                >
                                    <Trash2 size={18} />
                                </button>
                            </div>
                        ))}
                        <button onClick={addStep} style={s_addBtn}>
                            <Plus size={16} /> Добавить паузу
                        </button>
                    </div>
                </section>

                {/* ─── Ingredients ───────────────── */}
                <section>
                    <h3 style={s_header}>
                        <Plus size={18} /> Ингредиенты
                    </h3>

                    <div>
                        {recipe.ingredients.length === 0 && (
                            <div style={{ color: TEXT_MUTED, fontSize: '0.9rem', marginBottom: '1rem' }}>
                                Ингредиенты пока не добавлены
                            </div>
                        )}
                        {recipe.ingredients.map((ing) => (
                            <div key={ing.id} style={{ ...s_row, gridTemplateColumns: '130px minmax(180px, 1fr) 90px 70px 40px' }}>
                                <select
                                    value={ing.type}
                                    onChange={(e) => updateIngredient(ing.id, 'type', e.target.value)}
                                    style={s_input}
                                >
                                    {ingredientTypes.map(t => <option key={t} value={t}>{t}</option>)}
                                </select>

                                {['Солод', 'Хмель', 'Дрожжи'].includes(ing.type) ? (
                                    <select
                                        value={ing.name}
                                        onChange={(e) => updateIngredient(ing.id, 'name', e.target.value)}
                                        style={s_input}
                                    >
                                        <option value="">Выберите...</option>
                                        {dictionary.malt.map(m => <option key={m.id} value={m.name}>{m.name}</option>)}
                                        {ing.type === 'Хмель' && dictionary.hop.map(h => <option key={h.id} value={h.name}>{h.name}</option>)}
                                        {ing.type === 'Дрожжи' && dictionary.yeast.map(y => <option key={y.id} value={y.name}>{y.name}</option>)}
                                    </select>
                                ) : (
                                    <input
                                        type="text"
                                        value={ing.name}
                                        onChange={(e) => updateIngredient(ing.id, 'name', e.target.value)}
                                        placeholder={ing.type === 'Вода' ? 'Покупная/родниковая' : 'Название'}
                                        style={s_input}
                                    />
                                )}

                                <input
                                    type="number"
                                    value={ing.amount}
                                    onChange={(e) => updateIngredient(ing.id, 'amount', parseFloat(e.target.value) || '')}
                                    placeholder="Кол-во"
                                    style={s_input}
                                />
                                <input
                                    type="text"
                                    value={ing.unit}
                                    onChange={(e) => updateIngredient(ing.id, 'unit', e.target.value)}
                                    style={{ ...s_input, textAlign: 'center', padding: '0.8rem 0' }}
                                />
                                <button
                                    onClick={() => removeIngredient(ing.id)}
                                    style={{ background: 'none', border: 'none', color: DANGER_RED, padding: '0.5rem', cursor: 'pointer', display: 'flex', justifyContent: 'center' }}
                                >
                                    <Trash2 size={18} />
                                </button>
                            </div>
                        ))}
                        <button onClick={addIngredient} style={s_addBtn}>
                            <Plus size={16} /> Добавить ингредиент
                        </button>
                    </div>
                </section>

                {/* ─── Hops (Boil) ───────────────── */}
                <section>
                    <h3 style={s_header}>
                        <Clock size={18} /> Внесение хмеля на варке
                    </h3>

                    <div>
                        {recipe.hop_additions.length === 0 && (
                            <div style={{ color: TEXT_MUTED, fontSize: '0.9rem', marginBottom: '1rem' }}>
                                График внесения хмеля пуст
                            </div>
                        )}
                        {recipe.hop_additions.map((hop) => (
                            <div key={hop.id} style={{ ...s_row, gridTemplateColumns: 'minmax(200px, 1fr) 110px 130px 40px' }}>
                                <select
                                    value={hop.name}
                                    onChange={(e) => updateHop(hop.id, 'name', e.target.value)}
                                    style={s_input}
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
                                        style={{ ...s_input, paddingRight: '2rem' }}
                                    />
                                    <span style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', color: TEXT_MUTED, fontSize: '0.85rem' }}>г.</span>
                                </div>
                                <div style={{ position: 'relative' }}>
                                    <input
                                        type="number"
                                        value={hop.time}
                                        onChange={(e) => updateHop(hop.id, 'time', parseInt(e.target.value) || 0)}
                                        style={{ ...s_input, paddingRight: '2.5rem' }}
                                    />
                                    <span style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', color: TEXT_MUTED, fontSize: '0.75rem', textAlign: 'right', lineHeight: '1.1' }}>мин (конец)</span>
                                </div>
                                <button
                                    onClick={() => removeHop(hop.id)}
                                    style={{ background: 'none', border: 'none', color: DANGER_RED, padding: '0.5rem', cursor: 'pointer', display: 'flex', justifyContent: 'center' }}
                                >
                                    <Trash2 size={18} />
                                </button>
                            </div>
                        ))}
                        <button onClick={addHop} style={s_addBtn}>
                            <Plus size={16} /> Внести хмель
                        </button>
                    </div>
                </section>
            </div>

            {/* ─── Footer Action Bar ──────────────────── */}
            <div style={{ display: 'flex', gap: '1rem', marginTop: '4rem', paddingTop: '2rem', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                <button
                    onClick={() => navigate('/brewing')}
                    style={{ padding: '0.9rem 1.5rem', background: 'rgba(244, 67, 54, 0.1)', color: DANGER_RED, border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: '500', fontSize: '1rem' }}
                >
                    Отмена
                </button>
                <div style={{ flex: 1 }} />
                <button
                    onClick={handleSave}
                    disabled={saving || !recipe.name.trim()}
                    style={{ padding: '0.9rem 2rem', background: 'rgba(255, 152, 0, 0.15)', color: BRAND_ORANGE, border: 'none', borderRadius: '8px', cursor: saving ? 'wait' : 'pointer', fontWeight: '600', fontSize: '1rem', opacity: saving ? 0.5 : 1 }}
                >
                    {saving ? '...' : 'Сохранить'}
                </button>
                <button
                    onClick={handleStartBrew}
                    disabled={saving || !recipe.name.trim()}
                    style={{ padding: '0.9rem 2.5rem', background: BRAND_ORANGE, color: '#000', border: 'none', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: saving ? 'wait' : 'pointer', fontWeight: '700', fontSize: '1rem', opacity: saving ? 0.7 : 1 }}
                >
                    <Play size={18} fill="#000" /> {saving ? 'ЗАГРУЗКА...' : 'НАЧАТЬ ВАРКУ'}
                </button>
            </div>

        </div>
    );
};

export default RecipeConstructor;
