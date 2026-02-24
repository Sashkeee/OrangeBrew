const isDev = import.meta.env.DEV; // Vite: true в dev-режиме
export const API_BASE = import.meta.env.VITE_API_URL
    ? import.meta.env.VITE_API_URL
    : isDev ? 'http://localhost:3001/api' : '/api';

const wsProtocol =
    typeof window !== 'undefined' && window.location.protocol === 'https:' ? 'wss:' : 'ws:';
const wsHost =
    typeof window !== 'undefined' ? window.location.host : 'localhost:3001';
export const WS_URL = import.meta.env.VITE_WS_URL
    ? import.meta.env.VITE_WS_URL
    : isDev ? 'ws://localhost:3001/ws' : `${wsProtocol}//${wsHost}/ws`;


/**
 * Helper for debug API calls (PID, Mock controls).
 */
export async function debugPost(path, body) {
    const res = await fetch(`${API_BASE}/debug${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
    return res.json();
}
