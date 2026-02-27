import React, { useState, useEffect } from 'react';
import { ArrowLeft, Search, Plus, X, Save } from 'lucide-react';
import { HopsIcon, MaltIcon, YeastIcon } from '../components/Icons';
import { useNavigate } from 'react-router-dom';

import { DEFAULT_HOPS, DEFAULT_MALTS, DEFAULT_YEASTS, getIngredientsFromStorage } from '../utils/ingredients';

export default function IngredientsReference() {
    const navigate = useNavigate();
    const [activeTab, setActiveTab] = useState('hop');
    const [searchTerm, setSearchTerm] = useState('');
    const [showModal, setShowModal] = useState(false);

    // Load custom data from localStorage
    const [customMods, setCustomMods] = useState({ hop: [], malt: [], yeast: [] });

    useEffect(() => {
        try {
            const saved = localStorage.getItem('ob_custom_ingredients');
            if (saved) setCustomMods(JSON.parse(saved));
        } catch (e) { }
    }, []);

    const saveCustom = (newMods) => {
        setCustomMods(newMods);
        localStorage.setItem('ob_custom_ingredients', JSON.stringify(newMods));
    };

    // Modal state
    const [newIng, setNewIng] = useState({});

    const openAddModal = () => {
        if (activeTab === 'hop') setNewIng({ name: '', origin: '', alpha: '', type: 'Ароматный', analogues: '', desc: '' });
        else if (activeTab === 'malt') setNewIng({ name: '', type: 'Базовый', color: '', desc: '' });
        else if (activeTab === 'yeast') setNewIng({ name: '', style: 'Элевые', temp: '', att: '', flo: '', desc: '' });
        setShowModal(true);
    };

    const handleSaveNew = () => {
        if (!newIng.name) return;
        const toSave = { ...newIng, id: 'cust_' + Date.now() };
        saveCustom({
            ...customMods,
            [activeTab]: [...customMods[activeTab], toSave]
        });
        setShowModal(false);
    };

    // Derived lists
    const hops = [...DEFAULT_HOPS, ...customMods.hop];
    const malts = [...DEFAULT_MALTS, ...customMods.malt];
    const yeasts = [...DEFAULT_YEASTS, ...customMods.yeast];

    const handleDelete = (tab, id) => {
        if (!confirm('Удалить кастомный ингредиент?')) return;
        saveCustom({
            ...customMods,
            [tab]: customMods[tab].filter(i => i.id !== id)
        });
    };

    const renderTable = () => {
        const query = searchTerm.toLowerCase();

        if (activeTab === 'hop') {
            const filtered = hops.filter(h => h.name.toLowerCase().includes(query) || h.desc.toLowerCase().includes(query));
            return (
                <table style={{ width: '100%', minWidth: '800px', borderCollapse: 'collapse', textAlign: 'left' }}>
                    <thead>
                        <tr style={{ background: 'rgba(76, 175, 80, 0.15)', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                            <th style={{ padding: '1rem', color: '#4caf50' }}>Сорт</th>
                            <th style={{ padding: '1rem', color: '#888' }}>Тип / Alpha</th>
                            <th style={{ padding: '1rem', color: '#888' }}>Описание</th>
                            <th style={{ padding: '1rem', color: '#888', width: '50px' }}></th>
                        </tr>
                    </thead>
                    <tbody>
                        {filtered.map((item, i) => (
                            <tr key={item.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)' }}>
                                <td style={{ padding: '1rem', fontWeight: 'bold' }}>{item.name} <div style={{ fontSize: '0.8rem', color: '#888' }}>{item.origin}</div></td>
                                <td style={{ padding: '1rem' }}><span style={{ color: '#4caf50' }}>{item.type}</span> <br /><span style={{ fontFamily: 'monospace' }}>a: {item.alpha}</span></td>
                                <td style={{ padding: '1rem', color: '#bbb', fontSize: '0.9rem' }}>{item.desc} <div style={{ color: '#666', fontStyle: 'italic', fontSize: '0.8rem' }}>Аналоги: {item.analogues}</div></td>
                                <td style={{ padding: '1rem', textAlign: 'center' }}>
                                    {item.id.startsWith('cust_') && <button onClick={() => handleDelete('hop', item.id)} style={{ background: 'none', border: 'none', color: '#f44336' }}><X size={16} /></button>}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            );
        }

        if (activeTab === 'malt') {
            const filtered = malts.filter(m => m.name.toLowerCase().includes(query) || m.desc.toLowerCase().includes(query));
            return (
                <table style={{ width: '100%', minWidth: '800px', borderCollapse: 'collapse', textAlign: 'left' }}>
                    <thead>
                        <tr style={{ background: 'rgba(255, 152, 0, 0.15)', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                            <th style={{ padding: '1rem', color: '#ff9800' }}>Тип Солода</th>
                            <th style={{ padding: '1rem', color: '#888' }}>Категория</th>
                            <th style={{ padding: '1rem', color: '#888' }}>Цветность (EBC)</th>
                            <th style={{ padding: '1rem', color: '#888' }}>Описание</th>
                            <th style={{ padding: '1rem', color: '#888', width: '50px' }}></th>
                        </tr>
                    </thead>
                    <tbody>
                        {filtered.map((item, i) => (
                            <tr key={item.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)' }}>
                                <td style={{ padding: '1rem', fontWeight: 'bold' }}>{item.name}</td>
                                <td style={{ padding: '1rem', color: '#ff9800' }}>{item.type}</td>
                                <td style={{ padding: '1rem', fontFamily: 'monospace' }}>{item.color}</td>
                                <td style={{ padding: '1rem', color: '#bbb', fontSize: '0.9rem' }}>{item.desc}</td>
                                <td style={{ padding: '1rem', textAlign: 'center' }}>
                                    {item.id.startsWith('cust_') && <button onClick={() => handleDelete('malt', item.id)} style={{ background: 'none', border: 'none', color: '#f44336' }}><X size={16} /></button>}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            );
        }

        if (activeTab === 'yeast') {
            const filtered = yeasts.filter(y => y.name.toLowerCase().includes(query) || y.desc.toLowerCase().includes(query));
            return (
                <table style={{ width: '100%', minWidth: '800px', borderCollapse: 'collapse', textAlign: 'left' }}>
                    <thead>
                        <tr style={{ background: 'rgba(3, 169, 244, 0.15)', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                            <th style={{ padding: '1rem', color: '#03a9f4' }}>Штамм</th>
                            <th style={{ padding: '1rem', color: '#888' }}>Стиль / Температура</th>
                            <th style={{ padding: '1rem', color: '#888' }}>Свойства</th>
                            <th style={{ padding: '1rem', color: '#888' }}>Описание</th>
                            <th style={{ padding: '1rem', color: '#888', width: '50px' }}></th>
                        </tr>
                    </thead>
                    <tbody>
                        {filtered.map((item, i) => (
                            <tr key={item.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)' }}>
                                <td style={{ padding: '1rem', fontWeight: 'bold' }}>{item.name}</td>
                                <td style={{ padding: '1rem' }}><span style={{ color: '#03a9f4' }}>{item.style}</span> <br /><span style={{ fontFamily: 'monospace' }}>t: {item.temp}</span></td>
                                <td style={{ padding: '1rem', color: '#ddd', fontSize: '0.85rem' }}>Аттенюация: {item.att} <br />Флокуляция: {item.flo}</td>
                                <td style={{ padding: '1rem', color: '#bbb', fontSize: '0.9rem' }}>{item.desc}</td>
                                <td style={{ padding: '1rem', textAlign: 'center' }}>
                                    {item.id.startsWith('cust_') && <button onClick={() => handleDelete('yeast', item.id)} style={{ background: 'none', border: 'none', color: '#f44336' }}><X size={16} /></button>}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            );
        }
    };

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
                    <h1 style={{ margin: 0, fontSize: '1.8rem', color: '#fff' }}>Справочник Ингредиентов</h1>
                </div>
            </header>

            <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
                <button
                    onClick={() => setActiveTab('hop')}
                    style={{ flex: 1, padding: '1rem', background: activeTab === 'hop' ? 'rgba(76, 175, 80, 0.15)' : 'rgba(0,0,0,0.5)', border: `1px solid ${activeTab === 'hop' ? '#4caf50' : '#333'}`, color: activeTab === 'hop' ? '#4caf50' : '#888', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', fontWeight: 'bold' }}>
                    <HopsIcon size={20} /> Хмель
                </button>
                <button
                    onClick={() => setActiveTab('malt')}
                    style={{ flex: 1, padding: '1rem', background: activeTab === 'malt' ? 'rgba(255, 152, 0, 0.15)' : 'rgba(0,0,0,0.5)', border: `1px solid ${activeTab === 'malt' ? '#ff9800' : '#333'}`, color: activeTab === 'malt' ? '#ff9800' : '#888', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', fontWeight: 'bold' }}>
                    <MaltIcon size={20} /> Солод
                </button>
                <button
                    onClick={() => setActiveTab('yeast')}
                    style={{ flex: 1, padding: '1rem', background: activeTab === 'yeast' ? 'rgba(3, 169, 244, 0.15)' : 'rgba(0,0,0,0.5)', border: `1px solid ${activeTab === 'yeast' ? '#03a9f4' : '#333'}`, color: activeTab === 'yeast' ? '#03a9f4' : '#888', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', fontWeight: 'bold' }}>
                    <YeastIcon size={20} /> Дрожжи
                </button>
            </div>

            <div className="industrial-panel" style={{ padding: '1.5rem', marginBottom: '2rem', display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                <div style={{ position: 'relative', flex: '1 1 300px' }}>
                    <Search size={18} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: '#888' }} />
                    <input
                        type="text"
                        placeholder="Поиск по названию или описанию..."
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                        style={{ width: '100%', padding: '1rem 1rem 1rem 3rem', background: '#000', border: '1px solid var(--border-color)', color: '#fff', borderRadius: '4px', fontSize: '1rem' }}
                    />
                </div>
                <button
                    onClick={openAddModal}
                    style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0 1.5rem', background: '#333', border: '1px solid #555', color: '#fff', borderRadius: '4px', fontWeight: 'bold' }}>
                    <Plus size={18} /> Добавить свой сорт
                </button>
            </div>

            <div style={{ overflowX: 'auto', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
                {renderTable()}
            </div>

            {/* ─── ADD MODAL ─── */}
            {showModal && (
                <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.8)', zIndex: 99999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
                    <div className="industrial-panel" style={{ width: '100%', maxWidth: '500px', padding: '2rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
                            <h2 style={{ margin: 0 }}>Добавить {activeTab === 'hop' ? 'Хмель' : activeTab === 'malt' ? 'Солод' : 'Дрожжи'}</h2>
                            <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', color: '#fff' }}><X size={24} /></button>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            <input type="text" placeholder="Название *" value={newIng.name} onChange={e => setNewIng({ ...newIng, name: e.target.value })} style={{ padding: '0.8rem', background: '#000', border: '1px solid #444', color: '#fff' }} />

                            {activeTab === 'hop' && (
                                <>
                                    <input type="text" placeholder="Alpha-кислотность (например 5.5%)" value={newIng.alpha} onChange={e => setNewIng({ ...newIng, alpha: e.target.value })} style={{ padding: '0.8rem', background: '#000', border: '1px solid #444', color: '#fff' }} />
                                    <select value={newIng.type} onChange={e => setNewIng({ ...newIng, type: e.target.value })} style={{ padding: '0.8rem', background: '#000', border: '1px solid #444', color: '#fff' }}>
                                        <option>Ароматный</option>
                                        <option>Горький</option>
                                        <option>Универсальный</option>
                                    </select>
                                    <input type="text" placeholder="Страна происхождения" value={newIng.origin} onChange={e => setNewIng({ ...newIng, origin: e.target.value })} style={{ padding: '0.8rem', background: '#000', border: '1px solid #444', color: '#fff' }} />
                                    <input type="text" placeholder="Аналоги" value={newIng.analogues} onChange={e => setNewIng({ ...newIng, analogues: e.target.value })} style={{ padding: '0.8rem', background: '#000', border: '1px solid #444', color: '#fff' }} />
                                </>
                            )}
                            {activeTab === 'malt' && (
                                <>
                                    <input type="text" placeholder="Цветность EBC (например 5.5 EBC)" value={newIng.color} onChange={e => setNewIng({ ...newIng, color: e.target.value })} style={{ padding: '0.8rem', background: '#000', border: '1px solid #444', color: '#fff' }} />
                                    <select value={newIng.type} onChange={e => setNewIng({ ...newIng, type: e.target.value })} style={{ padding: '0.8rem', background: '#000', border: '1px solid #444', color: '#fff' }}>
                                        <option>Базовый</option>
                                        <option>Специальный</option>
                                        <option>Карамельный</option>
                                        <option>Жженый</option>
                                        <option>Несоложенка</option>
                                    </select>
                                </>
                            )}
                            {activeTab === 'yeast' && (
                                <>
                                    <select value={newIng.style} onChange={e => setNewIng({ ...newIng, style: e.target.value })} style={{ padding: '0.8rem', background: '#000', border: '1px solid #444', color: '#fff' }}>
                                        <option>Элевые (Ale)</option>
                                        <option>Лагерные (Lager)</option>
                                        <option>Пшеничные</option>
                                        <option>Saison</option>
                                        <option>Kveik</option>
                                        <option>Спиртовые</option>
                                    </select>
                                    <input type="text" placeholder="Диапазон температур (напр. 15-20°C)" value={newIng.temp} onChange={e => setNewIng({ ...newIng, temp: e.target.value })} style={{ padding: '0.8rem', background: '#000', border: '1px solid #444', color: '#fff' }} />
                                    <input type="text" placeholder="Аттенюация (напр. 75%)" value={newIng.att} onChange={e => setNewIng({ ...newIng, att: e.target.value })} style={{ padding: '0.8rem', background: '#000', border: '1px solid #444', color: '#fff' }} />
                                    <input type="text" placeholder="Флокуляция (напр. Высокая)" value={newIng.flo} onChange={e => setNewIng({ ...newIng, flo: e.target.value })} style={{ padding: '0.8rem', background: '#000', border: '1px solid #444', color: '#fff' }} />
                                </>
                            )}

                            <textarea placeholder="Вкусо-ароматический профиль..." value={newIng.desc} onChange={e => setNewIng({ ...newIng, desc: e.target.value })} style={{ padding: '0.8rem', background: '#000', border: '1px solid #444', color: '#fff', minHeight: '80px' }} />

                            <button onClick={handleSaveNew} style={{ padding: '1rem', background: 'var(--primary-color)', color: '#000', fontWeight: 'bold', border: 'none', borderRadius: '4px', marginTop: '1rem', display: 'flex', justifyContent: 'center', gap: '0.5rem' }}>
                                <Save size={20} /> Сохранить в справочник
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
