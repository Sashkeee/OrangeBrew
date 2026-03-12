import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { mkdirSync, existsSync } from 'fs';
import { runMigrations } from './migrate.js';

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
                console.log(`[DB] Assigned ${info.changes} orphaned row(s) to admin (id=${adminId}) — ${sql.match(/UPDATE (\w+)/)[1]}`);
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
        console.log(`[DB] Opening database: ${path}`);
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

        console.log('[DB] Database initialized successfully.');
    } catch (err) {
        console.error('[DB] Failed to initialize database:', err);
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
        console.log('[DB] Database connection closed.');
    }
}

// ─── Helpers ──────────────────────────────────────────────

function queryAll(sql, params = []) {
    return db.prepare(sql).all(params);
}

function queryOne(sql, params = []) {
    return db.prepare(sql).get(params) || null;
}

function runSql(sql, params = []) {
    const info = db.prepare(sql).run(params);
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

        if (fields.length === 0) return recipeQueries.getById(id, userId);

        fields.push("updated_at = datetime('now')");
        values.push(id, userId);

        runSql(`UPDATE recipes SET ${fields.join(', ')} WHERE id = ? AND user_id = ?`, values);
        return recipeQueries.getById(id, userId);
    },

    delete: (id, userId) => runSql('DELETE FROM recipes WHERE id = ? AND user_id = ?', [id, userId]),
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
                status   = 'online',
                last_seen = datetime('now')
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
