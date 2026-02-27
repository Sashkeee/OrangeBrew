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
    const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

    useEffect(() => {
        const handleResize = () => setIsMobile(window.innerWidth < 768);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    // Design Tokens - Advanced Glassmorphism
    const BRAND_ORANGE = '#ff9800';
    const DANGER_RED = '#f44336';
    const BG_DARK = '#030303';
    const GLASS_BG = 'rgba(255, 255, 255, 0.05)';
    const GLASS_BORDER = 'rgba(255, 152, 0, 0.2)';
    const TEXT_MUTED = 'rgba(255, 255, 255, 0.5)';

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

    // Helper functions
    const addStep = () => setRecipe({ ...recipe, mash_steps: [...recipe.mash_steps, { id: Date.now().toString(), name: 'Новая пауза', temp: 72, duration: 15 }] });
    const removeStep = (id) => recipe.mash_steps.length > 1 && setRecipe({ ...recipe, mash_steps: recipe.mash_steps.filter(s => s.id !== id) });
    const updateStep = (id, field, value) => setRecipe({ ...recipe, mash_steps: recipe.mash_steps.map(s => s.id === id ? { ...s, [field]: value } : s) });
    const addIngredient = () => setRecipe({ ...recipe, ingredients: [...recipe.ingredients, { id: Date.now().toString(), name: '', amount: '', unit: 'кг', type: 'Солод' }] });
    const removeIngredient = (id) => setRecipe({ ...recipe, ingredients: recipe.ingredients.filter(i => i.id !== id) });
    const updateIngredient = (id, field, value) => setRecipe({ ...recipe, ingredients: recipe.ingredients.map(i => i.id === id ? { ...i, [field]: value, unit: (field === 'type' && value === 'Вода') ? 'л' : (field === 'type' && i.unit === 'л' ? 'кг' : i.unit) } : i) });

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
            {[...Array(isMobile ? 3 : 5)].map((_, i) => (
                <motion.div
                    key={i}
                    animate={{
                        x: [0, i % 2 === 0 ? (isMobile ? 100 : 300) : (isMobile ? -100 : -300), 0],
                        y: [0, i % 2 === 0 ? (isMobile ? -100 : -300) : (isMobile ? 100 : 300), 0],
                        scale: [1, isMobile ? 1.4 : 1.8, 1],
                    }}
                    transition={{
                        duration: 12 + i * 4,
                        repeat: Infinity,
                        ease: "easeInOut"
                    }}
                    style={{
                        position: 'absolute',
                        width: isMobile ? '600px' : '1200px',
                        height: isMobile ? '600px' : '1200px',
                        top: (i * 25 - 10) + '%',
                        left: (i * 20 - 10) + '%',
                        background: `radial-gradient(circle, ${BRAND_ORANGE}${i % 2 === 0 ? '55' : '33'} 0%, transparent 70%)`,
                        filter: 'blur(130px)',
                        borderRadius: '50%',
                        opacity: 0.9
                    }}
                />
            ))}
            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, transparent, rgba(0,0,0,0.9))' }} />
        </div>
    );

    const GlassCard = ({ children, style = {} }) => (
        <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            style={{
                background: GLASS_BG,
                backdropFilter: 'blur(40px)',
                WebkitBackdropFilter: 'blur(40px)',
                border: `1px solid ${GLASS_BORDER}`,
                borderRadius: isMobile ? '24px' : '32px',
                padding: isMobile ? '1.5rem' : '3rem',
                boxShadow: '0 30px 60px -12px rgba(0, 0, 0, 0.6)',
                position: 'relative',
                zIndex: 1,
                willChange: 'transform, opacity',
                ...style
            }}
        >
            {children}
        </motion.div>
    );

    const inputStyle = {
        width: '100%',
        padding: isMobile ? '0.9rem 1rem' : '1.2rem',
        background: 'rgba(255, 255, 255, 0.04)',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        borderRadius: '16px',
        color: '#fff',
        outline: 'none',
        fontSize: isMobile ? '0.95rem' : '1rem',
        transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
        boxShadow: 'inset 0 4px 12px rgba(0,0,0,0.15)'
    };

    const sectionHeaderStyle = {
        display: 'flex',
        alignItems: 'center',
        gap: '0.9rem',
        color: '#fff',
        fontSize: isMobile ? '1.2rem' : '1.5rem',
        fontWeight: '900',
        marginBottom: isMobile ? '1.5rem' : '2.5rem',
        letterSpacing: '-0.8px',
        textShadow: `0 0 20px rgba(255,255,255,0.1)`
    };

    return (
        <div style={{ minHeight: '100vh', position: 'relative', color: '#fff', overflowX: 'hidden' }}>
            <BackgroundDecor />

            <div style={{ maxWidth: '1000px', margin: '0 auto', padding: isMobile ? '1.5rem 1rem 10rem' : '4rem 1rem', position: 'relative', zIndex: 1 }}>

                {/* HEADER */}
                <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: isMobile ? '2rem' : '4rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? '1rem' : '2.5rem' }}>
                        <motion.button
                            whileHover={{ scale: 1.1 }}
                            whileTap={{ scale: 0.9 }}
                            onClick={() => navigate('/brewing')}
                            style={{
                                background: 'rgba(255,255,255,0.06)',
                                color: '#fff',
                                cursor: 'pointer',
                                width: isMobile ? '44px' : '56px',
                                height: isMobile ? '44px' : '56px',
                                borderRadius: '14px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                border: '1px solid rgba(255,255,255,0.1)'
                            }}
                        >
                            <ArrowLeft size={isMobile ? 22 : 28} />
                        </motion.button>
                        <div>
                            <h1 style={{ margin: 0, fontSize: isMobile ? '1.8rem' : '3rem', fontWeight: '950', letterSpacing: '-1px', lineHeight: 1 }}>
                                Конструктор <br />
                                <span style={{ color: BRAND_ORANGE, textShadow: `0 0 30px ${BRAND_ORANGE}44` }}>Рецептов</span>
                            </h1>
                        </div>
                    </div>
                    <AnimatedHopNeonLogo size={isMobile ? 70 : 120} color={BRAND_ORANGE} />
                </header>

                <div style={{ display: 'flex', flexDirection: 'column', gap: isMobile ? '1.5rem' : '2.5rem' }}>

                    {/* 1. BASIC INFO */}
                    <GlassCard>
                        <h3 style={sectionHeaderStyle}><Beaker size={20} color={BRAND_ORANGE} /> Параметры</h3>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: isMobile ? '1.5rem' : '3rem' }}>
                            <div>
                                <label style={{ display: 'block', marginBottom: '0.6rem', color: TEXT_MUTED, fontSize: '0.75rem', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '1px' }}>Название</label>
                                <input
                                    style={inputStyle}
                                    placeholder="Название рецепта"
                                    value={recipe.name}
                                    onChange={(e) => setRecipe({ ...recipe, name: e.target.value })}
                                />
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                <div>
                                    <label style={{ display: 'block', marginBottom: '0.6rem', color: TEXT_MUTED, fontSize: '0.75rem', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '1px' }}>Объем (л)</label>
                                    <input type="number" style={inputStyle} value={recipe.batch_size} onChange={(e) => setRecipe({ ...recipe, batch_size: e.target.value })} />
                                </div>
                                <div>
                                    <label style={{ display: 'block', marginBottom: '0.6rem', color: TEXT_MUTED, fontSize: '0.75rem', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '1px' }}>Кип. (мин)</label>
                                    <input type="number" style={inputStyle} value={recipe.boil_time} onChange={(e) => setRecipe({ ...recipe, boil_time: e.target.value })} />
                                </div>
                            </div>
                        </div>
                    </GlassCard>

                    {/* 2. MASH STEPS */}
                    <GlassCard>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: isMobile ? '1.5rem' : '3rem' }}>
                            <h3 style={{ ...sectionHeaderStyle, marginBottom: 0 }}><Thermometer size={20} color={BRAND_ORANGE} /> Затирание</h3>
                            <button
                                onClick={addStep}
                                style={{ background: BRAND_ORANGE, color: '#000', border: 'none', padding: isMobile ? '0.6rem 1rem' : '0.8rem 1.5rem', borderRadius: '12px', fontWeight: '800', cursor: 'pointer', fontSize: isMobile ? '0.8rem' : '0.95rem' }}
                            >
                                + ШАГ
                            </button>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            <AnimatePresence>
                                {recipe.mash_steps.map((step, idx) => (
                                    <motion.div
                                        initial={{ opacity: 0, scale: 0.95 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        exit={{ opacity: 0, scale: 0.95 }}
                                        key={step.id}
                                        style={{
                                            display: 'flex',
                                            flexDirection: 'column',
                                            gap: '1rem',
                                            padding: isMobile ? '1.2rem' : '1.5rem',
                                            borderRadius: '20px',
                                            background: 'rgba(255,255,255,0.02)',
                                            border: '1px solid rgba(255,255,255,0.05)',
                                            position: 'relative'
                                        }}
                                    >
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <div style={{ fontSize: '0.8rem', fontWeight: '900', color: BRAND_ORANGE, opacity: 0.4 }}>ШАГ {idx + 1}</div>
                                            {recipe.mash_steps.length > 1 && (
                                                <button onClick={() => removeStep(step.id)} style={{ background: 'none', border: 'none', color: DANGER_RED, cursor: 'pointer' }}><X size={18} /></button>
                                            )}
                                        </div>
                                        <input style={{ ...inputStyle, background: 'transparent', border: 'none', padding: 0, fontSize: '1.1rem', fontWeight: '750' }} value={step.name} onChange={(e) => updateStep(step.id, 'name', e.target.value)} />
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                            <div style={{ position: 'relative' }}>
                                                <input type="number" style={inputStyle} value={step.temp} onChange={(e) => updateStep(step.id, 'temp', e.target.value)} />
                                                <span style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', fontWeight: '800', color: TEXT_MUTED, fontSize: '0.8rem' }}>°C</span>
                                            </div>
                                            <div style={{ position: 'relative' }}>
                                                <input type="number" style={inputStyle} value={step.duration} onChange={(e) => updateStep(step.id, 'duration', e.target.value)} />
                                                <span style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', fontWeight: '800', color: TEXT_MUTED, fontSize: '0.8rem' }}>мин</span>
                                            </div>
                                        </div>
                                    </motion.div>
                                ))}
                            </AnimatePresence>
                        </div>
                    </GlassCard>

                    {/* 3. INGREDIENTS */}
                    <GlassCard>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: isMobile ? '1.5rem' : '3rem' }}>
                            <h3 style={{ ...sectionHeaderStyle, marginBottom: 0 }}><Droplets size={20} color={BRAND_ORANGE} /> Состав</h3>
                            <button onClick={addIngredient} style={{ background: 'rgba(255,152,0,0.08)', color: BRAND_ORANGE, border: `1px solid ${BRAND_ORANGE}44`, padding: isMobile ? '0.6rem 1rem' : '0.8rem 1.5rem', borderRadius: '12px', fontWeight: '800', cursor: 'pointer', fontSize: isMobile ? '0.8rem' : '0.95rem' }}>
                                + ДОБАВИТЬ
                            </button>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            {recipe.ingredients.map((ing) => (
                                <div key={ing.id} style={{
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: '0.8rem',
                                    paddingBottom: '1rem',
                                    borderBottom: '1px solid rgba(255,255,255,0.05)',
                                    position: 'relative'
                                }}>
                                    <div style={{ display: 'flex', gap: '0.8rem' }}>
                                        <select value={ing.type} onChange={(e) => updateIngredient(ing.id, 'type', e.target.value)} style={{ ...inputStyle, flex: '0 0 100px', padding: '0.6rem' }}>
                                            <option value="Солод">Солод</option>
                                            <option value="Хмель">Хмель</option>
                                            <option value="Дрожжи">Дрожжи</option>
                                            <option value="Вода">Вода</option>
                                        </select>
                                        <div style={{ flex: 1 }}>
                                            {['Солод', 'Хмель', 'Дрожжи'].includes(ing.type) ? (
                                                <select style={{ ...inputStyle, padding: '0.6rem' }} value={ing.name} onChange={(e) => updateIngredient(ing.id, 'name', e.target.value)} >
                                                    <option value="">Выбрать...</option>
                                                    {ing.type === 'Солод' && dictionary.malt.map(m => <option key={m.id} value={m.name}>{m.name}</option>)}
                                                    {ing.type === 'Хмель' && dictionary.hop.map(h => <option key={h.id} value={h.name}>{h.name}</option>)}
                                                    {ing.type === 'Дрожжи' && dictionary.yeast.map(y => <option key={y.id} value={y.name}>{y.name}</option>)}
                                                </select>
                                            ) : (
                                                <input style={{ ...inputStyle, padding: '0.6rem' }} placeholder="Название" value={ing.name} onChange={(e) => updateIngredient(ing.id, 'name', e.target.value)} />
                                            )}
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flex: 1 }}>
                                            <input type="number" style={{ ...inputStyle, width: '100px', padding: '0.6rem' }} placeholder="0.00" value={ing.amount} onChange={(e) => updateIngredient(ing.id, 'amount', e.target.value)} />
                                            <span style={{ fontWeight: '900', color: BRAND_ORANGE, fontSize: '0.9rem' }}>{ing.unit}</span>
                                        </div>
                                        <button onClick={() => removeIngredient(ing.id)} style={{ background: 'none', border: 'none', color: DANGER_RED, cursor: 'pointer' }}><Trash2 size={18} /></button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </GlassCard>

                </div>

                {/* BOTTOM ACTION BAR - Sticky on mobile */}
                <div style={{
                    display: 'flex',
                    flexDirection: isMobile ? 'row' : 'row',
                    gap: isMobile ? '1rem' : '2.5rem',
                    marginTop: isMobile ? '2rem' : '6rem',
                    padding: isMobile ? '1.2rem' : '2.5rem',
                    background: 'rgba(10, 10, 10, 0.8)',
                    borderRadius: isMobile ? '24px' : '40px',
                    border: '1px solid rgba(255,255,255,0.1)',
                    backdropFilter: 'blur(20px)',
                    alignItems: 'center',
                    position: isMobile ? 'fixed' : 'relative',
                    bottom: isMobile ? '1.5rem' : 'auto',
                    left: isMobile ? '1rem' : 'auto',
                    right: isMobile ? '1rem' : 'auto',
                    zIndex: 100,
                    boxShadow: '0 -10px 40px rgba(0,0,0,0.5)'
                }}>
                    {!isMobile && (
                        <button onClick={() => navigate('/brewing')} style={{ background: 'transparent', border: 'none', color: TEXT_MUTED, fontWeight: '900', cursor: 'pointer', fontSize: '1.1rem', letterSpacing: '1px' }}>
                            ОТМЕНИТЬ
                        </button>
                    )}
                    <div style={{ flex: isMobile ? 0 : 1 }} />
                    <button
                        onClick={() => handleSave(false)}
                        disabled={saving}
                        style={{
                            background: 'rgba(255,255,255,0.05)',
                            color: '#fff',
                            border: '1px solid rgba(255,255,255,0.1)',
                            padding: isMobile ? '1rem 1.2rem' : '1.4rem 3rem',
                            borderRadius: '16px',
                            fontWeight: '800',
                            cursor: 'pointer',
                            flex: isMobile ? 1 : 'none',
                            fontSize: isMobile ? '0.85rem' : '1rem'
                        }}
                    >
                        В ЧЕРНОВИК
                    </button>
                    <motion.button
                        whileTap={{ scale: 0.95 }}
                        onClick={() => handleSave(true)}
                        disabled={saving}
                        style={{
                            background: BRAND_ORANGE,
                            color: '#000',
                            border: 'none',
                            padding: isMobile ? '1rem' : '1.4rem 4.5rem',
                            borderRadius: '16px',
                            fontWeight: '950',
                            cursor: 'pointer',
                            fontSize: isMobile ? '0.9rem' : '1.2rem',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '0.8rem',
                            flex: isMobile ? 1.5 : 'none',
                            boxShadow: `0 0 30px ${BRAND_ORANGE}55`
                        }}
                    >
                        <Play size={isMobile ? 20 : 28} fill="#000" /> {isMobile ? 'ПУСК' : 'НАЧАТЬ ВАРКУ'}
                    </motion.button>
                </div>
            </div>
        </div>
    );
};

export default RecipeConstructor_V2;
