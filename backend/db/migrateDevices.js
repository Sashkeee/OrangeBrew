import Database from 'better-sqlite3';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dbPath = join(__dirname, '../data/orangebrew.db');

console.log(`[Migration] Opening database at: ${dbPath}`);
const db = new Database(dbPath);

try {
    // 1. Add devices table
    db.exec(`
        CREATE TABLE IF NOT EXISTS devices (
            id          TEXT    PRIMARY KEY,
            name        TEXT    NOT NULL,
            role        TEXT    DEFAULT 'unassigned',
            status      TEXT    DEFAULT 'offline',
            last_seen   TEXT    DEFAULT (datetime('now')),
            created_at  TEXT    DEFAULT (datetime('now'))
        );
    `);
    console.log('[Migration] Table "devices" checked/created.');

    // 2. Add device_id to brew_sessions
    try {
        db.prepare('ALTER TABLE brew_sessions ADD COLUMN device_id TEXT REFERENCES devices(id) ON DELETE SET NULL').run();
        console.log('[Migration] Column "device_id" added to "brew_sessions".');
    } catch (e) {
        if (e.message.includes('duplicate column name')) {
            console.log('[Migration] Column "device_id" already exists.');
        } else {
            throw e;
        }
    }

    console.log('[Migration] All changes applied successfully.');
} catch (err) {
    console.error('[Migration] Failed:', err.message);
} finally {
    db.close();
}
