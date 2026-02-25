import { Router } from 'express';
import { temperatureQueries } from '../db/database.js';

const router = Router();

// Latest sensor readings are held in memory by the serial manager,
// this route provides them via REST (complement to WebSocket).

/** @type {Record<string, {value: number, timestamp: number}>} */
let latestReadings = {};

/**
 * Update the latest readings (called by serial manager or mapSensors).
 * Filters out metadata keys — only stores actual sensor role values.
 */
export function updateSensorReadings(readings) {
    const now = Date.now();
    // Ключи, которые не являются показаниями датчиков
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
 * Get current sensor readings.
 */
export function getSensorReadings() {
    return latestReadings;
}

// GET /api/sensors — current readings
router.get('/', (req, res) => {
    res.json(latestReadings);
});

// GET /api/sensors/history?minutes=10 — recent temperature history
router.get('/history', (req, res) => {
    try {
        const minutes = parseInt(req.query.minutes) || 10;
        const data = temperatureQueries.getRecent(minutes);
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

export default router;
