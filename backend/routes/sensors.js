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
 * Discovered sensors per user: Map<userId, Map<address, {temp, lastSeen, deviceId}>>
 * Populated whenever WiFi hardware sends sensor data.
 */
const discoveredSensors = new Map();

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
 * Stores deviceId alongside each sensor entry so the frontend
 * can show which device reported each sensor.
 * @param {number} userId
 * @param {Array<{address: string, temp: number}>} sensors
 * @param {string} [deviceId]
 */
export function updateDiscoveredSensors(userId, sensors, deviceId = null) {
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
                deviceId,
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
 *       the user's saved configuration (name, color, offset, enabled, role).
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
 *                   deviceId:
 *                     type: string
 *                     nullable: true
 *                     description: ID of the device that reported this sensor
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
 *                   role:
 *                     type: string
 *                     nullable: true
 *                     description: Sensor role (boiler, column, dephleg, output, ambient)
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
            deviceId: data.deviceId ?? null,
            name: cfg?.name ?? '',
            color: cfg?.color ?? null,
            offset: cfg?.offset ?? 0,
            enabled: cfg ? (cfg.enabled !== 0) : true,
            role: cfg?.role ?? null,
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

const VALID_ROLES = ['boiler', 'column', 'dephleg', 'output', 'ambient'];

/**
 * @openapi
 * /api/sensors/config:
 *   put:
 *     tags: [Sensors]
 *     summary: Save or update sensor configs
 *     description: >
 *       Upserts sensor configurations for the current user. Each sensor is
 *       identified by its OneWire address. Existing configs are updated,
 *       new ones are created. The `role` field assigns a dashboard role
 *       (boiler, column, dephleg, output, ambient) or null for display-only.
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
            const role = VALID_ROLES.includes(s.role) ? s.role : null;
            const row = sensorQueries.upsert(userId, s.address, {
                name: s.name ?? '',
                color: s.color ?? null,
                offset: parseFloat(s.offset) || 0,
                enabled: s.enabled !== false ? 1 : 0,
                role,
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
