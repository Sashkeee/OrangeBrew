/**
 * Maps raw sensor addresses to role keys (boiler, column, etc.) using
 * the user's sensor configuration from the `sensors` table.
 *
 * Only explicitly configured and enabled sensors are mapped.
 * Sensors with a `role` produce role-keyed values (e.g. mapped.boiler).
 * All enabled sensors also produce address-keyed values (mapped["28-abc..."]).
 *
 * NO automatic fallback — if no sensor has role='boiler', mapped.boiler
 * stays undefined. Dashboard pages show default/empty state.
 *
 * @param {string} deviceId
 * @param {object} rawData  — must have rawData.sensors = [{address, temp}]
 * @param {number|null} userId
 * @param {{ sensorQueries: object, logger: object }} deps
 * @returns {object} mapped data with role keys and sensors array
 */
export function mapSensors(deviceId, rawData, userId = null, { sensorQueries, logger }) {
    if (!rawData || !rawData.sensors || !Array.isArray(rawData.sensors)) return rawData;

    const mapped = {
        type: 'sensors',
        deviceId,
        sensors: rawData.sensors,
    };

    if (userId === null) return mapped;

    try {
        const configs = sensorQueries.getAll(userId);
        for (const cfg of configs) {
            if (!cfg.enabled) continue;
            const found = rawData.sensors.find(s => s.address === cfg.address);
            if (!found) continue;

            const rawTemp = parseFloat(found.temp ?? found.value ?? 0);
            const temp = rawTemp + parseFloat(cfg.offset || 0);

            // Address-keyed value (for named sensor display)
            mapped[cfg.address] = temp;

            // Role-keyed value (for dashboard pages and PID)
            if (cfg.role) {
                mapped[cfg.role] = temp;
            }
        }
    } catch (e) {
        logger.warn({ module: 'mapSensors', err: e.message }, 'Failed to load sensor configs');
    }

    return mapped;
}
