import initSqlJs from 'sql.js';
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { mkdirSync, existsSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));

let db = null;
let dbPath = null;
let saveTimer = null;

/**
 * Initialize the database connection and create tables if needed.
 * sql.js is a pure-JS WASM SQLite — no native compilation required.
 * @param {string} path - Path to the SQLite database file
 */
export async function initDatabase(path) {
    dbPath = path;

    // Ensure the data directory exists
    const dir = dirname(path);
    if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
    }

    const SQL = await initSqlJs();

    // Load existing DB file or create new
    if (existsSync(path)) {
        const fileBuffer = readFileSync(path);
        db = new SQL.Database(fileBuffer);
        console.log(`[DB] Loaded existing database: ${path}`);
    } else {
        db = new SQL.Database();
        console.log(`[DB] Created new database: ${path}`);
    }

    // Performance settings
    db.run('PRAGMA journal_mode = WAL');
    db.run('PRAGMA foreign_keys = ON');

    // Run schema
    const schema = readFileSync(join(__dirname, 'schema.sql'), 'utf-8');
    db.run(schema);

    // Auto-save every 30 seconds
    saveTimer = setInterval(() => saveDatabase(), 30000);

    return db;
}

/**
 * Save the in-memory database to disk.
 */
export function saveDatabase() {
    if (db && dbPath) {
        const data = db.export();
        const buffer = Buffer.from(data);
        writeFileSync(dbPath, buffer);
    }
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
    if (saveTimer) {
        clearInterval(saveTimer);
        saveTimer = null;
    }
    if (db) {
        saveDatabase(); // Final save
        db.close();
        db = null;
        console.log('[DB] Database connection closed.');
    }
}

// ─── Helpers ──────────────────────────────────────────────

/**
 * Run a SELECT query and return all rows as objects.
 */
function queryAll(sql, params = []) {
    const stmt = db.prepare(sql);
    stmt.bind(params);
    const rows = [];
    while (stmt.step()) {
        rows.push(stmt.getAsObject());
    }
    stmt.free();
    return rows;
}

/**
 * Run a SELECT query and return the first row.
 */
function queryOne(sql, params = []) {
    const stmt = db.prepare(sql);
    stmt.bind(params);
    let row = null;
    if (stmt.step()) {
        row = stmt.getAsObject();
    }
    stmt.free();
    return row;
}

/**
 * Run an INSERT/UPDATE/DELETE and return { changes, lastId }.
 */
function runSql(sql, params = []) {
    db.run(sql, params);
    const changes = db.getRowsModified();
    const lastId = queryOne('SELECT last_insert_rowid() as id');
    saveDatabase();
    return { changes, lastId: lastId?.id };
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
        return { id: lastId, ...recipe };
    },

    update: (id, recipe) => {
        const fields = [];
        const values = [];
        for (const [key, value] of Object.entries(recipe)) {
            if (['ingredients', 'mash_steps', 'hop_additions'].includes(key)) {
                fields.push(`${key} = ?`);
                values.push(JSON.stringify(value));
            } else {
                fields.push(`${key} = ?`);
                values.push(value);
            }
        }
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
        if (type) {
            return queryAll('SELECT * FROM brew_sessions WHERE type = ? ORDER BY started_at DESC', [type]);
        }
        return queryAll('SELECT * FROM brew_sessions ORDER BY started_at DESC');
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
        for (const r of rows) {
            db.run('INSERT INTO temperature_log (session_id, sensor, value) VALUES (?, ?, ?)', [r.session_id, r.sensor, r.value]);
        }
        saveDatabase();
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
        for (const [key, value] of Object.entries(settings)) {
            settingsQueries.set(key, value);
        }
    },
};
