import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Clock } from 'lucide-react';
import { formatTime } from '../utils/formatTime';
import '../pages/pages.css';

/**
 * Reusable page header with back button, title, and optional timer.
 *
 * @param {{ title: string, icon?: React.ElementType, color?: string, backTo?: string, elapsed?: number, children?: React.ReactNode }} props
 */
export function PageHeader({ title, icon: Icon, color = 'var(--primary-color)', backTo = '/', elapsed, children }) {
    const navigate = useNavigate();

    return (
        <header className="page-header">
            <div className="page-header__left">
                <button className="btn-back" onClick={() => navigate(backTo)} aria-label="Назад">
                    <ArrowLeft size={20} aria-hidden="true" />
                </button>
                <h1 className="page-title" style={{ color }}>
                    {Icon && <Icon size={28} className="page-title__icon" aria-hidden="true" />}
                    {title}
                </h1>
            </div>
            <div className="page-header__right">
                {children}
                {elapsed != null && (
                    <div className="timer-badge" style={{ borderColor: color, color }}>
                        <Clock size={18} aria-hidden="true" />
                        {formatTime(elapsed)}
                    </div>
                )}
            </div>
        </header>
    );
}
