import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Copy, Palette, Box, Info, Star, Sparkles } from 'lucide-react';
import {
    OrangeBrewLogo, CompactLogo, IndustrialLogo, ColumnLogo,
    HardwareLogo, MinimalLogo, BoutiqueLogo, CyberLogo,
    HopChipClassicLogo, HopChipShieldLogo, HopChipNeonLogo,
    HopChipMonogramLogo, HopChipRoundedLogo, HopChipBannerLogo,
    AnimatedHopNeonLogo, BinaryHopLogo
} from '../components/Logos';

const LogoShowcase = () => {
    const navigate = useNavigate();
    const [primaryColor, setPrimaryColor] = useState('#FF9800');
    const [accentColor, setAccentColor] = useState('#4CAF50');
    const [bgType, setBgType] = useState('dark');

    const originalLogos = [
        { id: 'OrangeBrew', name: 'Primary Logo (Full)', component: <OrangeBrewLogo size={250} color={primaryColor} />, desc: 'Main logo with typography' },
        { id: 'Symbol', name: 'Logo Symbol', component: <OrangeBrewLogo size={120} color={primaryColor} showText={false} />, desc: 'Isolated symbol for varied use' },
        { id: 'Compact', name: 'Compact / Icon', component: <CompactLogo size={80} color={primaryColor} />, desc: 'Simplified version for Navbar/Favicon' },
        { id: 'Industrial', name: 'Industrial Badge', component: <IndustrialLogo size={150} color={primaryColor} />, desc: 'Thematic version for hardware sections' },
        { id: 'Hardware', name: 'Hardware / Circuit', component: <HardwareLogo size={120} color={primaryColor} />, desc: 'Tech-focused icon with circuit paths' },
        { id: 'Minimal', name: 'Minimalist Art', component: <MinimalLogo size={120} color={primaryColor} />, desc: 'Clean geometric lines' },
        { id: 'Boutique', name: 'Premium / Boutique', component: <BoutiqueLogo size={120} color={primaryColor} />, desc: 'Elegant, thin-stroke brand mark' },
        { id: 'Cyber', name: 'Cyber / Futuristic', component: <CyberLogo size={120} color={primaryColor} />, desc: 'Angular, high-tech aesthetic' },
        { id: 'Column', name: 'Special: Column', component: <ColumnLogo size={100} color="#03A9F4" />, desc: 'Thematic icon for Distillation pages' }
    ];

    const aiLogos = [
        { id: 'HopChipClassic', name: 'Hop-Chip Classic', component: <HopChipClassicLogo size={150} color={primaryColor} accentColor={accentColor} />, desc: 'Шишка хмеля, из которой растут дорожки PCB. Природа встречает технологию.' },
        { id: 'HopChipShield', name: 'Hop-Chip Shield', component: <HopChipShieldLogo size={150} color={primaryColor} accentColor={accentColor} />, desc: 'Хмель + чип внутри защитного щита. Badge-стиль, подходит для эмблем.' },
        { id: 'HopChipNeon', name: 'Hop-Chip Neon', component: <HopChipNeonLogo size={150} color={primaryColor} accentColor={accentColor} />, desc: 'Неоновый контурный стиль с glow-эффектом. Идеален для тёмных фонов.' },
        { id: 'HopChipMonogram', name: 'Hop-Chip Monogram', component: <HopChipMonogramLogo size={150} color={primaryColor} accentColor={accentColor} />, desc: 'Монограмма «OB» в форме хмеля с ножками микросхемы.' },
        { id: 'HopChipRounded', name: 'Hop-Chip Rounded', component: <HopChipRoundedLogo size={150} color={primaryColor} accentColor={accentColor} />, desc: 'Мягкий, дружелюбный стиль. Плавные кривые PCB-дорожек.' },
        { id: 'HopChipBanner', name: 'Hop-Chip Banner', component: <HopChipBannerLogo size={400} color={primaryColor} accentColor={accentColor} />, desc: 'Горизонтальный фирменный логотип: символ + текст «OrangeBrew».' }
    ];

    const animatedLogos = [
        { id: 'AnimatedHopNeon', name: 'Animated Neon Glow', component: <AnimatedHopNeonLogo size={180} color={primaryColor} accentColor={accentColor} />, desc: 'Ожившая версия: пульсирующее свечение и анимированные дорожки. Идеально для Splash-screen.' },
        { id: 'BinaryHop', name: 'Binary / Digital Hop', component: <BinaryHopLogo size={180} color={primaryColor} accentColor={accentColor} />, desc: 'Хмель, состоящий из бинарного кода. Символ цифровой трансформации классического пивоварения.' }
    ];

    const copyToClipboard = (text) => {
        navigator.clipboard.writeText(text);
    };

    const containerBg = bgType === 'dark' ? '#0a0a0a' : '#f0f0f0';
    const cardBg = bgType === 'dark' ? 'rgba(255,255,255,0.03)' : '#fff';
    const previewBg = bgType === 'dark' ? '#050505' : '#e0e0e0';
    const textColor = bgType === 'dark' ? '#fff' : '#121212';
    const subColor = bgType === 'dark' ? '#888' : '#666';

    const LogoCard = ({ logo, isAI = false }) => (
        <motion.div
            whileHover={{ y: -6, scale: 1.01 }}
            transition={{ type: 'spring', stiffness: 300, damping: 20 }}
            style={{
                padding: '1.5rem',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '1.2rem',
                background: cardBg,
                borderRadius: '16px',
                border: isAI ? `1px solid ${primaryColor}33` : '1px solid rgba(128,128,128,0.1)',
                boxShadow: isAI ? `0 8px 30px ${primaryColor}11` : '0 4px 20px rgba(0,0,0,0.08)',
                position: 'relative',
                overflow: 'hidden'
            }}
        >
            {isAI && (
                <div style={{
                    position: 'absolute', top: '12px', right: '12px',
                    background: `linear-gradient(135deg, ${primaryColor}, #F57C00)`,
                    color: '#000', fontWeight: 800, fontSize: '0.6rem',
                    padding: '0.25rem 0.6rem', borderRadius: '20px',
                    display: 'flex', alignItems: 'center', gap: '0.3rem',
                    letterSpacing: '0.5px', textTransform: 'uppercase',
                    boxShadow: `0 2px 8px ${primaryColor}55`
                }}>
                    <Sparkles size={10} /> AI Design
                </div>
            )}
            <div style={{
                padding: '1.5rem',
                background: previewBg,
                borderRadius: '12px',
                width: '100%',
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                minHeight: '200px',
                border: '1px solid rgba(128,128,128,0.05)',
                overflow: 'hidden'
            }}>
                {logo.component}
            </div>

            <div style={{ width: '100%' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                    <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>{logo.name}</h3>
                    <span style={{ fontSize: '0.55rem', padding: '0.2rem 0.5rem', background: 'rgba(128,128,128,0.1)', borderRadius: '10px', color: subColor }}>SVG</span>
                </div>
                <p style={{ margin: '0 0 1rem 0', color: subColor, fontSize: '0.8rem', lineHeight: 1.5 }}>{logo.desc}</p>

                <button
                    onClick={() => {
                        const code = isAI
                            ? `<${logo.id}Logo color="${primaryColor}" accentColor="${accentColor}" size={150} />`
                            : `<${logo.id}Logo color="${primaryColor}" size={120} />`;
                        copyToClipboard(code);
                    }}
                    style={{
                        width: '100%',
                        padding: '0.7rem',
                        background: isAI ? `linear-gradient(135deg, ${primaryColor}, #F57C00)` : primaryColor,
                        border: 'none',
                        color: '#000',
                        borderRadius: '8px',
                        fontSize: '0.85rem',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '0.5rem',
                        cursor: 'pointer',
                        fontWeight: 700,
                        boxShadow: `0 4px 12px ${primaryColor}33`
                    }}
                >
                    <Copy size={14} /> Copy Code
                </button>
            </div>
        </motion.div>
    );

    return (
        <div style={{
            padding: '2rem',
            maxWidth: '1400px',
            margin: '0 auto',
            color: textColor,
            backgroundColor: containerBg,
            minHeight: '100vh',
            transition: 'all 0.4s ease'
        }}>
            <header style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', marginBottom: '3rem' }}>
                <button
                    onClick={() => navigate('/')}
                    style={{ background: 'none', border: '1px solid #444', color: textColor, padding: '0.6rem', borderRadius: '8px', cursor: 'pointer' }}
                >
                    <ArrowLeft size={20} />
                </button>
                <div>
                    <h1 style={{ margin: 0, fontSize: '2.4rem', fontWeight: 800, color: primaryColor }}>Brand Library</h1>
                    <p style={{ margin: '0.3rem 0 0', color: subColor }}>OrangeBrew Visual Identity System — {originalLogos.length + aiLogos.length + animatedLogos.length} assets</p>
                </div>
            </header>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: '2rem' }}>
                <div>
                    {/* ★ AI SECTION */}
                    <div style={{ marginBottom: '3rem' }}>
                        <div style={{
                            display: 'flex', alignItems: 'center', gap: '0.8rem', marginBottom: '1.5rem',
                            paddingBottom: '0.8rem', borderBottom: `2px solid ${primaryColor}33`
                        }}>
                            <Sparkles size={22} color={primaryColor} />
                            <h2 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 800 }}>
                                ★ AI Designs — Hop × Chip
                            </h2>
                            <span style={{
                                fontSize: '0.65rem', padding: '0.2rem 0.6rem',
                                background: `${primaryColor}22`, color: primaryColor,
                                borderRadius: '10px', fontWeight: 700
                            }}>
                                NEW
                            </span>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1.5rem' }}>
                            {aiLogos.map((logo) => <LogoCard key={logo.id} logo={logo} isAI={true} />)}
                        </div>
                    </div>

                    {/* ★ ANIMATED SECTION */}
                    <div style={{ marginBottom: '3rem' }}>
                        <div style={{
                            display: 'flex', alignItems: 'center', gap: '0.8rem', marginBottom: '1.5rem',
                            paddingBottom: '0.8rem', borderBottom: `2px solid #00E5FF33`
                        }}>
                            <Sparkles size={22} color="#00E5FF" />
                            <h2 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 800 }}>
                                ★ Animated & Neon
                            </h2>
                            <span style={{
                                fontSize: '0.65rem', padding: '0.2rem 0.6rem',
                                background: '#00E5FF22', color: '#00E5FF',
                                borderRadius: '10px', fontWeight: 700
                            }}>
                                MOTION
                            </span>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1.5rem' }}>
                            {animatedLogos.map((logo) => <LogoCard key={logo.id} logo={logo} isAI={true} />)}
                        </div>
                    </div>

                    {/* ORIGINAL SECTION */}
                    <div>
                        <div style={{
                            display: 'flex', alignItems: 'center', gap: '0.8rem', marginBottom: '1.5rem',
                            paddingBottom: '0.8rem', borderBottom: '2px solid rgba(128,128,128,0.15)'
                        }}>
                            <Box size={20} color={subColor} />
                            <h2 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 800, color: subColor }}>
                                Base Collection
                            </h2>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1.5rem' }}>
                            {originalLogos.map((logo) => <LogoCard key={logo.id} logo={logo} isAI={false} />)}
                        </div>
                    </div>
                </div>

                {/* Sidebar Controls */}
                <aside style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', position: 'sticky', top: '2rem', height: 'fit-content' }}>
                    <div style={{ padding: '1.5rem', background: cardBg, borderRadius: '16px', border: '1px solid rgba(128,128,128,0.1)' }}>
                        <h4 style={{ margin: '0 0 1.2rem 0', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1rem' }}>
                            <Palette size={18} color={primaryColor} /> Theme Controls
                        </h4>

                        <div style={{ marginBottom: '1.2rem' }}>
                            <label style={{ fontSize: '0.7rem', color: subColor, display: 'block', marginBottom: '0.4rem', letterSpacing: '1px' }}>PRIMARY COLOR</label>
                            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                                <input
                                    type="color" value={primaryColor}
                                    onChange={(e) => setPrimaryColor(e.target.value)}
                                    style={{ width: '42px', height: '36px', border: 'none', padding: 0, background: 'none', cursor: 'pointer' }}
                                />
                                <input
                                    type="text" value={primaryColor.toUpperCase()}
                                    onChange={(e) => setPrimaryColor(e.target.value)}
                                    style={{ flex: 1, padding: '0.5rem', background: 'rgba(128,128,128,0.1)', border: '1px solid rgba(128,128,128,0.2)', color: textColor, borderRadius: '6px', fontFamily: 'monospace', fontSize: '0.85rem' }}
                                />
                            </div>
                        </div>

                        <div style={{ marginBottom: '1.2rem' }}>
                            <label style={{ fontSize: '0.7rem', color: subColor, display: 'block', marginBottom: '0.4rem', letterSpacing: '1px' }}>HOP / ACCENT COLOR</label>
                            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                                <input
                                    type="color" value={accentColor}
                                    onChange={(e) => setAccentColor(e.target.value)}
                                    style={{ width: '42px', height: '36px', border: 'none', padding: 0, background: 'none', cursor: 'pointer' }}
                                />
                                <input
                                    type="text" value={accentColor.toUpperCase()}
                                    onChange={(e) => setAccentColor(e.target.value)}
                                    style={{ flex: 1, padding: '0.5rem', background: 'rgba(128,128,128,0.1)', border: '1px solid rgba(128,128,128,0.2)', color: textColor, borderRadius: '6px', fontFamily: 'monospace', fontSize: '0.85rem' }}
                                />
                            </div>
                        </div>

                        <div>
                            <label style={{ fontSize: '0.7rem', color: subColor, display: 'block', marginBottom: '0.4rem', letterSpacing: '1px' }}>BACKGROUND</label>
                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                                {['dark', 'light'].map(t => (
                                    <button
                                        key={t}
                                        onClick={() => setBgType(t)}
                                        style={{
                                            flex: 1, padding: '0.6rem', borderRadius: '6px', cursor: 'pointer',
                                            background: bgType === t ? primaryColor : 'rgba(128,128,128,0.1)',
                                            border: 'none', color: bgType === t ? '#000' : textColor, fontWeight: 700, fontSize: '0.85rem', textTransform: 'capitalize'
                                        }}
                                    >{t}</button>
                                ))}
                            </div>
                        </div>
                    </div>

                    <div style={{ padding: '1.5rem', background: cardBg, borderRadius: '16px', border: '1px solid rgba(128,128,128,0.1)', fontSize: '0.85rem', color: subColor }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', marginBottom: '0.8rem' }}>
                            <Info size={18} color={primaryColor} />
                            <h4 style={{ margin: 0, color: textColor, fontSize: '0.95rem' }}>Import</h4>
                        </div>
                        <div style={{ padding: '0.7rem', background: 'rgba(128,128,128,0.05)', borderRadius: '8px', borderLeft: `3px solid ${primaryColor}`, marginBottom: '0.8rem' }}>
                            <code style={{ fontSize: '0.7rem', lineHeight: 1.6 }}>
                                <span style={{ color: '#569cd6' }}>import</span>{' { '}
                                <span style={{ color: primaryColor }}>HopChipClassicLogo</span>
                                {' } '}
                                <span style={{ color: '#569cd6' }}>from</span>{' '}
                                <span style={{ color: '#ce9178' }}>'../components/Logos'</span>;
                            </code>
                        </div>
                        <p style={{ lineHeight: 1.5, fontSize: '0.8rem' }}>
                            Все AI логотипы принимают дополнительный пропс <code style={{ color: primaryColor }}>accentColor</code> для настройки цвета хмеля.
                        </p>
                    </div>
                </aside>
            </div>
        </div>
    );
};

export default LogoShowcase;
