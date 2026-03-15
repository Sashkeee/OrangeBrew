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

    // Public library + search
    getPublic: (params = {}) => request(`/recipes/public?${new URLSearchParams(params)}`),
    setPublic: (id, isPublic) => request(`/recipes/${id}/publish`, { method: 'POST', body: { isPublic } }),
    search: (params = {}) => request(`/recipes/search?${new URLSearchParams(params)}`),
    getStyles: () => request('/recipes/styles'),

    // Social: likes
    toggleLike: (id) => request(`/recipes/${id}/like`, { method: 'POST' }),
    getLikes: (id) => request(`/recipes/${id}/likes`),

    // Social: comments
    getComments: (id, params = {}) => request(`/recipes/${id}/comments?${new URLSearchParams(params)}`),
    addComment: (id, text) => request(`/recipes/${id}/comments`, { method: 'POST', body: { text } }),
    deleteComment: (recipeId, commentId) => request(`/recipes/${recipeId}/comments/${commentId}`, { method: 'DELETE' }),

    // Discovery
    trending: (days = 7) => request(`/recipes/trending?days=${days}`),
    similar:  (id)       => request(`/recipes/${id}/similar`),
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

    /** Sensors currently visible on the OneWire bus (merged with saved config) */
    getDiscovered: () => request('/sensors/discovered'),

    /** Saved named sensor configs for the current user */
    getConfig: () => request('/sensors/config'),

    /**
     * Save sensor configs.
     * @param {Array<{address, name, color, offset, enabled}>} sensors
     */
    updateConfig: (sensors) => request('/sensors/config', { method: 'PUT', body: { sensors } }),

    /** Remove a sensor config by address */
    deleteConfig: (address) => request(`/sensors/config/${encodeURIComponent(address)}`, { method: 'DELETE' }),
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

// ─── Process ──────────────────────────────────────────────

export const processApi = {
    getStatus: () => request('/process/status'),
    start:  (payload) => request('/process/start',  { method: 'POST', body: payload }),
    stop:   (payload) => request('/process/stop',   { method: 'POST', body: payload }),
    pause:  (payload) => request('/process/pause',  { method: 'POST', body: payload }),
    resume: (payload) => request('/process/resume', { method: 'POST', body: payload }),
    skip:   (payload) => request('/process/skip',   { method: 'POST', body: payload }),
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

// ─── BeerXML ──────────────────────────────────────────────

export const beerxmlApi = {
    /**
     * Import a .xml File object. Sends as multipart/form-data.
     * Returns { ok, imported, failed, recipes, errors? }
     */
    import: (file) => {
        const token = localStorage.getItem('orangebrew_token');
        const formData = new FormData();
        formData.append('file', file);
        return fetch(`${API_BASE}/beerxml/import`, {
            method: 'POST',
            headers: token ? { Authorization: `Bearer ${token}` } : {},
            body: formData,
            // Do NOT set Content-Type — browser adds multipart boundary automatically
        }).then(async res => {
            if (!res.ok) {
                const err = await res.json().catch(() => ({ error: res.statusText }));
                throw new Error(err.error || `HTTP ${res.status}`);
            }
            return res.json();
        });
    },

    /** Export a single recipe. Returns Blob (caller handles download). */
    exportOne: (id) => {
        const token = localStorage.getItem('orangebrew_token');
        return fetch(`${API_BASE}/beerxml/export/${id}`, {
            headers: token ? { Authorization: `Bearer ${token}` } : {},
        }).then(res => {
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return res.blob();
        });
    },

    /** Export all recipes. Returns Blob. */
    exportAll: () => {
        const token = localStorage.getItem('orangebrew_token');
        return fetch(`${API_BASE}/beerxml/export-all`, {
            headers: token ? { Authorization: `Bearer ${token}` } : {},
        }).then(res => {
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return res.blob();
        });
    },
};

// ─── Devices ──────────────────────────────────────────────

export const deviceApi = {
    getAll: () => request('/devices'),
    update: (id, data) => request(`/devices/${id}`, { method: 'PATCH', body: data }),
    delete: (id) => request(`/devices/${id}`, { method: 'DELETE' }),
    pairInit: () => request('/devices/pair/init', { method: 'POST' }),
    pairStatus: (code) => request(`/devices/pair/status?code=${encodeURIComponent(code)}`),
};
