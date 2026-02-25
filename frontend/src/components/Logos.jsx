import React from 'react';

// ═══════════════════════════════════════════════════════════════
//  EXISTING LOGOS (original set)
// ═══════════════════════════════════════════════════════════════

/**
 * Основной логотип OrangeBrew: стилизованный апельсин, переходящий в варочный котел.
 */
export const OrangeBrewLogo = ({ size = 200, color = '#FF9800', showText = true, ...props }) => (
    <svg width={size} height={showText ? size * 0.4 : size} viewBox={showText ? "0 0 500 200" : "0 0 200 200"} fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
        <defs>
            <linearGradient id="orangeGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor={color} />
                <stop offset="100%" stopColor="#F57C00" />
            </linearGradient>
        </defs>
        <g transform="translate(10, 10)">
            <path d="M100 20C55.8 20 20 55.8 20 100C20 144.2 55.8 180 100 180C144.2 180 180 144.2 180 100" stroke="url(#orangeGradient)" strokeWidth="12" strokeLinecap="round" />
            <path d="M80 20V10H120V20" stroke="url(#orangeGradient)" strokeWidth="12" strokeLinecap="round" />
            <circle cx="70" cy="100" r="10" fill="url(#orangeGradient)" opacity="0.6" />
            <circle cx="100" cy="130" r="15" fill="url(#orangeGradient)" />
            <circle cx="130" cy="90" r="8" fill="url(#orangeGradient)" opacity="0.4" />
            <path d="M120 10C120 10 140 10 150 30C150 30 130 40 120 30L120 10Z" fill="#4CAF50" />
        </g>
        {showText && (
            <g transform="translate(210, 115)">
                <text fontFamily="sans-serif" fontSize="72" fontWeight="800" fill="white" style={{ letterSpacing: '-2px' }}>
                    Orange<tspan fill={color}>Brew</tspan>
                </text>
                <text fontFamily="sans-serif" fontSize="14" fontWeight="400" fill="#888" x="2" y="30" style={{ letterSpacing: '8px', textTransform: 'uppercase' }}>
                    Smart Systems
                </text>
            </g>
        )}
    </svg>
);

export const CompactLogo = ({ size = 48, color = '#FF9800', ...props }) => (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
        <path d="M85 50C85 69.33 69.33 85 50 85C30.67 85 15 69.33 15 50C15 30.67 30.67 15 50 15" stroke={color} strokeWidth="8" strokeLinecap="round" />
        <path d="M40 15V10H60V15" stroke={color} strokeWidth="8" strokeLinecap="round" />
        <circle cx="50" cy="55" r="12" fill={color} />
        <path d="M60 10C60 10 70 10 75 20C75 20 65 25 60 20V10Z" fill="#4CAF50" />
    </svg>
);

export const IndustrialLogo = ({ size = 150, color = '#FF9800', ...props }) => (
    <svg width={size} height={size} viewBox="0 0 200 200" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
        <path d="M100 10L110 30H125L145 20L155 35L140 50V65L160 75L160 90L140 100V115L155 130L145 145L125 135H110L100 155L85 155L75 135H60L40 145L30 130L45 115V100L25 90L25 75L45 65V50L30 35L40 20L60 30H75L85 10L100 10Z" stroke="#444" strokeWidth="4" />
        <g transform="scale(0.6) translate(66, 66)">
            <CompactLogo size={200} color={color} />
        </g>
    </svg>
);

export const ColumnLogo = ({ size = 150, color = '#03A9F4', ...props }) => (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
        <rect x="35" y="10" width="30" height="80" rx="4" stroke={color} strokeWidth="4" />
        <path d="M35 30H65M35 50H65M35 70H65" stroke={color} strokeWidth="2" strokeDasharray="4 2" />
        <circle cx="50" cy="20" r="3" fill={color} />
        <path d="M65 15C75 15 85 25 85 35V60" stroke={color} strokeWidth="3" strokeLinecap="round" />
    </svg>
);

export const HardwareLogo = ({ size = 150, color = '#FF9800', ...props }) => (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
        <rect x="25" y="25" width="50" height="50" rx="2" stroke={color} strokeWidth="4" />
        <path d="M40 40H60V60H40V40Z" fill={color} opacity="0.3" />
        <path d="M50 25V10M50 75V90M25 50H10M75 50H90" stroke={color} strokeWidth="4" strokeLinecap="round" />
        <circle cx="50" cy="50" r="10" stroke={color} strokeWidth="2" />
        <circle cx="50" cy="10" r="4" fill={color} />
        <circle cx="50" cy="90" r="4" fill={color} />
        <circle cx="10" cy="50" r="4" fill={color} />
        <circle cx="90" cy="50" r="4" fill={color} />
    </svg>
);

export const MinimalLogo = ({ size = 150, color = '#FF9800', ...props }) => (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
        <path d="M50 20L80 70H20L50 20Z" stroke={color} strokeWidth="6" strokeLinejoin="round" />
        <circle cx="50" cy="55" r="8" fill={color} />
        <path d="M40 70V85M60 70V85" stroke={color} strokeWidth="4" strokeLinecap="round" />
    </svg>
);

export const BoutiqueLogo = ({ size = 150, color = '#FF9800', ...props }) => (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
        <circle cx="50" cy="50" r="40" stroke={color} strokeWidth="1" />
        <circle cx="50" cy="50" r="35" stroke={color} strokeWidth="0.5" opacity="0.5" />
        <path d="M50 10V90M10 50H90" stroke={color} strokeWidth="0.5" opacity="0.3" />
        <text x="50" y="55" fontFamily="serif" fontSize="24" fill={color} textAnchor="middle" fontWeight="300">OB</text>
        <path d="M30 30L70 70M70 30L30 70" stroke={color} strokeWidth="0.5" opacity="0.3" />
    </svg>
);

export const CyberLogo = ({ size = 150, color = '#FF9800', ...props }) => (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
        <path d="M20 20H80L90 35V80H10V35L20 20Z" stroke={color} strokeWidth="4" />
        <path d="M35 20V10M65 20V10" stroke={color} strokeWidth="4" />
        <rect x="30" y="45" width="40" height="20" fill={color} opacity="0.2" />
        <path d="M10 50H25M75 50H90" stroke={color} strokeWidth="2" />
        <circle cx="50" cy="55" r="5" fill={color} />
    </svg>
);


// ═══════════════════════════════════════════════════════════════
//  ★ AI LOGOS — Hop + Microchip concept variations
//  Created by Antigravity AI 
// ═══════════════════════════════════════════════════════════════

/**
 * ★ AI — Hop-Chip Classic
 * Шишка хмеля, из которой растут дорожки печатной платы.
 * Главная идея: природа встречает технологию.
 */
export const HopChipClassicLogo = ({ size = 150, color = '#FF9800', accentColor = '#4CAF50', ...props }) => (
    <svg width={size} height={size} viewBox="0 0 200 200" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
        <defs>
            <linearGradient id="hcClassicGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor={accentColor} />
                <stop offset="100%" stopColor={color} />
            </linearGradient>
        </defs>
        {/* Шишка хмеля — три перекрывающихся лепестка */}
        <ellipse cx="100" cy="75" rx="28" ry="22" fill={accentColor} opacity="0.9" />
        <ellipse cx="85" cy="95" rx="25" ry="20" fill={accentColor} opacity="0.7" />
        <ellipse cx="115" cy="95" rx="25" ry="20" fill={accentColor} opacity="0.7" />
        <ellipse cx="100" cy="112" rx="22" ry="18" fill={accentColor} opacity="0.5" />
        {/* Стебель */}
        <path d="M100 58V30" stroke={accentColor} strokeWidth="4" strokeLinecap="round" />
        <path d="M100 30C100 30 85 20 80 10" stroke={accentColor} strokeWidth="3" strokeLinecap="round" />
        <path d="M100 30C100 30 115 20 120 10" stroke={accentColor} strokeWidth="3" strokeLinecap="round" />
        {/* Дорожки микросхемы — идут от хмеля вниз */}
        <path d="M80 120V150H60V175" stroke={color} strokeWidth="3" strokeLinecap="round" />
        <path d="M100 130V180" stroke={color} strokeWidth="3" strokeLinecap="round" />
        <path d="M120 120V155H140V175" stroke={color} strokeWidth="3" strokeLinecap="round" />
        {/* Точки-контакты */}
        <circle cx="60" cy="178" r="4" fill={color} />
        <circle cx="100" cy="183" r="4" fill={color} />
        <circle cx="140" cy="178" r="4" fill={color} />
        {/* Горизонтальные перемычки */}
        <path d="M70 140H130" stroke={color} strokeWidth="1.5" opacity="0.4" />
        <path d="M65 160H135" stroke={color} strokeWidth="1.5" opacity="0.3" />
    </svg>
);

/**
 * ★ AI — Hop-Chip Shield
 * Хмель и микросхема внутри защитного щита (badge-стиль).
 */
export const HopChipShieldLogo = ({ size = 150, color = '#FF9800', accentColor = '#4CAF50', ...props }) => (
    <svg width={size} height={size} viewBox="0 0 200 200" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
        <defs>
            <linearGradient id="hcShieldGrad" x1="50%" y1="0%" x2="50%" y2="100%">
                <stop offset="0%" stopColor={color} stopOpacity="0.2" />
                <stop offset="100%" stopColor={color} stopOpacity="0.05" />
            </linearGradient>
        </defs>
        {/* Щит */}
        <path d="M100 10L175 40V110C175 150 140 180 100 195C60 180 25 150 25 110V40L100 10Z" fill="url(#hcShieldGrad)" stroke={color} strokeWidth="3" />
        {/* Шишка хмеля (мини) */}
        <ellipse cx="100" cy="70" rx="18" ry="14" fill={accentColor} opacity="0.85" />
        <ellipse cx="90" cy="82" rx="15" ry="12" fill={accentColor} opacity="0.65" />
        <ellipse cx="110" cy="82" rx="15" ry="12" fill={accentColor} opacity="0.65" />
        <ellipse cx="100" cy="93" rx="13" ry="10" fill={accentColor} opacity="0.45" />
        {/* Стебель */}
        <path d="M100 56V42" stroke={accentColor} strokeWidth="3" strokeLinecap="round" />
        <path d="M100 42L90 32M100 42L110 32" stroke={accentColor} strokeWidth="2" strokeLinecap="round" />
        {/* Дорожки */}
        <path d="M85 100V125H70" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
        <path d="M100 103V145" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
        <path d="M115 100V125H130" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
        {/* Контакты */}
        <circle cx="70" cy="125" r="3.5" fill={color} />
        <circle cx="100" cy="148" r="3.5" fill={color} />
        <circle cx="130" cy="125" r="3.5" fill={color} />
        {/* Боковые ножки чипа */}
        <path d="M25 65H45M25 85H45M155 65H175M155 85H175" stroke={color} strokeWidth="2" opacity="0.4" />
    </svg>
);

/**
 * ★ AI — Hop-Chip Neon
 * Неоновый стиль: контурный хмель с электронными элементами, свечение.
 */
export const HopChipNeonLogo = ({ size = 150, color = '#FF9800', accentColor = '#4CAF50', ...props }) => (
    <svg width={size} height={size} viewBox="0 0 200 200" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
        <defs>
            <filter id="neonGlow">
                <feGaussianBlur stdDeviation="4" result="blur" />
                <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                </feMerge>
            </filter>
        </defs>
        <g filter="url(#neonGlow)">
            {/* Контурная шишка хмеля */}
            <ellipse cx="100" cy="70" rx="30" ry="24" stroke={accentColor} strokeWidth="2" fill="none" />
            <ellipse cx="82" cy="92" rx="26" ry="21" stroke={accentColor} strokeWidth="2" fill="none" />
            <ellipse cx="118" cy="92" rx="26" ry="21" stroke={accentColor} strokeWidth="2" fill="none" />
            <ellipse cx="100" cy="110" rx="24" ry="19" stroke={accentColor} strokeWidth="2" fill="none" />
            {/* Стебель с «электрическим» стилем */}
            <path d="M100 46V22L92 10M100 22L108 10" stroke={accentColor} strokeWidth="2.5" strokeLinecap="round" />
            {/* Центральный чип */}
            <rect x="88" y="82" width="24" height="24" rx="3" stroke={color} strokeWidth="2.5" />
            <rect x="94" y="88" width="12" height="12" rx="1" fill={color} opacity="0.4" />
            {/* Дорожки от чипа */}
            <path d="M88 88H65M88 94H55M88 100H65" stroke={color} strokeWidth="1.5" />
            <path d="M112 88H135M112 94H145M112 100H135" stroke={color} strokeWidth="1.5" />
            <path d="M94 106V130M100 106V140M106 106V130" stroke={color} strokeWidth="1.5" />
            <path d="M94 82V65M100 82V58M106 82V65" stroke={color} strokeWidth="1.5" opacity="0.5" />
            {/* Точки-контакты (с эффектом свечения) */}
            <circle cx="55" cy="94" r="3" fill={color} />
            <circle cx="145" cy="94" r="3" fill={color} />
            <circle cx="100" cy="143" r="3" fill={color} />
            {/* Декоративные полукруги */}
            <path d="M30 165A70 70 0 0 1 170 165" stroke={color} strokeWidth="1" opacity="0.2" />
            <path d="M40 175A60 60 0 0 1 160 175" stroke={color} strokeWidth="1" opacity="0.15" />
        </g>
    </svg>
);

/**
 * ★ AI — Hop-Chip Monogram
 * Стильная монограмма «OB» вписанная в форму хмеля с контурами платы.
 */
export const HopChipMonogramLogo = ({ size = 150, color = '#FF9800', accentColor = '#4CAF50', ...props }) => (
    <svg width={size} height={size} viewBox="0 0 200 200" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
        {/* Внешний контур — лепесток хмеля */}
        <path d="M100 15C60 15 30 55 30 100C30 145 60 185 100 185C140 185 170 145 170 100C170 55 140 15 100 15Z" stroke={accentColor} strokeWidth="2" opacity="0.4" />
        {/* Внутренний контур — форма чипа */}
        <rect x="50" y="50" width="100" height="100" rx="8" stroke={color} strokeWidth="2" opacity="0.5" />
        {/* Монограмма */}
        <text x="100" y="115" fontFamily="sans-serif" fontSize="52" fontWeight="900" fill={color} textAnchor="middle" style={{ letterSpacing: '-3px' }}>OB</text>
        {/* Стебель хмеля */}
        <path d="M100 15V5" stroke={accentColor} strokeWidth="3" strokeLinecap="round" />
        <path d="M93 12L82 3M107 12L118 3" stroke={accentColor} strokeWidth="2" strokeLinecap="round" />
        {/* Ножки чипа со всех сторон */}
        <path d="M70 50V35M85 50V38M115 50V38M130 50V35" stroke={color} strokeWidth="2" strokeLinecap="round" opacity="0.6" />
        <path d="M70 150V165M85 150V162M115 150V162M130 150V165" stroke={color} strokeWidth="2" strokeLinecap="round" opacity="0.6" />
        <path d="M50 70H35M50 85H38M50 115H38M50 130H35" stroke={color} strokeWidth="2" strokeLinecap="round" opacity="0.6" />
        <path d="M150 70H165M150 85H162M150 115H162M150 130H165" stroke={color} strokeWidth="2" strokeLinecap="round" opacity="0.6" />
        {/* Маленькие точки контактов */}
        <circle cx="70" cy="33" r="2" fill={color} opacity="0.6" />
        <circle cx="130" cy="33" r="2" fill={color} opacity="0.6" />
        <circle cx="70" cy="167" r="2" fill={color} opacity="0.6" />
        <circle cx="130" cy="167" r="2" fill={color} opacity="0.6" />
        <circle cx="33" cy="70" r="2" fill={color} opacity="0.6" />
        <circle cx="167" cy="70" r="2" fill={color} opacity="0.6" />
        <circle cx="33" cy="130" r="2" fill={color} opacity="0.6" />
        <circle cx="167" cy="130" r="2" fill={color} opacity="0.6" />
    </svg>
);

/**
 * ★ AI — Hop-Chip Rounded (Мягкий/Friendly)
 * Скруглённая мягкая версия — хмель с округлыми дорожками, как логотип стартапа.
 */
export const HopChipRoundedLogo = ({ size = 150, color = '#FF9800', accentColor = '#4CAF50', ...props }) => (
    <svg width={size} height={size} viewBox="0 0 200 200" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
        <defs>
            <linearGradient id="hcRoundedGrad" x1="50%" y1="0%" x2="50%" y2="100%">
                <stop offset="0%" stopColor={accentColor} />
                <stop offset="60%" stopColor={color} />
            </linearGradient>
        </defs>
        {/* Фоновый круг */}
        <circle cx="100" cy="100" r="85" fill="none" stroke={color} strokeWidth="1.5" opacity="0.15" />
        {/* Хмель — мягкие формы */}
        <path d="M100 40C85 40 72 55 72 72C72 88 85 95 100 95C115 95 128 88 128 72C128 55 115 40 100 40Z" fill={accentColor} opacity="0.8" />
        <path d="M72 78C60 82 52 96 56 110C60 124 75 128 85 124" fill={accentColor} opacity="0.55" />
        <path d="M128 78C140 82 148 96 144 110C140 124 125 128 115 124" fill={accentColor} opacity="0.55" />
        <path d="M85 124C90 135 95 140 100 142C105 140 110 135 115 124C108 130 92 130 85 124Z" fill={accentColor} opacity="0.35" />
        {/* Стебель */}
        <path d="M100 40V20" stroke={accentColor} strokeWidth="4" strokeLinecap="round" />
        <path d="M100 25Q88 18 80 10" stroke={accentColor} strokeWidth="3" strokeLinecap="round" fill="none" />
        <path d="M100 25Q112 18 120 10" stroke={accentColor} strokeWidth="3" strokeLinecap="round" fill="none" />
        {/* Печатная плата — мягкие кривые */}
        <path d="M82 130Q82 150 65 160Q55 165 50 175" stroke={color} strokeWidth="3" strokeLinecap="round" fill="none" />
        <path d="M100 142Q100 165 100 185" stroke={color} strokeWidth="3" strokeLinecap="round" fill="none" />
        <path d="M118 130Q118 150 135 160Q145 165 150 175" stroke={color} strokeWidth="3" strokeLinecap="round" fill="none" />
        {/* Контакты-точки */}
        <circle cx="48" cy="178" r="5" fill={color} opacity="0.9" />
        <circle cx="100" cy="188" r="5" fill={color} opacity="0.9" />
        <circle cx="152" cy="178" r="5" fill={color} opacity="0.9" />
        {/* Боковые дорожки */}
        <path d="M65 95Q45 95 30 100" stroke={color} strokeWidth="2" strokeLinecap="round" opacity="0.4" />
        <path d="M135 95Q155 95 170 100" stroke={color} strokeWidth="2" strokeLinecap="round" opacity="0.4" />
        <circle cx="27" cy="100" r="3" fill={color} opacity="0.4" />
        <circle cx="173" cy="100" r="3" fill={color} opacity="0.4" />
    </svg>
);

/**
 * ★ AI — Hop-Chip Full Banner (горизонтальный логотип с текстом)
 * Полноценный фирменный логотип: хмель-чип слева, текст справа
 */
export const HopChipBannerLogo = ({ size = 250, color = '#FF9800', accentColor = '#4CAF50', ...props }) => (
    <svg width={size} height={size * 0.4} viewBox="0 0 500 200" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
        <defs>
            <linearGradient id="hcBannerGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor={accentColor} />
                <stop offset="100%" stopColor={color} />
            </linearGradient>
        </defs>
        {/* Символ: Хмель-чип */}
        <g transform="translate(15, 15) scale(0.85)">
            <ellipse cx="100" cy="65" rx="28" ry="22" fill={accentColor} opacity="0.9" />
            <ellipse cx="83" cy="85" rx="24" ry="19" fill={accentColor} opacity="0.65" />
            <ellipse cx="117" cy="85" rx="24" ry="19" fill={accentColor} opacity="0.65" />
            <ellipse cx="100" cy="102" rx="20" ry="16" fill={accentColor} opacity="0.45" />
            <path d="M100 43V25L90 12M100 25L110 12" stroke={accentColor} strokeWidth="3" strokeLinecap="round" />
            {/* Центральный чип */}
            <rect x="88" y="76" width="24" height="24" rx="2" stroke={color} strokeWidth="2" />
            <rect x="93" y="81" width="14" height="14" rx="1" fill={color} opacity="0.35" />
            {/* Дорожки */}
            <path d="M80 115V140H65" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
            <path d="M100 118V155" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
            <path d="M120 115V140H135" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
            <circle cx="65" cy="140" r="3.5" fill={color} />
            <circle cx="100" cy="158" r="3.5" fill={color} />
            <circle cx="135" cy="140" r="3.5" fill={color} />
        </g>
        {/* Текст */}
        <g transform="translate(200, 105)">
            <text fontFamily="sans-serif" fontSize="68" fontWeight="900" fill="white" style={{ letterSpacing: '-3px' }}>
                Orange<tspan fill={color}>Brew</tspan>
            </text>
            <text fontFamily="sans-serif" fontSize="14" fontWeight="500" fill="#666" x="3" y="28" style={{ letterSpacing: '6px', textTransform: 'uppercase' }}>
                Brewing × Technology
            </text>
        </g>
    </svg>
);
