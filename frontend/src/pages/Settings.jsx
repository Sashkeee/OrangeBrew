import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import {
    ArrowLeft, Settings as SettingsIcon, Cpu, Thermometer, Sliders,
    Wifi, Bell, Shield, Palette, Info, Save, RotateCcw,
    ChevronDown, ChevronRight, CheckCircle, AlertTriangle,
    Usb, Radio, Bot, Eye, Moon, Sun, Globe, Gauge,
    Zap, Droplets, Timer, Database, Download, Upload, Trash2
} from 'lucide-react';
import { settingsApi } from '../api/client.js';
import PidTuningPanel from '../components/PidTuningPanel';

// Дефолтные настройки
const DEFAULT_SETTINGS = {
    // Железо
    hardware: {
        connectionType: 'serial',       // serial | wifi | mock
        serialPort: 'COM3',
        baudRate: 115200,
        esp32Ip: '192.168.1.100',
        esp32Port: 80,
        reconnectInterval: 5,           // секунд
        watchdogTimeout: 10,            // секунд
    },
    // Датчики
    sensors: {
        boiler: { name: 'Куб', offset: 0, address: '28-0000001', enabled: true },
        column: { name: 'Колонна', offset: 0, address: '28-0000002', enabled: true },
        dephleg: { name: 'Дефлегматор', offset: 0, address: '28-0000003', enabled: true },
        output: { name: 'Выход', offset: 0, address: '28-0000004', enabled: true },
        ambient: { name: 'Окр. среда', offset: 0, address: '28-0000005', enabled: false },
    },
    // PID
    pid: {
        kp: 2.0,
        ki: 0.5,
        kd: 1.0,
        sampleTime: 1000,              // мс
        outputMin: 0,
        outputMax: 100,
        mode: 'auto',
    },
    // Телеграм
    telegram: {
        enabled: false,
        botToken: '',
        chatId: '',
        notifyPhaseChange: true,
        notifyTempAlert: true,
        notifyComplete: true,
        notifyInterval: 5,             // минут (периодический отчёт)
    },
    // Tailscale
    tailscale: {
        enabled: false,
        hostname: 'orangebrew',
    },
    // Безопасность
    safety: {
        maxBoilerTemp: 100,
        maxColumnTemp: 95,
        maxHeaterPower: 100,
        emergencyShutdownTemp: 105,
        heaterDryRunProtection: true,
        cooldownOnStop: true,
        cooldownDuration: 60,          // секунд
    },
    // UI
    ui: {
        theme: 'dark',
        language: 'ru',
        tempUnit: 'celsius',
        graphPoints: 120,
        soundAlerts: true,
        animationsEnabled: true,
    },
};

// Секции
const SECTIONS = [
    { id: 'hardware', label: 'Оборудование', icon: Cpu, color: '#ff9800' },
    { id: 'sensors', label: 'Датчики', icon: Thermometer, color: '#03a9f4' },
    { id: 'pid', label: 'PID-регулятор', icon: Sliders, color: '#4caf50' },
    { id: 'telegram', label: 'Telegram бот', icon: Bot, color: '#29b6f6' },
    { id: 'tailscale', label: 'Удалённый доступ', icon: Globe, color: '#7c4dff' },
    { id: 'safety', label: 'Безопасность', icon: Shield, color: '#f44336' },
    { id: 'ui', label: 'Интерфейс', icon: Palette, color: '#ce93d8' },
    { id: 'data', label: 'Данные', icon: Database, color: '#78909c' },
    { id: 'about', label: 'О системе', icon: Info, color: '#455a64' },
];

const SettingsPage = () => {
    const navigate = useNavigate();
    const [settings, setSettings] = useState(DEFAULT_SETTINGS);
    const [activeSection, setActiveSection] = useState('hardware');
    const [hasChanges, setHasChanges] = useState(false);
    const [saved, setSaved] = useState(false);
    const [expandedSensors, setExpandedSensors] = useState({});

    const fetchSettings = useCallback(async () => {
        try {
            const apiSettings = await settingsApi.getAll();
            if (apiSettings && Object.keys(apiSettings).length > 0) {
                const merged = { ...DEFAULT_SETTINGS };
                for (const [key, value] of Object.entries(apiSettings)) {
                    if (typeof value === 'object' && value !== null && merged[key]) {
                        merged[key] = { ...merged[key], ...value };
                    } else {
                        merged[key] = value;
                    }
                }
                setSettings(merged);
                return;
            }
        } catch { /* API unavailable, fallback to localStorage */ }
        const stored = localStorage.getItem('orangebrew_settings');
        if (stored) {
            try {
                setSettings(prev => ({ ...prev, ...JSON.parse(stored) }));
            } catch { /* ignore */ }
        }
    }, []);

    // Загрузка из API (с фоллбэком на localStorage)
    useEffect(() => {
        fetchSettings();
    }, [fetchSettings]);

    const updateSetting = (section, key, value) => {
        setSettings(prev => ({
            ...prev,
            [section]: { ...prev[section], [key]: value }
        }));
        setHasChanges(true);
        setSaved(false);
    };

    const updateSensorSetting = (sensorId, key, value) => {
        setSettings(prev => ({
            ...prev,
            sensors: {
                ...prev.sensors,
                [sensorId]: { ...prev.sensors[sensorId], [key]: value }
            }
        }));
        setHasChanges(true);
        setSaved(false);
    };

    const handleSave = async () => {
        // Save to both API and localStorage
        try {
            await settingsApi.update(settings);
        } catch (e) {
            console.warn('[Settings] API save failed, saving to localStorage only', e);
        }
        localStorage.setItem('orangebrew_settings', JSON.stringify(settings));
        setHasChanges(false);
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
    };

    const handleReset = () => {
        if (window.confirm('Сбросить все настройки к значениям по умолчанию?')) {
            setSettings(DEFAULT_SETTINGS);
            localStorage.removeItem('orangebrew_settings');
            setHasChanges(false);
        }
    };

    const handleExport = () => {
        const blob = new Blob([JSON.stringify(settings, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'orangebrew_settings.json';
        a.click();
        URL.revokeObjectURL(url);
    };

    const handleImport = () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = (e) => {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (ev) => {
                    try {
                        const imported = JSON.parse(ev.target.result);
                        setSettings(prev => ({ ...prev, ...imported }));
                        setHasChanges(true);
                    } catch { alert('Ошибка чтения файла'); }
                };
                reader.readAsText(file);
            }
        };
        input.click();
    };

    // Стили
    const inputStyle = {
        width: '100%', padding: '0.6rem 0.8rem', background: 'rgba(255,255,255,0.04)',
        border: '1px solid #444', borderRadius: '6px', color: 'var(--text-primary)',
        fontFamily: 'var(--font-mono)', fontSize: '0.85rem', outline: 'none',
        transition: 'border-color 0.2s',
    };

    const selectStyle = { ...inputStyle, appearance: 'none', cursor: 'pointer' };

    const labelStyle = {
        fontSize: '0.75rem', color: 'var(--text-secondary)', letterSpacing: '0.03em',
        marginBottom: '0.3rem', display: 'block',
    };

    const toggleStyle = (active) => ({
        position: 'relative', width: '44px', height: '24px', borderRadius: '12px',
        background: active ? 'var(--accent-green)' : 'rgba(255,255,255,0.1)',
        border: 'none', cursor: 'pointer', transition: 'background 0.3s', flexShrink: 0,
    });

    const toggleDotStyle = (active) => ({
        position: 'absolute', top: '3px', left: active ? '23px' : '3px',
        width: '18px', height: '18px', borderRadius: '50%', background: '#fff',
        transition: 'left 0.3s', boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
    });

    const Toggle = ({ value, onChange }) => (
        <button style={toggleStyle(value)} onClick={() => onChange(!value)}>
            <div style={toggleDotStyle(value)} />
        </button>
    );

    const SettingRow = ({ label, description, children }) => (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.8rem 0', borderBottom: '1px solid rgba(255,255,255,0.04)', gap: '1rem' }}>
            <div style={{ flex: 1 }}>
                <div style={{ fontSize: '0.9rem' }}>{label}</div>
                {description && <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: '0.15rem' }}>{description}</div>}
            </div>
            <div style={{ minWidth: '160px', display: 'flex', justifyContent: 'flex-end' }}>{children}</div>
        </div>
    );

    // Рендер секций
    const renderSection = () => {
        switch (activeSection) {
            case 'hardware':
                return (
                    <div>
                        <SettingRow label="Тип подключения" description="Способ связи с ESP32">
                            <select value={settings.hardware.connectionType} onChange={e => updateSetting('hardware', 'connectionType', e.target.value)}
                                style={{ ...selectStyle, width: '160px' }}>
                                <option value="serial">USB Serial</option>
                                <option value="wifi">WiFi</option>
                                <option value="mock">Эмуляция</option>
                            </select>
                        </SettingRow>

                        {settings.hardware.connectionType === 'serial' && (
                            <>
                                <SettingRow label="COM-порт" description="Порт подключения ESP32">
                                    <input value={settings.hardware.serialPort} onChange={e => updateSetting('hardware', 'serialPort', e.target.value)}
                                        style={{ ...inputStyle, width: '160px' }} placeholder="COM3" />
                                </SettingRow>
                                <SettingRow label="Скорость (бод)" description="Скорость Serial">
                                    <select value={settings.hardware.baudRate} onChange={e => updateSetting('hardware', 'baudRate', parseInt(e.target.value))}
                                        style={{ ...selectStyle, width: '160px' }}>
                                        {[9600, 19200, 38400, 57600, 115200].map(r => <option key={r} value={r}>{r}</option>)}
                                    </select>
                                </SettingRow>
                            </>
                        )}

                        {settings.hardware.connectionType === 'wifi' && (
                            <>
                                <SettingRow label="IP-адрес ESP32">
                                    <input value={settings.hardware.esp32Ip} onChange={e => updateSetting('hardware', 'esp32Ip', e.target.value)}
                                        style={{ ...inputStyle, width: '160px' }} placeholder="192.168.1.100" />
                                </SettingRow>
                                <SettingRow label="Порт">
                                    <input type="number" value={settings.hardware.esp32Port} onChange={e => updateSetting('hardware', 'esp32Port', parseInt(e.target.value))}
                                        style={{ ...inputStyle, width: '160px' }} />
                                </SettingRow>
                            </>
                        )}

                        <SettingRow label="Реконнект" description="Интервал переподключения (сек)">
                            <input type="number" min={1} max={60} value={settings.hardware.reconnectInterval}
                                onChange={e => updateSetting('hardware', 'reconnectInterval', parseInt(e.target.value))}
                                style={{ ...inputStyle, width: '80px', textAlign: 'center' }} />
                        </SettingRow>

                        <SettingRow label="Watchdog" description="Таймаут аварийного отключения (сек)">
                            <input type="number" min={5} max={60} value={settings.hardware.watchdogTimeout}
                                onChange={e => updateSetting('hardware', 'watchdogTimeout', parseInt(e.target.value))}
                                style={{ ...inputStyle, width: '80px', textAlign: 'center' }} />
                        </SettingRow>

                        <div style={{ marginTop: '1.5rem', padding: '1rem', background: 'rgba(255,152,0,0.08)', borderRadius: '6px', border: '1px solid rgba(255,152,0,0.2)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                                <Usb size={16} color="#ff9800" />
                                <span style={{ fontWeight: 'bold', fontSize: '0.85rem' }}>Статус</span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem' }}>
                                <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: settings.hardware.connectionType === 'mock' ? '#4caf50' : '#f44336' }} />
                                <span style={{ color: 'var(--text-secondary)' }}>
                                    {settings.hardware.connectionType === 'mock' ? 'Эмуляция активна' : 'Не подключено (бэкенд не запущен)'}
                                </span>
                            </div>
                        </div>
                    </div>
                );

            case 'sensors':
                return (
                    <div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>Калибровка DS18B20 датчиков. Смещение применяется к показаниям.</div>
                        {Object.entries(settings.sensors).map(([id, sensor]) => (
                            <div key={id} style={{ marginBottom: '0.5rem', border: '1px solid #333', borderRadius: '6px', overflow: 'hidden' }}>
                                <button onClick={() => setExpandedSensors(p => ({ ...p, [id]: !p[id] }))}
                                    style={{
                                        width: '100%', display: 'flex', alignItems: 'center', gap: '0.8rem', padding: '0.8rem 1rem',
                                        background: 'rgba(255,255,255,0.02)', border: 'none', cursor: 'pointer', color: 'var(--text-primary)', textAlign: 'left',
                                    }}>
                                    <Toggle value={sensor.enabled} onChange={(v) => { updateSensorSetting(id, 'enabled', v); }} />
                                    <Thermometer size={16} color={sensor.enabled ? '#03a9f4' : '#555'} />
                                    <span style={{ flex: 1, fontWeight: 'bold', fontSize: '0.85rem', opacity: sensor.enabled ? 1 : 0.4 }}>{sensor.name}</span>
                                    <span style={{ fontSize: '0.7rem', color: '#666', fontFamily: 'var(--font-mono)' }}>{sensor.address}</span>
                                    {expandedSensors[id] ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                </button>
                                <AnimatePresence>
                                    {expandedSensors[id] && (
                                        <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} style={{ overflow: 'hidden' }}>
                                            <div style={{ padding: '1rem', background: 'rgba(0,0,0,0.2)', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.8rem' }}>
                                                <div>
                                                    <label style={labelStyle}>Имя</label>
                                                    <input value={sensor.name} onChange={e => updateSensorSetting(id, 'name', e.target.value)} style={inputStyle} />
                                                </div>
                                                <div>
                                                    <label style={labelStyle}>Адрес 1-Wire</label>
                                                    <input value={sensor.address} onChange={e => updateSensorSetting(id, 'address', e.target.value)} style={inputStyle} />
                                                </div>
                                                <div>
                                                    <label style={labelStyle}>Смещение (°C)</label>
                                                    <input type="number" step="0.1" value={sensor.offset} onChange={e => updateSensorSetting(id, 'offset', parseFloat(e.target.value))}
                                                        style={{ ...inputStyle, textAlign: 'center' }} />
                                                </div>
                                            </div>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>
                        ))}
                        <div style={{ marginTop: '1rem', padding: '0.8rem', background: 'rgba(3,169,244,0.08)', borderRadius: '6px', border: '1px solid rgba(3,169,244,0.2)', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                            💡 Для калибровки: поместите датчик в ледяную воду (0°C) или кипящую (100°C), запишите показания и установите нужное смещение.
                        </div>
                    </div>
                );

            case 'pid':
                return (
                    <div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>Настройки PID-регулятора для управления нагревом</div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                            {[
                                { key: 'kp', label: 'Kp', desc: 'Пропорциональный', color: '#f44336' },
                                { key: 'ki', label: 'Ki', desc: 'Интегральный', color: '#4caf50' },
                                { key: 'kd', label: 'Kd', desc: 'Дифференциальный', color: '#2196f3' },
                            ].map(p => (
                                <div key={p.key} style={{ padding: '1rem', background: 'rgba(255,255,255,0.02)', borderRadius: '6px', border: `1px solid ${p.color}30`, textAlign: 'center' }}>
                                    <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>{p.desc}</div>
                                    <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: p.color, fontFamily: 'var(--font-mono)', marginBottom: '0.5rem' }}>{p.label}</div>
                                    <input type="number" step="0.1" min="0" value={settings.pid[p.key]}
                                        onChange={e => updateSetting('pid', p.key, parseFloat(e.target.value))}
                                        style={{ ...inputStyle, textAlign: 'center', width: '100px', margin: '0 auto', display: 'block' }} />
                                </div>
                            ))}
                        </div>

                        <SettingRow label="Период выборки" description="Интервал расчёта PID (мс)">
                            <input type="number" step="100" min={100} max={5000} value={settings.pid.sampleTime}
                                onChange={e => updateSetting('pid', 'sampleTime', parseInt(e.target.value))}
                                style={{ ...inputStyle, width: '100px', textAlign: 'center' }} />
                        </SettingRow>

                        <SettingRow label="Мин. выход" description="Минимальная мощность ТЭН (%)">
                            <input type="number" min={0} max={100} value={settings.pid.outputMin}
                                onChange={e => updateSetting('pid', 'outputMin', parseInt(e.target.value))}
                                style={{ ...inputStyle, width: '80px', textAlign: 'center' }} />
                        </SettingRow>

                        <SettingRow label="Макс. выход" description="Максимальная мощность ТЭН (%)">
                            <input type="number" min={0} max={100} value={settings.pid.outputMax}
                                onChange={e => updateSetting('pid', 'outputMax', parseInt(e.target.value))}
                                style={{ ...inputStyle, width: '80px', textAlign: 'center' }} />
                        </SettingRow>

                        <SettingRow label="Режим PID">
                            <select value={settings.pid.mode} onChange={e => updateSetting('pid', 'mode', e.target.value)} style={{ ...selectStyle, width: '160px' }}>
                                <option value="auto">Автоматический</option>
                                <option value="manual">Ручной</option>
                            </select>
                        </SettingRow>

                        <PidTuningPanel onTuningComplete={fetchSettings} />
                    </div>
                );

            case 'telegram':
                return (
                    <div>
                        <SettingRow label="Telegram бот" description="Уведомления и управление через Telegram">
                            <Toggle value={settings.telegram.enabled} onChange={v => updateSetting('telegram', 'enabled', v)} />
                        </SettingRow>

                        {settings.telegram.enabled && (
                            <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
                                <div style={{ margin: '0.5rem 0 1rem', padding: '0.8rem', background: 'rgba(41,182,246,0.08)', borderRadius: '6px', border: '1px solid rgba(41,182,246,0.2)', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                                    1. Создайте бота через <b>@BotFather</b> в Telegram<br />
                                    2. Скопируйте токен бота<br />
                                    3. Напишите боту <code>/start</code>, затем узнайте Chat ID через <b>@userinfobot</b>
                                </div>

                                <SettingRow label="Токен бота">
                                    <input type="password" value={settings.telegram.botToken} placeholder="123456:ABC-def..."
                                        onChange={e => updateSetting('telegram', 'botToken', e.target.value)}
                                        style={{ ...inputStyle, width: '260px' }} />
                                </SettingRow>

                                <SettingRow label="Chat ID">
                                    <input value={settings.telegram.chatId} placeholder="123456789"
                                        onChange={e => updateSetting('telegram', 'chatId', e.target.value)}
                                        style={{ ...inputStyle, width: '160px' }} />
                                </SettingRow>

                                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: '1rem 0 0.5rem', fontWeight: 'bold' }}>Уведомления</div>

                                <SettingRow label="Смена фазы" description="Уведомлять при переходе между фазами">
                                    <Toggle value={settings.telegram.notifyPhaseChange} onChange={v => updateSetting('telegram', 'notifyPhaseChange', v)} />
                                </SettingRow>
                                <SettingRow label="Температурные алерты" description="Критические отклонения температуры">
                                    <Toggle value={settings.telegram.notifyTempAlert} onChange={v => updateSetting('telegram', 'notifyTempAlert', v)} />
                                </SettingRow>
                                <SettingRow label="Завершение" description="Уведомить по окончании процесса">
                                    <Toggle value={settings.telegram.notifyComplete} onChange={v => updateSetting('telegram', 'notifyComplete', v)} />
                                </SettingRow>
                                <SettingRow label="Периодический отчёт" description="Интервал отправки статуса (мин)">
                                    <input type="number" min={0} max={60} value={settings.telegram.notifyInterval}
                                        onChange={e => updateSetting('telegram', 'notifyInterval', parseInt(e.target.value))}
                                        style={{ ...inputStyle, width: '80px', textAlign: 'center' }} />
                                </SettingRow>

                                <div style={{ marginTop: '1rem' }}>
                                    <button
                                        onClick={async () => {
                                            if (hasChanges) {
                                                alert('⚠️ Пожалуйста, сначала сохраните настройки (кнопка "Сохранить" внизу), чтобы изменения вступили в силу на сервере.');
                                                return;
                                            }
                                            try {
                                                const res = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3001/api'}/settings/test-telegram`, { method: 'POST' });
                                                const data = await res.json();
                                                if (data.ok) {
                                                    alert('✅ Сообщение отправлено! Проверьте ваш Telegram.');
                                                } else {
                                                    alert(`❌ Ошибка: ${data.message || 'Неизвестная ошибка'}`);
                                                }
                                            } catch (e) {
                                                alert('❌ Ошибка: Сервер не ответил. Проверьте запущен ли бэкенд.');
                                            }
                                        }}
                                        style={{
                                            width: '100%', padding: '0.8rem', borderRadius: '6px',
                                            border: '1px solid rgba(41,182,246,0.3)', background: 'rgba(41,182,246,0.08)',
                                            color: '#29b6f6', cursor: 'pointer', fontWeight: 'bold', fontSize: '0.85rem',
                                        }}>
                                        📨 Отправить тестовое сообщение
                                    </button>
                                </div>
                            </motion.div>
                        )}
                    </div>
                );

            case 'tailscale':
                return (
                    <div>
                        <SettingRow label="Tailscale VPN" description="Удалённый доступ к веб-интерфейсу">
                            <Toggle value={settings.tailscale.enabled} onChange={v => updateSetting('tailscale', 'enabled', v)} />
                        </SettingRow>

                        {settings.tailscale.enabled && (
                            <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
                                <div style={{ margin: '0.5rem 0 1rem', padding: '0.8rem', background: 'rgba(124,77,255,0.08)', borderRadius: '6px', border: '1px solid rgba(124,77,255,0.2)', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                                    Tailscale создаёт безопасный VPN-туннель. Установите Tailscale на Raspberry Pi и на устройство, с которого хотите управлять.<br />
                                    После подключения интерфейс доступен по адресу: <code style={{ color: '#7c4dff' }}>http://{settings.tailscale.hostname}:5173</code>
                                </div>

                                <SettingRow label="Hostname" description="Имя устройства в Tailscale сети">
                                    <input value={settings.tailscale.hostname} onChange={e => updateSetting('tailscale', 'hostname', e.target.value)}
                                        style={{ ...inputStyle, width: '200px' }} />
                                </SettingRow>
                            </motion.div>
                        )}
                    </div>
                );

            case 'safety':
                return (
                    <div>
                        <div style={{ padding: '0.8rem', marginBottom: '1rem', background: 'rgba(244,67,54,0.08)', borderRadius: '6px', border: '1px solid rgba(244,67,54,0.2)', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <AlertTriangle size={16} color="#f44336" />
                            <span>Параметры аварийной защиты. Изменяйте с осторожностью!</span>
                        </div>

                        <SettingRow label="Макс. температура куба" description="Аварийное снижение мощности">
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                                <input type="number" min={80} max={120} value={settings.safety.maxBoilerTemp}
                                    onChange={e => updateSetting('safety', 'maxBoilerTemp', parseInt(e.target.value))}
                                    style={{ ...inputStyle, width: '70px', textAlign: 'center' }} />
                                <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>°C</span>
                            </div>
                        </SettingRow>

                        <SettingRow label="Макс. температура колонны" description="Предупреждение о захвате хвостов">
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                                <input type="number" min={70} max={110} value={settings.safety.maxColumnTemp}
                                    onChange={e => updateSetting('safety', 'maxColumnTemp', parseInt(e.target.value))}
                                    style={{ ...inputStyle, width: '70px', textAlign: 'center' }} />
                                <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>°C</span>
                            </div>
                        </SettingRow>

                        <SettingRow label="Макс. мощность ТЭН" description="Ограничение максимальной мощности">
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                                <input type="number" min={10} max={100} value={settings.safety.maxHeaterPower}
                                    onChange={e => updateSetting('safety', 'maxHeaterPower', parseInt(e.target.value))}
                                    style={{ ...inputStyle, width: '70px', textAlign: 'center' }} />
                                <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>%</span>
                            </div>
                        </SettingRow>

                        <SettingRow label="Аварийное отключение" description="Полное отключение нагрева при этой температуре">
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                                <input type="number" min={90} max={120} value={settings.safety.emergencyShutdownTemp}
                                    onChange={e => updateSetting('safety', 'emergencyShutdownTemp', parseInt(e.target.value))}
                                    style={{ ...inputStyle, width: '70px', textAlign: 'center', borderColor: '#f44336' }} />
                                <span style={{ fontSize: '0.8rem', color: '#f44336' }}>°C</span>
                            </div>
                        </SettingRow>

                        <SettingRow label="Защита от сухого хода" description="Блокировка ТЭН без воды">
                            <Toggle value={settings.safety.heaterDryRunProtection} onChange={v => updateSetting('safety', 'heaterDryRunProtection', v)} />
                        </SettingRow>

                        <SettingRow label="Охлаждение при стопе" description="Автоматическое охлаждение после остановки">
                            <Toggle value={settings.safety.cooldownOnStop} onChange={v => updateSetting('safety', 'cooldownOnStop', v)} />
                        </SettingRow>

                        {settings.safety.cooldownOnStop && (
                            <SettingRow label="Время охлаждения" description="Длительность охлаждения (сек)">
                                <input type="number" min={10} max={600} value={settings.safety.cooldownDuration}
                                    onChange={e => updateSetting('safety', 'cooldownDuration', parseInt(e.target.value))}
                                    style={{ ...inputStyle, width: '80px', textAlign: 'center' }} />
                            </SettingRow>
                        )}
                    </div>
                );

            case 'ui':
                return (
                    <div>
                        <SettingRow label="Тема оформления">
                            <div style={{ display: 'flex', gap: '0.3rem' }}>
                                {[
                                    { value: 'dark', label: 'Тёмная', icon: Moon },
                                    { value: 'light', label: 'Светлая', icon: Sun },
                                ].map(t => (
                                    <button key={t.value} onClick={() => updateSetting('ui', 'theme', t.value)}
                                        style={{
                                            padding: '0.4rem 0.8rem', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.3rem',
                                            background: settings.ui.theme === t.value ? 'rgba(206,147,216,0.15)' : 'rgba(255,255,255,0.03)',
                                            border: `1px solid ${settings.ui.theme === t.value ? '#ce93d8' : '#444'}`,
                                            color: settings.ui.theme === t.value ? '#ce93d8' : 'var(--text-secondary)', fontSize: '0.8rem',
                                        }}>
                                        <t.icon size={14} /> {t.label}
                                    </button>
                                ))}
                            </div>
                        </SettingRow>

                        <SettingRow label="Единицы температуры">
                            <div style={{ display: 'flex', gap: '0.3rem' }}>
                                {[{ v: 'celsius', l: '°C' }, { v: 'fahrenheit', l: '°F' }].map(u => (
                                    <button key={u.v} onClick={() => updateSetting('ui', 'tempUnit', u.v)}
                                        style={{
                                            padding: '0.4rem 0.8rem', borderRadius: '6px', cursor: 'pointer', fontSize: '0.85rem',
                                            background: settings.ui.tempUnit === u.v ? 'rgba(3,169,244,0.15)' : 'rgba(255,255,255,0.03)',
                                            border: `1px solid ${settings.ui.tempUnit === u.v ? '#03a9f4' : '#444'}`,
                                            color: settings.ui.tempUnit === u.v ? '#03a9f4' : 'var(--text-secondary)', fontFamily: 'var(--font-mono)',
                                        }}>
                                        {u.l}
                                    </button>
                                ))}
                            </div>
                        </SettingRow>

                        <SettingRow label="Точек на графике" description="Количество отображаемых точек">
                            <input type="number" min={30} max={500} value={settings.ui.graphPoints}
                                onChange={e => updateSetting('ui', 'graphPoints', parseInt(e.target.value))}
                                style={{ ...inputStyle, width: '80px', textAlign: 'center' }} />
                        </SettingRow>

                        <SettingRow label="Звуковые уведомления">
                            <Toggle value={settings.ui.soundAlerts} onChange={v => updateSetting('ui', 'soundAlerts', v)} />
                        </SettingRow>

                        <SettingRow label="Анимации" description="Плавные переходы и эффекты">
                            <Toggle value={settings.ui.animationsEnabled} onChange={v => updateSetting('ui', 'animationsEnabled', v)} />
                        </SettingRow>
                    </div>
                );

            case 'data':
                return (
                    <div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>Управление данными приложения</div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
                            <button onClick={handleExport}
                                style={{
                                    padding: '1.2rem', borderRadius: '8px', border: '1px dashed #4caf50', background: 'rgba(76,175,80,0.05)',
                                    color: '#4caf50', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem',
                                }}>
                                <Download size={24} />
                                <span style={{ fontWeight: 'bold', fontSize: '0.9rem' }}>Экспорт</span>
                                <span style={{ fontSize: '0.7rem', opacity: 0.7 }}>Скачать настройки (JSON)</span>
                            </button>

                            <button onClick={handleImport}
                                style={{
                                    padding: '1.2rem', borderRadius: '8px', border: '1px dashed #03a9f4', background: 'rgba(3,169,244,0.05)',
                                    color: '#03a9f4', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem',
                                }}>
                                <Upload size={24} />
                                <span style={{ fontWeight: 'bold', fontSize: '0.9rem' }}>Импорт</span>
                                <span style={{ fontSize: '0.7rem', opacity: 0.7 }}>Загрузить из файла</span>
                            </button>
                        </div>

                        <button onClick={handleReset}
                            style={{
                                width: '100%', padding: '1rem', borderRadius: '8px', border: '1px solid rgba(244,67,54,0.3)', background: 'rgba(244,67,54,0.05)',
                                color: '#f44336', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', fontSize: '0.9rem',
                            }}>
                            <Trash2 size={18} /> Сбросить все настройки
                        </button>

                        <div style={{ marginTop: '1.5rem', padding: '1rem', background: 'rgba(255,255,255,0.02)', borderRadius: '6px', border: '1px solid #333', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                            <div style={{ marginBottom: '0.3rem' }}>📦 Хранилище: <b>localStorage</b></div>
                            <div>Размер: <span className="text-mono">{(JSON.stringify(settings).length / 1024).toFixed(1)} KB</span></div>
                        </div>
                    </div>
                );

            case 'about':
                return (
                    <div>
                        <div style={{ textAlign: 'center', padding: '2rem 0 1.5rem' }}>
                            <div style={{ fontSize: '3rem', marginBottom: '0.5rem' }}>🍺</div>
                            <h2 style={{ margin: 0, fontSize: '1.8rem', background: 'linear-gradient(135deg, var(--primary-color), var(--accent-blue))', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                                OrangeBrew
                            </h2>
                            <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginTop: '0.3rem' }}>Система автоматизации пивоварения и дистилляции</div>
                            <div className="text-mono" style={{ color: '#666', fontSize: '0.8rem', marginTop: '0.5rem' }}>v0.1.0-alpha</div>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem', margin: '1.5rem 0' }}>
                            {[
                                { label: 'Фронтенд', value: 'React + Vite' },
                                { label: 'Бэкенд', value: 'Node.js (план)' },
                                { label: 'Железо', value: 'RPi + ESP32' },
                                { label: 'БД', value: 'SQLite (план)' },
                                { label: 'Удал. доступ', value: 'Tailscale' },
                                { label: 'Уведомления', value: 'Telegram' },
                            ].map((item, i) => (
                                <div key={i} style={{ padding: '0.6rem', background: 'rgba(255,255,255,0.02)', borderRadius: '6px', border: '1px solid #333', textAlign: 'center' }}>
                                    <div style={{ fontSize: '0.6rem', color: 'var(--text-secondary)', letterSpacing: '0.05em' }}>{item.label}</div>
                                    <div style={{ fontSize: '0.8rem', marginTop: '0.2rem', fontWeight: 'bold' }}>{item.value}</div>
                                </div>
                            ))}
                        </div>

                        <div style={{ padding: '1rem', background: 'rgba(255,255,255,0.02)', borderRadius: '6px', border: '1px solid #333', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                            <div style={{ fontWeight: 'bold', marginBottom: '0.5rem' }}>Архитектура:</div>
                            <div>• <b>ESP32</b> — датчики (DS18B20), реле, SSR, watchdog</div>
                            <div>• <b>Raspberry Pi</b> — сервер, БД, PID, Telegram</div>
                            <div>• <b>USB Serial</b> — JSON-протокол между RPi и ESP32</div>
                            <div>• <b>Tailscale VPN</b> — безопасный удалённый доступ</div>
                        </div>
                    </div>
                );

            default:
                return null;
        }
    };

    return (
        <div style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto' }}>
            {/* Header */}
            <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <button onClick={() => navigate('/')} aria-label="Назад"
                        style={{ background: 'none', border: '1px solid var(--border-color)', color: 'var(--text-primary)', padding: '0.5rem', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                        <ArrowLeft size={20} />
                    </button>
                    <h1 style={{ margin: 0, fontSize: '1.8rem', color: 'var(--text-secondary)' }}>
                        <SettingsIcon size={28} style={{ verticalAlign: 'middle', marginRight: '0.5rem' }} />
                        Настройки
                    </h1>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <AnimatePresence>
                        {saved && (
                            <motion.span initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }}
                                style={{ color: 'var(--accent-green)', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                                <CheckCircle size={16} /> Сохранено
                            </motion.span>
                        )}
                    </AnimatePresence>
                    <button onClick={handleSave} disabled={!hasChanges}
                        style={{
                            padding: '0.5rem 1.2rem', borderRadius: '6px', border: 'none', cursor: hasChanges ? 'pointer' : 'default',
                            background: hasChanges ? 'var(--accent-green)' : 'rgba(255,255,255,0.05)',
                            color: hasChanges ? '#000' : '#666', fontWeight: 'bold', fontSize: '0.85rem',
                            display: 'flex', alignItems: 'center', gap: '0.4rem', transition: 'all 0.3s',
                        }}>
                        <Save size={16} /> Сохранить
                    </button>
                </div>
            </header>

            {/* 2-column: sidebar + content */}
            <div style={{ display: 'grid', gridTemplateColumns: '240px 1fr', gap: '1.5rem', alignItems: 'start' }}>
                {/* Sidebar */}
                <nav className="industrial-panel" style={{ padding: '0.5rem', position: 'sticky', top: '1rem' }}>
                    {SECTIONS.map(s => {
                        const isActive = activeSection === s.id;
                        return (
                            <button key={s.id} onClick={() => setActiveSection(s.id)}
                                style={{
                                    width: '100%', display: 'flex', alignItems: 'center', gap: '0.7rem', padding: '0.7rem 0.8rem',
                                    background: isActive ? `${s.color}15` : 'transparent', border: 'none',
                                    borderLeft: isActive ? `3px solid ${s.color}` : '3px solid transparent',
                                    cursor: 'pointer', color: isActive ? s.color : 'var(--text-secondary)',
                                    borderRadius: '0 4px 4px 0', textAlign: 'left', transition: 'all 0.2s', fontSize: '0.85rem',
                                }}>
                                <s.icon size={16} />
                                <span style={{ fontWeight: isActive ? 'bold' : 'normal' }}>{s.label}</span>
                            </button>
                        );
                    })}
                </nav>

                {/* Content */}
                <div className="industrial-panel" style={{ padding: '1.5rem', minHeight: '500px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.7rem', marginBottom: '1.5rem', paddingBottom: '1rem', borderBottom: '1px solid #333' }}>
                        {(() => { const s = SECTIONS.find(s => s.id === activeSection); return s ? <s.icon size={20} color={s.color} /> : null; })()}
                        <h2 style={{ margin: 0, fontSize: '1.2rem' }}>{SECTIONS.find(s => s.id === activeSection)?.label}</h2>
                    </div>
                    {renderSection()}
                </div>
            </div>
        </div>
    );
};

export default SettingsPage;
