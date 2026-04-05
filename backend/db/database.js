import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { mkdirSync, existsSync } from 'fs';
import { runMigrations } from './migrate.js';
import logger from '../utils/logger.js';

const log = logger.child({ module: 'DB' });
const __dirname = dirname(fileURLToPath(import.meta.url));

let db = null;
let dbPath = null;

/**
 * Seed orphaned data (user_id = NULL after migration) to the first admin user.
 * Called once after migrations to preserve existing single-user data.
 */
function _assignOrphanedDataToAdmin() {
    const admin = db.prepare(`SELECT id FROM users ORDER BY id ASC LIMIT 1`).get();
    if (!admin) return;

    const adminId = admin.id;

    const updates = [
        'UPDATE devices     SET user_id = ? WHERE user_id IS NULL',
        'UPDATE recipes     SET user_id = ? WHERE user_id IS NULL',
        'UPDATE brew_sessions SET user_id = ? WHERE user_id IS NULL',
    ];

    db.transaction(() => {
        for (const sql of updates) {
            const info = db.prepare(sql).run(adminId);
            if (info.changes > 0) {
                log.info({ changes: info.changes, table: sql.match(/UPDATE (\w+)/)[1], adminId }, 'Assigned orphaned rows');
            }
        }
    })();
}

/**
 * Initialize the database connection.
 * Uses better-sqlite3 for robust file-based storage.
 * @param {string} path - Path to the SQLite database file
 */
export async function initDatabase(path) {
    dbPath = path;

    // Ensure the data directory exists
    const dir = dirname(path);
    if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
    }

    try {
        log.info({ path }, 'Opening database');
        db = new Database(path, { verbose: null });

        // Performance settings
        db.pragma('journal_mode = WAL');
        db.pragma('foreign_keys = ON');
        db.pragma('synchronous = NORMAL');

        // Run base schema (CREATE TABLE IF NOT EXISTS — idempotent)
        const schema = readFileSync(join(__dirname, 'schema.sql'), 'utf-8');
        db.exec(schema);

        // Run pending migrations (001_multitenancy.sql, 002_..., etc.)
        runMigrations(db);

        // Seed existing data to admin user (no-op if already done)
        _assignOrphanedDataToAdmin();

        log.info('Database initialized successfully');
    } catch (err) {
        log.error({ err }, 'Failed to initialize database');
        throw err;
    }

    return db;
}

/**
 * Save is no longer needed with better-sqlite3 (auto-commit),
 * but kept for compatibility if called elsewhere.
 */
export function saveDatabase() {
    // No-op
}

/**
 * Get the database instance.
 */
export function getDb() {
    if (!db) throw new Error('Database not initialized. Call initDatabase() first.');
    return db;
}

/**
 * Close the database connection gracefully.
 */
export function closeDatabase() {
    if (db) {
        db.close();
        db = null;
        log.info('Database connection closed');
    }
}

// ─── Helpers ──────────────────────────────────────────────

function queryAll(sql, params = []) {
    if (!db) throw new Error('Database not initialized. Call initDatabase() first.');
    const start = performance.now();
    const result = db.prepare(sql).all(params);
    const ms = performance.now() - start;
    if (ms > 100) log.warn({ sql: sql.slice(0, 80), ms: Math.round(ms) }, 'Slow query');
    return result;
}

function queryOne(sql, params = []) {
    if (!db) throw new Error('Database not initialized. Call initDatabase() first.');
    const start = performance.now();
    const result = db.prepare(sql).get(params) || null;
    const ms = performance.now() - start;
    if (ms > 100) log.warn({ sql: sql.slice(0, 80), ms: Math.round(ms) }, 'Slow query');
    return result;
}

function runSql(sql, params = []) {
    if (!db) throw new Error('Database not initialized. Call initDatabase() first.');
    const start = performance.now();
    const info = db.prepare(sql).run(params);
    const ms = performance.now() - start;
    if (ms > 100) log.warn({ sql: sql.slice(0, 80), ms: Math.round(ms) }, 'Slow query');
    return { changes: info.changes, lastId: info.lastInsertRowid };
}

// ─── Users ────────────────────────────────────────────────

export const userQueries = {
    getById: (id) => queryOne('SELECT * FROM users WHERE id = ?', [id]),

    getByUsername: (username) => queryOne('SELECT * FROM users WHERE username = ?', [username]),

    getByEmail: (email) => queryOne('SELECT * FROM users WHERE email = ?', [email]),

    getAll: () => queryAll('SELECT id, username, email, role, subscription_tier, subscription_status, subscription_expires_at, created_at FROM users ORDER BY id ASC'),

    create: ({ username, password_hash, role = 'user', email = null }) => {
        // New users get a 14-day trial subscription
        const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
        const { lastId } = runSql(
            `INSERT INTO users (username, password_hash, role, email, subscription_tier, subscription_status, subscription_expires_at)
             VALUES (?, ?, ?, ?, 'trial', 'active', ?)`,
            [username, password_hash, role, email, expiresAt]
        );
        return userQueries.getById(lastId);
    },

    updatePassword: (id, password_hash) => {
        runSql('UPDATE users SET password_hash = ? WHERE id = ?', [password_hash, id]);
    },

    updateSubscription: (id, { tier, status, expiresAt }) => {
        runSql(
            `UPDATE users SET subscription_tier = ?, subscription_status = ?, subscription_expires_at = ? WHERE id = ?`,
            [tier, status, expiresAt, id]
        );
        return userQueries.getById(id);
    },

    setConsent: (id) => {
        runSql(
            `UPDATE users SET consent_given_at = datetime('now') WHERE id = ?`,
            [id]
        );
    },

    delete: (id) => runSql('DELETE FROM users WHERE id = ?', [id]),

    ban: (id, reason = '') => {
        runSql(
            `UPDATE users SET banned_at = datetime('now'), banned_reason = ? WHERE id = ?`,
            [reason, id]
        );
    },

    unban: (id) => {
        runSql(`UPDATE users SET banned_at = NULL, banned_reason = '' WHERE id = ?`, [id]);
    },
};

// ─── Recipes ──────────────────────────────────────────────

export const recipeQueries = {
    /**
     * @param {number} userId - Owner's user id
     */
    getAll: (userId) => queryAll(
        'SELECT * FROM recipes WHERE user_id = ? ORDER BY created_at DESC',
        [userId]
    ),

    /**
     * @param {number} id
     * @param {number} userId - For ownership check
     */
    getById: (id, userId = null) => {
        if (userId !== null) {
            return queryOne('SELECT * FROM recipes WHERE id = ? AND user_id = ?', [id, userId]);
        }
        return queryOne('SELECT * FROM recipes WHERE id = ?', [id]);
    },

    create: (recipe, userId) => {
        const sql = `
            INSERT INTO recipes (user_id, name, style, og, fg, ibu, abv, batch_size, boil_time, ingredients, mash_steps, hop_additions, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;
        const { lastId } = runSql(sql, [
            userId,
            recipe.name || 'Без названия',
            recipe.style || '',
            recipe.og || 0,
            recipe.fg || 0,
            recipe.ibu || 0,
            recipe.abv || 0,
            recipe.batch_size || 20,
            recipe.boil_time || 60,
            JSON.stringify(recipe.ingredients || []),
            JSON.stringify(recipe.mash_steps || []),
            JSON.stringify(recipe.hop_additions || []),
            recipe.notes || '',
        ]);
        return recipeQueries.getById(lastId);
    },

    update: (id, recipe, userId) => {
        const numId = parseInt(id, 10);
        const fields = [];
        const values = [];
        for (const [key, value] of Object.entries(recipe)) {
            if (['id', 'created_at', 'updated_at', 'user_id'].includes(key)) continue;
            if (['ingredients', 'mash_steps', 'hop_additions'].includes(key)) {
                fields.push(`${key} = ?`);
                values.push(JSON.stringify(value));
            } else {
                fields.push(`${key} = ?`);
                values.push(value);
            }
        }

        if (fields.length === 0) return recipeQueries.getById(numId, userId);

        fields.push("updated_at = datetime('now')");
        values.push(numId, userId);

        const { changes } = runSql(`UPDATE recipes SET ${fields.join(', ')} WHERE id = ? AND user_id = ?`, values);
        if (changes === 0) return null;
        return recipeQueries.getById(numId, userId);
    },

    delete: (id, userId) => runSql('DELETE FROM recipes WHERE id = ? AND user_id = ?', [id, userId]),

    /** Returns all public recipes with author username, likes_count, comments_count. */
    getPublic: (limit = 50, offset = 0) => queryAll(
        `SELECT r.*, u.username as author
         FROM recipes r
         JOIN users u ON r.user_id = u.id
         WHERE r.is_public = 1
         ORDER BY r.likes_count DESC, r.created_at DESC
         LIMIT ? OFFSET ?`,
        [limit, offset]
    ),

    /** Toggle is_public for a recipe owned by userId. Returns updated recipe. */
    setPublic: (id, userId, isPublic) => {
        runSql(
            `UPDATE recipes SET is_public = ?, updated_at = datetime('now') WHERE id = ? AND user_id = ?`,
            [isPublic ? 1 : 0, id, userId]
        );
        return recipeQueries.getById(id, userId);
    },
};

// ─── Sessions ─────────────────────────────────────────────

export const sessionQueries = {
    getAll: (userId, type = null) => {
        const query = `
            SELECT s.*, r.name as recipe_name, r.ingredients as recipe_ingredients, r.hop_additions as recipe_hop_additions
            FROM brew_sessions s
            LEFT JOIN recipes r ON s.recipe_id = r.id
            WHERE s.user_id = ?
            ${type ? 'AND s.type = ?' : ''}
            ORDER BY s.started_at DESC
        `;
        return type ? queryAll(query, [userId, type]) : queryAll(query, [userId]);
    },

    getById: (id, userId = null) => {
        if (userId !== null) {
            return queryOne('SELECT * FROM brew_sessions WHERE id = ? AND user_id = ?', [id, userId]);
        }
        return queryOne('SELECT * FROM brew_sessions WHERE id = ?', [id]);
    },

    create: (session, userId) => {
        const { lastId } = runSql(
            `INSERT INTO brew_sessions (user_id, recipe_id, type, status, notes) VALUES (?, ?, ?, ?, ?)`,
            [userId, session.recipe_id || null, session.type, session.status || 'active', session.notes || '']
        );
        return sessionQueries.getById(lastId);
    },

    update: (id, data, userId) => {
        const fields = [];
        const values = [];
        for (const [key, value] of Object.entries(data)) {
            if (['id', 'started_at', 'finished_at', 'user_id'].includes(key)) continue;
            fields.push(`${key} = ?`);
            values.push(value);
        }
        if (fields.length > 0) {
            values.push(id, userId);
            runSql(`UPDATE brew_sessions SET ${fields.join(', ')} WHERE id = ? AND user_id = ?`, values);
        }
        return sessionQueries.getById(id, userId);
    },

    delete: (id, userId) => runSql('DELETE FROM brew_sessions WHERE id = ? AND user_id = ?', [id, userId]),

    complete: (id, userId) => {
        runSql(
            `UPDATE brew_sessions SET status = 'completed', finished_at = datetime('now') WHERE id = ? AND user_id = ?`,
            [id, userId]
        );
        return sessionQueries.getById(id, userId);
    },

    cancel: (id, userId) => {
        runSql(
            `UPDATE brew_sessions SET status = 'cancelled', finished_at = datetime('now') WHERE id = ? AND user_id = ?`,
            [id, userId]
        );
        return sessionQueries.getById(id, userId);
    },
};

// ─── Temperature Log ──────────────────────────────────────

export const temperatureQueries = {
    getBySession: (sessionId, limit = 500) => {
        return queryAll(
            'SELECT * FROM temperature_log WHERE session_id = ? ORDER BY timestamp DESC LIMIT ?',
            [sessionId, limit]
        );
    },

    getRecent: (minutes = 10) => {
        return queryAll(
            `SELECT * FROM temperature_log WHERE timestamp > datetime('now', '-' || ? || ' minutes') ORDER BY timestamp ASC`,
            [minutes]
        );
    },

    insert: (sessionId, sensor, value) => {
        runSql(
            'INSERT INTO temperature_log (session_id, sensor, value) VALUES (?, ?, ?)',
            [sessionId, sensor, value]
        );
    },

    insertBatch: (rows) => {
        const insert = db.prepare(
            'INSERT INTO temperature_log (session_id, sensor, value) VALUES (@session_id, @sensor, @value)'
        );
        const insertMany = db.transaction((logs) => {
            for (const log of logs) insert.run(log);
        });
        insertMany(rows);
    },
};

// ─── Fraction Log ─────────────────────────────────────────

export const fractionQueries = {
    getBySession: (sessionId) => {
        return queryAll(
            'SELECT * FROM fraction_log WHERE session_id = ? ORDER BY timestamp ASC',
            [sessionId]
        );
    },

    insert: (fraction) => {
        runSql(
            `INSERT INTO fraction_log (session_id, phase, volume, abv, temp_boiler, temp_column, notes) VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
                fraction.session_id,
                fraction.phase,
                fraction.volume || 0,
                fraction.abv || 0,
                fraction.temp_boiler || null,
                fraction.temp_column || null,
                fraction.notes || '',
            ]
        );
    },
};

// ─── Fermentation Entries ─────────────────────────────────

export const fermentationQueries = {
    getBySession: (sessionId) => {
        return queryAll(
            'SELECT * FROM fermentation_entries WHERE session_id = ? ORDER BY timestamp ASC',
            [sessionId]
        );
    },

    insert: (entry) => {
        runSql(
            `INSERT INTO fermentation_entries (session_id, stage, temperature, gravity, abv, notes) VALUES (?, ?, ?, ?, ?, ?)`,
            [
                entry.session_id,
                entry.stage || 'primary',
                entry.temperature || null,
                entry.gravity || null,
                entry.abv || null,
                entry.notes || '',
            ]
        );
    },
};

// ─── Settings ─────────────────────────────────────────────
// Uses settings_v2 table (user_id = null → global/system defaults).

export const settingsQueries = {
    /**
     * @param {number|null} userId - null = global system settings
     */
    getAll: (userId = null) => {
        const rows = userId !== null
            ? queryAll('SELECT key, value FROM settings_v2 WHERE user_id = ?', [userId])
            : queryAll('SELECT key, value FROM settings_v2 WHERE user_id IS NULL');
        const result = {};
        for (const row of rows) {
            try { result[row.key] = JSON.parse(row.value); }
            catch { result[row.key] = row.value; }
        }
        return result;
    },

    get: (key, userId = null) => {
        const row = userId !== null
            ? queryOne('SELECT value FROM settings_v2 WHERE key = ? AND user_id = ?', [key, userId])
            : queryOne('SELECT value FROM settings_v2 WHERE key = ? AND user_id IS NULL', [key]);
        if (!row) return null;
        try { return JSON.parse(row.value); }
        catch { return row.value; }
    },

    set: (key, value, userId = null) => {
        const serialized = typeof value === 'string' ? value : JSON.stringify(value);
        if (userId !== null) {
            runSql(
                `INSERT INTO settings_v2 (key, user_id, value, updated_at) VALUES (?, ?, ?, datetime('now'))
                 ON CONFLICT(key, user_id) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`,
                [key, userId, serialized]
            );
        } else {
            // Global setting — user_id IS NULL, handle separately (SQLite NULL != NULL in UNIQUE)
            const existing = settingsQueries.get(key, null);
            if (existing !== null) {
                runSql(
                    `UPDATE settings_v2 SET value = ?, updated_at = datetime('now') WHERE key = ? AND user_id IS NULL`,
                    [serialized, key]
                );
            } else {
                runSql(
                    `INSERT INTO settings_v2 (key, user_id, value, updated_at) VALUES (?, NULL, ?, datetime('now'))`,
                    [key, serialized]
                );
            }
        }
    },

    setBulk: (settings, userId = null) => {
        db.transaction(() => {
            for (const [key, value] of Object.entries(settings)) {
                settingsQueries.set(key, value, userId);
            }
        })();
    },
};

// ─── Devices ──────────────────────────────────────────────

export const deviceQueries = {
    /**
     * Get all devices for a specific user.
     * @param {number} userId
     */
    getAll: (userId) => queryAll(
        'SELECT * FROM devices WHERE user_id = ? ORDER BY last_seen DESC',
        [userId]
    ),

    getById: (id) => queryOne('SELECT * FROM devices WHERE id = ?', [id]),

    /**
     * Find device by its unique api_key (used for hardware WebSocket authentication).
     * @param {string} apiKey
     */
    getByApiKey: (apiKey) => queryOne('SELECT * FROM devices WHERE api_key = ?', [apiKey]),

    /**
     * Create or update a device record for a given user.
     * @param {string} id - Device MAC/hardware id
     * @param {string} name
     * @param {number} userId
     * @param {string} apiKey - Unique key generated at pairing time
     * @param {string} role
     */
    upsert: (id, name, userId, apiKey = null, role = 'unassigned') => {
        runSql(`
            INSERT INTO devices (id, name, role, user_id, api_key, status, last_seen)
            VALUES (?, ?, ?, ?, ?, 'online', datetime('now'))
            ON CONFLICT(id) DO UPDATE SET
                status    = 'online',
                last_seen = datetime('now'),
                api_key   = COALESCE(excluded.api_key, api_key),
                user_id   = COALESCE(excluded.user_id, user_id)
        `, [id, name, role, userId, apiKey]);
        return deviceQueries.getById(id);
    },

    updateStatus: (id, status) => {
        runSql(
            `UPDATE devices SET status = ?, last_seen = datetime('now') WHERE id = ?`,
            [status, id]
        );
    },

    rename: (id, name, userId) => {
        runSql('UPDATE devices SET name = ? WHERE id = ? AND user_id = ?', [name, id, userId]);
    },

    setRole: (id, role, userId) => {
        runSql('UPDATE devices SET role = ? WHERE id = ? AND user_id = ?', [role, id, userId]);
    },

    delete: (id, userId) => runSql('DELETE FROM devices WHERE id = ? AND user_id = ?', [id, userId]),

    deleteAllByUser: (userId) => runSql('DELETE FROM devices WHERE user_id = ?', [userId]),

    /** Mark all devices offline — called on server startup before any WS connections. */
    resetAllOnline: () => {
        runSql(`UPDATE devices SET status = 'offline' WHERE status = 'online'`);
    },
};

// ─── Device Pairings ──────────────────────────────────────

export const pairingQueries = {
    /**
     * Create a new pairing code for a user.
     * @param {number} userId
     * @param {string} code - 6-char alphanumeric code
     * @param {string} expiresAt - ISO timestamp
     */
    create: (userId, code, expiresAt) => {
        const { lastId } = runSql(
            `INSERT INTO device_pairings (user_id, pairing_code, expires_at) VALUES (?, ?, ?)`,
            [userId, code, expiresAt]
        );
        return queryOne('SELECT * FROM device_pairings WHERE id = ?', [lastId]);
    },

    /**
     * Get a pairing record by code (only valid/unexpired ones).
     * @param {string} code
     */
    getByCode: (code) => queryOne(
        `SELECT * FROM device_pairings WHERE pairing_code = ? AND expires_at > datetime('now') AND used_at IS NULL`,
        [code]
    ),

    getByCodeAny: (code) => queryOne(
        `SELECT * FROM device_pairings WHERE pairing_code = ?`,
        [code]
    ),

    /**
     * Mark a pairing as used when device completes pairing.
     * @param {number} id - Pairing record id
     * @param {string} deviceId - Hardware device id
     */
    markUsed: (id, deviceId) => {
        runSql(
            `UPDATE device_pairings SET used_at = datetime('now'), device_id = ? WHERE id = ?`,
            [deviceId, id]
        );
    },

    /**
     * Clean up expired and used pairing codes older than 24 hours.
     */
    cleanup: () => {
        runSql(
            `DELETE FROM device_pairings WHERE expires_at < datetime('now', '-1 day')`,
            []
        );
    },
};

// ─── Named Sensors ────────────────────────────────────────

const SENSOR_DEFAULT_COLORS = [
    '#FF6B35', '#03a9f4', '#4caf50', '#ff9800', '#e91e63',
    '#9c27b0', '#00bcd4', '#8bc34a', '#ff5722', '#607d8b',
];

export const sensorQueries = {
    /**
     * Get all configured sensors for a user.
     * @param {number} userId
     */
    getAll: (userId) => queryAll(
        'SELECT * FROM sensors WHERE user_id = ? ORDER BY id ASC',
        [userId]
    ),

    /**
     * Get sensor by address for a user.
     */
    getByAddress: (userId, address) => queryOne(
        'SELECT * FROM sensors WHERE user_id = ? AND address = ?',
        [userId, address]
    ),

    /**
     * Upsert a sensor config. Returns the sensor row.
     */
    upsert: (userId, address, { name = '', color, offset = 0, enabled = 1, role = null } = {}) => {
        // Assign a default color based on current count if not provided
        if (!color) {
            const count = queryOne('SELECT COUNT(*) as cnt FROM sensors WHERE user_id = ?', [userId])?.cnt || 0;
            color = SENSOR_DEFAULT_COLORS[count % SENSOR_DEFAULT_COLORS.length];
        }
        // Clear role from any other sensor of this user before assigning
        if (role) {
            runSql(
                'UPDATE sensors SET role = NULL WHERE user_id = ? AND role = ? AND address != ?',
                [userId, role, address]
            );
        }
        runSql(
            `INSERT INTO sensors (user_id, address, name, color, offset, enabled, role)
             VALUES (?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(user_id, address) DO UPDATE SET
               name    = excluded.name,
               color   = excluded.color,
               offset  = excluded.offset,
               enabled = excluded.enabled,
               role    = excluded.role`,
            [userId, address, name, color, offset, enabled ? 1 : 0, role]
        );
        return queryOne('SELECT * FROM sensors WHERE user_id = ? AND address = ?', [userId, address]);
    },

    /**
     * Delete a sensor config.
     */
    delete: (userId, address) => runSql(
        'DELETE FROM sensors WHERE user_id = ? AND address = ?',
        [userId, address]
    ),
};


// ─── Payments ─────────────────────────────────────────────

export const paymentQueries = {
    create: ({ id, userId, amount, currency = 'RUB', status, yookassaId = null, tier = null }) => {
        runSql(
            `INSERT INTO payments (id, user_id, amount, currency, status, yookassa_id, tier) VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [id, userId, amount, currency, status, yookassaId, tier]
        );
        return queryOne('SELECT * FROM payments WHERE id = ?', [id]);
    },

    updateStatus: (id, status) => {
        runSql('UPDATE payments SET status = ? WHERE id = ?', [status, id]);
    },

    getByUser: (userId) => queryAll(
        'SELECT * FROM payments WHERE user_id = ? ORDER BY created_at DESC',
        [userId]
    ),

    getById: (id) => queryOne('SELECT * FROM payments WHERE id = ?', [id]),

    getByYookassaId: (yookassaId) => queryOne('SELECT * FROM payments WHERE yookassa_id = ?', [yookassaId]),
};

// ─── Recipe Likes ──────────────────────────────────────────

export const recipeLikesQueries = {
    /**
     * Toggle like for a recipe. Returns { liked, count }.
     */
    toggle(recipeId, userId) {
        const existing = queryOne(
            'SELECT id FROM recipe_likes WHERE recipe_id = ? AND user_id = ?',
            [recipeId, userId]
        );
        if (existing) {
            runSql('DELETE FROM recipe_likes WHERE recipe_id = ? AND user_id = ?', [recipeId, userId]);
        } else {
            runSql('INSERT INTO recipe_likes (recipe_id, user_id) VALUES (?, ?)', [recipeId, userId]);
        }
        const { likes_count } = queryOne('SELECT likes_count FROM recipes WHERE id = ?', [recipeId]);
        return { liked: !existing, count: likes_count };
    },

    /** Returns { count, isLiked } for a given recipe + user. */
    getStatus(recipeId, userId) {
        const { likes_count } = queryOne('SELECT likes_count FROM recipes WHERE id = ?', [recipeId]) || { likes_count: 0 };
        const isLiked = !!queryOne(
            'SELECT 1 FROM recipe_likes WHERE recipe_id = ? AND user_id = ?',
            [recipeId, userId]
        );
        return { count: likes_count, isLiked };
    },
};

// ─── Recipe Comments ───────────────────────────────────────

export const recipeCommentsQueries = {
    /** Returns paginated comments with username. */
    getByRecipe(recipeId, limit = 50, offset = 0) {
        const comments = queryAll(
            `SELECT c.id, c.recipe_id, c.user_id, u.username, c.text, c.created_at
             FROM recipe_comments c
             JOIN users u ON c.user_id = u.id
             WHERE c.recipe_id = ? AND c.is_deleted = 0
             ORDER BY c.created_at ASC
             LIMIT ? OFFSET ?`,
            [recipeId, limit, offset]
        );
        const { total } = queryOne(
            'SELECT COUNT(*) as total FROM recipe_comments WHERE recipe_id = ? AND is_deleted = 0',
            [recipeId]
        );
        return { comments, total };
    },

    /** Creates a comment. Returns the created comment with username. */
    create(recipeId, userId, text) {
        const { lastId } = runSql(
            'INSERT INTO recipe_comments (recipe_id, user_id, text) VALUES (?, ?, ?)',
            [recipeId, userId, text]
        );
        return queryOne(
            `SELECT c.id, c.recipe_id, c.user_id, u.username, c.text, c.created_at
             FROM recipe_comments c JOIN users u ON c.user_id = u.id
             WHERE c.id = ?`,
            [lastId]
        );
    },

    /** Soft-deletes a comment. Only the author can delete (checked in route). */
    softDelete(commentId, userId) {
        const comment = queryOne(
            'SELECT id, user_id FROM recipe_comments WHERE id = ? AND is_deleted = 0',
            [commentId]
        );
        if (!comment) return null;
        if (comment.user_id !== userId) return false;
        runSql(
            'UPDATE recipe_comments SET is_deleted = 1, updated_at = datetime(\'now\') WHERE id = ?',
            [commentId]
        );
        return true;
    },
};

// ─── Recipe Search ─────────────────────────────────────────

export const recipeSearchQueries = {
    /**
     * Full-text search across public recipes using FTS5.
     * Falls back to LIKE if query is empty.
     *
     * @param {string} query      — search string (can be empty)
     * @param {string} style      — filter by style (optional)
     * @param {number} limit
     * @param {number} offset
     * @returns {recipes[]}
     */
    searchPublic(query = '', style = null, limit = 20, offset = 0) {
        const hasQuery = query.trim().length > 0;

        if (hasQuery) {
            // FTS5 search — sanitise query: remove special chars except *
            const ftsQuery = query.trim().replace(/[^а-яёa-z0-9\s\*]/gi, ' ').trim() + '*';
            const styleClause = style ? 'AND r.style = ?' : '';
            const params = style
                ? [ftsQuery, style, limit, offset]
                : [ftsQuery, limit, offset];

            return queryAll(`
                SELECT r.*, u.username as author
                FROM recipes_fts fts
                JOIN recipes r ON r.id = fts.rowid
                JOIN users u ON r.user_id = u.id
                WHERE recipes_fts MATCH ?
                  AND r.is_public = 1
                  ${styleClause}
                ORDER BY r.likes_count DESC, r.created_at DESC
                LIMIT ? OFFSET ?
            `, params);
        } else {
            const styleClause = style ? 'AND r.style = ?' : '';
            const params = style
                ? [style, limit, offset]
                : [limit, offset];

            return queryAll(`
                SELECT r.*, u.username as author
                FROM recipes r
                JOIN users u ON r.user_id = u.id
                WHERE r.is_public = 1
                  ${styleClause}
                ORDER BY r.likes_count DESC, r.created_at DESC
                LIMIT ? OFFSET ?
            `, params);
        }
    },

    /**
     * Search within a user's OWN recipes (private + public).
     */
    searchOwn(userId, query = '', limit = 20, offset = 0) {
        const hasQuery = query.trim().length > 0;

        if (hasQuery) {
            const ftsQuery = query.trim().replace(/[^а-яёa-z0-9\s\*]/gi, ' ').trim() + '*';
            return queryAll(`
                SELECT r.*
                FROM recipes_fts fts
                JOIN recipes r ON r.id = fts.rowid
                WHERE recipes_fts MATCH ?
                  AND r.user_id = ?
                ORDER BY r.created_at DESC
                LIMIT ? OFFSET ?
            `, [ftsQuery, userId, limit, offset]);
        } else {
            return queryAll(
                'SELECT * FROM recipes WHERE user_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?',
                [userId, limit, offset]
            );
        }
    },

    /** Get distinct styles from public recipes for filter dropdown. */
    getPublicStyles() {
        return queryAll(
            `SELECT DISTINCT style FROM recipes WHERE is_public = 1 AND style IS NOT NULL AND style != '' ORDER BY style`,
            []
        ).map(r => r.style);
    },
};

// ─── Recipe Trending & Similar ─────────────────────────────

export const recipeTrendingQueries = {
    /**
     * Get trending public recipes scored by engagement.
     * Score = likes * 2 + comments. Filters by recency window (days).
     *
     * @param {number} days  — look-back window (default 7)
     * @param {number} limit — max results (default 10)
     */
    getTrending(days = 7, limit = 10) {
        return queryAll(`
            SELECT r.*, u.username AS author,
                   (COALESCE(r.likes_count, 0) * 2 + COALESCE(r.comments_count, 0)) AS score
            FROM recipes r
            JOIN users u ON r.user_id = u.id
            WHERE r.is_public = 1
              AND (
                r.created_at > datetime('now', ?)
                OR r.likes_count > 0
              )
            ORDER BY score DESC, r.created_at DESC
            LIMIT ?
        `, [`-${days} days`, limit]);
    },

    /**
     * Get similar public recipes by style.
     * Falls back to top-rated if not enough style matches.
     *
     * @param {number} recipeId — recipe to find similar for
     * @param {number} limit    — max results (default 5)
     */
    getSimilar(recipeId, limit = 5) {
        const recipe = queryOne('SELECT id, style FROM recipes WHERE id = ?', [recipeId]);
        if (!recipe) return [];

        // Recipes with same style, public, excluding self
        const similar = queryAll(`
            SELECT r.*, u.username AS author
            FROM recipes r
            JOIN users u ON r.user_id = u.id
            WHERE r.is_public = 1
              AND r.style = ?
              AND r.id != ?
            ORDER BY r.likes_count DESC, r.created_at DESC
            LIMIT ?
        `, [recipe.style || '', recipeId, limit]);

        // Fallback: fill remaining slots with top-rated (any style)
        if (similar.length < limit) {
            const remaining = limit - similar.length;
            const exclude   = [recipeId, ...similar.map(r => r.id)];
            const ph        = exclude.map(() => '?').join(', ');
            const topRated  = queryAll(`
                SELECT r.*, u.username AS author
                FROM recipes r
                JOIN users u ON r.user_id = u.id
                WHERE r.is_public = 1
                  AND r.id NOT IN (${ph})
                ORDER BY r.likes_count DESC, r.created_at DESC
                LIMIT ?
            `, [...exclude, remaining]);
            return [...similar, ...topRated];
        }

        return similar;
    },
};

// ─── Audit Log ────────────────────────────────────────────

export const auditQueries = {
    insert: ({ userId, action, detail = '', adminId = null, ip = null }) => {
        runSql(
            `INSERT INTO audit_log (user_id, action, detail, admin_id, ip) VALUES (?, ?, ?, ?, ?)`,
            [userId, action, detail, adminId, ip]
        );
    },

    getByUser: (userId, limit = 100, offset = 0) => queryAll(
        `SELECT al.*, u.username AS admin_username
         FROM audit_log al
         LEFT JOIN users u ON al.admin_id = u.id
         WHERE al.user_id = ?
         ORDER BY al.created_at DESC
         LIMIT ? OFFSET ?`,
        [userId, limit, offset]
    ),

    getRecent: (limit = 100, offset = 0) => queryAll(
        `SELECT al.*, u.username AS username, a.username AS admin_username
         FROM audit_log al
         JOIN users u ON al.user_id = u.id
         LEFT JOIN users a ON al.admin_id = a.id
         ORDER BY al.created_at DESC
         LIMIT ? OFFSET ?`,
        [limit, offset]
    ),

    countByUser: (userId) => {
        const row = queryOne('SELECT COUNT(*) AS total FROM audit_log WHERE user_id = ?', [userId]);
        return row?.total || 0;
    },

    cleanup: (days = 30) => runSql(
        `DELETE FROM audit_log WHERE created_at < datetime('now', ?)`,
        [`-${days} days`]
    ),
};
