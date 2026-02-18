/**
 * OrangeBrew API Client
 * HTTP client for communicating with the backend REST API.
 */

const API_BASE = 'http://localhost:3001/api';

async function request(path, options = {}) {
    const url = `${API_BASE}${path}`;
    const config = {
        headers: { 'Content-Type': 'application/json' },
        ...options,
    };

    if (config.body && typeof config.body === 'object') {
        config.body = JSON.stringify(config.body);
    }

    const res = await fetch(url, config);

    if (!res.ok) {
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
