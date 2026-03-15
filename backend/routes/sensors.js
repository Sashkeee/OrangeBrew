import { Router } from 'express';
import { temperatureQueries, sensorQueries } from '../db/database.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

// ─── In-memory stores ──────────────────────────────────────

/**
 * Latest role-mapped sensor readings for REST polling.
 * @type {Record<string, {value: number, timestamp: number}>}
 */
let latestReadings = {};

/**
 * Discovered sensors per user: Map<userId, Map<address, {temp, lastSeen}>>
 * Populated whenever WiFi hardware sends sensor data.
 */
const discoveredSensors = new Map();

// ─── Exported update functions (called from server.js) ────

/**
 * Update the latest role-mapped readings.
 * Filters out metadata keys — only stores actual sensor values.
 */
export function updateSensorReadings(readings) {
    const now = Date.now();
    const skipKeys = ['type', 'timestamp', 'deviceId', 'sensors'];

    for (const [sensor, value] of Object.entries(readings)) {
        if (skipKeys.includes(sensor)) continue;
        if (typeof value === 'number') {
            latestReadings[sensor] = { value, timestamp: now };
        } else if (typeof value === 'object' && value !== null && 'value' in value) {
            latestReadings[sensor] = { value: value.value, timestamp: now };
        }
    }
}

/**
 * Update the in-memory discovered sensors store.
 * Called from server.js whenever hardware sensor data arrives.
 * @param {number} userId
 * @param {Array<{address: string, temp: number}>} sensors
 */
export function updateDiscoveredSensors(userId, sensors) {
    if (!Array.isArray(sensors) || sensors.length === 0) return;
    if (!discoveredSensors.has(userId)) {
        discoveredSensors.set(userId, new Map());
    }
    const userMap = discoveredSensors.get(userId);
    const now = Date.now();
    for (const s of sensors) {
        if (s.address) {
            userMap.set(s.address, {
                temp: parseFloat(s.temp ?? s.value ?? 0),
                lastSeen: now,
            });
        }
    }
}

/**
 * Get current role-mapped readings.
 */
export function getSensorReadings() {
    return latestReadings;
}

// ─── Routes ────────────────────────────────────────────────

// GET /api/sensors — current role-mapped readings (for WS init / legacy polling)
router.get('/', (req, res) => {
    res.json(latestReadings);
});

// GET /api/sensors/history?minutes=10 — recent temperature history from DB
router.get('/history', (req, res) => {
    try {
        const minutes = parseInt(req.query.minutes) || 10;
        const data = temperatureQueries.getRecent(minutes);
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/sensors/discovered — sensors currently visible on the OneWire bus
// Merges in-memory discovered sensors with user's saved config (name, color, etc.)
router.get('/discovered', authenticate, (req, res) => {
    const userId = req.user.id;
    const userMap = discoveredSensors.get(userId) || new Map();

    let configs = [];
    try {
        configs = sensorQueries.getAll(userId);
    } catch { /* sensors table may not exist yet */ }

    const result = [];
    for (const [address, data] of userMap) {
        const cfg = configs.find(c => c.address === address);
        result.push({
            address,
            temp: data.temp,
            lastSeen: data.lastSeen,
            name: cfg?.name ?? '',
            color: cfg?.color ?? null,
            offset: cfg?.offset ?? 0,
            enabled: cfg ? (cfg.enabled !== 0) : true,
            configured: !!cfg,
        });
    }

    // Also include configured sensors not seen recently (possibly offline)
    for (const cfg of configs) {
        if (!userMap.has(cfg.address)) {
            result.push({
                address: cfg.address,
                temp: null,
                lastSeen: null,
                name: cfg.name,
                color: cfg.color,
                offset: cfg.offset,
                enabled: cfg.enabled !== 0,
                configured: true,
            });
        }
    }

    res.json(result);
});

// GET /api/sensors/config — named sensor configs for the current user
router.get('/config', authenticate, (req, res) => {
    try {
        const configs = sensorQueries.getAll(req.user.id);
        res.json(configs);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PUT /api/sensors/config — save/update sensor configs
// Body: { sensors: [{address, name, color, offset, enabled}, ...] }
router.put('/config', authenticate, (req, res) => {
    try {
        const { sensors } = req.body;
        if (!Array.isArray(sensors)) {
            return res.status(400).json({ error: 'sensors must be an array' });
        }
        const userId = req.user.id;
        const saved = [];
        for (const s of sensors) {
            if (!s.address) continue;
            const row = sensorQueries.upsert(userId, s.address, {
                name: s.name ?? '',
                color: s.color ?? null,
                offset: parseFloat(s.offset) || 0,
                enabled: s.enabled !== false ? 1 : 0,
            });
            saved.push(row);
        }
        res.json({ ok: true, sensors: saved });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE /api/sensors/config/:address — remove a sensor config
router.delete('/config/:address', authenticate, (req, res) => {
    try {
        const address = decodeURIComponent(req.params.address);
        sensorQueries.delete(req.user.id, address);
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

export default router;
