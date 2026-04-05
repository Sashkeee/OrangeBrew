import { Router } from 'express';
import { temperatureQueries, sensorQueries } from '../db/database.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

// ─── In-memory stores ──────────────────────────────────────

/**
 * Latest role-mapped sensor readings per user: Map<userId, Record<string, {value, timestamp}>>
 */
const latestReadingsMap = new Map();

/**
 * Discovered sensors per user: Map<userId, Map<address, {temp, lastSeen}>>
 * Populated whenever WiFi hardware sends sensor data.
 */
const discoveredSensors = new Map();

/**
 * Cross-talk detection: tracks which users' devices report each sensor address.
 * On a shared breadboard, OneWire buses can pick up sensors from neighbouring ESPs.
 * Map<address, Map<userId, { deviceId, lastSeen }>>
 */
const addressReporters = new Map();

/**
 * Per-device sensor baseline: tracks the minimum number of sensors
 * a device has ever reported.  Intermittent cross-talk adds extra
 * sensors to some scans — the minimum is the stable "native" count.
 * Map<deviceId, { minCount: number, samples: number }>
 */
const deviceSensorBaseline = new Map();

// ─── Exported update functions (called from server.js) ────

/**
 * Update the latest role-mapped readings for a specific user.
 * Filters out metadata keys — only stores actual sensor values.
 * @param {object} readings
 * @param {number} userId
 */
export function updateSensorReadings(readings, userId) {
    if (userId == null) return;
    const now = Date.now();
    const skipKeys = ['type', 'timestamp', 'deviceId', 'sensors'];

    if (!latestReadingsMap.has(userId)) {
        latestReadingsMap.set(userId, {});
    }
    const userReadings = latestReadingsMap.get(userId);

    for (const [sensor, value] of Object.entries(readings)) {
        if (skipKeys.includes(sensor)) continue;
        if (typeof value === 'number') {
            userReadings[sensor] = { value, timestamp: now };
        } else if (typeof value === 'object' && value !== null && 'value' in value) {
            userReadings[sensor] = { value: value.value, timestamp: now };
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
 * Get current role-mapped readings for a specific user.
 * @param {number} [userId]
 * @returns {Record<string, {value: number, timestamp: number}>}
 */
export function getSensorReadings(userId = null) {
    if (userId == null) return {};
    return latestReadingsMap.get(userId) || {};
}

// ─── Cross-talk detection (called from server.js) ─────────

/**
 * Record that a user's device reported certain sensor addresses.
 * Builds up the addressReporters map for cross-talk detection.
 */
export function trackSensorReporters(userId, deviceId, sensors) {
    if (!Array.isArray(sensors)) return;
    const now = Date.now();
    for (const s of sensors) {
        if (!s.address) continue;
        if (!addressReporters.has(s.address)) {
            addressReporters.set(s.address, new Map());
        }
        addressReporters.get(s.address).set(userId, { deviceId, lastSeen: now });
    }
}

/**
 * Filter out cross-talk sensors: addresses that are also reported by
 * a DIFFERENT user's device within the TTL window.
 *
 * Priority:
 *  1. User-configured addresses (sensors table) → always pass
 *  2. Addresses reported ONLY by this user's devices → pass
 *  3. Addresses reported by multiple users → blocked (cross-talk)
 *
 * Fallback: if ALL sensors would be blocked (full cross-talk with no
 * configuration), return the single best candidate — the address with
 * the fewest other active reporters.
 *
 * @param {number} userId
 * @param {Array<{address: string, temp: number}>} sensors
 * @param {Set<string>} userConfiguredAddresses
 * @returns {Array<{address: string, temp: number}>}
 */
export function filterCrossTalkSensors(userId, sensors, userConfiguredAddresses = new Set()) {
    if (!Array.isArray(sensors) || sensors.length === 0) return sensors;

    const REPORTER_TTL = 30_000; // 30 s — reporter considered "active" within this window
    const now = Date.now();

    const filtered = sensors.filter(s => {
        if (!s.address) return true;
        if (userConfiguredAddresses.has(s.address)) return true;

        const reporters = addressReporters.get(s.address);
        if (!reporters) return true;

        for (const [uid, info] of reporters) {
            if (uid !== userId && (now - info.lastSeen) < REPORTER_TTL) {
                return false; // another user's device also reports this → cross-talk
            }
        }
        return true;
    });

    // Full cross-talk fallback: pick the sensor with fewest competing reporters
    if (filtered.length === 0 && sensors.length > 0) {
        let best = sensors[0];
        let bestScore = Infinity;
        for (const s of sensors) {
            if (!s.address) continue;
            const reporters = addressReporters.get(s.address);
            const otherCount = reporters
                ? [...reporters.entries()].filter(([uid, info]) => uid !== userId && (now - info.lastSeen) < REPORTER_TTL).length
                : 0;
            if (otherCount < bestScore) {
                bestScore = otherCount;
                best = s;
            }
        }
        return [best];
    }

    return filtered;
}

/**
 * Remove a device from the reporters map (called on device disconnect).
 */
export function removeDeviceFromReporters(deviceId) {
    for (const [address, reporters] of addressReporters) {
        for (const [userId, info] of reporters) {
            if (info.deviceId === deviceId) {
                reporters.delete(userId);
            }
        }
        if (reporters.size === 0) {
            addressReporters.delete(address);
        }
    }
}

/**
 * Cap the sensor array to the device's stable baseline count.
 * If a device sometimes reports 1 sensor and sometimes 2, the stable
 * count is 1 — the extra is intermittent cross-talk.
 * Needs ≥ 3 samples before capping (avoids premature filtering on startup).
 *
 * @param {string} deviceId
 * @param {Array} sensors
 * @returns {Array} sensors trimmed to baseline length (or unchanged if baseline not yet established)
 */
export function applyDeviceBaseline(deviceId, sensors) {
    if (!Array.isArray(sensors) || sensors.length === 0) return sensors;

    const count = sensors.length;

    if (!deviceSensorBaseline.has(deviceId)) {
        deviceSensorBaseline.set(deviceId, { minCount: count, samples: 1 });
        return sensors;
    }

    const baseline = deviceSensorBaseline.get(deviceId);
    baseline.samples++;
    if (count < baseline.minCount) {
        baseline.minCount = count;
    }

    // Wait for a few samples before enforcing the cap
    if (baseline.samples < 3) return sensors;

    if (sensors.length > baseline.minCount) {
        return sensors.slice(0, baseline.minCount);
    }
    return sensors;
}

/**
 * Reset baseline for a device (called on device disconnect).
 */
export function resetDeviceBaseline(deviceId) {
    deviceSensorBaseline.delete(deviceId);
}

// ─── Routes ────────────────────────────────────────────────

/**
 * @openapi
 * /api/sensors:
 *   get:
 *     tags: [Sensors]
 *     summary: Current role-mapped sensor readings
 *     description: >
 *       Returns the latest role-mapped temperature readings stored in memory.
 *       Used for WS initialisation and legacy polling fallback.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Key-value map of sensor roles to their latest readings
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               additionalProperties:
 *                 type: object
 *                 properties:
 *                   value:
 *                     type: number
 *                     description: Temperature value in °C
 *                   timestamp:
 *                     type: number
 *                     description: Unix timestamp (ms) of the reading
 *               example:
 *                 boiler: { value: 65.3, timestamp: 1711360000000 }
 *                 column: { value: 42.1, timestamp: 1711360000000 }
 */
router.get('/', (req, res) => {
    res.json(getSensorReadings(req.user.id));
});

/**
 * @openapi
 * /api/sensors/history:
 *   get:
 *     tags: [Sensors]
 *     summary: Recent temperature history
 *     description: Returns temperature log entries from the database for the last N minutes.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: minutes
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Number of minutes of history to return
 *     responses:
 *       200:
 *         description: Array of temperature log entries
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: integer
 *                   session_id:
 *                     type: integer
 *                   boiler_temp:
 *                     type: number
 *                   column_temp:
 *                     type: number
 *                     nullable: true
 *                   target_temp:
 *                     type: number
 *                     nullable: true
 *                   heater_power:
 *                     type: number
 *                     nullable: true
 *                   timestamp:
 *                     type: string
 *                     format: date-time
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/history', (req, res) => {
    try {
        const minutes = parseInt(req.query.minutes) || 10;
        const data = temperatureQueries.getRecent(minutes);
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * @openapi
 * /api/sensors/discovered:
 *   get:
 *     tags: [Sensors]
 *     summary: Discovered sensors with saved config
 *     description: >
 *       Returns sensors currently visible on the OneWire bus, merged with
 *       the user's saved configuration (name, color, offset, enabled).
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Array of discovered sensors
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   address:
 *                     type: string
 *                     description: OneWire address (e.g. "28-3c01f096b4aa")
 *                   temp:
 *                     type: number
 *                     description: Current temperature in °C
 *                   lastSeen:
 *                     type: number
 *                     description: Unix timestamp (ms) of last reading
 *                   name:
 *                     type: string
 *                     description: User-assigned sensor name
 *                   color:
 *                     type: string
 *                     nullable: true
 *                     description: HEX colour for UI charting
 *                   offset:
 *                     type: number
 *                     description: Calibration offset in °C
 *                   enabled:
 *                     type: boolean
 *                     description: Whether the sensor is enabled
 *                   configured:
 *                     type: boolean
 *                     description: Whether a saved config exists for this sensor
 */
router.get('/discovered', authenticate, (req, res) => {
    const userId = req.user.id;
    const userMap = discoveredSensors.get(userId) || new Map();

    let configs = [];
    try {
        configs = sensorQueries.getAll(userId);
    } catch { /* sensors table may not exist yet */ }

    const TTL_MS = 60_000; // sensors not heard from in 60s are considered stale
    const now = Date.now();
    const result = [];
    for (const [address, data] of userMap) {
        if (now - data.lastSeen > TTL_MS) continue; // skip stale entries
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

    res.json(result);
});

/**
 * @openapi
 * /api/sensors/config:
 *   get:
 *     tags: [Sensors]
 *     summary: Get named sensor configs
 *     description: Returns all saved sensor configurations for the current user.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Array of sensor config objects
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/SensorConfig'
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/config', authenticate, (req, res) => {
    try {
        const configs = sensorQueries.getAll(req.user.id);
        res.json(configs);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * @openapi
 * /api/sensors/config:
 *   put:
 *     tags: [Sensors]
 *     summary: Save or update sensor configs
 *     description: >
 *       Upserts sensor configurations for the current user. Each sensor is
 *       identified by its OneWire address. Existing configs are updated,
 *       new ones are created.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [sensors]
 *             properties:
 *               sensors:
 *                 type: array
 *                 items:
 *                   $ref: '#/components/schemas/SensorConfig'
 *     responses:
 *       200:
 *         description: Saved sensor configs
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok:
 *                   type: boolean
 *                   example: true
 *                 sensors:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/SensorConfig'
 *       400:
 *         description: Invalid request body (sensors must be an array)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
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

/**
 * @openapi
 * /api/sensors/config/{address}:
 *   delete:
 *     tags: [Sensors]
 *     summary: Remove a sensor config
 *     description: Deletes the saved configuration for the given sensor address.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: address
 *         required: true
 *         schema:
 *           type: string
 *         description: URL-encoded OneWire sensor address (e.g. "28-3c01f096b4aa")
 *     responses:
 *       200:
 *         description: Config deleted
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok:
 *                   type: boolean
 *                   example: true
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
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
