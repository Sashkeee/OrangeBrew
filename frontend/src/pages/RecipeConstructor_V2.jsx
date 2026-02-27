import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import {
    ArrowLeft, Clock, Calendar, Plus, X, Save, Play,
    Loader, AlertTriangle, Trash2, Beaker, Thermometer,
    Zap, Droplets, Circle
} from 'lucide-react';
import { recipesApi, sessionsApi } from '../api/client.js';
import { DEFAULT_HOPS, DEFAULT_MALTS, DEFAULT_YEASTS, getIngredientsFromStorage } from '../utils/ingredients';
import { AnimatedHopNeonLogo } from '../components/Logos';

const RecipeConstructor_V2 = () => {
    const navigate = useNavigate();
    const [saving, setSaving] = useState(false);

    // Design Tokens - Advanced Glassmorphism
    const BRAND_ORANGE = '#ff9800';
    const DANGER_RED = '#f44336';
    const BG_DARK = '#030303';
    const GLASS_BG = 'rgba(255, 255, 255, 0.03)';
    const GLASS_BORDER = 'rgba(255, 152, 0, 0.15)';
    const TEXT_MUTED = 'rgba(255, 255, 255, 0.45)';

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
        name: '', style: '', notes: '',
        og: 0, fg: 0, ibu: 0, abv: 0,
        batch_size: 40, boil_time: 60,
        mash_steps: [{ id: '1', name: 'Пауза осахаривания', temp: 62, duration: 60 }],
        ingredients: [],
        hop_additions: [],
    });

    // Helper functions (same logic as V1 but kept for completeness)
    const addStep = () => setRecipe({ ...recipe, mash_steps: [...recipe.mash_steps, { id: Date.now().toString(), name: 'Новая пауза', temp: 72, duration: 15 }] });
    const removeStep = (id) => recipe.mash_steps.length > 1 && setRecipe({ ...recipe, mash_steps: recipe.mash_steps.filter(s => s.id !== id) });
    const updateStep = (id, field, value) => setRecipe({ ...recipe, mash_steps: recipe.mash_steps.map(s => s.id === id ? { ...s, [field]: value } : s) });
    const addIngredient = () => setRecipe({ ...recipe, ingredients: [...recipe.ingredients, { id: Date.now().toString(), name: '', amount: '', unit: 'кг', type: 'Солод' }] });
    const removeIngredient = (id) => setRecipe({ ...recipe, ingredients: recipe.ingredients.filter(i => i.id !== id) });
    const updateIngredient = (id, field, value) => setRecipe({ ...recipe, ingredients: recipe.ingredients.map(i => i.id === id ? { ...i, [field]: value, unit: (field === 'type' && value === 'Вода') ? 'л' : (field === 'type' && i.unit === 'л' ? 'кг' : i.unit) } : i) });
    const addHop = () => setRecipe({ ...recipe, hop_additions: [...recipe.hop_additions, { id: Date.now().toString(), name: '', amount: 10, time: 10 }] });
    const updateHop = (id, field, value) => setRecipe({ ...recipe, hop_additions: recipe.hop_additions.map(i => i.id === id ? { ...i, [field]: value } : i) });
    const removeHop = (id) => setRecipe({ ...recipe, hop_additions: recipe.hop_additions.filter(i => i.id !== id) });

    const handleSave = async (start = false) => {
        if (!recipe.name.trim()) return alert('Введите название рецепта');
        try {
            setSaving(true);
            const created = await recipesApi.create(recipe);
            localStorage.setItem('currentRecipe', JSON.stringify({ ...created, steps: recipe.mash_steps }));
            if (start) {
                const session = await sessionsApi.create({ recipe_id: created.id, type: 'brewing', status: 'active' });
                navigate(`/brewing/mash/${session.id}`);
            } else {
                navigate('/brewing/recipes');
            }
        } catch (e) { alert('Ошибка: ' + e.message); } finally { setSaving(false); }
    };

    // Components
    const BackgroundDecor = () => (
        <div style={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none', background: BG_DARK, overflow: 'hidden' }}>
            {/* Animated Glow Orbs - Pixel-perfect match to high-end UI */}
            {[...Array(3)].map((_, i) => (
                <motion.div
                    key={i}
                    animate={{
                        x: [0, i % 2 === 0 ? 150 : -150, 0],
                        y: [0, i % 2 === 0 ? -150 : 150, 0],
                        scale: [1, 1.4, 1],
                    }}
                    transition={{
                        duration: 20 + i * 8,
                        repeat: Infinity,
                        ease: "easeInOut"
                    }}
                    style={{
                        position: 'absolute',
                        width: '800px',
                        height: '800px',
                        top: 10 + i * 35 + '%',
                        left: -5 + i * 30 + '%',
                        background: `radial-gradient(circle, ${BRAND_ORANGE}${i === 0 ? '18' : '08'} 0%, transparent 70%)`,
                        filter: 'blur(100px)',
                        borderRadius: '50%'
                    }}
                />
            ))}
            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, transparent, rgba(0,0,0,0.9))' }} />
        </div>
    );

    const GlassCard = ({ children, style = {} }) => (
        <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            style={{
                background: GLASS_BG,
                backdropFilter: 'blur(40px)',
                WebkitBackdropFilter: 'blur(40px)',
                border: `1px solid ${GLASS_BORDER}`,
                borderRadius: '32px',
                padding: '3rem',
                boxShadow: '0 30px 60px -12px rgba(0, 0, 0, 0.6)',
                position: 'relative',
                zIndex: 1,
                ...style
            }}
        >
            {children}
        </motion.div>
    );

    const inputStyle = {
        width: '100%',
        padding: '1.2rem',
        background: 'rgba(255, 255, 255, 0.04)',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        borderRadius: '16px',
        color: '#fff',
        outline: 'none',
        fontSize: '1rem',
        transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
        boxShadow: 'inset 0 4px 12px rgba(0,0,0,0.15)'
    };

    const sectionHeaderStyle = {
        display: 'flex',
        alignItems: 'center',
        gap: '0.9rem',
        color: '#fff',
        fontSize: '1.5rem',
        fontWeight: '900',
        marginBottom: '2.5rem',
        letterSpacing: '-0.8px',
        textShadow: `0 0 20px rgba(255,255,255,0.1)`
    };

    return (
        <div style={{ minHeight: '100vh', position: 'relative', color: '#fff', overflowX: 'hidden' }}>
            <BackgroundDecor />

            <div style={{ maxWidth: '1000px', margin: '0 auto', padding: '4rem 1rem', position: 'relative', zIndex: 1 }}>

                {/* HEADER - High Fidelity */}
                <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '2.5rem' }}>
                        <motion.button
                            whileHover={{ scale: 1.1, x: -5 }}
                            whileTap={{ scale: 0.9 }}
                            onClick={() => navigate('/brewing')}
                            style={{ background: 'rgba(255,255,255,0.06)', border: 'none', color: '#fff', cursor: 'pointer', width: '56px', height: '56px', borderRadius: '18px', display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(10px)', border: '1px solid rgba(255,255,255,0.1)' }}
                        >
                            <ArrowLeft size={28} />
                        </motion.button>
                        <div>
                            <h1 style={{ margin: 0, fontSize: '3rem', fontWeight: '950', letterSpacing: '-2px', lineHeight: 1 }}>
                                Конструктор <span style={{ color: BRAND_ORANGE, textShadow: `0 0 40px ${BRAND_ORANGE}55` }}>Рецептов</span>
                            </h1>
                            <p style={{ margin: '0.6rem 0 0', color: TEXT_MUTED, fontSize: '1.2rem', fontWeight: '500', letterSpacing: '0.5px' }}>Лаборатория OrangeBrew</p>
                        </div>
                    </div>
                    <motion.div
                        initial={{ opacity: 0, rotate: -30, scale: 0.8 }}
                        animate={{ opacity: 1, rotate: 0, scale: 1 }}
                        transition={{ duration: 1.2, type: "spring" }}
                    >
                        <AnimatedHopNeonLogo size={120} color={BRAND_ORANGE} />
                    </motion.div>
                </header>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '2.5rem' }}>

                    {/* 1. BASIC INFO */}
                    <GlassCard>
                        <h3 style={sectionHeaderStyle}><Beaker size={24} color={BRAND_ORANGE} /> Основные параметры</h3>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '3rem' }}>
                            <div>
                                <label style={{ display: 'block', marginBottom: '0.8rem', color: TEXT_MUTED, fontSize: '0.9rem', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '1px' }}>Название варки</label>
                                <input
                                    style={inputStyle}
                                    placeholder="Напр: Imperial Triple IPA"
                                    value={recipe.name}
                                    onChange={(e) => setRecipe({ ...recipe, name: e.target.value })}
                                />
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
                                <div>
                                    <label style={{ display: 'block', marginBottom: '0.8rem', color: TEXT_MUTED, fontSize: '0.9rem', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '1px' }}>Объем (л)</label>
                                    <input type="number" style={inputStyle} value={recipe.batch_size} onChange={(e) => setRecipe({ ...recipe, batch_size: e.target.value })} />
                                </div>
                                <div>
                                    <label style={{ display: 'block', marginBottom: '0.8rem', color: TEXT_MUTED, fontSize: '0.9rem', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '1px' }}>Кип. (мин)</label>
                                    <input type="number" style={inputStyle} value={recipe.boil_time} onChange={(e) => setRecipe({ ...recipe, boil_time: e.target.value })} />
                                </div>
                            </div>
                        </div>
                    </GlassCard>

                    {/* 2. MASH STEPS */}
                    <GlassCard>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '3rem' }}>
                            <h3 style={{ ...sectionHeaderStyle, marginBottom: 0 }}><Thermometer size={24} color={BRAND_ORANGE} /> Программа затирания</h3>
                            <motion.button
                                whileHover={{ scale: 1.05 }}
                                whileTap={{ scale: 0.95 }}
                                onClick={addStep}
                                style={{ background: BRAND_ORANGE, color: '#000', border: 'none', padding: '0.8rem 1.5rem', borderRadius: '15px', fontWeight: '800', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.6rem', fontSize: '0.95rem' }}
                            >
                                <Plus size={18} /> ШАГ
                            </motion.button>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                            <AnimatePresence>
                                {recipe.mash_steps.map((step, idx) => (
                                    <motion.div
                                        initial={{ opacity: 0, x: -30 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        exit={{ opacity: 0, scale: 0.95 }}
                                        key={step.id}
                                        style={{
                                            display: 'grid',
                                            gridTemplateColumns: '60px 1fr 140px 140px 50px',
                                            alignItems: 'center',
                                            gap: '1.5rem',
                                            padding: '1.5rem',
                                            borderRadius: '24px',
                                            background: 'rgba(255,255,255,0.02)',
                                            border: '1px solid rgba(255,255,255,0.05)'
                                        }}
                                    >
                                        <div style={{ fontSize: '1.4rem', fontWeight: '950', color: BRAND_ORANGE, opacity: 0.3 }}>{String(idx + 1).padStart(2, '0')}</div>
                                        <input style={{ ...inputStyle, background: 'transparent', border: 'none', padding: 0, fontSize: '1.2rem', fontWeight: '750' }} value={step.name} onChange={(e) => updateStep(step.id, 'name', e.target.value)} />
                                        <div style={{ position: 'relative' }}>
                                            <input type="number" style={inputStyle} value={step.temp} onChange={(e) => updateStep(step.id, 'temp', e.target.value)} />
                                            <span style={{ position: 'absolute', right: '15px', top: '50%', transform: 'translateY(-50%)', fontWeight: '800', color: TEXT_MUTED }}>°C</span>
                                        </div>
                                        <div style={{ position: 'relative' }}>
                                            <input type="number" style={inputStyle} value={step.duration} onChange={(e) => updateStep(step.id, 'duration', e.target.value)} />
                                            <span style={{ position: 'absolute', right: '15px', top: '50%', transform: 'translateY(-50%)', fontWeight: '800', color: TEXT_MUTED }}>мин</span>
                                        </div>
                                        <button onClick={() => removeStep(step.id)} style={{ background: 'rgba(244, 67, 54, 0.1)', border: 'none', color: DANGER_RED, cursor: 'pointer', width: '40px', height: '40px', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><X size={20} /></button>
                                    </motion.div>
                                ))}
                            </AnimatePresence>
                        </div>
                    </GlassCard>

                    {/* 3. INGREDIENTS */}
                    <GlassCard>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '3rem' }}>
                            <h3 style={{ ...sectionHeaderStyle, marginBottom: 0 }}><Droplets size={24} color={BRAND_ORANGE} /> Состав ингредиентов</h3>
                            <button onClick={addIngredient} style={{ background: 'rgba(255,152,0,0.08)', color: BRAND_ORANGE, border: `1px solid ${BRAND_ORANGE}44`, padding: '0.8rem 1.5rem', borderRadius: '15px', fontWeight: '800', cursor: 'pointer', fontSize: '0.95rem' }}>
                                + ИНГРЕДИЕНТ
                            </button>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                            {recipe.ingredients.map((ing) => (
                                <div key={ing.id} style={{ display: 'grid', gridTemplateColumns: '150px 1fr 140px 60px 50px', gap: '2rem', alignItems: 'center' }}>
                                    <select value={ing.type} onChange={(e) => updateIngredient(ing.id, 'type', e.target.value)} style={{ ...inputStyle, fontWeight: '700' }}>
                                        <option value="Солод">Солод</option>
                                        <option value="Хмель">Хмель</option>
                                        <option value="Дрожжи">Дрожжи</option>
                                        <option value="Вода">Вода</option>
                                    </select>
                                    {['Солод', 'Хмель', 'Дрожжи'].includes(ing.type) ? (
                                        <select style={{ ...inputStyle, fontWeight: '600' }} value={ing.name} onChange={(e) => updateIngredient(ing.id, 'name', e.target.value)} >
                                            <option value="">Выбрать из справочника...</option>
                                            {ing.type === 'Солод' && dictionary.malt.map(m => <option key={m.id} value={m.name}>{m.name}</option>)}
                                            {ing.type === 'Хмель' && dictionary.hop.map(h => <option key={h.id} value={h.name}>{h.name}</option>)}
                                            {ing.type === 'Дрожжи' && dictionary.yeast.map(y => <option key={y.id} value={y.name}>{y.name}</option>)}
                                        </select>
                                    ) : (
                                        <input style={inputStyle} placeholder={ing.type === 'Вода' ? 'Покупная/родниковая' : 'Название'} value={ing.name} onChange={(e) => updateIngredient(ing.id, 'name', e.target.value)} />
                                    )}
                                    <input type="number" style={inputStyle} placeholder="0.00" value={ing.amount} onChange={(e) => updateIngredient(ing.id, 'amount', e.target.value)} />
                                    <span style={{ fontWeight: '900', color: BRAND_ORANGE, fontSize: '1rem' }}>{ing.unit}</span>
                                    <button onClick={() => removeIngredient(ing.id)} style={{ background: 'none', border: 'none', color: DANGER_RED, cursor: 'pointer' }}><Trash2 size={20} /></button>
                                </div>
                            ))}
                        </div>
                    </GlassCard>

                </div>

                {/* BOTTOM ACTION BAR */}
                <div style={{ display: 'flex', gap: '2.5rem', marginTop: '6rem', padding: '2.5rem', background: 'rgba(255,255,255,0.03)', borderRadius: '40px', border: '1px solid rgba(255,255,255,0.08)', backdropFilter: 'blur(20px)', alignItems: 'center' }}>
                    <button onClick={() => navigate('/brewing')} style={{ background: 'transparent', border: 'none', color: TEXT_MUTED, fontWeight: '900', cursor: 'pointer', fontSize: '1.1rem', letterSpacing: '1px' }}>
                        ОТМЕНИТЬ
                    </button>
                    <div style={{ flex: 1 }} />
                    <button
                        onClick={() => handleSave(false)}
                        disabled={saving}
                        style={{ background: 'rgba(255,255,255,0.05)', color: '#fff', border: '1px solid rgba(255,255,255,0.1)', padding: '1.4rem 3rem', borderRadius: '22px', fontWeight: '800', cursor: 'pointer', transition: 'all 0.3s' }}
                    >
                        {saving ? '...' : 'В ЧЕРНОВИК'}
                    </button>
                    <motion.button
                        whileHover={{ scale: 1.05, boxShadow: `0 0 50px ${BRAND_ORANGE}cc` }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => handleSave(true)}
                        disabled={saving}
                        style={{ background: BRAND_ORANGE, color: '#000', border: 'none', padding: '1.4rem 4.5rem', borderRadius: '22px', fontWeight: '950', cursor: 'pointer', fontSize: '1.2rem', display: 'flex', alignItems: 'center', gap: '1.2rem', boxShadow: `0 0 30px ${BRAND_ORANGE}77` }}
                    >
                        <Play size={28} fill="#000" /> {saving ? 'ЗАПУСК...' : 'НАЧАТЬ ВАРКУ'}
                    </motion.button>
                </div>
            </div>
        </div>
    );
};

export default RecipeConstructor_V2;
