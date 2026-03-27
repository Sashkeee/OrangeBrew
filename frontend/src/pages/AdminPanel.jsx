import React, { useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { useAdmin, useAuditLog } from '../hooks/useAdmin';
import { Shield, Users, ArrowLeft, RefreshCw, Ban, Unlock, KeyRound, Trash2, Clock, User, AlertTriangle } from 'lucide-react';

// ─── Action labels (human-readable, RU) ─────────────────
const ACTION_LABELS = {
    'user.register':       'Регистрация',
    'user.login':          'Вход в систему',
    'user.login_failed':   'Неудачная попытка входа',
    'recipe.create':       'Создание рецепта',
    'recipe.delete':       'Удаление рецепта',
    'recipe.publish':      'Публикация рецепта',
    'session.create':      'Начало сессии',
    'session.complete':    'Завершение сессии',
    'device.pair':         'Паринг устройства',
    'device.delete':       'Удаление устройства',
    'process.start':       'Запуск процесса',
    'process.stop':        'Остановка процесса',
    'settings.update':     'Изменение настроек',
    'admin.ban':           'Заблокирован администратором',
    'admin.unban':         'Разблокирован администратором',
    'admin.reset_password': 'Сброс пароля администратором',
    'admin.delete_user':   'Удаление пользователя',
    'admin.delete_devices': 'Удаление устройств администратором',
};

// ─── Styles (module scope to prevent re-creation) ───────
const panelStyle = {
    background: 'rgba(18, 18, 18, 0.8)',
    backdropFilter: 'blur(10px)',
    borderRadius: '12px',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    padding: '1.5rem',
};

const tableRowStyle = {
    display: 'grid',
    gridTemplateColumns: '160px 220px 80px 80px 120px',
    gap: '0.5rem',
    padding: '0.75rem 1rem',
    alignItems: 'center',
    cursor: 'pointer',
    borderRadius: '8px',
    transition: 'background 0.2s',
};

const badgeStyle = (color) => ({
    display: 'inline-block',
    padding: '2px 8px',
    borderRadius: '12px',
    fontSize: '0.75rem',
    fontWeight: 600,
    background: `${color}20`,
    color,
    border: `1px solid ${color}40`,
});

const btnStyle = (color = 'var(--primary-color)') => ({
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.5rem',
    padding: '0.5rem 1rem',
    borderRadius: '8px',
    border: 'none',
    background: `${color}20`,
    color,
    cursor: 'pointer',
    fontSize: '0.85rem',
    fontWeight: 500,
    transition: 'all 0.2s',
});

const inputStyle = {
    width: '100%',
    padding: '0.5rem 0.75rem',
    borderRadius: '8px',
    border: '1px solid rgba(255,255,255,0.15)',
    background: 'rgba(255,255,255,0.05)',
    color: 'var(--text-primary)',
    fontSize: '0.9rem',
    outline: 'none',
};

// ─── Sub-components (module scope) ──────────────────────

function UserTable({ users, selectedId, onSelect }) {
    return (
        <div>
            <div style={{ ...tableRowStyle, cursor: 'default', color: 'var(--text-secondary)', fontSize: '0.8rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                <span>Пользователь</span>
                <span>Email</span>
                <span>Роль</span>
                <span>Тариф</span>
                <span>Статус</span>
            </div>
            {users.map(user => (
                <div
                    key={user.id}
                    style={{
                        ...tableRowStyle,
                        background: selectedId === user.id ? 'rgba(255, 152, 0, 0.1)' : 'transparent',
                        borderLeft: selectedId === user.id ? '3px solid var(--primary-color)' : '3px solid transparent',
                    }}
                    onClick={() => onSelect(user)}
                    onMouseEnter={e => { if (selectedId !== user.id) e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; }}
                    onMouseLeave={e => { if (selectedId !== user.id) e.currentTarget.style.background = 'transparent'; }}
                >
                    <span style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user.username}</span>
                    <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user.email || '—'}</span>
                    <span>
                        <span style={badgeStyle(user.role === 'admin' ? '#ff9800' : '#03a9f4')}>
                            {user.role}
                        </span>
                    </span>
                    <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{user.subscription_tier || '—'}</span>
                    <span>
                        {user.banned_at
                            ? <span style={badgeStyle('#f44336')}>Заблокирован</span>
                            : <span style={badgeStyle('#4caf50')}>Активен</span>
                        }
                    </span>
                </div>
            ))}
        </div>
    );
}

function AuditTimeline({ entries }) {
    if (entries.length === 0) {
        return <p style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '2rem 0' }}>Нет записей</p>;
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {entries.map(entry => (
                <div key={entry.id} style={{
                    display: 'flex',
                    gap: '1rem',
                    padding: '0.75rem 1rem',
                    borderRadius: '8px',
                    background: 'rgba(255,255,255,0.02)',
                    alignItems: 'flex-start',
                }}>
                    <Clock size={14} style={{ color: 'var(--text-secondary)', marginTop: '3px', flexShrink: 0 }} />
                    <div style={{ flex: 1 }}>
                        <div style={{ fontSize: '0.9rem', marginBottom: '2px' }}>
                            <span style={{ fontWeight: 500 }}>
                                {ACTION_LABELS[entry.action] || entry.action}
                            </span>
                            {entry.detail && (
                                <span style={{ color: 'var(--text-secondary)', marginLeft: '0.5rem' }}>
                                    — {entry.detail}
                                </span>
                            )}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                            {new Date(entry.created_at + 'Z').toLocaleString('ru-RU')}
                            {entry.admin_username && (
                                <span style={{ marginLeft: '0.5rem', color: '#ff9800' }}>
                                    (админ: {entry.admin_username})
                                </span>
                            )}
                        </div>
                    </div>
                </div>
            ))}
        </div>
    );
}

function ConfirmDialog({ title, message, onConfirm, onCancel, children }) {
    return (
        <div style={{
            position: 'fixed', inset: 0, zIndex: 1000,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
        }} onClick={onCancel}>
            <div style={{
                ...panelStyle,
                maxWidth: '420px', width: '90%',
                border: '1px solid rgba(255,152,0,0.3)',
            }} onClick={e => e.stopPropagation()}>
                <h3 style={{ margin: '0 0 0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <AlertTriangle size={18} color="#ff9800" />
                    {title}
                </h3>
                <p style={{ color: 'var(--text-secondary)', margin: '0 0 1rem', fontSize: '0.9rem' }}>{message}</p>
                {children}
                <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '1rem' }}>
                    <button style={btnStyle('var(--text-secondary)')} onClick={onCancel}>Отмена</button>
                    <button style={btnStyle('#f44336')} onClick={onConfirm}>Подтвердить</button>
                </div>
            </div>
        </div>
    );
}

function UserActions({ user, onBan, onUnban, onResetPassword, onDeleteDevices }) {
    const [dialog, setDialog] = useState(null);
    const [banReason, setBanReason] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [actionLoading, setActionLoading] = useState(false);

    const handleAction = async (fn) => {
        setActionLoading(true);
        try {
            await fn();
        } catch (err) {
            alert(err.message);
        } finally {
            setActionLoading(false);
            setDialog(null);
            setBanReason('');
            setNewPassword('');
        }
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                {user.banned_at ? (
                    <button style={btnStyle('#4caf50')} onClick={() => setDialog('unban')} disabled={actionLoading}>
                        <Unlock size={16} /> Разблокировать
                    </button>
                ) : (
                    <button style={btnStyle('#f44336')} onClick={() => setDialog('ban')} disabled={actionLoading || user.role === 'admin'}>
                        <Ban size={16} /> Заблокировать
                    </button>
                )}
                <button style={btnStyle('#ff9800')} onClick={() => setDialog('resetPassword')} disabled={actionLoading}>
                    <KeyRound size={16} /> Сбросить пароль
                </button>
                <button style={btnStyle('#f44336')} onClick={() => setDialog('deleteDevices')} disabled={actionLoading}>
                    <Trash2 size={16} /> Удалить устройства ({user.device_count || 0})
                </button>
            </div>

            {dialog === 'ban' && (
                <ConfirmDialog
                    title="Заблокировать пользователя"
                    message={`Вы уверены, что хотите заблокировать ${user.username}?`}
                    onConfirm={() => handleAction(() => onBan(user.id, banReason))}
                    onCancel={() => setDialog(null)}
                >
                    <input
                        style={inputStyle}
                        placeholder="Причина блокировки (необязательно)"
                        value={banReason}
                        onChange={e => setBanReason(e.target.value)}
                    />
                </ConfirmDialog>
            )}

            {dialog === 'unban' && (
                <ConfirmDialog
                    title="Разблокировать пользователя"
                    message={`Разблокировать ${user.username}?`}
                    onConfirm={() => handleAction(() => onUnban(user.id))}
                    onCancel={() => setDialog(null)}
                />
            )}

            {dialog === 'resetPassword' && (
                <ConfirmDialog
                    title="Сброс пароля"
                    message={`Установить новый пароль для ${user.username}`}
                    onConfirm={() => handleAction(() => onResetPassword(user.id, newPassword))}
                    onCancel={() => setDialog(null)}
                >
                    <input
                        type="password"
                        style={inputStyle}
                        placeholder="Новый пароль (мин. 8 символов)"
                        value={newPassword}
                        onChange={e => setNewPassword(e.target.value)}
                        minLength={8}
                    />
                </ConfirmDialog>
            )}

            {dialog === 'deleteDevices' && (
                <ConfirmDialog
                    title="Удалить все устройства"
                    message={`Удалить все устройства (${user.device_count || 0}) пользователя ${user.username}? Это действие необратимо.`}
                    onConfirm={() => handleAction(() => onDeleteDevices(user.id))}
                    onCancel={() => setDialog(null)}
                />
            )}
        </div>
    );
}

// ─── Main component ─────────────────────────────────────

export default function AdminPanel() {
    const { users, loading, refresh, banUser, unbanUser, resetPassword, deleteDevices } = useAdmin();
    const [selectedUser, setSelectedUser] = useState(null);
    const [activeTab, setActiveTab] = useState('audit');
    const { entries, total, loading: auditLoading, refresh: refreshAudit } = useAuditLog(selectedUser?.id);

    const handleSelectUser = useCallback((user) => {
        setSelectedUser(user);
        setActiveTab('audit');
    }, []);

    return (
        <div style={{ padding: '1.5rem', maxWidth: '1400px', margin: '0 auto', minHeight: '100vh' }}>
            {/* Header */}
            <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <Shield size={28} color="var(--primary-color)" />
                    <h1 style={{ margin: 0, fontSize: '1.5rem' }}>Админ-панель</h1>
                </div>
                <button style={btnStyle()} onClick={refresh} disabled={loading}>
                    <RefreshCw size={16} className={loading ? 'spin' : ''} /> Обновить
                </button>
            </motion.div>

            <div style={{ display: 'grid', gridTemplateColumns: selectedUser ? '1fr 1fr' : '1fr', gap: '1.5rem' }}>
                {/* Left panel — User list */}
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    style={panelStyle}
                >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
                        <Users size={18} color="var(--primary-color)" />
                        <h2 style={{ margin: 0, fontSize: '1.1rem' }}>Пользователи ({users.length})</h2>
                    </div>

                    {loading ? (
                        <p style={{ color: 'var(--text-secondary)', textAlign: 'center' }}>Загрузка...</p>
                    ) : (
                        <UserTable users={users} selectedId={selectedUser?.id} onSelect={handleSelectUser} />
                    )}
                </motion.div>

                {/* Right panel — User detail */}
                {selectedUser && (
                    <motion.div
                        key={selectedUser.id}
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        style={panelStyle}
                    >
                        {/* User info header */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                <button
                                    style={{ ...btnStyle('var(--text-secondary)'), padding: '0.25rem 0.5rem' }}
                                    onClick={() => setSelectedUser(null)}
                                >
                                    <ArrowLeft size={16} />
                                </button>
                                <User size={18} color="var(--primary-color)" />
                                <h2 style={{ margin: 0, fontSize: '1.1rem' }}>{selectedUser.username}</h2>
                                <span style={badgeStyle(selectedUser.role === 'admin' ? '#ff9800' : '#03a9f4')}>
                                    {selectedUser.role}
                                </span>
                                {selectedUser.banned_at && (
                                    <span style={badgeStyle('#f44336')}>Заблокирован</span>
                                )}
                            </div>
                        </div>

                        {/* User info card */}
                        <div style={{
                            display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)',
                            gap: '0.75rem', marginBottom: '1.5rem',
                            padding: '1rem', borderRadius: '8px',
                            background: 'rgba(255,255,255,0.02)',
                        }}>
                            <div>
                                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Email</div>
                                <div style={{ fontSize: '0.9rem' }}>{selectedUser.email || '—'}</div>
                            </div>
                            <div>
                                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Тариф</div>
                                <div style={{ fontSize: '0.9rem' }}>{selectedUser.subscription_tier || '—'}</div>
                            </div>
                            <div>
                                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Устройства</div>
                                <div style={{ fontSize: '0.9rem' }}>{selectedUser.device_count || 0}</div>
                            </div>
                            <div>
                                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Регистрация</div>
                                <div style={{ fontSize: '0.9rem' }}>
                                    {selectedUser.created_at ? new Date(selectedUser.created_at + 'Z').toLocaleDateString('ru-RU') : '—'}
                                </div>
                            </div>
                        </div>

                        {/* Tabs */}
                        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '0.5rem' }}>
                            {[
                                { key: 'audit', label: 'Аудит-лог' },
                                { key: 'actions', label: 'Действия' },
                            ].map(tab => (
                                <button
                                    key={tab.key}
                                    style={{
                                        ...btnStyle(activeTab === tab.key ? 'var(--primary-color)' : 'var(--text-secondary)'),
                                        background: activeTab === tab.key ? 'rgba(255,152,0,0.15)' : 'transparent',
                                    }}
                                    onClick={() => setActiveTab(tab.key)}
                                >
                                    {tab.label}
                                </button>
                            ))}
                            {activeTab === 'audit' && (
                                <button style={{ ...btnStyle('var(--text-secondary)'), marginLeft: 'auto', padding: '0.25rem 0.5rem' }} onClick={() => refreshAudit()}>
                                    <RefreshCw size={14} />
                                </button>
                            )}
                        </div>

                        {/* Tab content */}
                        {activeTab === 'audit' && (
                            <div style={{ maxHeight: '50vh', overflowY: 'auto' }}>
                                {auditLoading ? (
                                    <p style={{ color: 'var(--text-secondary)', textAlign: 'center' }}>Загрузка...</p>
                                ) : (
                                    <>
                                        <AuditTimeline entries={entries} />
                                        {total > entries.length && (
                                            <p style={{ textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.8rem', marginTop: '0.5rem' }}>
                                                Показано {entries.length} из {total}
                                            </p>
                                        )}
                                    </>
                                )}
                            </div>
                        )}

                        {activeTab === 'actions' && (
                            <UserActions
                                user={selectedUser}
                                onBan={banUser}
                                onUnban={unbanUser}
                                onResetPassword={resetPassword}
                                onDeleteDevices={deleteDevices}
                            />
                        )}
                    </motion.div>
                )}
            </div>
        </div>
    );
}
