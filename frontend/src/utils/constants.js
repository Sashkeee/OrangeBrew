export const API_BASE = 'http://localhost:3001/api';
export const WS_URL = 'ws://localhost:3001/ws';

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
