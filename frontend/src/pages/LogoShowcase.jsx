import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Copy, Palette, Box, Info } from 'lucide-react';
import {
    OrangeBrewLogo, CompactLogo, IndustrialLogo, ColumnLogo,
    HardwareLogo, MinimalLogo, BoutiqueLogo, CyberLogo
} from '../components/Logos';

const LogoShowcase = () => {
    const navigate = useNavigate();
    const [primaryColor, setPrimaryColor] = useState('#FF9800');
    const [bgType, setBgType] = useState('dark');

    const logos = [
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

    const copyToClipboard = (text) => {
        navigator.clipboard.writeText(text);
        alert('Component code copied!');
    };

    const containerBg = bgType === 'dark' ? '#121212' : '#f5f5f5';
    const cardBg = bgType === 'dark' ? 'rgba(255,255,255,0.02)' : '#fff';
    const textColor = bgType === 'dark' ? '#fff' : '#121212';

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
                    <p style={{ margin: 0, color: '#888' }}>OrangeBrew Visual Identity System & Design Tokens</p>
                </div>
            </header>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: '2rem' }}>
                {/* Showcase Grid */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1.5rem' }}>
                    {logos.map((logo) => (
                        <motion.div
                            key={logo.id}
                            whileHover={{ y: -8, scale: 1.02 }}
                            style={{
                                padding: '1.5rem',
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                gap: '1.5rem',
                                background: cardBg,
                                borderRadius: '16px',
                                border: '1px solid rgba(128,128,128,0.1)',
                                boxShadow: '0 10px 30px rgba(0,0,0,0.1)'
                            }}
                        >
                            <div style={{
                                padding: '1.5rem',
                                background: bgType === 'dark' ? '#0a0a0a' : '#ececec',
                                borderRadius: '12px',
                                width: '100%',
                                display: 'flex',
                                justifyContent: 'center',
                                alignItems: 'center',
                                minHeight: '200px',
                                border: '1px solid rgba(255,255,255,0.05)',
                                overflow: 'hidden'
                            }}>
                                {logo.component}
                            </div>

                            <div style={{ width: '100%' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                                    <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700 }}>{logo.name}</h3>
                                    <span style={{ fontSize: '0.6rem', padding: '0.2rem 0.5rem', background: 'rgba(128,128,128,0.1)', borderRadius: '10px' }}>SVG</span>
                                </div>
                                <p style={{ margin: '0 0 1.2rem 0', color: '#888', fontSize: '0.85rem', lineHeight: 1.4 }}>{logo.desc}</p>

                                <button
                                    onClick={() => copyToClipboard(`<${logo.id}Logo color="${primaryColor}" size={120} />`)}
                                    style={{
                                        width: '100%',
                                        padding: '0.8rem',
                                        background: primaryColor,
                                        border: 'none',
                                        color: '#000',
                                        borderRadius: '8px',
                                        fontSize: '0.9rem',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        gap: '0.5rem',
                                        cursor: 'pointer',
                                        fontWeight: 700,
                                        boxShadow: `0 4px 15px ${primaryColor}44`
                                    }}
                                >
                                    <Copy size={16} /> Copy Code
                                </button>
                            </div>
                        </motion.div>
                    ))}
                </div>

                {/* Sidebar Controls */}
                <aside style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', position: 'sticky', top: '2rem', height: 'fit-content' }}>
                    <div style={{ padding: '1.5rem', background: cardBg, borderRadius: '16px', border: '1px solid rgba(128,128,128,0.1)' }}>
                        <h4 style={{ margin: '0 0 1.2rem 0', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1rem' }}>
                            <Palette size={18} color={primaryColor} /> Global Theme
                        </h4>

                        <div style={{ marginBottom: '1.5rem' }}>
                            <label style={{ fontSize: '0.75rem', color: '#888', display: 'block', marginBottom: '0.5rem' }}>BRAND COLOR</label>
                            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                                <input
                                    type="color"
                                    value={primaryColor}
                                    onChange={(e) => setPrimaryColor(e.target.value)}
                                    style={{ width: '50px', height: '40px', border: 'none', padding: 0, background: 'none', cursor: 'pointer' }}
                                />
                                <input
                                    type="text"
                                    value={primaryColor.toUpperCase()}
                                    onChange={(e) => setPrimaryColor(e.target.value)}
                                    style={{
                                        flex: 1,
                                        padding: '0.6rem',
                                        background: 'rgba(128,128,128,0.1)',
                                        border: '1px solid rgba(128,128,128,0.2)',
                                        color: textColor,
                                        borderRadius: '6px',
                                        fontFamily: 'monospace',
                                        fontSize: '0.9rem'
                                    }}
                                />
                            </div>
                        </div>

                        <div>
                            <label style={{ fontSize: '0.75rem', color: '#888', display: 'block', marginBottom: '0.5rem' }}>BACKGROUND MODE</label>
                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                                <button
                                    onClick={() => setBgType('dark')}
                                    style={{
                                        flex: 1, padding: '0.6rem', borderRadius: '6px', cursor: 'pointer',
                                        background: bgType === 'dark' ? primaryColor : 'rgba(128,128,128,0.1)',
                                        border: 'none', color: bgType === 'dark' ? '#000' : textColor, fontWeight: 700
                                    }}
                                >Dark</button>
                                <button
                                    onClick={() => setBgType('light')}
                                    style={{
                                        flex: 1, padding: '0.6rem', borderRadius: '6px', cursor: 'pointer',
                                        background: bgType === 'light' ? primaryColor : 'rgba(128,128,128,0.1)',
                                        border: 'none', color: bgType === 'light' ? '#000' : textColor, fontWeight: 700
                                    }}
                                >Light</button>
                            </div>
                        </div>
                    </div>

                    <div style={{ padding: '1.5rem', background: cardBg, borderRadius: '16px', border: '1px solid rgba(128,128,128,0.1)', fontSize: '0.85rem', color: '#888' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', marginBottom: '1rem', color: primaryColor }}>
                            <Box size={24} />
                            <h4 style={{ margin: 0, color: textColor }}>Usage Guide</h4>
                        </div>
                        <p style={{ lineHeight: 1.6 }}>These components are fully reactive. You can pass <code>size</code> and <code>color</code> as props to customize them on the fly.</p>
                        <div style={{ marginTop: '1rem', padding: '0.8rem', background: 'rgba(128,128,128,0.05)', borderRadius: '8px', borderLeft: `3px solid ${primaryColor}` }}>
                            <code style={{ fontSize: '0.75rem' }}><span style={{ color: '#569cd6' }}>import</span> {'{'} CyberLogo {'}'} <span style={{ color: '#569cd6' }}>from</span> <span style={{ color: '#ce9178' }}>'../components/Logos'</span>;</code>
                        </div>
                    </div>

                    <div style={{ padding: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#555', fontSize: '0.75rem' }}>
                        <Info size={14} />
                        <span>Vector assets v1.2</span>
                    </div>
                </aside>
            </div>
        </div>
    );
};

export default LogoShowcase;
