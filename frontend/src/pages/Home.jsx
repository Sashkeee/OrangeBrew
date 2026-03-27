import React from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { MashingIcon, FermentationIcon, DistillationIcon, RectificationIcon } from '../components/Icons';
import { Settings, Shield } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

const Home = () => {
  const { user } = useAuth();

  const menuItems = [
    { title: 'Пивоварение', icon: <MashingIcon size={32} />, path: '/brewing', color: 'var(--primary-color)' },
    { title: 'Брожение', icon: <FermentationIcon size={32} />, path: '/fermentation', color: '#4caf50' },
    { title: 'Дистилляция', icon: <DistillationIcon size={32} />, path: '/distillation', color: '#03a9f4' },
    { title: 'Ректификация', icon: <RectificationIcon size={32} />, path: '/rectification', color: '#e91e63' },
    { title: 'Настройки', icon: <Settings size={32} />, path: '/settings', color: 'var(--secondary-color)' },
    ...(user?.role === 'admin' ? [{ title: 'Админ-панель', icon: <Shield size={32} />, path: '/admin', color: '#ff9800' }] : []),
  ];

  return (
    <div className="home-container" style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '100vh',
      padding: '2rem'
    }}>
      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.8, ease: "easeOut" }}
        style={{ marginBottom: '2rem' }}
      >
        <img
          src="/orangebrew_logo_1771368271600.png"
          alt="OrangeBrew Logo"
          className="responsive-logo"
          style={{
            width: '100%',
            maxWidth: '300px',
            height: 'auto',
            filter: 'drop-shadow(0 0 20px rgba(255, 152, 0, 0.4))'
          }}
        />
      </motion.div>

      <div className="menu-grid" style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
        gap: '1.5rem',
        width: '100%',
        maxWidth: '1000px'
      }}>
        {menuItems.map((item, index) => (
          <motion.div
            key={item.path}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 + index * 0.1 }}
          >
            <Link
              to={item.path}
              style={{ textDecoration: 'none' }}
              aria-label={`Перейти в раздел ${item.title}`}
            >
              <div className="industrial-panel glow-orange" style={{
                padding: '1.5rem',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '1rem',
                transition: 'all 0.3s ease',
                borderTop: `4px solid ${item.color}`,
                cursor: 'pointer',
                background: 'rgba(18, 18, 18, 0.8)',
                backdropFilter: 'blur(10px)',
                height: '100%'
              }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-5px)';
                  e.currentTarget.style.backgroundColor = 'rgba(30, 30, 30, 0.9)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.backgroundColor = 'rgba(18, 18, 18, 0.8)';
                }}
              >
                <div style={{ color: item.color }} aria-hidden="true">{item.icon}</div>
                <span style={{
                  color: 'var(--text-primary)',
                  fontWeight: 600,
                  fontSize: '1.1rem',
                  textAlign: 'center'
                }}>{item.title}</span>
              </div>
            </Link>
          </motion.div>
        ))}
      </div>
    </div>
  );
};

export default Home;
