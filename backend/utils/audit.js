import { auditQueries } from '../db/database.js';
import logger from './logger.js';

const log = logger.child({ module: 'Audit' });

/**
 * Fire-and-forget audit log writer.
 * Never throws — audit failures must not break the main flow.
 *
 * @param {Object} opts
 * @param {number}      opts.userId  — subject user
 * @param {string}      opts.action  — e.g. 'user.login', 'recipe.create'
 * @param {string}     [opts.detail] — human-readable detail
 * @param {number|null} [opts.adminId] — admin who performed the action (if applicable)
 * @param {string|null} [opts.ip]     — request IP
 */
export function writeAudit({ userId, action, detail = '', adminId = null, ip = null }) {
    try {
        auditQueries.insert({ userId, action, detail, adminId, ip });
    } catch (err) {
        log.error({ err, userId, action }, 'Failed to write audit log');
    }
}
