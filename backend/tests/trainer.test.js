import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import { createServer } from 'http';
import trainerRouter from '../routes/trainer.js';

// ─── Test Server Setup ────────────────────────────────────

let server, baseUrl;

function createApp() {
    const app = express();
    app.use(express.json());

    // Mock auth — trainer requires authenticate
    app.use((req, _res, next) => {
        req.user = { id: 1, username: 'testuser', role: 'user' };
        next();
    });

    app.use('/api/trainer', trainerRouter);
    return app;
}

beforeAll(async () => {
    const app = createApp();
    server = createServer(app);
    await new Promise((resolve) => {
        server.listen(0, () => {
            const { port } = server.address();
            baseUrl = `http://localhost:${port}`;
            resolve();
        });
    });
});

afterAll(async () => {
    await new Promise((resolve) => server.close(resolve));
});

const api = (path, opts = {}) => fetch(`${baseUrl}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
});

// ═══════════════════════════════════════════════════════════
//  GET /api/trainer/tasks
// ═══════════════════════════════════════════════════════════

describe('GET /api/trainer/tasks', () => {
    it('should return task list without expected_query', async () => {
        const res = await api('/api/trainer/tasks');
        expect(res.status).toBe(200);
        const tasks = await res.json();
        expect(Array.isArray(tasks)).toBe(true);
        expect(tasks.length).toBeGreaterThanOrEqual(10);

        // Must not expose answers
        for (const task of tasks) {
            expect(task.expected_query).toBeUndefined();
            expect(task.id).toBeDefined();
            expect(task.title).toBeDefined();
            expect(task.category).toBeDefined();
            expect(task.difficulty).toBeDefined();
            expect(task.task_markdown).toBeDefined();
        }
    });
});

// ═══════════════════════════════════════════════════════════
//  GET /api/trainer/schema
// ═══════════════════════════════════════════════════════════

describe('GET /api/trainer/schema', () => {
    it('should return schema with tables and columns', async () => {
        const res = await api('/api/trainer/schema');
        expect(res.status).toBe(200);
        const schema = await res.json();
        expect(Array.isArray(schema)).toBe(true);

        const tableNames = schema.map(s => s.table);
        expect(tableNames).toContain('users');
        expect(tableNames).toContain('recipes');
        expect(tableNames).toContain('brew_sessions');
        expect(tableNames).toContain('temperature_log');

        // Each table should have columns
        const recipesTable = schema.find(s => s.table === 'recipes');
        expect(recipesTable.columns.length).toBeGreaterThan(5);
        expect(recipesTable.columns.some(c => c.name === 'name')).toBe(true);
    });
});

// ═══════════════════════════════════════════════════════════
//  POST /api/trainer/execute
// ═══════════════════════════════════════════════════════════

describe('POST /api/trainer/execute', () => {
    it('should return correct result for a correct query (task 6: COUNT)', async () => {
        // Task 6: SELECT COUNT(*) AS total FROM recipes
        const res = await api('/api/trainer/execute', {
            method: 'POST',
            body: { taskId: 6, userQuery: 'SELECT COUNT(*) AS total FROM recipes' },
        });
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.success).toBe(true);
        expect(data.userResult).toBeDefined();
        expect(data.userResult[0].total).toBe(7);
        // expectedResult not sent on success
        expect(data.expectedResult).toBeNull();
    });

    it('should detect wrong answer', async () => {
        // Task 4: should return public recipes only, but we return all
        const res = await api('/api/trainer/execute', {
            method: 'POST',
            body: { taskId: 4, userQuery: 'SELECT name FROM recipes' },
        });
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.success).toBe(false);
        expect(data.expectedResult).toBeDefined();
        expect(data.expectedResult.length).toBeLessThan(data.userResult.length);
    });

    it('should return SQL error for invalid query', async () => {
        const res = await api('/api/trainer/execute', {
            method: 'POST',
            body: { taskId: 1, userQuery: 'SELECT * FROM nonexistent_table' },
        });
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.success).toBe(false);
        expect(data.error).toBeDefined();
        expect(data.error).toMatch(/no such table/i);
    });

    it('should handle free-form query (no taskId)', async () => {
        const res = await api('/api/trainer/execute', {
            method: 'POST',
            body: { userQuery: 'SELECT username FROM users ORDER BY id' },
        });
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.success).toBeNull(); // free-form — no pass/fail
        expect(data.userResult.length).toBe(4);
        expect(data.userResult[0].username).toBe('brewmaster');
    });

    it('should reject empty query', async () => {
        const res = await api('/api/trainer/execute', {
            method: 'POST',
            body: { taskId: 1, userQuery: '' },
        });
        expect(res.status).toBe(400);
    });

    it('should reject missing query', async () => {
        const res = await api('/api/trainer/execute', {
            method: 'POST',
            body: { taskId: 1 },
        });
        expect(res.status).toBe(400);
    });

    it('should return 404 for non-existent task', async () => {
        const res = await api('/api/trainer/execute', {
            method: 'POST',
            body: { taskId: 9999, userQuery: 'SELECT 1' },
        });
        expect(res.status).toBe(404);
    });

    it('should reject overly long queries', async () => {
        const longQuery = 'SELECT ' + 'x'.repeat(2100);
        const res = await api('/api/trainer/execute', {
            method: 'POST',
            body: { userQuery: longQuery },
        });
        expect(res.status).toBe(400);
    });
});

// ═══════════════════════════════════════════════════════════
//  Isolation: destructive queries don't affect next request
// ═══════════════════════════════════════════════════════════

describe('Database isolation', () => {
    it('INSERT should not persist between requests', async () => {
        // Insert a row — DML returns { changes: N }
        const res1 = await api('/api/trainer/execute', {
            method: 'POST',
            body: { userQuery: "INSERT INTO users (username, email) VALUES ('hacker', 'h@h.com')" },
        });
        expect(res1.status).toBe(200);
        const data1 = await res1.json();
        expect(data1.userResult[0].changes).toBe(1);

        // Next request should still have only 4 users (fresh DB)
        const res2 = await api('/api/trainer/execute', {
            method: 'POST',
            body: { userQuery: 'SELECT COUNT(*) AS total FROM users' },
        });
        const data2 = await res2.json();
        expect(data2.userResult[0].total).toBe(4);
    });

    it('DELETE should not persist between requests', async () => {
        // Delete all recipes
        const res1 = await api('/api/trainer/execute', {
            method: 'POST',
            body: { userQuery: 'DELETE FROM recipes' },
        });
        const data1 = await res1.json();
        expect(data1.userResult[0].changes).toBe(7);

        // Next request should still have 7 recipes
        const res2 = await api('/api/trainer/execute', {
            method: 'POST',
            body: { userQuery: 'SELECT COUNT(*) AS total FROM recipes' },
        });
        const data2 = await res2.json();
        expect(data2.userResult[0].total).toBe(7);
    });

    it('DROP TABLE should not affect subsequent requests', async () => {
        // Drop table — DML via run()
        const res1 = await api('/api/trainer/execute', {
            method: 'POST',
            body: { userQuery: 'DROP TABLE recipes' },
        });
        expect(res1.status).toBe(200);

        // Next request: recipes table should still exist
        const res2 = await api('/api/trainer/execute', {
            method: 'POST',
            body: { userQuery: 'SELECT COUNT(*) AS total FROM recipes' },
        });
        const data2 = await res2.json();
        expect(data2.userResult[0].total).toBe(7);
    });

    it('UPDATE should not persist between requests', async () => {
        await api('/api/trainer/execute', {
            method: 'POST',
            body: { userQuery: "UPDATE users SET username = 'pwned' WHERE id = 1" },
        });

        const res = await api('/api/trainer/execute', {
            method: 'POST',
            body: { userQuery: 'SELECT username FROM users WHERE id = 1' },
        });
        const data = await res.json();
        expect(data.userResult[0].username).toBe('brewmaster');
    });
});

// ═══════════════════════════════════════════════════════════
//  Result comparison logic
// ═══════════════════════════════════════════════════════════

describe('Result comparison', () => {
    it('should match regardless of row order', async () => {
        // Task 1: SELECT * FROM users — order shouldn't matter
        const res = await api('/api/trainer/execute', {
            method: 'POST',
            body: { taskId: 1, userQuery: 'SELECT * FROM users ORDER BY id DESC' },
        });
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.success).toBe(true);
    });

    it('should fail if columns differ', async () => {
        // Task 2 expects name and style, but we query name and abv
        const res = await api('/api/trainer/execute', {
            method: 'POST',
            body: { taskId: 2, userQuery: 'SELECT name, abv FROM recipes' },
        });
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.success).toBe(false);
    });
});

// ═══════════════════════════════════════════════════════════
//  DML tasks with verify_query
// ═══════════════════════════════════════════════════════════

describe('DML tasks (verify_query)', () => {
    it('DELETE task: correct query should pass (task 21)', async () => {
        const res = await api('/api/trainer/execute', {
            method: 'POST',
            body: { taskId: 21, userQuery: "DELETE FROM brew_sessions WHERE status = 'cancelled'" },
        });
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.success).toBe(true);
        // verify_query returns remaining cancelled — should be 0
        expect(data.userResult[0].remaining).toBe(0);
    });

    it('DELETE task: wrong query should fail', async () => {
        // Delete completed instead of cancelled
        const res = await api('/api/trainer/execute', {
            method: 'POST',
            body: { taskId: 21, userQuery: "DELETE FROM brew_sessions WHERE status = 'completed'" },
        });
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.success).toBe(false);
        // User still has cancelled sessions
        expect(data.userResult[0].remaining).toBe(1);
    });

    it('UPDATE task: correct query should pass (task 22)', async () => {
        const res = await api('/api/trainer/execute', {
            method: 'POST',
            body: { taskId: 22, userQuery: 'UPDATE recipes SET is_public = 1' },
        });
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.success).toBe(true);
        expect(data.userResult[0].private_count).toBe(0);
    });

    it('INSERT task: correct query should pass (task 23)', async () => {
        const res = await api('/api/trainer/execute', {
            method: 'POST',
            body: {
                taskId: 23,
                userQuery: "INSERT INTO users (username, role, email, subscription_tier) VALUES ('newbrewer', 'user', 'newbrewer@example.com', 'trial')",
            },
        });
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.success).toBe(true);
        expect(data.userResult[0].username).toBe('newbrewer');
    });

    it('INSERT task: wrong values should fail', async () => {
        const res = await api('/api/trainer/execute', {
            method: 'POST',
            body: {
                taskId: 23,
                userQuery: "INSERT INTO users (username, role, email, subscription_tier) VALUES ('wrongname', 'admin', 'wrong@example.com', 'pro')",
            },
        });
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.success).toBe(false);
    });

    it('DML task isolation: changes do not leak to next request', async () => {
        // Run task 21 (delete cancelled sessions)
        await api('/api/trainer/execute', {
            method: 'POST',
            body: { taskId: 21, userQuery: "DELETE FROM brew_sessions WHERE status = 'cancelled'" },
        });

        // Next free-form query should still see the cancelled session
        const res = await api('/api/trainer/execute', {
            method: 'POST',
            body: { userQuery: "SELECT COUNT(*) AS total FROM brew_sessions WHERE status = 'cancelled'" },
        });
        const data = await res.json();
        expect(data.userResult[0].total).toBe(1);
    });
});
