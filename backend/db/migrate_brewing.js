import Database from 'better-sqlite3';
import path from 'path';

const dbPath = 'c:/Users/user/Documents/Antigravity/OrangeBrew/data/orangebrew.db';

console.log(`[Migration] Starting migration on ${dbPath}...`);

try {
    const db = new Database(dbPath);

    db.transaction(() => {
        // 1. Rename existing table
        db.prepare('ALTER TABLE brew_sessions RENAME TO brew_sessions_old').run();

        // 2. Create new table with updated constraint
        db.prepare(`
            CREATE TABLE brew_sessions (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                recipe_id   INTEGER REFERENCES recipes(id) ON DELETE SET NULL,
                type        TEXT    NOT NULL CHECK(type IN ('brewing','mash','boil','fermentation','distillation','rectification')),
                status      TEXT    NOT NULL DEFAULT 'active' CHECK(status IN ('active','paused','completed','cancelled')),
                started_at  TEXT    DEFAULT (datetime('now')),
                finished_at TEXT,
                notes       TEXT    DEFAULT ''
            )
        `).run();

        // 3. Copy data
        db.prepare(`
            INSERT INTO brew_sessions (id, recipe_id, type, status, started_at, finished_at, notes)
            SELECT id, recipe_id, type, status, started_at, finished_at, notes FROM brew_sessions_old
        `).run();

        // 4. Drop old table
        db.prepare('DROP TABLE brew_sessions_old').run();

        // 5. Re-create indexes since they are dropped with the table
        db.prepare('CREATE INDEX IF NOT EXISTS idx_sessions_type ON brew_sessions(type, status)').run();
        db.prepare('CREATE INDEX IF NOT EXISTS idx_temp_log_session ON temperature_log(session_id, timestamp)').run();
        db.prepare('CREATE INDEX IF NOT EXISTS idx_fraction_session ON fraction_log(session_id, timestamp)').run();
    })();

    console.log('[Migration] Successfully updated brew_sessions table constraint.');
    db.close();
} catch (err) {
    console.error('[Migration] Failed:', err.message);
    process.exit(1);
}
