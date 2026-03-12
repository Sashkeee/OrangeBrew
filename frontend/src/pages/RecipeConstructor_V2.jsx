import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import {
    ArrowLeft, Clock, Plus, X, Play,
    Loader, Trash2, Beaker, Thermometer,
    Droplets, Info, Layers, Palette, Zap
} from 'lucide-react';
import { recipesApi, sessionsApi } from '../api/client.js';
import { DEFAULT_HOPS, DEFAULT_MALTS, DEFAULT_YEASTS, getIngredientsFromStorage } from '../utils/ingredients';
import { AnimatedHopNeonLogo } from '../components/Logos';

// Design Tokens - Advanced Glassmorphism
const BRAND_ORANGE = '#ff9800';
const DANGER_RED = '#f44336';
const BG_DARK = '#030303';
const GLASS_BG = 'rgba(255, 255, 255, 0.05)';
const GLASS_BORDER = 'rgba(255, 152, 0, 0.2)';
const TEXT_MUTED = 'rgba(255, 255, 255, 0.5)';

// --- Sub-components outside main component ---

const BackgroundDecor = ({ isMobile }) => (
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

const GlassCard = ({ children, isMobile, style = {} }) => (
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

const StatItem = ({ icon: Icon, label, value, unit, color = BRAND_ORANGE }) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', padding: '1rem', background: 'rgba(255,255,255,0.02)', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.05)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: TEXT_MUTED, fontSize: '0.7rem', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            <Icon size={14} color={color} /> {label}
        </div>
        <div style={{ fontSize: '1.4rem', fontWeight: '900', color: '#fff' }}>
            {value} <span style={{ fontSize: '0.8rem', color: TEXT_MUTED }}>{unit}</span>
        </div>
    </div>
);

const RecipeConstructor_V2 = () => {
    const navigate = useNavigate();
    const [saving, setSaving] = useState(false);
    const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

    useEffect(() => {
        const handleResize = () => setIsMobile(window.innerWidth < 768);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

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

    // --- CALCULATIONS ---
    const stats = useMemo(() => {
        const totalMalt = recipe.ingredients
            .filter(i => i.type === 'Солод')
            .reduce((sum, i) => sum + (parseFloat(i.amount) || 0), 0);

        const totalWater = recipe.ingredients
            .filter(i => i.type === 'Вода')
            .reduce((sum, i) => sum + (parseFloat(i.amount) || 0), 0);

        const hydroModule = totalMalt > 0 ? (totalWater / totalMalt).toFixed(2) : 0;

        // Color Calculation (Morey/Metric MCU)
        let mcu = 0;
        recipe.ingredients.filter(i => i.type === 'Солод').forEach(ing => {
            const amount = parseFloat(ing.amount) || 0;
            const maltData = dictionary.malt.find(m => m.name === ing.name);
            if (maltData) {
                // Parse color string: "2.5 - 4.0 EBC" -> 3.25
                const colors = maltData.color.match(/[\d.]+/g);
                const avgEbc = colors ? colors.reduce((s, c) => s + parseFloat(c), 0) / colors.length : 0;
                mcu += (amount * avgEbc);
            }
        });
        const ebc = recipe.batch_size > 0 ? (2.93 * Math.pow(mcu / recipe.batch_size, 0.69)).toFixed(1) : 0;

        // IBU Calculation (Tinseth Approximation)
        let totalIbu = 0;
        const vol = recipe.batch_size || 1;
        recipe.hop_additions.forEach(hop => {
            const amount = parseFloat(hop.amount) || 0;
            const time = parseInt(hop.time) || 0;
            const hopData = dictionary.hop.find(h => h.name === hop.name);
            if (hopData) {
                const alphaStr = hopData.alpha.match(/[\d.]+/g);
                const alpha = alphaStr ? (alphaStr.reduce((s, a) => s + parseFloat(a), 0) / alphaStr.length) / 100 : 0.05;

                // Tinseth Utilization Factor
                const bignessFactor = 1.65 * Math.pow(0.000125, 0.05); // Assume 1.050 OG
                const timeFactor = (1 - Math.exp(-0.04 * time)) / 4.15;
                let utilization = bignessFactor * timeFactor;

                // Whirlpool (0 min) adjustment
                if (time === 0) utilization = 0.05;

                totalIbu += (amount * alpha * utilization * 1000) / vol;
            }
        });

        return {
            malt: totalMalt.toFixed(2),
            water: totalWater.toFixed(1),
            ratio: hydroModule,
            color: ebc,
            ibu: totalIbu.toFixed(0)
        };
    }, [recipe, dictionary]);

    // Helper functions
    const addStep = () => setRecipe({ ...recipe, mash_steps: [...recipe.mash_steps, { id: Date.now().toString(), name: 'Новая пауза', temp: 72, duration: 15 }] });
    const removeStep = (id) => recipe.mash_steps.length > 1 && setRecipe({ ...recipe, mash_steps: recipe.mash_steps.filter(s => s.id !== id) });
    const updateStep = (id, field, value) => setRecipe({ ...recipe, mash_steps: recipe.mash_steps.map(s => s.id === id ? { ...s, [field]: value } : s) });

    const addIngredient = () => setRecipe({ ...recipe, ingredients: [...recipe.ingredients, { id: Date.now().toString(), name: '', amount: '', unit: 'кг', type: 'Солод' }] });
    const removeIngredient = (id) => setRecipe({ ...recipe, ingredients: recipe.ingredients.filter(i => i.id !== id) });
    const updateIngredient = (id, field, value) => setRecipe({
        ...recipe,
        ingredients: recipe.ingredients.map(i => {
            if (i.id === id) {
                const updated = { ...i, [field]: value };
                if (field === 'type' && value === 'Вода') updated.unit = 'л';
                else if (field === 'type' && value !== 'Вода' && i.unit === 'л') updated.unit = 'кг';
                return updated;
            }
            return i;
        })
    });

    const addHop = () => setRecipe({ ...recipe, hop_additions: [...recipe.hop_additions, { id: Date.now().toString(), name: '', amount: 10, time: 10 }] });
    const removeHop = (id) => setRecipe({ ...recipe, hop_additions: recipe.hop_additions.filter(h => h.id !== id) });
    const updateHop = (id, field, value) => setRecipe({ ...recipe, hop_additions: recipe.hop_additions.map(h => h.id === id ? { ...h, [field]: value } : h) });

    const validateRecipe = () => {
        if (!recipe.name.trim()) { alert('Введите название рецепта'); return false; }
        for (let i = 0; i < recipe.mash_steps.length - 1; i++) {
            if (parseFloat(recipe.mash_steps[i].temp) >= parseFloat(recipe.mash_steps[i + 1].temp)) {
                alert(`Ошибка: Температура паузы #${i + 2} (${recipe.mash_steps[i + 1].temp}°C) должна быть выше температуры паузы #${i + 1} (${recipe.mash_steps[i].temp}°C).`);
                return false;
            }
        }
        return true;
    };

    const handleSave = async (start = false) => {
        if (!validateRecipe()) return;
        try {
            setSaving(true);
            const created = await recipesApi.create(recipe);
            if (start) {
                const session = await sessionsApi.create({ recipe_id: created.id, type: 'brewing', status: 'active' });
                navigate(`/brewing/mash/${session.id}`);
            } else {
                navigate('/brewing/recipes');
            }
        } catch (e) { alert('Ошибка: ' + e.message); } finally { setSaving(false); }
    };

    const inputStyle = {
        width: '100%',
        padding: isMobile ? '0.9rem 1rem' : '1.2rem',
        background: 'rgba(30, 30, 30, 0.9)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        borderRadius: '16px',
        color: '#fff',
        outline: 'none',
        fontSize: isMobile ? '0.95rem' : '1rem',
        transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
        boxShadow: 'inset 0 4px 12px rgba(0,0,0,0.15)',
        cursor: 'pointer'
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

    const labelStyle = {
        display: 'block',
        marginBottom: '0.6rem',
        color: TEXT_MUTED,
        fontSize: '0.75rem',
        fontWeight: '800',
        textTransform: 'uppercase',
        letterSpacing: '1px'
    };

    return (
        <div style={{ minHeight: '100vh', position: 'relative', color: '#fff', overflowX: 'hidden' }}>
            <BackgroundDecor isMobile={isMobile} />

            <div style={{ maxWidth: '1000px', margin: '0 auto', padding: isMobile ? '1.5rem 1rem 12rem' : '4rem 1rem', position: 'relative', zIndex: 1 }}>

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
                    <GlassCard isMobile={isMobile}>
                        <h3 style={sectionHeaderStyle}><Beaker size={20} color={BRAND_ORANGE} /> Параметры</h3>
                        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: isMobile ? '1.5rem' : '2.5rem' }}>
                            <div>
                                <label style={labelStyle}>Название рецепта *</label>
                                <input style={inputStyle} placeholder="Напр: Жигулевское" value={recipe.name} onChange={(e) => setRecipe({ ...recipe, name: e.target.value })} />
                            </div>
                            <div>
                                <label style={labelStyle}>Стиль</label>
                                <input style={inputStyle} placeholder="Напр: American IPA" value={recipe.style} onChange={(e) => setRecipe({ ...recipe, style: e.target.value })} />
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                                <div>
                                    <label style={labelStyle}>Объем (л)</label>
                                    <input type="number" style={inputStyle} value={recipe.batch_size} onChange={(e) => setRecipe({ ...recipe, batch_size: parseFloat(e.target.value) || 0 })} />
                                </div>
                                <div>
                                    <label style={labelStyle}>Кип. (мин)</label>
                                    <input type="number" style={inputStyle} value={recipe.boil_time} onChange={(e) => setRecipe({ ...recipe, boil_time: parseInt(e.target.value) || 0 })} />
                                </div>
                            </div>
                        </div>
                    </GlassCard>

                    {/* 2. MASH STEPS */}
                    <GlassCard isMobile={isMobile}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: isMobile ? '1.5rem' : '3rem' }}>
                            <h3 style={{ ...sectionHeaderStyle, marginBottom: 0 }}><Thermometer size={20} color={BRAND_ORANGE} /> Затирание</h3>
                            <button onClick={addStep} style={{ background: BRAND_ORANGE, color: '#000', border: 'none', padding: isMobile ? '0.6rem 1rem' : '0.8rem 1.5rem', borderRadius: '12px', fontWeight: '800', cursor: 'pointer', fontSize: isMobile ? '0.8rem' : '0.95rem' }}>+ ШАГ</button>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            {recipe.mash_steps.map((step, idx) => (
                                <motion.div layout key={step.id} style={{ display: 'flex', flexDirection: 'column', gap: '1rem', padding: isMobile ? '1.2rem' : '1.5rem', borderRadius: '20px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <div style={{ fontSize: '0.8rem', fontWeight: '900', color: BRAND_ORANGE, opacity: 0.4 }}>ШАГ {idx + 1}</div>
                                        {recipe.mash_steps.length > 1 && <button onClick={() => removeStep(step.id)} style={{ background: 'none', border: 'none', color: DANGER_RED, cursor: 'pointer' }}><X size={18} /></button>}
                                    </div>
                                    <input style={{ ...inputStyle, background: 'transparent', border: 'none', padding: 0, fontSize: '1.1rem', fontWeight: '750' }} value={step.name} onChange={(e) => updateStep(step.id, 'name', e.target.value)} />
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                        <div style={{ position: 'relative' }}><input type="number" style={inputStyle} value={step.temp} onChange={(e) => updateStep(step.id, 'temp', parseInt(e.target.value))} /><span style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', fontWeight: '800', color: TEXT_MUTED }}>°C</span></div>
                                        <div style={{ position: 'relative' }}><input type="number" style={inputStyle} value={step.duration} onChange={(e) => updateStep(step.id, 'duration', parseInt(e.target.value))} /><span style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', fontWeight: '800', color: TEXT_MUTED }}>мин</span></div>
                                    </div>
                                </motion.div>
                            ))}
                        </div>
                    </GlassCard>

                    {/* 3. INGREDIENTS */}
                    <GlassCard isMobile={isMobile}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: isMobile ? '1.5rem' : '3rem' }}>
                            <h3 style={{ ...sectionHeaderStyle, marginBottom: 0 }}><Droplets size={20} color={BRAND_ORANGE} /> Ингредиенты</h3>
                            <button onClick={addIngredient} style={{ background: 'rgba(255,152,0,0.08)', color: BRAND_ORANGE, border: `1px solid ${BRAND_ORANGE}44`, padding: isMobile ? '0.6rem 1rem' : '0.8rem 1.5rem', borderRadius: '12px', fontWeight: '800', cursor: 'pointer' }}>+ ДОБАВИТЬ</button>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            {recipe.ingredients.map((ing) => (
                                <div key={ing.id} style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem', paddingBottom: '1rem', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                    <div style={{ display: 'flex', gap: '0.8rem' }}>
                                        <select value={ing.type} onChange={(e) => updateIngredient(ing.id, 'type', e.target.value)} style={{ ...inputStyle, flex: '0 0 110px', padding: '0.6rem' }}>
                                            {['Солод', 'Хмель', 'Дрожжи', 'Вода', 'Добавка'].map(t => <option key={t} value={t} style={{ background: '#1a1a1a' }}>{t}</option>)}
                                        </select>
                                        {['Солод', 'Хмель', 'Дрожжи'].includes(ing.type) ? (
                                            <select style={{ ...inputStyle, padding: '0.6rem', flex: 1 }} value={ing.name} onChange={(e) => updateIngredient(ing.id, 'name', e.target.value)}>
                                                <option value="" style={{ background: '#1a1a1a' }}>Выбрать...</option>
                                                {dictionary[ing.type === 'Солод' ? 'malt' : ing.type === 'Хмель' ? 'hop' : 'yeast'].map(i => <option key={i.id} value={i.name} style={{ background: '#1a1a1a' }}>{i.name}</option>)}
                                            </select>
                                        ) : (
                                            <input style={{ ...inputStyle, padding: '0.6rem', flex: 1 }} placeholder={ing.type === 'Вода' ? 'Покупная' : 'Название'} value={ing.name} onChange={(e) => updateIngredient(ing.id, 'name', e.target.value)} />
                                        )}
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                            <input type="number" style={{ ...inputStyle, width: '100px', padding: '0.6rem' }} placeholder="Кол-во" value={ing.amount} onChange={(e) => updateIngredient(ing.id, 'amount', parseFloat(e.target.value) || '')} />
                                            <select style={{ ...inputStyle, width: '80px', padding: '0.6rem' }} value={ing.unit} onChange={(e) => updateIngredient(ing.id, 'unit', e.target.value)}>
                                                {['кг', 'г', 'л', 'шт'].map(u => <option key={u} value={u} style={{ background: '#1a1a1a' }}>{u}</option>)}
                                            </select>
                                        </div>
                                        <button onClick={() => removeIngredient(ing.id)} style={{ background: 'none', border: 'none', color: DANGER_RED }}><Trash2 size={18} /></button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </GlassCard>

                    {/* 4. HOPS SCHEDULE */}
                    <GlassCard isMobile={isMobile}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: isMobile ? '1.5rem' : '3rem' }}>
                            <h3 style={{ ...sectionHeaderStyle, marginBottom: 0 }}><Clock size={20} color={BRAND_ORANGE} /> График хмеля</h3>
                            <button onClick={addHop} style={{ background: 'rgba(255,152,0,0.08)', color: BRAND_ORANGE, border: `1px solid ${BRAND_ORANGE}44`, padding: isMobile ? '0.6rem 1rem' : '0.8rem 1.5rem', borderRadius: '12px', fontWeight: '800' }}>+ ХМЕЛЬ</button>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            {recipe.hop_additions.map((hop) => (
                                <div key={hop.id} style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem', paddingBottom: '1rem', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                    <select value={hop.name} onChange={(e) => updateHop(hop.id, 'name', e.target.value)} style={{ ...inputStyle, padding: '0.6rem' }}>
                                        <option value="" style={{ background: '#1a1a1a' }}>Сорт хмеля...</option>
                                        {dictionary.hop.map(h => <option key={h.id} value={h.name} style={{ background: '#1a1a1a' }}>{h.name}</option>)}
                                    </select>
                                    <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                                        <div style={{ position: 'relative', flex: 1 }}><input type="number" style={inputStyle} value={hop.amount} onChange={(e) => updateHop(hop.id, 'amount', parseFloat(e.target.value) || 0)} /><span style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', fontWeight: '800', color: TEXT_MUTED }}>г.</span></div>
                                        <div style={{ position: 'relative', flex: 1.5 }}><input type="number" style={inputStyle} value={hop.time} onChange={(e) => updateHop(hop.id, 'time', parseInt(e.target.value) || 0)} /><span style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', fontWeight: '800', color: TEXT_MUTED }}>мин</span></div>
                                        <button onClick={() => removeHop(hop.id)} style={{ background: 'none', border: 'none', color: DANGER_RED }}><Trash2 size={18} /></button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </GlassCard>

                </div>

                {/* BOTTOM ACTION BAR */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', marginTop: '4rem', padding: isMobile ? '1.5rem' : '2.5rem', background: 'rgba(255, 255, 255, 0.03)', borderRadius: isMobile ? '24px' : '40px', border: '1px solid rgba(255,255,255,0.08)', backdropFilter: 'blur(20px)' }}>
                    <div style={{ display: 'flex', gap: isMobile ? '0.8rem' : '1.5rem' }}>
                        <button onClick={() => handleSave(false)} disabled={saving} style={{ flex: 1, background: 'rgba(255,255,255,0.05)', color: '#fff', border: '1px solid rgba(255,255,255,0.1)', padding: isMobile ? '1.2rem' : '1.4rem', borderRadius: '16px', fontWeight: '800', cursor: 'pointer' }}>СОХРАНИТЬ</button>
                        <motion.button whileTap={{ scale: 0.95 }} onClick={() => handleSave(true)} disabled={saving} style={{ flex: 2, background: BRAND_ORANGE, color: '#000', border: 'none', padding: isMobile ? '1.2rem' : '1.4rem', borderRadius: '16px', fontWeight: '950', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.8rem', boxShadow: `0 0 30px ${BRAND_ORANGE}55` }}>
                            <Play size={isMobile ? 20 : 28} fill="#000" /> {isMobile ? 'ПУСК' : 'НАЧАТЬ ВАРКУ'}
                        </motion.button>
                    </div>
                    <button onClick={() => navigate('/brewing')} style={{ width: '100%', background: 'rgba(244, 67, 54, 0.1)', border: '1px solid rgba(244, 67, 54, 0.2)', color: DANGER_RED, fontWeight: '800', padding: isMobile ? '1rem' : '1.2rem', borderRadius: '16px', fontSize: isMobile ? '0.85rem' : '1rem' }}>ОТМЕНИТЬ</button>
                </div>

                {/* --- ANALYTICS SUMMARY --- */}
                <div style={{ marginTop: '2.5rem' }}>
                    <GlassCard isMobile={isMobile} style={{ padding: isMobile ? '1.5rem' : '2rem', border: `1px solid rgba(255,255,255,0.1)`, background: 'rgba(0,0,0,0.2)' }}>
                        <h3 style={{ ...sectionHeaderStyle, fontSize: '1.2rem', marginBottom: '1.5rem' }}>
                            <Info size={18} color={BRAND_ORANGE} /> Сводка рецепта
                        </h3>
                        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(auto-fit, minmax(150px, 1fr))', gap: '1rem' }}>
                            <StatItem icon={Droplets} label="Всего воды" value={stats.water} unit="л" color="#2196f3" />
                            <StatItem icon={Layers} label="Солод" value={stats.malt} unit="кг" color="#795548" />
                            <StatItem icon={Zap} label="Г/Модуль" value={stats.ratio} unit="л/кг" color="#4caf50" />
                            <StatItem icon={Palette} label="Цвет" value={stats.color} unit="EBC" color="#ffc107" />
                            <StatItem icon={Clock} label="Горькость" value={stats.ibu} unit="IBU" color={DANGER_RED} />
                        </div>

                        {recipe.notes && (
                            <div style={{ marginTop: '1.5rem', padding: '1rem', background: 'rgba(255,255,255,0.02)', borderRadius: '16px', borderLeft: `3px solid ${BRAND_ORANGE}` }}>
                                <div style={labelStyle}>Заметки технолога</div>
                                <div style={{ fontSize: '0.9rem', color: TEXT_MUTED, lineHeight: 1.5 }}>{recipe.notes}</div>
                            </div>
                        )}
                    </GlassCard>
                </div>
            </div>
        </div>
    );
};

export default RecipeConstructor_V2;
