import React, { useState, useEffect } from 'react';
import { Cpu, Edit2, Check, X, Trash2, RefreshCw } from 'lucide-react';
import { deviceApi } from '../api/client';

export default function DeviceManagement() {
    const [devices, setDevices] = useState([]);
    const [loading, setLoading] = useState(true);
    const [editingId, setEditingId] = useState(null);
    const [editName, setEditName] = useState('');

    const fetchDevices = async () => {
        setLoading(true);
        try {
            const data = await deviceApi.getAll();
            setDevices(data);
        } catch (err) {
            console.error('[Devices] Failed to fetch:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchDevices();
        const interval = setInterval(fetchDevices, 5000);
        return () => clearInterval(interval);
    }, []);

    const handleRename = async (id) => {
        try {
            await deviceApi.update(id, { name: editName });
            setEditingId(null);
            fetchDevices();
        } catch (err) {
            alert('Ошибка при переименовании');
        }
    };

    const handleDelete = async (id) => {
        if (!window.confirm('Забыть это устройство?')) return;
        try {
            await deviceApi.delete(id);
            fetchDevices();
        } catch (err) {
            alert('Ошибка при удалении');
        }
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                    Обнаруженные контроллеры в сети
                </div>
                <button onClick={fetchDevices} style={{ background: 'none', border: 'none', color: 'var(--accent-blue)', cursor: 'pointer' }}>
                    <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
                </button>
            </div>

            {devices.length === 0 && !loading && (
                <div style={{ padding: '2rem', textAlign: 'center', background: 'rgba(255,255,255,0.02)', borderRadius: '8px', border: '1px dashed #444' }}>
                    <Cpu size={32} color="#666" style={{ marginBottom: '0.5rem' }} />
                    <div style={{ color: '#666' }}>Устройства не найдены. Подключите ESP32 к сети.</div>
                </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                {devices.map(device => (
                    <div key={device.id} className="industrial-panel" style={{
                        padding: '1rem',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '1rem',
                        borderLeft: `4px solid ${device.status === 'online' ? '#2ecc71' : '#666'}`
                    }}>
                        <Cpu size={24} color={device.status === 'online' ? '#2ecc71' : '#666'} />

                        <div style={{ flex: 1 }}>
                            {editingId === device.id ? (
                                <div style={{ display: 'flex', gap: '0.5rem' }}>
                                    <input
                                        value={editName}
                                        onChange={e => setEditName(e.target.value)}
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
                                    color: device.status === 'online' ? '#2ecc71' : '#e74c3c',
                                    fontWeight: 'bold',
                                    textTransform: 'uppercase'
                                }}>
                                    {device.status}
                                </div>
                                <div style={{ fontSize: '0.6rem', color: '#444' }}>
                                    {new Date(device.last_seen).toLocaleTimeString()}
                                </div>
                            </div>
                            <button onClick={() => handleDelete(device.id)} style={{ color: '#444', background: 'none', border: 'none', cursor: 'pointer' }}><Trash2 size={16} /></button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
