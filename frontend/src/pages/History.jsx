import React from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, User, Calendar, Clock, Beer } from 'lucide-react';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';

const mockHistory = [
    { id: 101, name: 'Stout "Night Watch"', brewer: 'Александр', date: new Date('2026-02-15'), duration: 185, volume: 25 },
    { id: 102, name: 'Amber Ale "Autumn"', brewer: 'Иван', date: new Date('2026-02-01'), duration: 160, volume: 20 },
    { id: 103, name: 'Wheat "Summer Breeze"', brewer: 'Александр', date: new Date('2026-01-20'), duration: 145, volume: 25 },
];

const History = () => {
    const navigate = useNavigate();

    return (
        <div style={{ padding: '2rem', maxWidth: '1000px', margin: '0 auto' }}>
            <header style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '2rem' }}>
                <button
                    onClick={() => navigate('/brewing')}
                    style={{ background: 'none', border: '1px solid var(--border-color)', color: 'var(--text-primary)', padding: '0.5rem', borderRadius: '4px' }}
                >
                    <ArrowLeft size={20} />
                </button>
                <h1 style={{ margin: 0, fontSize: '1.8rem', color: 'var(--primary-color)' }}>История варок</h1>
            </header>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                {mockHistory.map((brew, index) => (
                    <motion.div
                        key={brew.id}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: index * 0.1 }}
                        className="industrial-panel"
                        style={{
                            padding: '1.5rem',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            borderLeft: '4px solid #444'
                        }}
                    >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
                            <div style={{ background: 'rgba(255,255,255,0.05)', padding: '1rem', borderRadius: '8px' }}>
                                <Beer size={32} color="var(--primary-color)" />
                            </div>
                            <div>
                                <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '1.3rem' }}>{brew.name}</h3>
                                <div style={{ display: 'flex', gap: '1.5rem', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}><User size={14} /> {brew.brewer}</span>
                                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}><Calendar size={14} /> {format(brew.date, 'dd MMMM yyyy', { locale: ru })}</span>
                                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}><Clock size={14} /> {Math.floor(brew.duration / 60)}ч {brew.duration % 60}м</span>
                                </div>
                            </div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                            <div className="text-mono" style={{ fontSize: '1.5rem', color: 'var(--primary-color)' }}>{brew.volume}л</div>
                            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>ГОТОВО</div>
                        </div>
                    </motion.div>
                ))}
            </div>
        </div>
    );
};

export default History;
