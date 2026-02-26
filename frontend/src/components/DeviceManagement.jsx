import React, { useState, useEffect, useCallback } from 'react';
import { Cpu, Edit2, Check, X, Trash2, RefreshCw, Wifi, WifiOff } from 'lucide-react';
import { deviceApi } from '../api/client';

/**
 * DeviceManagement — shows discovered ESP controllers.
 *
 * Key improvements:
 * - No flickering: interval refresh doesn't set loading=true (only initial + manual refresh do)
 * - Fixed-height empty state to prevent layout shifts
 * - Clear messaging about what "forget" means
 * - Last fetch error is shown to user
 */
export default function DeviceManagement() {
    const [devices, setDevices] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [editingId, setEditingId] = useState(null);
    const [editName, setEditName] = useState('');

    // Fetch devices. showSpinner=true only on first load and manual refresh.
    const fetchDevices = useCallback(async (showSpinner = false) => {
        if (showSpinner) setLoading(true);
        try {
            const data = await deviceApi.getAll();
            setDevices(data);
            setError(null);
        } catch (err) {
            console.error('[Devices] Failed to fetch:', err);
            setError('Не удалось загрузить список устройств');
        } finally {
            if (showSpinner) setLoading(false);
        }
    }, []);

    useEffect(() => {
        // Initial load — show spinner
        fetchDevices(true);
        // Interval refresh — silent (no spinner, no layout shift)
        const interval = setInterval(() => fetchDevices(false), 5000);
        return () => clearInterval(interval);
    }, [fetchDevices]);

    const handleRefresh = () => {
        fetchDevices(true);
    };

    const handleRename = async (id) => {
        try {
            await deviceApi.update(id, { name: editName });
            setEditingId(null);
            fetchDevices(false);
        } catch (err) {
            alert('Ошибка при переименовании');
        }
    };

    const handleDelete = async (id) => {
        const device = devices.find(d => d.id === id);
        const deviceName = device?.name || id;
        if (!window.confirm(`Забыть устройство "${deviceName}"?\n\nУстройство будет удалено из списка. Если оно всё ещё подключено к сети, оно появится снова автоматически.`)) return;
        try {
            await deviceApi.delete(id);
            fetchDevices(false);
        } catch (err) {
            alert('Ошибка при удалении');
        }
    };

    const onlineCount = devices.filter(d => d.status === 'online').length;
    const totalCount = devices.length;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                    <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                        Обнаруженные контроллеры
                    </div>
                    {!loading && totalCount > 0 && (
                        <div style={{ fontSize: '0.7rem', color: '#666', marginTop: '0.2rem' }}>
                            {`${onlineCount} из ${totalCount} в сети`}
                        </div>
                    )}
                </div>
                <button
                    onClick={handleRefresh}
                    disabled={loading}
                    title="Обновить список"
                    style={{
                        background: 'none',
                        border: '1px solid #333',
                        borderRadius: '6px',
                        color: loading ? '#444' : 'var(--accent-blue)',
                        cursor: loading ? 'default' : 'pointer',
                        padding: '0.4rem 0.6rem',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.3rem',
                        fontSize: '0.75rem',
                        transition: 'all 0.2s'
                    }}
                >
                    <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                    Обновить
                </button>
            </div>

            {/* Error banner */}
            {error && (
                <div style={{
                    padding: '0.8rem 1rem',
                    background: 'rgba(244,67,54,0.08)',
                    border: '1px solid rgba(244,67,54,0.2)',
                    borderRadius: '8px',
                    color: '#f44336',
                    fontSize: '0.8rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem'
                }}>
                    <WifiOff size={16} />
                    {error}
                </div>
            )}

            {/* Loading skeleton (only on initial load) */}
            {loading && devices.length === 0 && (
                <div style={{
                    padding: '2rem',
                    textAlign: 'center',
                    background: 'rgba(255,255,255,0.02)',
                    borderRadius: '8px',
                    border: '1px solid #333',
                    minHeight: '80px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                }}>
                    <RefreshCw size={20} color="#666" className="animate-spin" />
                    <span style={{ color: '#666', marginLeft: '0.5rem', fontSize: '0.85rem' }}>
                        Загрузка...
                    </span>
                </div>
            )}

            {/* Empty state — fixed height to prevent layout shifts */}
            {!loading && devices.length === 0 && (
                <div style={{
                    padding: '2rem',
                    textAlign: 'center',
                    background: 'rgba(255,255,255,0.02)',
                    borderRadius: '8px',
                    border: '1px dashed #444',
                    minHeight: '80px',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.5rem'
                }}>
                    <Cpu size={28} color="#555" />
                    <div style={{ color: '#888', fontSize: '0.85rem' }}>
                        Нет зарегистрированных устройств
                    </div>
                    <div style={{ color: '#555', fontSize: '0.7rem', maxWidth: '280px' }}>
                        Подключите ESP32 к WiFi-сети. Устройство зарегистрируется автоматически при подключении к серверу.
                    </div>
                </div>
            )}

            {/* Device list */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                {devices.map(device => (
                    <div key={device.id} className="industrial-panel" style={{
                        padding: '1rem',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '1rem',
                        borderLeft: `4px solid ${device.status === 'online' ? '#2ecc71' : '#666'}`,
                        transition: 'border-color 0.3s'
                    }}>
                        {device.status === 'online'
                            ? <Wifi size={20} color="#2ecc71" />
                            : <WifiOff size={20} color="#666" />
                        }

                        <div style={{ flex: 1 }}>
                            {editingId === device.id ? (
                                <div style={{ display: 'flex', gap: '0.5rem' }}>
                                    <input
                                        value={editName}
                                        onChange={e => setEditName(e.target.value)}
                                        onKeyDown={e => e.key === 'Enter' && handleRename(device.id)}
                                        style={{
                                            background: '#111',
                                            border: '1px solid #444',
                                            color: '#fff',
                                            padding: '0.2rem 0.5rem',
                                            borderRadius: '4px',
                                            flex: 1
                                        }}
                                        autoFocus
                                    />
                                    <button onClick={() => handleRename(device.id)} style={{ color: '#2ecc71', background: 'none', border: 'none', cursor: 'pointer' }}><Check size={18} /></button>
                                    <button onClick={() => setEditingId(null)} style={{ color: '#e74c3c', background: 'none', border: 'none', cursor: 'pointer' }}><X size={18} /></button>
                                </div>
                            ) : (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <span style={{ fontWeight: 'bold' }}>{device.name}</span>
                                    <button onClick={() => { setEditingId(device.id); setEditName(device.name); }} style={{ color: '#666', background: 'none', border: 'none', cursor: 'pointer' }}><Edit2 size={14} /></button>
                                </div>
                            )}
                            <div style={{ fontSize: '0.7rem', color: '#666', fontFamily: 'var(--font-mono)', marginTop: '0.2rem' }}>
                                ID: {device.id} • Роль: {device.role}
                            </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                            <div style={{ textAlign: 'right' }}>
                                <div style={{
                                    fontSize: '0.7rem',
                                    color: device.status === 'online' ? '#2ecc71' : '#888',
                                    fontWeight: 'bold',
                                    textTransform: 'uppercase'
                                }}>
                                    {device.status === 'online' ? 'в сети' : 'не в сети'}
                                </div>
                                <div style={{ fontSize: '0.6rem', color: '#444' }}>
                                    {new Date(device.last_seen).toLocaleTimeString()}
                                </div>
                            </div>
                            <button
                                onClick={() => handleDelete(device.id)}
                                title="Забыть устройство"
                                style={{
                                    color: '#666',
                                    background: 'none',
                                    border: 'none',
                                    cursor: 'pointer',
                                    padding: '0.3rem',
                                    borderRadius: '4px',
                                    transition: 'color 0.2s'
                                }}
                            >
                                <Trash2 size={16} />
                            </button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
