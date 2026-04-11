import React, { useState, useEffect, useMemo } from 'react';
import { ZoomIn, ZoomOut } from 'lucide-react';
import {
    ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip,
    ResponsiveContainer, ReferenceLine, Legend, Brush
} from 'recharts';
import { sessionsApi } from '../api/client';
import '../pages/pages.css';

const TOOLTIP_STYLE = {
    background: 'rgba(20, 20, 20, 0.85)',
    border: '1px solid #444',
    borderRadius: '4px',
    backdropFilter: 'blur(4px)',
    boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
    color: '#fff',
    fontSize: '0.85rem'
};

// Panel height overrides to accommodate toolbar + Brush
const HEIGHT_CONFIG = {
    'chart-panel--sm': { panel: 340, chart: 270 },
    'chart-panel--md': { panel: 410, chart: 340 },
    'chart-panel--lg': { panel: 460, chart: 390 },
};

/**
 * Reusable chart panel with zoom controls, period selector, Brush pan,
 * heater power overlay and previous-session comparison.
 *
 * @param {{
 *   data: Array,
 *   lines: Array<{ dataKey: string, color: string, name: string, width?: number }>,
 *   referenceLines?: Array<{ y: number, color: string, label: string }>,
 *   height?: string,
 *   defaultYMin?: number,
 *   defaultYMax?: number,
 *   maxZoomRange?: number,
 *   minZoomRange?: number,
 *   sessionId?: string|null,
 *   recipeId?: number|null,
 *   sessionType?: string,
 *   accentColor?: string,
 * }} props
 */
export function ProcessChart({
    data,
    lines,
    referenceLines = [],
    height = 'chart-panel--md',
    defaultYMin = 0,
    defaultYMax = 100,
    maxZoomRange = 60,
    minZoomRange = 5,
    // Session-aware features
    sessionId = null,
    recipeId = null,
    sessionType = 'boil',
    accentColor = 'var(--primary-color)',
}) {
    const [mounted, setMounted] = useState(false);
    const [yMin, setYMin] = useState(defaultYMin);
    const [yMax, setYMax] = useState(defaultYMax);

    // Extended features state
    const [periodMinutes, setPeriodMinutes] = useState(null);
    const [showHeaterPower, setShowHeaterPower] = useState(false);
    const [showPrevSession, setShowPrevSession] = useState(false);
    const [prevHistory, setPrevHistory] = useState([]);

    useEffect(() => { setMounted(true); }, []);

    // Load previous session data for comparison
    useEffect(() => {
        if (!showPrevSession || !recipeId || !sessionId || sessionId === 'new') {
            if (!showPrevSession) setPrevHistory([]);
            return;
        }
        sessionsApi.getAll(sessionType).then(sessions => {
            const prev = sessions
                .filter(s => s.recipe_id === recipeId && String(s.id) !== String(sessionId))
                .sort((a, b) => new Date(b.started_at) - new Date(a.started_at))[0];
            if (!prev) return null;
            return sessionsApi.getTemperatures(prev.id, 5000);
        }).then(res => {
            if (!res) return;
            const formatted = res.map(row => ({
                temp: row.value,
                unix: new Date(row.timestamp).getTime()
            })).reverse();
            setPrevHistory(formatted);
        }).catch(e => console.warn('[ProcessChart] Could not load prev session', e));
    }, [showPrevSession, recipeId, sessionId, sessionType]);

    // Zoom helpers
    const zoomIn = () => {
        const mid = (yMin + yMax) / 2;
        const r = Math.max((yMax - yMin) / 2 * 0.7, minZoomRange);
        setYMin(Math.round(mid - r));
        setYMax(Math.round(mid + r));
    };
    const zoomOut = () => {
        const mid = (yMin + yMax) / 2;
        const r = Math.min((yMax - yMin) / 2 * 1.4, maxZoomRange);
        setYMin(Math.round(mid - r));
        setYMax(Math.round(mid + r));
    };
    const zoomReset = () => { setYMin(defaultYMin); setYMax(defaultYMax); };

    // Filter data by selected period
    const filteredData = useMemo(() => {
        if (!periodMinutes) return data;
        const cutoff = Date.now() - periodMinutes * 60 * 1000;
        return data.filter(p => p.unix >= cutoff);
    }, [data, periodMinutes]);

    // Merge current session with previous (normalised to relative minutes)
    const chartData = useMemo(() => {
        if (!showPrevSession || prevHistory.length === 0) return filteredData;

        const firstUnix = filteredData[0]?.unix || Date.now();
        const currentByMin = {};
        filteredData.forEach(p => {
            const relMin = Math.round((p.unix - firstUnix) / 60000);
            if (!currentByMin[relMin]) currentByMin[relMin] = p;
        });

        const prevFirstUnix = prevHistory[0]?.unix || 0;
        const prevByMin = {};
        prevHistory.forEach(p => {
            const relMin = Math.round((p.unix - prevFirstUnix) / 60000);
            if (prevByMin[relMin] === undefined) prevByMin[relMin] = p.temp;
        });

        const allMins = new Set([
            ...Object.keys(currentByMin).map(Number),
            ...Object.keys(prevByMin).map(Number),
        ]);

        return Array.from(allMins).sort((a, b) => a - b).map(min => ({
            time: `${min} мин`,
            ...currentByMin[min],
            prevTemp: prevByMin[min] ?? null,
        }));
    }, [showPrevSession, prevHistory, filteredData]);

    // Session-aware features are shown only when sessionId is provided
    const canShowSessionFeatures = Boolean(sessionId && sessionId !== 'new');
    const { panel: panelHeight, chart: chartHeight } = HEIGHT_CONFIG[height] || HEIGHT_CONFIG['chart-panel--lg'];

    return (
        <div className={`industrial-panel chart-panel ${height}`} style={{ height: panelHeight }}>
            {/* ── Toolbar ── */}
            <div style={{
                display: 'flex', gap: '0.3rem', flexWrap: 'wrap', alignItems: 'center',
                marginBottom: '0.5rem', fontSize: '0.7rem', color: 'var(--text-secondary)',
            }}>
                <span style={{ letterSpacing: '0.05em' }}>ПЕРИОД:</span>
                {[{ v: null, l: 'ВСЁ' }, { v: 30, l: '30м' }, { v: 60, l: '1ч' }, { v: 120, l: '2ч' }].map(({ v, l }) => (
                    <button key={l} className="chart-zoom__btn"
                        onClick={() => setPeriodMinutes(v)}
                        style={{
                            padding: '0.2rem 0.45rem',
                            background: periodMinutes === v ? 'rgba(255,152,0,0.2)' : undefined,
                            color: periodMinutes === v ? accentColor : undefined,
                            borderColor: periodMinutes === v ? accentColor : undefined,
                            fontWeight: periodMinutes === v ? 'bold' : undefined,
                        }}>
                        {l}
                    </button>
                ))}

                <div style={{ flex: 1, minWidth: '0.5rem' }} />

                {canShowSessionFeatures && (
                    <button className="chart-zoom__btn"
                        onClick={() => setShowHeaterPower(v => !v)}
                        title="Показать мощность нагревателя"
                        style={{
                            padding: '0.2rem 0.5rem',
                            background: showHeaterPower ? 'rgba(255,82,82,0.15)' : undefined,
                            color: showHeaterPower ? '#ff5252' : undefined,
                            borderColor: showHeaterPower ? '#ff5252' : undefined,
                        }}>
                        🔥 НАГРЕВ
                    </button>
                )}
                {canShowSessionFeatures && (
                    <button className="chart-zoom__btn"
                        onClick={() => setShowPrevSession(v => !v)}
                        title="Сравнить с предыдущей варкой того же рецепта"
                        style={{
                            padding: '0.2rem 0.5rem',
                            background: showPrevSession ? 'rgba(100,181,246,0.15)' : undefined,
                            color: showPrevSession ? 'var(--accent-blue)' : undefined,
                            borderColor: showPrevSession ? 'var(--accent-blue)' : undefined,
                        }}>
                        📊 ПРОШЛАЯ
                    </button>
                )}

                <div style={{ width: '0.4rem' }} />
                <span>МАСШТАБ</span>
                <button className="chart-zoom__btn" onClick={zoomIn}><ZoomIn size={14} /></button>
                <button className="chart-zoom__btn" onClick={zoomOut}><ZoomOut size={14} /></button>
                <button className="chart-zoom__btn chart-zoom__btn--text" onClick={zoomReset}>СБРОС</button>
            </div>

            {/* ── Chart ── */}
            {mounted && (
                <ResponsiveContainer width="100%" height={chartHeight} minWidth={0} minHeight={0}>
                    <ComposedChart data={chartData}>
                        <defs>
                            {lines.map((l, i) => (
                                <linearGradient key={`grad-${i}`} id={`color-${l.dataKey}`} x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor={l.color} stopOpacity={0.4} />
                                    <stop offset="95%" stopColor={l.color} stopOpacity={0} />
                                </linearGradient>
                            ))}
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                        <XAxis dataKey="time" stroke="#666" fontSize={10} interval="preserveStartEnd" minTickGap={30} tickMargin={5} />
                        <YAxis yAxisId="left" domain={[yMin, yMax]} stroke="#888" fontSize={11} tickMargin={5} width={30} />
                        {showHeaterPower && (
                            <YAxis yAxisId="right" orientation="right" domain={[0, 100]} stroke="#ff5252" fontSize={10} tickMargin={5} width={28} tickFormatter={v => `${v}%`} />
                        )}
                        <Tooltip contentStyle={TOOLTIP_STYLE} itemStyle={{ fontWeight: 'bold' }} labelStyle={{ color: '#aaa', marginBottom: '0.3rem' }} />

                        {/* Horizontal reference lines (e.g. target boil temp) */}
                        {referenceLines.map((rl, i) => (
                            <ReferenceLine key={i} y={rl.y} yAxisId="left"
                                stroke={rl.color} strokeDasharray="5 5"
                                label={{ value: rl.label, fill: rl.color, fontSize: 10, position: 'insideTopRight' }}
                            />
                        ))}

                        {/* Main data series */}
                        {lines.map((l) => (
                            <Area key={l.dataKey} yAxisId="left"
                                type="monotone" dataKey={l.dataKey}
                                stroke={l.color} fillOpacity={1} fill={`url(#color-${l.dataKey})`}
                                strokeWidth={l.width || 2} dot={false}
                                activeDot={{ r: 4, fill: l.color, stroke: '#1e1e1e', strokeWidth: 2 }}
                                name={l.name} isAnimationActive={false} connectNulls={false}
                            />
                        ))}

                        {/* Previous session overlay */}
                        {showPrevSession && (
                            <Line yAxisId="left"
                                type="monotone" dataKey="prevTemp" stroke="rgba(100,181,246,0.65)"
                                strokeWidth={1.5} strokeDasharray="3 3" dot={false}
                                name="Прошлая варка" isAnimationActive={false} connectNulls={false}
                            />
                        )}

                        {/* Heater power overlay (right axis, live data only) */}
                        {showHeaterPower && (
                            <Line yAxisId="right"
                                type="stepAfter" dataKey="heaterPower" stroke="#ff5252"
                                strokeWidth={1.5} strokeDasharray="2 2" dot={false}
                                name="Нагрев %" isAnimationActive={false} connectNulls={false}
                            />
                        )}

                        <Legend wrapperStyle={{ fontSize: '0.75rem', paddingTop: '6px' }} iconType="circle" />

                        {/* Brush — pan/zoom timeline scrubber */}
                        <Brush
                            dataKey="time"
                            height={24}
                            stroke="#444"
                            fill="rgba(255,255,255,0.03)"
                            travellerWidth={8}
                            tickFormatter={() => ''}
                        />
                    </ComposedChart>
                </ResponsiveContainer>
            )}
        </div>
    );
}
