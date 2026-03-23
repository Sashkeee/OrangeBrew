/**
 * Maps raw sensor addresses to named roles (boiler, column, etc.).
 * Uses new `sensors` table (per-user, address-based) first.
 * Falls back to old settings_v2 'sensors' config for backward compat.
 * Also applies calibration offset.
 *
 * @param {string} deviceId
 * @param {object} rawData  — must have rawData.sensors = [{address, temp}]
 * @param {number|null} userId
 * @param {{ sensorQueries: object, settingsQueries: object, logger: object }} deps
 * @returns {object} mapped data with role keys (boiler, column, ...) and sensors array
 */
export function mapSensors(deviceId, rawData, userId = null, { sensorQueries, settingsQueries, logger }) {
    if (!rawData || !rawData.sensors || !Array.isArray(rawData.sensors)) return rawData;

    const mapped = {
        type: 'sensors',
        deviceId,
        sensors: rawData.sensors,
    };

    // ── 1. New address-based config (sensors table) ─────────────────
    if (userId !== null) {
        try {
            const configs = sensorQueries.getAll(userId);
            for (const cfg of configs) {
                if (!cfg.enabled) continue;
                const found = rawData.sensors.find(s => s.address === cfg.address);
                if (found) {
                    const rawTemp = parseFloat(found.temp ?? found.value ?? 0);
                    mapped[cfg.address] = rawTemp + parseFloat(cfg.offset || 0);
                }
            }
        } catch (e) {
            logger.warn({ module: 'mapSensors', err: e.message }, 'Failed to load sensor configs');
        }
    }

    // ── 2. Legacy role-based config (settings_v2 'sensors') ─────────
    // Keep for backward compat — maps boiler/column/dephleg/output/ambient
    let legacySettings = null;
    try {
        legacySettings = (userId !== null ? settingsQueries.get('sensors', userId) : null)
            ?? settingsQueries.get('sensors', null);
        if (typeof legacySettings === 'string') legacySettings = JSON.parse(legacySettings);
    } catch { /* ignore */ }

    if (legacySettings && typeof legacySettings === 'object') {
        for (const [role, config] of Object.entries(legacySettings)) {
            if (mapped[role] !== undefined) continue; // already set
            if (config && config.enabled && config.address) {
                const found = rawData.sensors.find(s => s.address === config.address);
                if (found) {
                    const rawTemp = parseFloat(found.temp ?? found.value ?? 0);
                    mapped[role] = rawTemp + parseFloat(config.offset || 0);
                }
            }
        }
    }

    // ── 3. Fallback: boiler = first sensor, column = second ──────────
    if (mapped.boiler === undefined && rawData.sensors.length > 0) {
        mapped.boiler = parseFloat(rawData.sensors[0].temp ?? rawData.sensors[0].value ?? 0);
    }
    if (mapped.column === undefined && rawData.sensors.length > 1) {
        mapped.column = parseFloat(rawData.sensors[1].temp ?? rawData.sensors[1].value ?? 0);
    }

    return mapped;
}
