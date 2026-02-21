import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { mkdirSync, existsSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));

let db = null;
let dbPath = null;

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
        db = new Database(path, { verbose: null }); // Set verbose: console.log for debugging query

        // Performance settings
        db.pragma('journal_mode = WAL');
        db.pragma('foreign_keys = ON');
        db.pragma('synchronous = NORMAL'); // Faster, still safe in WAL mode

        // Run schema if new or to ensure tables exist
        // better-sqlite3 doesn't have a simple "is new" check, but we can just run "CREATE TABLE IF NOT EXISTS"
        const schema = readFileSync(join(__dirname, 'schema.sql'), 'utf-8');
        db.exec(schema);

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

// ─── Recipes ──────────────────────────────────────────────

export const recipeQueries = {
    getAll: () => queryAll('SELECT * FROM recipes ORDER BY created_at DESC'),

    getById: (id) => queryOne('SELECT * FROM recipes WHERE id = ?', [id]),

    create: (recipe) => {
        const sql = `
            INSERT INTO recipes (name, style, og, fg, ibu, abv, batch_size, boil_time, ingredients, mash_steps, hop_additions, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;
        const { lastId } = runSql(sql, [
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

    update: (id, recipe) => {
        const fields = [];
        const values = [];
        for (const [key, value] of Object.entries(recipe)) {
            // Filter fields that are actually in the DB (basic check)
            if (['id', 'created_at', 'updated_at'].includes(key)) continue;

            if (['ingredients', 'mash_steps', 'hop_additions'].includes(key)) {
                fields.push(`${key} = ?`);
                values.push(JSON.stringify(value));
            } else {
                fields.push(`${key} = ?`);
                values.push(value);
            }
        }

        if (fields.length === 0) return recipeQueries.getById(id);

        fields.push("updated_at = datetime('now')");
        values.push(id);

        runSql(`UPDATE recipes SET ${fields.join(', ')} WHERE id = ?`, values);
        return recipeQueries.getById(id);
    },

    delete: (id) => runSql('DELETE FROM recipes WHERE id = ?', [id]),
};

// ─── Sessions ─────────────────────────────────────────────

export const sessionQueries = {
    getAll: (type) => {
        const query = `
            SELECT s.*, r.name as recipe_name, r.ingredients as recipe_ingredients, r.hop_additions as recipe_hop_additions 
            FROM brew_sessions s 
            LEFT JOIN recipes r ON s.recipe_id = r.id 
            ${type ? 'WHERE s.type = ? ' : ''}
            ORDER BY s.started_at DESC
        `;
        return type ? queryAll(query, [type]) : queryAll(query);
    },

    getById: (id) => queryOne('SELECT * FROM brew_sessions WHERE id = ?', [id]),

    create: (session) => {
        const { lastId } = runSql(
            `INSERT INTO brew_sessions (recipe_id, type, status, notes) VALUES (?, ?, ?, ?)`,
            [session.recipe_id || null, session.type, session.status || 'active', session.notes || '']
        );
        return sessionQueries.getById(lastId);
    },

    update: (id, data) => {
        const fields = [];
        const values = [];
        for (const [key, value] of Object.entries(data)) {
            if (['id', 'started_at', 'finished_at'].includes(key)) continue;
            fields.push(`${key} = ?`);
            values.push(value);
        }
        if (fields.length > 0) {
            values.push(id);
            runSql(`UPDATE brew_sessions SET ${fields.join(', ')} WHERE id = ?`, values);
        }
        return sessionQueries.getById(id);
    },

    delete: (id) => runSql('DELETE FROM brew_sessions WHERE id = ?', [id]),

    complete: (id) => {
        runSql(`UPDATE brew_sessions SET status = 'completed', finished_at = datetime('now') WHERE id = ?`, [id]);
        return sessionQueries.getById(id);
    },

    cancel: (id) => {
        runSql(`UPDATE brew_sessions SET status = 'cancelled', finished_at = datetime('now') WHERE id = ?`, [id]);
        return sessionQueries.getById(id);
    },
};

// ─── Temperature Log ──────────────────────────────────────

export const temperatureQueries = {
    getBySession: (sessionId, limit = 500) => {
        return queryAll('SELECT * FROM temperature_log WHERE session_id = ? ORDER BY timestamp DESC LIMIT ?', [sessionId, limit]);
    },

    getRecent: (minutes = 10) => {
        return queryAll(
            `SELECT * FROM temperature_log WHERE timestamp > datetime('now', '-' || ? || ' minutes') ORDER BY timestamp ASC`,
            [minutes]
        );
    },

    insert: (sessionId, sensor, value) => {
        runSql('INSERT INTO temperature_log (session_id, sensor, value) VALUES (?, ?, ?)', [sessionId, sensor, value]);
    },

    insertBatch: (rows) => {
        const insert = db.prepare('INSERT INTO temperature_log (session_id, sensor, value) VALUES (@session_id, @sensor, @value)');
        const insertMany = db.transaction((logs) => {
            for (const log of logs) insert.run(log);
        });
        insertMany(rows);
    },
};

// ─── Fraction Log ─────────────────────────────────────────

export const fractionQueries = {
    getBySession: (sessionId) => {
        return queryAll('SELECT * FROM fraction_log WHERE session_id = ? ORDER BY timestamp ASC', [sessionId]);
    },

    insert: (fraction) => {
        runSql(
            `INSERT INTO fraction_log (session_id, phase, volume, abv, temp_boiler, temp_column, notes) VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [fraction.session_id, fraction.phase, fraction.volume || 0, fraction.abv || 0, fraction.temp_boiler || null, fraction.temp_column || null, fraction.notes || '']
        );
    },
};

// ─── Fermentation Entries ─────────────────────────────────

export const fermentationQueries = {
    getBySession: (sessionId) => {
        return queryAll('SELECT * FROM fermentation_entries WHERE session_id = ? ORDER BY timestamp ASC', [sessionId]);
    },

    insert: (entry) => {
        runSql(
            `INSERT INTO fermentation_entries (session_id, stage, temperature, gravity, abv, notes) VALUES (?, ?, ?, ?, ?, ?)`,
            [entry.session_id, entry.stage || 'primary', entry.temperature || null, entry.gravity || null, entry.abv || null, entry.notes || '']
        );
    },
};

// ─── Settings ─────────────────────────────────────────────

export const settingsQueries = {
    getAll: () => {
        const rows = queryAll('SELECT key, value FROM settings');
        const result = {};
        for (const row of rows) {
            try { result[row.key] = JSON.parse(row.value); }
            catch { result[row.key] = row.value; }
        }
        return result;
    },

    get: (key) => {
        const row = queryOne('SELECT value FROM settings WHERE key = ?', [key]);
        if (!row) return null;
        try { return JSON.parse(row.value); }
        catch { return row.value; }
    },

    set: (key, value) => {
        const serialized = typeof value === 'string' ? value : JSON.stringify(value);
        runSql(
            `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
             ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`,
            [key, serialized]
        );
    },

    setBulk: (settings) => {
        const insert = db.prepare(`
            INSERT INTO settings (key, value, updated_at) VALUES (@key, @value, datetime('now'))
            ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')
        `);
        const insertMany = db.transaction((settingsObj) => {
            for (const [key, value] of Object.entries(settingsObj)) {
                const serialized = typeof value === 'string' ? value : JSON.stringify(value);
                insert.run({ key, value: serialized });
            }
        });
        insertMany(settings);
    },
};
