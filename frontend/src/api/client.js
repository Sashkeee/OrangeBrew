/**
 * OrangeBrew API Client
 * HTTP client for communicating with the backend REST API.
 */

import { API_BASE } from '../utils/constants';

async function request(path, options = {}) {
    const url = `${API_BASE}${path}`;
    const token = localStorage.getItem('orangebrew_token');

    const config = {
        headers: {
            'Content-Type': 'application/json',
            ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        ...options,
    };

    if (config.body && typeof config.body === 'object') {
        config.body = JSON.stringify(config.body);
    }

    const res = await fetch(url, config);

    if (!res.ok) {
        if (res.status === 401) {
            // Unauthenticated! Clear token and force reload to show login
            localStorage.removeItem('orangebrew_token');
            window.location.href = '/login';
        }
        const error = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(error.error || `HTTP ${res.status}`);
    }

    return res.json();
}

// ─── Recipes ──────────────────────────────────────────────

export const recipesApi = {
    getAll: () => request('/recipes'),
    getById: (id) => request(`/recipes/${id}`),
    create: (data) => request('/recipes', { method: 'POST', body: data }),
    update: (id, data) => request(`/recipes/${id}`, { method: 'PUT', body: data }),
    delete: (id) => request(`/recipes/${id}`, { method: 'DELETE' }),

    // Import / Export (JSON)
    exportAll: () => request('/recipes/export'),
    importJson: (recipes) => request('/recipes/import', { method: 'POST', body: { recipes } }),

    // Scaling
    scale: (id, targetBatchSize) =>
        request(`/recipes/${id}/scale`, { method: 'POST', body: { targetBatchSize } }),
    scaleAndSave: (id, targetBatchSize) =>
        request(`/recipes/${id}/scale-and-save`, { method: 'POST', body: { targetBatchSize } }),
};

// ─── Sessions ─────────────────────────────────────────────

export const sessionsApi = {
    getAll: (type) => request(`/sessions${type ? `?type=${type}` : ''}`),
    getById: (id) => request(`/sessions/${id}`),
    create: (data) => request('/sessions', { method: 'POST', body: data }),
    update: (id, data) => request(`/sessions/${id}`, { method: 'PUT', body: data }),
    complete: (id) => request(`/sessions/${id}/complete`, { method: 'POST' }),
    delete: (id) => request(`/sessions/${id}`, { method: 'DELETE' }),

    // Temperature log
    getTemperatures: (id, limit) => request(`/sessions/${id}/temperatures?limit=${limit || 500}`),
    logTemperature: (id, sensor, value) => request(`/sessions/${id}/temperatures`, { method: 'POST', body: { sensor, value } }),

    // Fractions (distillation)
    getFractions: (id) => request(`/sessions/${id}/fractions`),
    logFraction: (id, data) => request(`/sessions/${id}/fractions`, { method: 'POST', body: data }),

    // Fermentation entries
    getFermentation: (id) => request(`/sessions/${id}/fermentation`),
    logFermentation: (id, data) => request(`/sessions/${id}/fermentation`, { method: 'POST', body: data }),
};

// ─── Users ─────────────────────────────────────────────

export const usersApi = {
    getMe: () => request('/users/me'),
    updateProfile: (data) => request('/users/profile', { method: 'PUT', body: data }),
    getAll: () => request('/users'),
    create: (data) => request('/users', { method: 'POST', body: data }),
    delete: (id) => request(`/users/${id}`, { method: 'DELETE' }),
};

// ─── Sensors ──────────────────────────────────────────────

export const sensorsApi = {
    getCurrent: () => request('/sensors'),
    getHistory: (minutes = 10) => request(`/sensors/history?minutes=${minutes}`),
};

// ─── Control ──────────────────────────────────────────────

export const controlApi = {
    getState: () => request('/control'),
    setHeater: (value) => request('/control/heater', { method: 'POST', body: { value } }),
    setCooler: (value) => request('/control/cooler', { method: 'POST', body: { value } }),
    setPump: (value) => request('/control/pump', { method: 'POST', body: { value } }),
    setDephleg: (value, mode) => request('/control/dephleg', { method: 'POST', body: { value, mode } }),
    emergencyStop: () => request('/control/emergency-stop', { method: 'POST' }),
};

// ─── Settings ─────────────────────────────────────────────

export const settingsApi = {
    getAll: () => request('/settings'),
    update: (data) => request('/settings', { method: 'PUT', body: data }),
    testConnection: () => request('/settings/test-connection', { method: 'POST' }),
};

// ─── Health ───────────────────────────────────────────────

export const healthApi = {
    check: () => request('/health'),
};

// ─── Auth ─────────────────────────────────────────────────

export const authApi = {
    login: (username, password) => request('/auth/login', {
        method: 'POST',
        body: { username, password },
    }),
    register: (data) => request('/auth/register', {
        method: 'POST',
        body: data,
    }),
    me: () => request('/auth/me'),
};

// ─── Devices ──────────────────────────────────────────────

export const deviceApi = {
    getAll: () => request('/devices'),
    update: (id, data) => request(`/devices/${id}`, { method: 'PATCH', body: data }),
    delete: (id) => request(`/devices/${id}`, { method: 'DELETE' }),
    pairInit: () => request('/devices/pair/init', { method: 'POST' }),
    pairStatus: (code) => request(`/devices/pair/status?code=${encodeURIComponent(code)}`),
};
