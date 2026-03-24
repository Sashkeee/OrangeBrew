/**
 * Migration system for OrangeBrew.
 * Reads SQL files from ./migrations/ in numeric order and applies only new ones.
 * Applied migrations are tracked in the _migrations table.
 */

import { readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import logger from '../utils/logger.js';

const log = logger.child({ module: 'Migration' });

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(__dirname, 'migrations');

/**
 * Run all pending migrations on the given db instance.
 * @param {import('better-sqlite3').Database} db
 */
export function runMigrations(db) {
    // Ensure tracking table exists
    db.exec(`
        CREATE TABLE IF NOT EXISTS _migrations (
            id        INTEGER PRIMARY KEY AUTOINCREMENT,
            filename  TEXT    NOT NULL UNIQUE,
            applied_at TEXT   DEFAULT (datetime('now'))
        )
    `);

    // Get already applied migrations
    const applied = new Set(
        db.prepare('SELECT filename FROM _migrations').all().map(r => r.filename)
    );

    // Read all .sql files sorted by name (numeric order: 001_, 002_, ...)
    const files = readdirSync(MIGRATIONS_DIR)
        .filter(f => f.endsWith('.sql'))
        .sort();

    let count = 0;
    for (const file of files) {
        if (applied.has(file)) continue;

        log.info({ file }, 'Applying migration');
        const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf-8');

        // Run inside transaction for atomicity
        db.transaction(() => {
            db.exec(sql);
            db.prepare('INSERT INTO _migrations (filename) VALUES (?)').run(file);
        })();

        count++;
        log.info({ file }, 'Migration applied');
    }

    if (count === 0) {
        log.info('All migrations up to date');
    } else {
        log.info({ count }, 'Migrations applied');
    }
}
