const isDev = import.meta.env.DEV; // Vite in dev mode
export const API_BASE = isDev ? 'http://localhost:3001/api' : '/api';

const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
export const WS_URL = isDev ? 'ws://localhost:3001/ws' : `${wsProtocol}//${window.location.host}/ws`;

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
