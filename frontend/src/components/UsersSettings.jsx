import React, { useState, useEffect } from 'react';
import { usersApi } from '../api/client';
import { User, Shield, Trash2, Edit2, Plus, LogOut, CheckCircle, AlertTriangle } from 'lucide-react';

export default function UsersSettings() {
    const [me, setMe] = useState(null);
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [success, setSuccess] = useState(null);

    // Profile state
    const [profileUsername, setProfileUsername] = useState('');
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');

    // New user state (admin only)
    const [newUsername, setNewUsername] = useState('');
    const [newUserPassword, setNewUserPassword] = useState('');
    const [newUserRole, setNewUserRole] = useState('user');

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        try {
            setLoading(true);
            const meData = await usersApi.getMe();
            setMe(meData);
            setProfileUsername(meData.username);

            if (meData.role === 'admin') {
                const usersData = await usersApi.getAll();
                setUsers(usersData);
            }
        } catch (err) {
            setError('Не удалось загрузить данные пользователей: ' + err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleUpdateProfile = async (e) => {
        e.preventDefault();
        setError(null);
        setSuccess(null);
        try {
            await usersApi.updateProfile({
                username: profileUsername,
                currentPassword: currentPassword || undefined,
                newPassword: newPassword || undefined
            });
            setSuccess('Профиль успешно обновлен');
            setCurrentPassword('');
            setNewPassword('');
            loadData();
        } catch (err) {
            setError(err.message);
        }
    };

    const handleAddUser = async (e) => {
        e.preventDefault();
        setError(null);
        setSuccess(null);
        try {
            await usersApi.create({
                username: newUsername,
                password: newUserPassword,
                role: newUserRole
            });
            setSuccess('Пользователь добавлен');
            setNewUsername('');
            setNewUserPassword('');
            loadData();
        } catch (err) {
            setError(err.message);
        }
    };

    const handleDeleteUser = async (id) => {
        if (!window.confirm('Вы уверены, что хотите удалить пользователя?')) return;
        try {
            await usersApi.delete(id);
            setSuccess('Пользователь удален');
            loadData();
        } catch (err) {
            setError(err.message);
        }
    };

    const handleLogout = () => {
        localStorage.removeItem('orangebrew_token');
        window.location.href = '/login';
    };

    if (loading) return <div style={{ color: '#888' }}>Загрузка пользователей...</div>;

    const inputStyle = {
        background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)',
        color: '#fff', padding: '0.6rem 0.8rem', borderRadius: '4px', width: '100%', fontSize: '0.9rem'
    };

    const btnStyle = {
        background: 'var(--accent-orange)', border: 'none', color: '#000', padding: '0.6rem 1.2rem',
        borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '0.5rem'
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
            {error && <div style={{ background: 'rgba(244, 67, 54, 0.1)', color: '#f44336', padding: '1rem', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '0.5rem' }}><AlertTriangle size={18} />{error}</div>}
            {success && <div style={{ background: 'rgba(76, 175, 80, 0.1)', color: '#4caf50', padding: '1rem', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '0.5rem' }}><CheckCircle size={18} />{success}</div>}

            <section className="industrial-panel" style={{ padding: '1.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                    <h3 style={{ margin: 0, color: 'var(--accent-orange)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <User size={20} /> Мой профиль ({me?.role === 'admin' ? 'Администратор' : 'Пользователь'})
                    </h3>
                    <button onClick={handleLogout} style={{ background: 'transparent', border: '1px solid #f44336', color: '#f44336', padding: '0.4rem 1rem', borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <LogOut size={16} /> Выйти
                    </button>
                </div>

                <form onSubmit={handleUpdateProfile} style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '1rem', maxWidth: '400px' }}>
                    <div>
                        <label style={{ display: 'block', fontSize: '0.8rem', color: '#aaa', marginBottom: '0.3rem' }}>Логин</label>
                        <input type="text" value={profileUsername} autoComplete="username" onChange={e => setProfileUsername(e.target.value)} style={inputStyle} />
                    </div>
                    <div>
                        <label style={{ display: 'block', fontSize: '0.8rem', color: '#aaa', marginBottom: '0.3rem' }}>Смена пароля (Новый пароль)</label>
                        <input type="password" placeholder="Оставьте пустым, если не меняете" autoComplete="new-password" value={newPassword} onChange={e => setNewPassword(e.target.value)} style={inputStyle} />
                    </div>
                    {newPassword && (
                        <div>
                            <label style={{ display: 'block', fontSize: '0.8rem', color: '#aaa', marginBottom: '0.3rem' }}>Введите текущий пароль для подтверждения</label>
                            <input type="password" required autoComplete="current-password" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} style={inputStyle} />
                        </div>
                    )}
                    <button type="submit" style={{ ...btnStyle, marginTop: '1rem', justifyContent: 'center' }}><Edit2 size={16} /> Сохранить изменения</button>
                </form>
            </section>

            {me?.role === 'admin' && (
                <section className="industrial-panel" style={{ padding: '1.5rem' }}>
                    <h3 style={{ margin: 0, marginBottom: '1.5rem', color: '#03a9f4', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <Shield size={20} /> Управление пользователями
                    </h3>

                    <div style={{ overflowX: 'auto', marginBottom: '2rem' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                            <thead>
                                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', color: '#888', textAlign: 'left' }}>
                                    <th style={{ padding: '0.8rem' }}>ID</th>
                                    <th style={{ padding: '0.8rem' }}>Логин</th>
                                    <th style={{ padding: '0.8rem' }}>Роль</th>
                                    <th style={{ padding: '0.8rem' }}>Создан</th>
                                    <th style={{ padding: '0.8rem', textAlign: 'right' }}>Действия</th>
                                </tr>
                            </thead>
                            <tbody>
                                {users.map(u => (
                                    <tr key={u.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                        <td style={{ padding: '0.8rem', color: '#888' }}>#{u.id}</td>
                                        <td style={{ padding: '0.8rem', fontWeight: 'bold' }}>{u.username}</td>
                                        <td style={{ padding: '0.8rem' }}>
                                            <span style={{ padding: '0.2rem 0.5rem', borderRadius: '12px', background: u.role === 'admin' ? 'rgba(3, 169, 244, 0.2)' : 'rgba(255,255,255,0.1)', color: u.role === 'admin' ? '#03a9f4' : '#ccc', fontSize: '0.8rem' }}>
                                                {u.role}
                                            </span>
                                        </td>
                                        <td style={{ padding: '0.8rem', color: '#666' }}>{new Date(u.created_at).toLocaleDateString()}</td>
                                        <td style={{ padding: '0.8rem', textAlign: 'right' }}>
                                            {u.id !== me.id && (
                                                <button onClick={() => handleDeleteUser(u.id)} style={{ background: 'none', border: 'none', color: '#f44336', cursor: 'pointer', padding: '0.5rem' }}>
                                                    <Trash2 size={16} />
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    <div style={{ background: 'rgba(0,0,0,0.2)', padding: '1rem', borderRadius: '4px', border: '1px dashed rgba(255,255,255,0.1)' }}>
                        <h4 style={{ margin: '0 0 1rem 0', color: '#ccc', fontSize: '0.9rem' }}>Добавить нового пользователя</h4>
                        <form onSubmit={handleAddUser} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '1rem', alignItems: 'end' }}>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.75rem', color: '#aaa', marginBottom: '0.3rem' }}>Имя пользователя</label>
                                <input type="text" required autoComplete="off" value={newUsername} onChange={e => setNewUsername(e.target.value)} style={inputStyle} />
                            </div>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.75rem', color: '#aaa', marginBottom: '0.3rem' }}>Пароль</label>
                                <input type="password" required autoComplete="new-password" value={newUserPassword} onChange={e => setNewUserPassword(e.target.value)} style={inputStyle} />
                            </div>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.75rem', color: '#aaa', marginBottom: '0.3rem' }}>Роль</label>
                                <select value={newUserRole} onChange={e => setNewUserRole(e.target.value)} style={{ ...inputStyle, WebkitAppearance: 'none' }}>
                                    <option value="user">Пользователь (Ограничен)</option>
                                    <option value="admin">Администратор</option>
                                </select>
                            </div>
                            <button type="submit" style={{ background: 'rgba(76, 175, 80, 0.2)', border: '1px solid #4caf50', color: '#4caf50', padding: '0.6rem 1rem', borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                                <Plus size={16} /> Создать
                            </button>
                        </form>
                    </div>
                </section>
            )}
        </div>
    );
}
