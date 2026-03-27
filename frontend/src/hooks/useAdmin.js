import { useState, useEffect, useCallback } from 'react';
import { adminApi } from '../api/client';

export function useAdmin() {
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const refresh = useCallback(async () => {
        try {
            setLoading(true);
            setError(null);
            const data = await adminApi.getUsers();
            setUsers(data);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, []);

    const banUser = useCallback(async (id, reason) => {
        await adminApi.banUser(id, reason);
        await refresh();
    }, [refresh]);

    const unbanUser = useCallback(async (id) => {
        await adminApi.unbanUser(id);
        await refresh();
    }, [refresh]);

    const resetPassword = useCallback(async (id, newPassword) => {
        await adminApi.resetPassword(id, newPassword);
    }, []);

    const deleteDevices = useCallback(async (id) => {
        const result = await adminApi.deleteDevices(id);
        await refresh();
        return result;
    }, [refresh]);

    useEffect(() => { refresh(); }, [refresh]);

    return { users, loading, error, refresh, banUser, unbanUser, resetPassword, deleteDevices };
}

export function useAuditLog(userId) {
    const [entries, setEntries] = useState([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);

    const refresh = useCallback(async (params = {}) => {
        if (!userId) return;
        try {
            setLoading(true);
            const data = await adminApi.getAudit(userId, params);
            setEntries(data.entries);
            setTotal(data.total);
        } catch {
            setEntries([]);
        } finally {
            setLoading(false);
        }
    }, [userId]);

    useEffect(() => { refresh(); }, [refresh]);

    return { entries, total, loading, refresh };
}
