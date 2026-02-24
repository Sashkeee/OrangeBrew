import React from 'react';

const LogoBase = ({ children, size = 120, className = '', ...props }) => (
    <svg
        width={size}
        height={size}
        viewBox="0 0 200 200"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={`orangebrew-logo ${className}`}
        {...props}
    >
        {children}
    </svg>
);

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
                <text
                    fontFamily="sans-serif"
                    fontSize="72"
                    fontWeight="800"
                    fill="white"
                    style={{ letterSpacing: '-2px' }}
                >
                    Orange
                    <tspan fill={color}>Brew</tspan>
                </text>
                <text
                    fontFamily="sans-serif"
                    fontSize="14"
                    fontWeight="400"
                    fill="#888"
                    x="2"
                    y="30"
                    style={{ letterSpacing: '8px', textTransform: 'uppercase' }}
                >
                    Smart Systems
                </text>
            </g>
        )}
    </svg>
);

/**
 * Компактный логотип для Navbar или Favicon
 */
export const CompactLogo = ({ size = 48, color = '#FF9800', ...props }) => (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
        <path d="M85 50C85 69.33 69.33 85 50 85C30.67 85 15 69.33 15 50C15 30.67 30.67 15 50 15" stroke={color} strokeWidth="8" strokeLinecap="round" />
        <path d="M40 15V10H60V15" stroke={color} strokeWidth="8" strokeLinecap="round" />
        <circle cx="50" cy="55" r="12" fill={color} />
        <path d="M60 10C60 10 70 10 75 20C75 20 65 25 60 20V10Z" fill="#4CAF50" />
    </svg>
);

/**
 * Индустриальный логотип (в шестеренке)
 */
export const IndustrialLogo = ({ size = 150, color = '#FF9800', ...props }) => (
    <svg width={size} height={size} viewBox="0 0 200 200" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
        <path
            d="M100 10L110 30H125L145 20L155 35L140 50V65L160 75L160 90L140 100V115L155 130L145 145L125 135H110L100 155L85 155L75 135H60L40 145L30 130L45 115V100L25 90L25 75L45 65V50L30 35L40 20L60 30H75L85 10L100 10Z"
            stroke="#444"
            strokeWidth="4"
        />
        <g transform="scale(0.6) translate(66, 66)">
            <CompactLogo size={200} color={color} />
        </g>
    </svg>
);

/**
 * Логотип спиртовой колонны (для дистилляции/ректификации)
 */
export const ColumnLogo = ({ size = 150, color = '#03A9F4', ...props }) => (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
        <rect x="35" y="10" width="30" height="80" rx="4" stroke={color} strokeWidth="4" />
        <path d="M35 30H65M35 50H65M35 70H65" stroke={color} strokeWidth="2" strokeDasharray="4 2" />
        <circle cx="50" cy="20" r="3" fill={color} />
        <path d="M65 15C75 15 85 25 85 35V60" stroke={color} strokeWidth="3" strokeLinecap="round" />
    </svg>
);

/**
 * Hardware / Circuit Logo
 */
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

/**
 * Minimalist Line-art Logo
 */
export const MinimalLogo = ({ size = 150, color = '#FF9800', ...props }) => (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
        <path d="M50 20L80 70H20L50 20Z" stroke={color} strokeWidth="6" strokeLinejoin="round" />
        <circle cx="50" cy="55" r="8" fill={color} />
        <path d="M40 70V85M60 70V85" stroke={color} strokeWidth="4" strokeLinecap="round" />
    </svg>
);

/**
 * Premium / Boutique Logo
 */
export const BoutiqueLogo = ({ size = 150, color = '#FF9800', ...props }) => (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
        <circle cx="50" cy="50" r="40" stroke={color} strokeWidth="1" />
        <circle cx="50" cy="50" r="35" stroke={color} strokeWidth="0.5" opacity="0.5" />
        <path d="M50 10V90M10 50H90" stroke={color} strokeWidth="0.5" opacity="0.3" />
        <text x="50" y="55" fontFamily="serif" fontSize="24" fill={color} textAnchor="middle" fontWeight="300">OB</text>
        <path d="M30 30L70 70M70 30L30 70" stroke={color} strokeWidth="0.5" opacity="0.3" />
    </svg>
);

/**
 * Futuristic / Cyber Logo
 */
export const CyberLogo = ({ size = 150, color = '#FF9800', ...props }) => (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
        <path d="M20 20H80L90 35V80H10V35L20 20Z" stroke={color} strokeWidth="4" />
        <path d="M35 20V10M65 20V10" stroke={color} strokeWidth="4" />
        <rect x="30" y="45" width="40" height="20" fill={color} opacity="0.2" />
        <path d="M10 50H25M75 50H90" stroke={color} strokeWidth="2" />
        <circle cx="50" cy="55" r="5" fill={color} />
    </svg>
);
