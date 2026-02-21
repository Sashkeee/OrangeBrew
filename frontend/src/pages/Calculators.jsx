import React, { useState } from 'react';
import { ArrowLeft, Calculator, Thermometer, Droplet, FlaskConical, Percent, Eye } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function Calculators() {
    const navigate = useNavigate();
    const [activeCalc, setActiveCalc] = useState('abv');

    // --- State for ABV Calc ---
    const [og, setOg] = useState(1.050);
    const [fg, setFg] = useState(1.010);
    const calcAbv = () => {
        // Standard formula: ABV = (OG - FG) * 131.25
        const abv = (og - fg) * 131.25;
        return Math.max(0, abv.toFixed(2));
    };

    // --- State for Hydrometer Correction Calc ---
    const [hydroReading, setHydroReading] = useState(1.050);
    const [hydroTemp, setHydroTemp] = useState(25);
    const [hydroCalTemp, setHydroCalTemp] = useState(20);
    const calcCorrection = () => {
        // Simple approximation for SG:
        // Correction = SG * ( (1.00130346 - 0.000134722124 * T + 0.00000204052596 * T^2 - 0.00000000232820948 * T^3) / (1.00130346 - 0.000134722124 * TC + 0.00000204052596 * TC^2 - 0.00000000232820948 * TC^3) )
        // Let's use simpler Brix/Plato / SG formula or just a basic scale.
        // For ABV/Density in % (Brix/Plato): correction approx is (Temp - Calibrate) * 0.3 for % 
        // For SG: 
        let cg = hydroReading;
        let tr = hydroTemp * 1.8 + 32; // to F
        let tc = hydroCalTemp * 1.8 + 32; // to F
        const corrected = cg * ((1.00130346 - 0.000134722124 * tr + 0.00000204052596 * Math.pow(tr, 2) - 0.00000000232820948 * Math.pow(tr, 3)) / (1.00130346 - 0.000134722124 * tc + 0.00000204052596 * Math.pow(tc, 2) - 0.00000000232820948 * Math.pow(tc, 3)));
        return Math.max(1.000, corrected).toFixed(4);
    };

    // --- State for Dilution (Разбавление спирта) ---
    const [volDilute, setVolDilute] = useState(1000); // ml
    const [abvInitial, setAbvInitial] = useState(96);
    const [abvTarget, setAbvTarget] = useState(40);
    const calcDilution = () => {
        // V2 = V1 * (C1 / C2)
        // Water = V2 - V1 = V1 * (C1 / C2 - 1)
        // With contraction! But without fertman table we use simplified:
        if (abvTarget >= abvInitial || abvTarget <= 0) return 0;
        const water = volDilute * (abvInitial / abvTarget - 1);
        return water.toFixed(0);
    };

    // --- State for Mixing (Смешивание спиртов) ---
    const [v1, setV1] = useState(1000);
    const [c1, setC1] = useState(40);
    const [v2, setV2] = useState(500);
    const [c2, setC2] = useState(90);
    const calcMixing = () => {
        // Total Volume = V1 + V2
        // Total pure = (V1*C1 + V2*C2)
        // Final ABV = Total pure / Total Volume
        const totalV = parseFloat(v1) + parseFloat(v2);
        if (totalV === 0) return 0;
        const totalPure = (parseFloat(v1) * parseFloat(c1) / 100) + (parseFloat(v2) * parseFloat(c2) / 100);
        return ((totalPure / totalV) * 100).toFixed(1);
    };

    // --- State for Refractometer (Fermenting Wort) ---
    const [origBrix, setOrigBrix] = useState(12.0);
    const [finalBrix, setFinalBrix] = useState(6.0);
    const [wortCorrection, setWortCorrection] = useState(1.04);
    const calcRefractometer = () => {
        const ob = parseFloat(origBrix) / parseFloat(wortCorrection);
        const fb = parseFloat(finalBrix) / parseFloat(wortCorrection);
        const fg = 1.0000 - 0.0044993 * ob + 0.011774 * fb + 0.00027581 * Math.pow(ob, 2) - 0.0012717 * Math.pow(fb, 2) - 0.0000072800 * Math.pow(ob, 3) + 0.000063293 * Math.pow(fb, 3);
        const og = (ob / (258.6 - ((ob / 258.2) * 227.1))) + 1;
        const abv = (og - fg) * 131.25;
        return { fg: isNaN(fg) ? "1.000" : fg.toFixed(3), abv: isNaN(abv) ? "0.0" : Math.max(0, abv).toFixed(2), og: isNaN(og) ? "1.000" : og.toFixed(3) };
    };

    return (
        <div style={{ padding: '2rem 1rem', maxWidth: '1000px', margin: '0 auto' }}>
            <header style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '2rem' }}>
                <button
                    onClick={() => navigate(-1)}
                    aria-label="Назад"
                    style={{ background: 'none', border: '1px solid var(--border-color)', color: 'var(--text-primary)', padding: '0.5rem', borderRadius: '4px' }}
                >
                    <ArrowLeft size={20} />
                </button>
                <h1 style={{ margin: 0, fontSize: '1.8rem', color: '#fff', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Calculator /> Калькуляторы Пивовара / Винокура
                </h1>
            </header>

            <div style={{ display: 'flex', gap: '1rem', marginBottom: '2rem', flexWrap: 'wrap' }}>
                <button
                    onClick={() => setActiveCalc('abv')}
                    style={{ flex: '1 1 200px', padding: '1rem', background: activeCalc === 'abv' ? 'rgba(76, 175, 80, 0.15)' : 'rgba(0,0,0,0.5)', border: `1px solid ${activeCalc === 'abv' ? '#4caf50' : '#333'}`, color: activeCalc === 'abv' ? '#4caf50' : '#888', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', fontWeight: 'bold' }}>
                    <Percent size={18} /> Крепость пива
                </button>
                <button
                    onClick={() => setActiveCalc('hydro')}
                    style={{ flex: '1 1 200px', padding: '1rem', background: activeCalc === 'hydro' ? 'rgba(255, 152, 0, 0.15)' : 'rgba(0,0,0,0.5)', border: `1px solid ${activeCalc === 'hydro' ? '#ff9800' : '#333'}`, color: activeCalc === 'hydro' ? '#ff9800' : '#888', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', fontWeight: 'bold' }}>
                    <Thermometer size={18} /> Коррекция ареометра
                </button>
                <button
                    onClick={() => setActiveCalc('dilute')}
                    style={{ flex: '1 1 200px', padding: '1rem', background: activeCalc === 'dilute' ? 'rgba(3, 169, 244, 0.15)' : 'rgba(0,0,0,0.5)', border: `1px solid ${activeCalc === 'dilute' ? '#03a9f4' : '#333'}`, color: activeCalc === 'dilute' ? '#03a9f4' : '#888', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', fontWeight: 'bold' }}>
                    <Droplet size={18} /> Разбавление водой
                </button>
                <button
                    onClick={() => setActiveCalc('mix')}
                    style={{ flex: '1 1 200px', padding: '1rem', background: activeCalc === 'mix' ? 'rgba(156, 39, 176, 0.15)' : 'rgba(0,0,0,0.5)', border: `1px solid ${activeCalc === 'mix' ? '#9c27b0' : '#333'}`, color: activeCalc === 'mix' ? '#9c27b0' : '#888', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', fontWeight: 'bold' }}>
                    <FlaskConical size={18} /> Смешивание спиртов
                </button>
                <button
                    onClick={() => setActiveCalc('refract')}
                    style={{ flex: '1 1 200px', padding: '1rem', background: activeCalc === 'refract' ? 'rgba(233, 30, 99, 0.15)' : 'rgba(0,0,0,0.5)', border: `1px solid ${activeCalc === 'refract' ? '#e91e63' : '#333'}`, color: activeCalc === 'refract' ? '#e91e63' : '#888', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', fontWeight: 'bold' }}>
                    <Eye size={18} /> Рефрактометр
                </button>
            </div>

            <main>
                {/* 1. ABV */}
                {activeCalc === 'abv' && (
                    <div className="industrial-panel" style={{ padding: '2rem' }}>
                        <h2 style={{ top: 0, marginTop: 0, color: '#4caf50' }}>Расчет крепости пива (ABV)</h2>
                        <p style={{ color: '#888', marginBottom: '2rem' }}>Определение содержания алкоголя на основе начальной и конечной плотности (Specific Gravity).</p>

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '2rem' }}>
                            <div>
                                <label style={{ display: 'block', color: '#aaa', marginBottom: '0.5rem' }}>Начальная плотность (OG)</label>
                                <input type="number" step="0.001" value={og} onChange={e => setOg(parseFloat(e.target.value) || 0)} style={{ width: '100%', padding: '0.8rem', background: '#000', border: '1px solid #444', color: '#fff', fontSize: '1.2rem', borderRadius: '4px' }} />
                            </div>
                            <div>
                                <label style={{ display: 'block', color: '#aaa', marginBottom: '0.5rem' }}>Конечная плотность (FG)</label>
                                <input type="number" step="0.001" value={fg} onChange={e => setFg(parseFloat(e.target.value) || 0)} style={{ width: '100%', padding: '0.8rem', background: '#000', border: '1px solid #444', color: '#fff', fontSize: '1.2rem', borderRadius: '4px' }} />
                            </div>
                        </div>

                        <div style={{ marginTop: '2rem', padding: '1.5rem', background: 'rgba(76, 175, 80, 0.1)', border: '1px solid rgba(76, 175, 80, 0.3)', borderRadius: '8px', textAlign: 'center' }}>
                            <div style={{ fontSize: '1.2rem', color: '#ccc' }}>Крепость (Алкоголь по объему):</div>
                            <div style={{ fontSize: '3rem', fontWeight: 'bold', color: '#4caf50' }}>{calcAbv()}%</div>
                        </div>
                    </div>
                )}

                {/* 2. Hydrometer Correction */}
                {activeCalc === 'hydro' && (
                    <div className="industrial-panel" style={{ padding: '2rem' }}>
                        <h2 style={{ top: 0, marginTop: 0, color: '#ff9800' }}>Коррекция показаний ареометра</h2>
                        <p style={{ color: '#888', marginBottom: '2rem' }}>Ареометры откалиброваны при определенной температуре (обычно 20°C). Если вы проводите замеры горячего или холодного сусла, плотность меняется.</p>

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '2rem' }}>
                            <div>
                                <label style={{ display: 'block', color: '#aaa', marginBottom: '0.5rem' }}>Показания прибора (SG)</label>
                                <input type="number" step="0.001" value={hydroReading} onChange={e => setHydroReading(parseFloat(e.target.value) || 0)} style={{ width: '100%', padding: '0.8rem', background: '#000', border: '1px solid #444', color: '#fff', fontSize: '1.2rem', borderRadius: '4px' }} />
                            </div>
                            <div>
                                <label style={{ display: 'block', color: '#aaa', marginBottom: '0.5rem' }}>Температура сусла (°C)</label>
                                <input type="number" step="0.1" value={hydroTemp} onChange={e => setHydroTemp(parseFloat(e.target.value) || 0)} style={{ width: '100%', padding: '0.8rem', background: '#000', border: '1px solid #444', color: '#fff', fontSize: '1.2rem', borderRadius: '4px' }} />
                            </div>
                            <div>
                                <label style={{ display: 'block', color: '#aaa', marginBottom: '0.5rem' }}>Калибровка прибора (°C)</label>
                                <input type="number" step="1" value={hydroCalTemp} onChange={e => setHydroCalTemp(parseFloat(e.target.value) || 0)} style={{ width: '100%', padding: '0.8rem', background: '#000', border: '1px solid #444', color: '#fff', fontSize: '1.2rem', borderRadius: '4px' }} />
                            </div>
                        </div>

                        <div style={{ marginTop: '2rem', padding: '1.5rem', background: 'rgba(255, 152, 0, 0.1)', border: '1px solid rgba(255, 152, 0, 0.3)', borderRadius: '8px', textAlign: 'center' }}>
                            <div style={{ fontSize: '1.2rem', color: '#ccc' }}>Скорректированная плотность (SG):</div>
                            <div style={{ fontSize: '3rem', fontWeight: 'bold', color: '#ff9800' }}>{calcCorrection()}</div>
                        </div>
                    </div>
                )}

                {/* 3. Dilution */}
                {activeCalc === 'dilute' && (
                    <div className="industrial-panel" style={{ padding: '2rem' }}>
                        <h2 style={{ top: 0, marginTop: 0, color: '#03a9f4' }}>Разбавление спирта водой</h2>
                        <p style={{ color: '#888', marginBottom: '2rem' }}>Расчет количества воды, необходимого для получения желаемой крепости (дистилляция, ректификация).</p>

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '2rem' }}>
                            <div>
                                <label style={{ display: 'block', color: '#aaa', marginBottom: '0.5rem' }}>Объем спирта (мл)</label>
                                <input type="number" step="1" value={volDilute} onChange={e => setVolDilute(parseFloat(e.target.value) || 0)} style={{ width: '100%', padding: '0.8rem', background: '#000', border: '1px solid #444', color: '#fff', fontSize: '1.2rem', borderRadius: '4px' }} />
                            </div>
                            <div>
                                <label style={{ display: 'block', color: '#aaa', marginBottom: '0.5rem' }}>Текущая крепость (%)</label>
                                <input type="number" step="0.1" value={abvInitial} onChange={e => setAbvInitial(parseFloat(e.target.value) || 0)} style={{ width: '100%', padding: '0.8rem', background: '#000', border: '1px solid #444', color: '#fff', fontSize: '1.2rem', borderRadius: '4px' }} />
                            </div>
                            <div>
                                <label style={{ display: 'block', color: '#aaa', marginBottom: '0.5rem' }}>Желаемая крепость (%)</label>
                                <input type="number" step="0.1" value={abvTarget} onChange={e => setAbvTarget(parseFloat(e.target.value) || 0)} style={{ width: '100%', padding: '0.8rem', background: '#000', border: '1px solid #444', color: '#fff', fontSize: '1.2rem', borderRadius: '4px' }} />
                            </div>
                        </div>

                        <div style={{ marginTop: '2rem', padding: '1.5rem', background: 'rgba(3, 169, 244, 0.1)', border: '1px solid rgba(3, 169, 244, 0.3)', borderRadius: '8px', textAlign: 'center' }}>
                            <div style={{ fontSize: '1.2rem', color: '#ccc' }}>Необходимо добавить воды:</div>
                            <div style={{ fontSize: '3rem', fontWeight: 'bold', color: '#03a9f4' }}>{calcDilution()} мл</div>
                            <div style={{ marginTop: '0.5rem', color: '#888', fontSize: '0.9rem' }}>Итоговый объем: {parseFloat(volDilute) + parseFloat(calcDilution())} мл</div>
                        </div>
                    </div>
                )}

                {/* 4. Mixing */}
                {activeCalc === 'mix' && (
                    <div className="industrial-panel" style={{ padding: '2rem' }}>
                        <h2 style={{ top: 0, marginTop: 0, color: '#9c27b0' }}>Смешивание жидкостей разной крепости</h2>
                        <p style={{ color: '#888', marginBottom: '2rem' }}>Помогает узнать итоговую крепость при сливании спиртов (например, тело и хвосты).</p>

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '2rem' }}>
                            <div>
                                <h3 style={{ borderBottom: '1px solid #444', paddingBottom: '0.5rem', color: '#ccc' }}>Жидкость 1</h3>
                                <label style={{ display: 'block', color: '#aaa', marginBottom: '0.5rem', marginTop: '1rem' }}>Объем (мл)</label>
                                <input type="number" step="1" value={v1} onChange={e => setV1(parseFloat(e.target.value) || 0)} style={{ width: '100%', padding: '0.8rem', background: '#000', border: '1px solid #444', color: '#fff', fontSize: '1.2rem', borderRadius: '4px' }} />

                                <label style={{ display: 'block', color: '#aaa', marginBottom: '0.5rem', marginTop: '1rem' }}>Крепость (%)</label>
                                <input type="number" step="0.1" value={c1} onChange={e => setC1(parseFloat(e.target.value) || 0)} style={{ width: '100%', padding: '0.8rem', background: '#000', border: '1px solid #444', color: '#fff', fontSize: '1.2rem', borderRadius: '4px' }} />
                            </div>
                            <div>
                                <h3 style={{ borderBottom: '1px solid #444', paddingBottom: '0.5rem', color: '#ccc' }}>Жидкость 2</h3>
                                <label style={{ display: 'block', color: '#aaa', marginBottom: '0.5rem', marginTop: '1rem' }}>Объем (мл)</label>
                                <input type="number" step="1" value={v2} onChange={e => setV2(parseFloat(e.target.value) || 0)} style={{ width: '100%', padding: '0.8rem', background: '#000', border: '1px solid #444', color: '#fff', fontSize: '1.2rem', borderRadius: '4px' }} />

                                <label style={{ display: 'block', color: '#aaa', marginBottom: '0.5rem', marginTop: '1rem' }}>Крепость (%)</label>
                                <input type="number" step="0.1" value={c2} onChange={e => setC2(parseFloat(e.target.value) || 0)} style={{ width: '100%', padding: '0.8rem', background: '#000', border: '1px solid #444', color: '#fff', fontSize: '1.2rem', borderRadius: '4px' }} />
                            </div>
                        </div>

                        <div style={{ marginTop: '2rem', padding: '1.5rem', background: 'rgba(156, 39, 176, 0.1)', border: '1px solid rgba(156, 39, 176, 0.3)', borderRadius: '8px', textAlign: 'center' }}>
                            <div style={{ fontSize: '1.2rem', color: '#ccc' }}>Итоговая крепость смеси:</div>
                            <div style={{ fontSize: '3rem', fontWeight: 'bold', color: '#9c27b0' }}>{calcMixing()}%</div>
                            <div style={{ marginTop: '0.5rem', color: '#888', fontSize: '0.9rem' }}>Итоговый объем: {parseFloat(v1) + parseFloat(v2)} мл</div>
                        </div>
                    </div>
                )}

                {/* 5. Refractometer */}
                {activeCalc === 'refract' && (
                    <div className="industrial-panel" style={{ padding: '2rem' }}>
                        <h2 style={{ top: 0, marginTop: 0, color: '#e91e63' }}>Рефрактометр (Брожение)</h2>
                        <p style={{ color: '#888', marginBottom: '2rem' }}>Алкоголь искажает показания рефрактометра (Brix) во время и после брожения пива. Этот калькулятор пересчитывает Brix в реальную конечную плотность (FG) и крепость (ABV) по формуле Шона Террилла (Sean Terrill).</p>

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '2rem' }}>
                            <div>
                                <label style={{ display: 'block', color: '#aaa', marginBottom: '0.5rem' }}>Начальная плотность (Brix)</label>
                                <input type="number" step="0.1" value={origBrix} onChange={e => setOrigBrix(parseFloat(e.target.value))} style={{ width: '100%', padding: '0.8rem', background: '#000', border: '1px solid #444', color: '#fff', fontSize: '1.2rem', borderRadius: '4px' }} />
                                <div style={{ marginTop: '0.5rem', fontSize: '0.85rem', color: '#666' }}>До начала брожения (OG)</div>
                            </div>
                            <div>
                                <label style={{ display: 'block', color: '#aaa', marginBottom: '0.5rem' }}>Текущая плотность (Brix)</label>
                                <input type="number" step="0.1" value={finalBrix} onChange={e => setFinalBrix(parseFloat(e.target.value))} style={{ width: '100%', padding: '0.8rem', background: '#000', border: '1px solid #444', color: '#fff', fontSize: '1.2rem', borderRadius: '4px' }} />
                                <div style={{ marginTop: '0.5rem', fontSize: '0.85rem', color: '#666' }}>Текущие показания прибора</div>
                            </div>
                            <div>
                                <label style={{ display: 'block', color: '#aaa', marginBottom: '0.5rem' }}>Коррекция сусла (WCF)</label>
                                <input type="number" step="0.01" value={wortCorrection} onChange={e => setWortCorrection(parseFloat(e.target.value))} style={{ width: '100%', padding: '0.8rem', background: '#000', border: '1px solid #444', color: '#fff', fontSize: '1.2rem', borderRadius: '4px' }} />
                                <div style={{ marginTop: '0.5rem', fontSize: '0.85rem', color: '#666' }}>Обычно 1.04 для пивного сусла</div>
                            </div>
                        </div>

                        <div style={{ marginTop: '2rem', padding: '1.5rem', background: 'rgba(233, 30, 99, 0.1)', border: '1px solid rgba(233, 30, 99, 0.3)', borderRadius: '8px', display: 'flex', flexWrap: 'wrap', gap: '2rem', justifyContent: 'space-around' }}>
                            <div style={{ textAlign: 'center' }}>
                                <div style={{ fontSize: '1.1rem', color: '#bbb', marginBottom: '0.5rem' }}>Расчетная OG (SG)</div>
                                <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#fff' }}>{calcRefractometer().og}</div>
                            </div>
                            <div style={{ textAlign: 'center' }}>
                                <div style={{ fontSize: '1.1rem', color: '#bbb', marginBottom: '0.5rem' }}>Истинная FG (SG)</div>
                                <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#e91e63' }}>{calcRefractometer().fg}</div>
                            </div>
                            <div style={{ textAlign: 'center' }}>
                                <div style={{ fontSize: '1.1rem', color: '#bbb', marginBottom: '0.5rem' }}>Крепость (ABV)</div>
                                <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#e91e63' }}>{calcRefractometer().abv}%</div>
                            </div>
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
}
