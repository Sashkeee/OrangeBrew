import React, { useState, useEffect } from 'react';
import { ArrowLeft, Search, Plus, X, Save } from 'lucide-react';
import { HopsIcon, MaltIcon, YeastIcon } from '../components/Icons';
import { useNavigate } from 'react-router-dom';

const DEFAULT_HOPS = [
    { id: 'h1', name: 'Cascade', origin: 'США', alpha: '4.5-8.9%', type: 'Ароматный', analogues: 'Centennial, Amarillo', desc: 'Цветочный, цитрусовый и грейпфрутовый профиль. Классика для American Pale Ale.' },
    { id: 'h2', name: 'Magnum', origin: 'Германия', alpha: '11-16%', type: 'Горький', analogues: 'Nugget, Taurus, Columbus', desc: 'Чистая, мягкая горечь без резких нот. Идеален для закладки на горечь (первый хмель).' },
    { id: 'h3', name: 'Citra', origin: 'США', alpha: '11-15%', type: 'Ароматный', analogues: 'Simcoe, Mosaic, Galaxy', desc: 'Мощные тропические фрукты, маракуйя, цитрус, личи. Популярен в NEIPA.' },
    { id: 'h4', name: 'Saaz / Жатецкий', origin: 'Чехия', alpha: '2-5%', type: 'Ароматный', analogues: 'Lubelski, Sterling', desc: 'Мягкий травянистый, древесный и цветочный. Традиционный для Богемского Пилснера.' },
    { id: 'h5', name: 'Perle', origin: 'Германия', alpha: '4-9%', type: 'Универсальный', analogues: 'Northern Brewer', desc: 'Мятный, землистый аромат с нотами специй. Приятная умеренная горечь.' },
    { id: 'h6', name: 'Centennial', origin: 'США', alpha: '9-12%', type: 'Универсальный', analogues: 'Cascade, Amarillo', desc: '«Супер-Каскад». Более смолистый и цветочный, с выраженным лимонно-цитрусовым тоном.' },
    { id: 'h7', name: 'Mosaic', origin: 'США', alpha: '11-14%', type: 'Ароматный', analogues: 'Citra, Simcoe', desc: 'Сложный профиль: тропики, черника, мандарин, хвоя. Часто используется для сухого охмеления.' },
    { id: 'h8', name: 'Simcoe', origin: 'США', alpha: '12-14%', type: 'Универсальный', analogues: 'Summit, Mosaic', desc: 'Маракуйя, хвоя, земляные ноты и цитрус. Отлично подходит как для горечи, так и для аромата IPA.' },
    { id: 'h9', name: 'Columbus (CTZ)', origin: 'США', alpha: '14-18%', type: 'Горький', analogues: 'Nugget, Chinook', desc: 'Едкая, резкая горечь. Мощный землистый и солодково-хвойный аромат.' },
    { id: 'h10', name: 'Hallertauer Mittelfrüh', origin: 'Германия', alpha: '3-5%', type: 'Ароматный', analogues: 'Liberty, Tradition', desc: 'Благородный хмель. Тонкий, пряный, цветочный. Идеален для классических немецких лагеров.' },
    { id: 'h11', name: 'Fuggles', origin: 'Англия', alpha: '4-6%', type: 'Ароматный', analogues: 'Willamette, Styrian Golding', desc: 'Традиционный британский эль: землистый, древесный, слегка мятный.' },
    { id: 'h12', name: 'East Kent Goldings', origin: 'Англия', alpha: '4-6%', type: 'Ароматный', analogues: 'Fuggles', desc: 'Лаванда, специи, мед и земля. Главный хмель для классических английских биттеров и стаутов.' },
    { id: 'h13', name: 'Московский Ранний', origin: 'Россия', alpha: '3-4%', type: 'Ароматный', analogues: 'Saaz', desc: 'Тонкий хмелевой аромат. Устойчив к болезням. Применяется для светлых сортов (лагеры, пшеничное).' },
    { id: 'h14', name: 'Подвязный', origin: 'Россия', alpha: '4-6%', type: 'Универсальный', analogues: 'Northern Brewer', desc: 'Выраженный хмелевой аромат. Средняя горечь. Хорош для домашних лагеров и элей средней плотности.' },
    { id: 'h15', name: 'Nelson Sauvin', origin: 'Н. Зеландия', alpha: '12-13%', type: 'Универсальный', analogues: 'Pacific Jade', desc: 'Уникальный аромат вина Совиньон Блан, белый виноград, крыжовник.' }
];

const DEFAULT_MALTS = [
    { id: 'm1', name: 'Pilsner (Пилснер)', type: 'Базовый', color: '2.5 - 4.0 EBC', desc: 'Светлый базовый солод (100% засыпи) для лагеров и элей. Чистый зерновой, слегка сладковатый вкус.' },
    { id: 'm2', name: 'Pale Ale (Пэйл Эль)', type: 'Базовый', color: '5.5 - 7.5 EBC', desc: 'Базовый для британских и американских элей (до 100%). Дает насыщенный солодовый вкус с глубокими нотами бисквита и хлеба.' },
    { id: 'm3', name: 'Munich (Мюнхенский)', type: 'Базовый / Спец', color: '15 - 25 EBC', desc: 'Усиливает цветность до золотисто-янтарного, дает богатый вкус хлебной корки. Можно использовать до 100% (Мюнхенское светлое) или как добавку.' },
    { id: 'm4', name: 'Vienna (Венский)', type: 'Базовый', color: '7.0 - 10.0 EBC', desc: 'Придает золотистый цвет и полнотелость. Ореховые, кремово-карамельные ноты. Классика для Венского Лагера (до 100%).' },
    { id: 'm5', name: 'Wheat (Пшеничный)', type: 'Базовый', color: '3.0 - 5.0 EBC', desc: 'Необходим для Weizen, Witbier (до 50-70%). Придаст легкую кислинку, сливочность и стойкую пену.' },
    { id: 'm6', name: 'Caramel / Crystal (Карам. 50-150)', type: 'Карамельный', color: '50 - 150 EBC', desc: 'Содержит неферментируемые сахара. Добавляет остаточную сладость, полнотелость, аромат ирисок и карамели (до 15-20%).' },
    { id: 'm7', name: 'CaraPils / Dextrin', type: 'Карамельный', color: '2.5 - 5.0 EBC', desc: 'Светлый карамельный солод. Практически не меняет цвет, но увеличивает тело пива и мощно улучшает стойкость пены (до 10%).' },
    { id: 'm8', name: 'Melanoidin (Меланоидиновый)', type: 'Специальный', color: '60 - 80 EBC', desc: 'Имитирует отварочное затирание. Глубокий красный цвет, усиленный аромат солода и меда, стабильность вкуса (до 15%).' },
    { id: 'm9', name: 'Chocolate (Шоколадный)', type: 'Жженый', color: '800 - 1000 EBC', desc: 'Придает темно-коричневый/черный цвет. Ноты темного шоколада, кофе и орехов без сильной горечи (до 5% в портерах/стаутах).' },
    { id: 'm10', name: 'Roasted Barley (Жженый Ячмень)', type: 'Несоложенка', color: '1000 - 1300 EBC', desc: 'Несоложеный обжаренный ячмень. Резкая, сухая кофейная горечь. Ключевой ингредиент Ирландского Стаута (Guinness) (до 5-10%).' },
    { id: 'm11', name: 'Rye Malt (Ржаной солод)', type: 'Специальный', color: '4.0 - 8.0 EBC', desc: 'Привносит пряный, ржаной, "хлебный" привкус. Повышает плотность тела (до 15-20%).' },
    { id: 'm12', name: 'Курский Пилснер (Россия)', type: 'Базовый', color: '3.0 - 4.5 EBC', desc: 'Отечественный базовый солод. Доступная альтернатива немецкому/бельгийскому солоду. Хорошая экстрактивность.' },
    { id: 'm13', name: 'Abbey / Biscuit', type: 'Специальный', color: '40 - 50 EBC', desc: 'Дает выраженный аромат свежеиспеченного печенья, орехов и теплого хлеба. Янтарный оттенок (до 10%).' }
];

const DEFAULT_YEASTS = [
    { id: 'y1', name: 'SafAle US-05', style: 'Элевые (Ale)', temp: '15-22°C', att: 'Высокая (81%)', flo: 'Средняя', desc: 'Эталон для American IPA и Pale Ale. Максимально чистый профиль, не перебивает хмель.' },
    { id: 'y2', name: 'SafAle S-04', style: 'Элевые (Ale)', temp: '15-20°C', att: 'Средняя (75%)', flo: 'Высокая', desc: 'Классика для английских элей, портеров, стаутов. Образует фруктовые эфиры, мгновенно оседает на дно плотным комком.' },
    { id: 'y3', name: 'SafLager W-34/70', style: 'Лагерные (Lager)', temp: '9-15°C', att: 'Высокая', flo: 'Высокая', desc: 'Легендарный штамм из Weihenstephan. Создает чистые, освежающие классические лагеры (Pilsner, Helles).' },
    { id: 'y4', name: 'SafAle WB-06', style: 'Пшеничные', temp: '15-24°C', att: 'Высокая (86%)', flo: 'Низкая', desc: 'Для баварского пшеничного. Дает выраженные фенольные (гвоздика) и эфирные (банан) ноты.' },
    { id: 'y5', name: 'LalBrew Belle Saison', style: 'Saison', temp: '15-35°C', att: 'Очень высокая', flo: 'Низкая', desc: 'Выдерживает высокие температуры. Перечный, пряный, фруктовый аромат. Сбраживает очень "насухо".' },
    { id: 'y6', name: 'Fermentis S-33', style: 'Элевые (Ale)', temp: '15-20°C', att: 'Низкая (70%)', flo: 'Средняя', desc: 'Оставляет плотное, сладимое тело. Отличный выбор для Belgian Blond, Dubbel или густых овсяных стаутов.' },
    { id: 'y7', name: 'LalBrew Nottingham', style: 'Элевые (Ale)', temp: '10-22°C', att: 'Очень высокая', flo: 'Высокая', desc: 'Чрезвычайно универсальные дрожжи. Способны бродить при низких температурах (давая лагероподобную чистоту).' },
    { id: 'y8', name: 'Mangrove Jack M44', style: 'Элевые (Ale)', temp: '18-23°C', att: 'Высокая', flo: 'Высокая', desc: 'US West Coast дрожжи. Позволяют хмелю максимально раскрыться (аналог US-05, но лучше оседают).' },
    { id: 'y9', name: 'Mangrove Jack M41', style: 'Belgian Ale', temp: '18-28°C', att: 'Высокая', flo: 'Средняя', desc: 'Бельгийские эли. Сильные ноты сливы, пряностей. Терпимы к высокому алкоголю (до 12%).' },
    { id: 'y10', name: 'LalBrew Voss Kveik', style: 'Kveik', temp: '25-40°C', att: 'Средняя', flo: 'Очень высокая', desc: 'Норвежские квейки. Изумительно быстрое брожение в жару без побочек. Слегка цитрусовый профиль.' },
    { id: 'y11', name: 'Fermentis BE-256', style: 'Belgian Ale', temp: '15-20°C', att: 'Высокая', flo: 'Высокая', desc: 'Для аббатских стилей. Очень быстрая ферментация, высокий алкоголь, сложный эфирный профиль.' },
    { id: 'y12', name: 'Mangrove Jack M05', style: 'Медовуха / Mead', temp: '15-30°C', att: 'Высокая', flo: 'Высокая', desc: 'Для медовухи (Mead). Сохраняет цветочные ароматы меда, высокая толерантность к алкоголю (до 18%).' }
];

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
