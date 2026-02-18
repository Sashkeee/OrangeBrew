/**
 * OrangeBrew WebSocket Client
 * Real-time connection to the backend for live sensor data and control.
 */

import { WS_URL } from '../utils/constants';

class WsClient {
    constructor() {
        this.ws = null;
        this.listeners = new Map();
        this.reconnectTimer = null;
        this.reconnectDelay = 1000;
        this.maxReconnectDelay = 30000;
        this.connected = false;
        this.commandQueue = [];
    }

    /**
     * Connect to the WebSocket server.
     */
    connect() {
        if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
            return;
        }

        try {
            this.ws = new WebSocket(WS_URL);

            this.ws.onopen = () => {
                console.log('[WS] Connected');
                this.connected = true;
                this.reconnectDelay = 1000;
                this._emit('connection', { connected: true });

                // Flush queued commands
                while (this.commandQueue.length > 0) {
                    const cmd = this.commandQueue.shift();
                    this.send(cmd);
                }
            };

            this.ws.onmessage = (event) => {
                try {
                    const msg = JSON.parse(event.data);
                    this._emit(msg.type, msg);
                } catch (e) {
                    console.warn('[WS] Invalid message:', event.data);
                }
            };

            this.ws.onclose = () => {
                console.log('[WS] Disconnected');
                this.connected = false;
                this._emit('connection', { connected: false });
                this._scheduleReconnect();
            };

            this.ws.onerror = (err) => {
                console.error('[WS] Error:', err);
                this.connected = false;
            };
        } catch (e) {
            console.error('[WS] Connection failed:', e);
            this._scheduleReconnect();
        }
    }

    /**
     * Disconnect and stop reconnecting.
     */
    disconnect() {
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        this.connected = false;
    }

    /**
     * Send a command to the server.
     */
    send(data) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(data));
        } else {
            // Queue for when we reconnect
            this.commandQueue.push(data);
        }
    }

    /**
     * Subscribe to a message type.
     * @param {string} type - Message type ('sensors', 'control', 'alert', 'connection', etc.)
     * @param {Function} callback
     * @returns {Function} unsubscribe function
     */
    on(type, callback) {
        if (!this.listeners.has(type)) {
            this.listeners.set(type, new Set());
        }
        this.listeners.get(type).add(callback);

        // Return unsubscribe function
        return () => {
            const set = this.listeners.get(type);
            if (set) set.delete(callback);
        };
    }

    /**
     * Emit an event to all listeners.
     */
    _emit(type, data) {
        const set = this.listeners.get(type);
        if (set) {
            for (const cb of set) {
                try { cb(data); } catch (e) { console.error('[WS] Listener error:', e); }
            }
        }
    }

    /**
     * Schedule a reconnection with exponential backoff.
     */
    _scheduleReconnect() {
        if (this.reconnectTimer) return;
        console.log(`[WS] Reconnecting in ${this.reconnectDelay}ms...`);
        this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null;
            this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.maxReconnectDelay);
            this.connect();
        }, this.reconnectDelay);
    }
}

// Singleton instance
const wsClient = new WsClient();
export default wsClient;
