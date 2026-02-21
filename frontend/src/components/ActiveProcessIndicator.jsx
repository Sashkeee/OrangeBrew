import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useProcess } from '../hooks/useProcess.js';
import { Activity } from 'lucide-react';

export function ActiveProcessIndicator() {
    const { status, processState, elapsedTime } = useProcess();
    const navigate = useNavigate();
    const location = useLocation();

    // Only show if process is active
    if (status === 'IDLE' || status === 'COMPLETED') return null;

    const mode = processState?.mode;
    const sessionId = processState?.sessionId;

    let targetPath = '/';
    let label = 'Процесс запущен';
    let themeColor = '#ff9800'; // default orange

    switch (mode) {
        case 'mash':
            targetPath = `/brewing/mash/${sessionId || 'new'}`;
            label = 'Идет затирание';
            themeColor = '#ff9800';
            break;
        case 'boil':
            targetPath = `/brewing/boil/${sessionId || 'new'}`;
            label = 'Идет кипячение';
            themeColor = '#f44336';
            break;
        case 'distillation':
            targetPath = '/distillation';
            label = 'Идет дистилляция';
            themeColor = '#03a9f4';
            break;
        case 'rectification':
            targetPath = '/rectification';
            label = 'Идет ректификация';
            themeColor = '#9c27b0';
            break;
        default:
            targetPath = '/';
    }

    // Hide if we are already viewing it
    if (location.pathname === targetPath || location.pathname.startsWith(`${targetPath}/`)) {
        return null;
    }

    const formatElapsed = (sec) => {
        const h = Math.floor(sec / 3600);
        const m = Math.floor((sec % 3600) / 60);
        const s = sec % 60;
        return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    };

    const isPaused = status === 'PAUSED';

    const hexToRgb = (hex) => {
        let shorthandRegex = /^#?([a-f\d])([a-f\d])([a-f\d])$/i;
        hex = hex.replace(shorthandRegex, function (m, r, g, b) { return r + r + g + g + b + b; });
        let result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}` : '255, 152, 0';
    };

    const rgbColor = hexToRgb(themeColor);

    const style = {
        position: 'fixed',
        top: '1.5rem',
        right: '1.5rem',
        display: 'flex',
        alignItems: 'center',
        gap: '0.8rem',
        padding: '0.8rem 1.2rem',
        borderRadius: '12px',
        background: `rgba(${rgbColor}, 0.15)`,
        color: themeColor,
        border: `1px solid rgba(${rgbColor}, 0.4)`,
        cursor: 'pointer',
        boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
        backdropFilter: 'blur(10px)',
        zIndex: 9999,
        transition: 'all 0.3s ease',
    };

    return (
        <div style={style} onClick={() => navigate(targetPath)} className="active-process-indicator" title="Нажмите, чтобы вернуться к процессу">
            <style>{`
                @keyframes pulse-icon {
                    0% { transform: scale(1); opacity: 1; }
                    50% { transform: scale(1.1); opacity: 0.8; }
                    100% { transform: scale(1); opacity: 1; }
                }
                .active-process-indicator:hover {
                    background: rgba(${rgbColor}, 0.25) !important;
                    transform: translateY(-2px);
                }
            `}</style>
            <Activity size={24} style={{ animation: isPaused ? 'none' : 'pulse-icon 2s infinite', opacity: isPaused ? 0.6 : 1 }} />
            <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontWeight: 'bold', fontSize: '0.9rem' }}>{label}</span>
                <span style={{ fontSize: '0.8rem', opacity: 0.8, fontFamily: 'monospace' }}>
                    {isPaused ? 'ПАУЗА' : formatElapsed(elapsedTime || 0)}
                </span>
            </div>
        </div>
    );
}
