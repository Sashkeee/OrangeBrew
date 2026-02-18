import { useState, useCallback } from 'react';
import { sessionsApi } from '../api/client.js';

/**
 * Hook for managing brew sessions via REST API.
 *
 * @param {string} [type] - Optional filter: 'mash' | 'boil' | 'fermentation' | 'distillation' | 'rectification'
 * @returns {{ sessions, activeSession, loading, error, startSession, completeSession, deleteSession, refresh }}
 */
export function useSessions(type) {
    const [sessions, setSessions] = useState([]);
    const [activeSession, setActiveSession] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const refresh = useCallback(async () => {
        try {
            setLoading(true);
            const data = await sessionsApi.getAll(type);
            setSessions(data);
            // Find active session
            const active = data.find(s => s.status === 'active');
            setActiveSession(active || null);
            setError(null);
        } catch (e) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    }, [type]);

    const startSession = useCallback(async (sessionData) => {
        try {
            const session = await sessionsApi.create({ type, ...sessionData });
            setActiveSession(session);
            setSessions(prev => [session, ...prev]);
            return session;
        } catch (e) {
            setError(e.message);
            throw e;
        }
    }, [type]);

    const completeSession = useCallback(async (id) => {
        try {
            const session = await sessionsApi.complete(id || activeSession?.id);
            setActiveSession(null);
            setSessions(prev => prev.map(s => s.id === session.id ? session : s));
            return session;
        } catch (e) {
            setError(e.message);
            throw e;
        }
    }, [activeSession]);

    const deleteSession = useCallback(async (id) => {
        try {
            await sessionsApi.delete(id);
            setSessions(prev => prev.filter(s => s.id !== id));
            if (activeSession?.id === id) setActiveSession(null);
        } catch (e) {
            setError(e.message);
            throw e;
        }
    }, [activeSession]);

    // Temperature logging
    const logTemperature = useCallback(async (sensor, value) => {
        if (!activeSession) return;
        try {
            await sessionsApi.logTemperature(activeSession.id, sensor, value);
        } catch (e) {
            console.error('[Session] Failed to log temperature:', e);
        }
    }, [activeSession]);

    // Fraction logging (distillation)
    const logFraction = useCallback(async (data) => {
        if (!activeSession) return;
        try {
            await sessionsApi.logFraction(activeSession.id, data);
        } catch (e) {
            console.error('[Session] Failed to log fraction:', e);
        }
    }, [activeSession]);

    return {
        sessions, activeSession, loading, error,
        startSession, completeSession, deleteSession,
        logTemperature, logFraction, refresh,
    };
}
