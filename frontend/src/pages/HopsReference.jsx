import React, { useState } from 'react';
import { ArrowLeft, Search, Leaf } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const HOPS_DATA = [
    { name: 'Cascade (Каскад)', origin: 'США', alpha: '4.5 - 8.9%', type: 'Ароматный', analogues: 'Centennial, Amarillo, Columbus', description: 'Цветочный, цитрусовый и грейпфрутовый аромат. Классика для American Pale Ale.' },
    { name: 'Centennial (Сентенниал)', origin: 'США', alpha: '9.5 - 11.5%', type: 'Универсальный', analogues: 'Cascade, Columbus, Chinook', description: '"Супер-Каскад". Цветочный и интенсивный цитрусовый аромат.' },
    { name: 'Chinook (Чинук)', origin: 'США', alpha: '12.0 - 14.0%', type: 'Горько-ароматный', analogues: 'Columbus, Northern Brewer, Nugget', description: 'Пряный, сосновый и грейпфрутовый профиль.' },
    { name: 'Citra (Цитра)', origin: 'США', alpha: '11.0 - 13.0%', type: 'Ароматный', analogues: 'Simcoe, Mosaic, Galaxy', description: 'Мощный аромат цитрусовых и тропических фруктов (манго, личи, маракуйя).' },
    { name: 'Magnum (Магнум)', origin: 'Германия', alpha: '11.0 - 16.0%', type: 'Горький', analogues: 'Nugget, Taurus, Columbus', description: 'Дает чистую, мягкую горечь. Отлично подходит для базы.' },
    { name: 'Perle (Перле)', origin: 'Германия', alpha: '4.0 - 9.0%', type: 'Универсальный', analogues: 'Northern Brewer, Tettnanger', description: 'Слегка пряный, мятный и землистый аромат.' },
    { name: 'Saaz / Жатецкий', origin: 'Чехия', alpha: '2.0 - 5.0%', type: 'Ароматный', analogues: 'Sladek, Lubelski, Sterling', description: 'Благородный чешский хмель. Травянистый, цветочный и землистый профиль (идеально для Пилснеров).' },
    { name: 'Northern Brewer (Норден Брюэр)', origin: 'Англия / Германия', alpha: '7.0 - 10.0%', type: 'Универсальный', analogues: 'Perle, Magnum, Chinook', description: 'Хвойный, мятный и древесный аромат.' },
    { name: 'East Kent Goldings (Ист Кент Голдингс)', origin: 'Англия', alpha: '4.5 - 6.5%', type: 'Ароматный', analogues: 'Fuggles, Progress', description: 'Мягкий цветочный и землисто-пряный аромат. Классика английских элей.' },
    { name: 'Mosaic (Мозаик)', origin: 'США', alpha: '11.5 - 13.5%', type: 'Ароматный', analogues: 'Citra, Simcoe', description: 'Сложный профиль ягод, тропических фруктов, цитрусов и хвои.' },
    { name: 'Simcoe (Симко)', origin: 'США', alpha: '12.0 - 14.0%', type: 'Универсальный', analogues: 'Summit, Magnum', description: 'Яркий аромат сосны, маракуйи и землисто-цитрусовых нот.' },
    { name: 'Amarillo (Амарилло)', origin: 'США', alpha: '8.0 - 11.0%', type: 'Ароматный', analogues: 'Cascade, Centennial', description: 'Аромат сладких цитрусов, цветочные нотки, апельсин.' },
    { name: 'Подвязный', origin: 'Россия', alpha: '4.0 - 5.5%', type: 'Ароматный', analogues: 'Saaz, Spalter Select', description: 'Цветочно-травянистый аромат, легкая хвоя.' },
    { name: 'Московский ранний', origin: 'Россия', alpha: '3.0 - 4.5%', type: 'Ароматный', analogues: 'Saaz, Tettnanger', description: 'Приятный травянистый аромат, подходит для светлых и пшеничных сортов.' },
    { name: 'Saphir (Сапфир)', origin: 'Германия', alpha: '2.0 - 4.5%', type: 'Ароматный', analogues: 'Hallertau Mittelfrüh', description: 'Сладковатый, фруктовый аромат со специями и легкими цитрусами.' },
];

export default function HopsReference() {
    const navigate = useNavigate();
    const [searchTerm, setSearchTerm] = useState('');

    const filtered = HOPS_DATA.filter(h =>
        h.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        h.analogues.toLowerCase().includes(searchTerm.toLowerCase()) ||
        h.description.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div style={{ padding: '2rem 1rem', maxWidth: '1200px', margin: '0 auto' }}>
            <header style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '2rem' }}>
                <button
                    onClick={() => navigate('/brewing')}
                    aria-label="Назад к пивоварению"
                    style={{ background: 'none', border: '1px solid var(--border-color)', color: 'var(--text-primary)', padding: '0.5rem', borderRadius: '4px' }}
                >
                    <ArrowLeft size={20} />
                </button>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
                    <Leaf size={32} color="#4caf50" />
                    <h1 style={{ margin: 0, fontSize: '1.8rem', color: '#4caf50' }}>Справочник: Хмель</h1>
                </div>
            </header>

            <div className="industrial-panel" style={{ padding: '1.5rem', marginBottom: '2rem' }}>
                <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>
                    Расширенная таблица популярных сортов хмеля и их аналогов. Используйте поиск, чтобы найти нужный профиль или замену для рецепта.
                </p>
                <div style={{ position: 'relative' }}>
                    <Search size={18} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: '#888' }} />
                    <input
                        type="text"
                        placeholder="Поиск по названию, аналогам или описанию..."
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                        style={{ width: '100%', padding: '1rem 1rem 1rem 3rem', background: '#000', border: '1px solid var(--border-color)', color: '#fff', borderRadius: '4px', fontSize: '1rem' }}
                    />
                </div>
            </div>

            <div style={{ overflowX: 'auto', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
                <table style={{ width: '100%', minWidth: '800px', borderCollapse: 'collapse', textAlign: 'left' }}>
                    <thead>
                        <tr style={{ background: 'rgba(76, 175, 80, 0.15)', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                            <th style={{ padding: '1rem', color: '#4caf50', fontWeight: 'bold' }}>Сорт</th>
                            <th style={{ padding: '1rem', color: 'var(--text-secondary)' }}>Тип</th>
                            <th style={{ padding: '1rem', color: 'var(--text-secondary)' }}>Alpha (Горечь)</th>
                            <th style={{ padding: '1rem', color: 'var(--text-secondary)' }}>Профиль / Описание</th>
                            <th style={{ padding: '1rem', color: 'var(--text-secondary)' }}>Аналоги</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filtered.length > 0 ? filtered.map((hop, i) => (
                            <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)' }}>
                                <td style={{ padding: '1.2rem 1rem', fontWeight: 'bold', color: 'var(--text-primary)' }}>
                                    {hop.name}
                                    <div style={{ fontSize: '0.8rem', color: '#888', marginTop: '4px' }}>{hop.origin}</div>
                                </td>
                                <td style={{ padding: '1.2rem 1rem' }}>
                                    <span style={{
                                        padding: '0.3rem 0.6rem', borderRadius: '4px', fontSize: '0.8rem',
                                        background: hop.type.includes('Горьк') ? 'rgba(244, 67, 54, 0.1)' : hop.type.includes('Аромат') ? 'rgba(3, 169, 244, 0.1)' : 'rgba(255, 152, 0, 0.1)',
                                        color: hop.type.includes('Горьк') ? '#f44336' : hop.type.includes('Аромат') ? '#03a9f4' : '#ff9800'
                                    }}>
                                        {hop.type}
                                    </span>
                                </td>
                                <td style={{ padding: '1.2rem 1rem', fontFamily: 'monospace', color: '#fff' }}>{hop.alpha}</td>
                                <td style={{ padding: '1.2rem 1rem', color: '#bbb', fontSize: '0.95rem' }}>{hop.description}</td>
                                <td style={{ padding: '1.2rem 1rem', color: '#888', fontStyle: 'italic', fontSize: '0.9rem' }}>{hop.analogues}</td>
                            </tr>
                        )) : (
                            <tr>
                                <td colSpan="5" style={{ padding: '2rem', textAlign: 'center', color: '#888' }}>
                                    Хмель не найден.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
