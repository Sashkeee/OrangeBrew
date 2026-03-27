import { Router } from 'express';
import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import logger from '../utils/logger.js';

const log = logger.child({ module: 'Trainer' });
const router = Router();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load seed SQL and tasks once at startup
const seedSql = readFileSync(path.join(__dirname, '../db/trainer-seed.sql'), 'utf-8');
const tasks = JSON.parse(readFileSync(path.join(__dirname, '../data/sql-tasks.json'), 'utf-8'));

/**
 * Create a fresh in-memory SQLite database with seed data.
 * Each call returns an isolated DB — no state leaks between requests.
 */
function createSandboxDb() {
    const db = new Database(':memory:');
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    db.exec(seedSql);
    return db;
}

/**
 * Normalize query results for comparison:
 * - Sort rows by all columns (order-insensitive comparison)
 * - Convert values to strings for consistent matching
 */
function normalizeResults(rows) {
    if (!Array.isArray(rows) || rows.length === 0) return [];
    const keys = Object.keys(rows[0]);
    return rows
        .map(row => {
            const normalized = {};
            for (const k of keys) {
                normalized[k.toLowerCase()] = row[k];
            }
            return normalized;
        })
        .sort((a, b) => {
            for (const k of Object.keys(a)) {
                const av = String(a[k] ?? '');
                const bv = String(b[k] ?? '');
                if (av < bv) return -1;
                if (av > bv) return 1;
            }
            return 0;
        });
}

function resultsMatch(userRows, expectedRows) {
    const a = normalizeResults(userRows);
    const b = normalizeResults(expectedRows);
    return JSON.stringify(a) === JSON.stringify(b);
}

// ─── GET /api/trainer/schema — table structure for reference ───
router.get('/schema', (req, res) => {
    const db = createSandboxDb();
    try {
        const tables = db.prepare(
            "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
        ).all();

        const schema = tables.map(({ name }) => {
            const columns = db.prepare(`PRAGMA table_info("${name}")`).all();
            return { table: name, columns };
        });

        res.json(schema);
    } finally {
        db.close();
    }
});

// ─── GET /api/trainer/tasks — list of tasks (without answers) ───
router.get('/tasks', (req, res) => {
    const safeTasks = tasks.map(({ expected_query, verify_query, ...rest }) => rest);
    res.json(safeTasks);
});

// ─── POST /api/trainer/execute — run user query and check ───
router.post('/execute', (req, res) => {
    const { taskId, userQuery } = req.body;

    if (!userQuery || typeof userQuery !== 'string' || !userQuery.trim()) {
        return res.status(400).json({ error: 'userQuery is required' });
    }

    const trimmedQuery = userQuery.trim();

    // Limit query length to prevent abuse
    if (trimmedQuery.length > 2000) {
        return res.status(400).json({ error: 'Query too long (max 2000 chars)' });
    }

    const db = createSandboxDb();

    try {
        // Execute user query (SELECT → all(), DML → run() + return changes info)
        let userResult;
        try {
            const stmt = db.prepare(trimmedQuery);
            if (stmt.reader) {
                userResult = stmt.all();
            } else {
                const info = stmt.run();
                userResult = [{ changes: info.changes }];
            }
        } catch (err) {
            log.debug({ userId: req.user?.id, query: trimmedQuery, err: err.message }, 'User SQL error');
            return res.json({
                success: false,
                error: err.message,
                userResult: [],
                expectedResult: null,
            });
        }

        // If taskId provided — compare with expected result
        if (taskId != null) {
            const task = tasks.find(t => t.id === taskId);
            if (!task) {
                return res.status(404).json({ error: `Task ${taskId} not found` });
            }

            // DML tasks have verify_query — run it on the DB *after* user's DML
            // to check that the mutation produced the correct state.
            // SELECT tasks compare results directly.
            if (task.verify_query) {
                // ── DML task ──
                // userQuery already ran on `db` above — now verify the state
                let userVerify;
                try {
                    userVerify = db.prepare(task.verify_query).all();
                } catch (err) {
                    log.error({ taskId, err: err.message }, 'verify_query failed on user DB');
                    return res.status(500).json({ error: 'Internal error running verify query' });
                }

                // Run expected DML + verify on a separate fresh DB
                const refDb = createSandboxDb();
                let expectedVerify;
                try {
                    const expStmt = refDb.prepare(task.expected_query);
                    if (expStmt.reader) {
                        expStmt.all();
                    } else {
                        expStmt.run();
                    }
                    expectedVerify = refDb.prepare(task.verify_query).all();
                } catch (err) {
                    log.error({ taskId, err: err.message }, 'Expected DML+verify failed — check sql-tasks.json');
                    return res.status(500).json({ error: 'Internal error executing reference query' });
                } finally {
                    refDb.close();
                }

                const success = resultsMatch(userVerify, expectedVerify);
                log.info({ userId: req.user?.id, taskId, success }, 'SQL task attempt');

                return res.json({
                    success,
                    userResult: userVerify.slice(0, 100),
                    expectedResult: success ? null : expectedVerify.slice(0, 100),
                });
            }

            // ── SELECT task ── compare results directly
            let expectedResult;
            try {
                const expStmt = db.prepare(task.expected_query);
                if (expStmt.reader) {
                    expectedResult = expStmt.all();
                } else {
                    const info = expStmt.run();
                    expectedResult = [{ changes: info.changes }];
                }
            } catch (err) {
                log.error({ taskId, err: err.message }, 'Expected query failed — check sql-tasks.json');
                return res.status(500).json({ error: 'Internal error executing reference query' });
            }

            const success = resultsMatch(userResult, expectedResult);
            log.info({ userId: req.user?.id, taskId, success }, 'SQL task attempt');

            return res.json({
                success,
                userResult: userResult.slice(0, 100),
                expectedResult: success ? null : expectedResult.slice(0, 100),
            });
        }

        // Free-form query (no taskId) — just return results
        res.json({
            success: null,
            userResult: userResult.slice(0, 100),
            expectedResult: null,
        });
    } finally {
        db.close();
    }
});

export default router;
