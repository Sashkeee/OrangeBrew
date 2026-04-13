import React, { createContext, useContext, useState, useCallback } from 'react';
import wsClient from '../api/wsClient.js';

const AuthContext = createContext(null);

/** Decode JWT payload (no signature check — just for UI state) */
function decodeToken(token) {
    try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        if (payload.exp && payload.exp * 1000 < Date.now()) return null; // expired
        return payload;
    } catch {
        return null;
    }
}

export function AuthProvider({ children }) {
    const [user, setUser] = useState(() => {
        const token = localStorage.getItem('orangebrew_token');
        if (!token) return null;
        const payload = decodeToken(token);
        if (!payload) {
            localStorage.removeItem('orangebrew_token');
            return null;
        }
        return {
            id:       payload.id,
            username: payload.username,
            role:     payload.role,
        };
    });

    /**
     * Call after successful login or register.
     * @param {string} token  - JWT token from backend
     * @param {object} userData - full user object from backend response
     */
    const login = useCallback((token, userData) => {
        wsClient.disconnect(); // force WS reconnect with new user's token
        localStorage.setItem('orangebrew_token', token);
        setUser({
            id:                      userData.id,
            username:                userData.username,
            role:                    userData.role,
            email:                   userData.email,
            subscription_tier:       userData.subscription_tier,
            subscription_status:     userData.subscription_status,
            subscription_expires_at: userData.subscription_expires_at,
        });
    }, []);

    /** Clear token and state — navigating is caller's responsibility */
    const logout = useCallback(() => {
        wsClient.disconnect(); // close WS before removing token
        localStorage.removeItem('orangebrew_token');
        setUser(null);
    }, []);

    /** Update user fields without re-login (e.g. after /auth/me refresh) */
    const updateUser = useCallback((partial) => {
        setUser(prev => prev ? { ...prev, ...partial } : prev);
    }, []);

    const isAuthenticated = !!user;

    return (
        <AuthContext.Provider value={{ user, isAuthenticated, login, logout, updateUser }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error('useAuth must be used within <AuthProvider>');
    return ctx;
}
