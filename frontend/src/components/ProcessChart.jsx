import React, { useState, useEffect } from 'react';
import { ZoomIn, ZoomOut } from 'lucide-react';
import {
    LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
    ResponsiveContainer, ReferenceLine, Legend
} from 'recharts';
import '../pages/pages.css';

const TOOLTIP_STYLE = {
    background: '#1e1e1e', border: '1px solid #444', borderRadius: '4px'
};

/**
 * Reusable chart panel with zoom controls.
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
}) {
    const [mounted, setMounted] = useState(false);
    const [yMin, setYMin] = useState(defaultYMin);
    const [yMax, setYMax] = useState(defaultYMax);

    useEffect(() => { setMounted(true); }, []);

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

    return (
        <div className={`industrial-panel chart-panel ${height}`}>
            <div className="chart-zoom">
                <span>МАСШТАБ</span>
                <button className="chart-zoom__btn" onClick={zoomIn}><ZoomIn size={14} /></button>
                <button className="chart-zoom__btn" onClick={zoomOut}><ZoomOut size={14} /></button>
                <button className="chart-zoom__btn chart-zoom__btn--text" onClick={zoomReset}>СБРОС</button>
            </div>
            {mounted && (
                <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                    <LineChart data={data}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                        <XAxis dataKey="time" stroke="#666" fontSize={10} interval="preserveStartEnd" />
                        <YAxis domain={[yMin, yMax]} stroke="#666" fontSize={12} />
                        <Tooltip contentStyle={TOOLTIP_STYLE} labelStyle={{ color: '#999' }} />
                        {referenceLines.map((rl, i) => (
                            <ReferenceLine
                                key={i} y={rl.y} stroke={rl.color} strokeDasharray="5 5"
                                label={{ value: rl.label, fill: rl.color, fontSize: 10, position: 'insideTopRight' }}
                            />
                        ))}
                        {lines.map(l => (
                            <Line
                                key={l.dataKey}
                                type="monotone"
                                dataKey={l.dataKey}
                                stroke={l.color}
                                strokeWidth={l.width || 2}
                                dot={false}
                                name={l.name}
                            />
                        ))}
                        <Legend wrapperStyle={{ fontSize: '0.75rem' }} />
                    </LineChart>
                </ResponsiveContainer>
            )}
        </div>
    );
}
