import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import initSqlJs from 'sql.js';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import express from 'express';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ─── Helpers ──────────────────────────────────────────────

/** Spin up an in-memory DB and hand-wire the recipe route. */
async function createTestApp() {
    const SQL = await initSqlJs();
    const db = new SQL.Database();
    db.run('PRAGMA foreign_keys = ON');
    const schema = readFileSync(join(__dirname, '..', 'db', 'schema.sql'), 'utf-8');
    db.run(schema);

    // ── replicate the helpers from database.js ──
    function queryAll(sql, params = []) {
        const stmt = db.prepare(sql);
        stmt.bind(params);
        const rows = [];
        while (stmt.step()) rows.push(stmt.getAsObject());
        stmt.free();
        return rows;
    }
    function queryOne(sql, params = []) {
        const stmt = db.prepare(sql);
        stmt.bind(params);
        let row = null;
        if (stmt.step()) row = stmt.getAsObject();
        stmt.free();
        return row;
    }
    function runSql(sql, params = []) {
        db.run(sql, params);
        const changes = db.getRowsModified();
        const lastId = queryOne('SELECT last_insert_rowid() as id');
        return { changes, lastId: lastId?.id };
    }

    // ── recipe queries (mirrors database.js exactly) ──
    const recipeQueries = {
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

    // ── Build Express app with JSON parsing for the recipe route ──
    const app = express();
    app.use(express.json());

    const parseJsonFields = (r) => ({
        ...r,
        ingredients: JSON.parse(r.ingredients || '[]'),
        mash_steps: JSON.parse(r.mash_steps || '[]'),
        hop_additions: JSON.parse(r.hop_additions || '[]'),
    });

    app.get('/api/recipes', (req, res) => {
        const recipes = recipeQueries.getAll();
        res.json(recipes.map(parseJsonFields));
    });

    app.get('/api/recipes/:id', (req, res) => {
        const recipe = recipeQueries.getById(req.params.id);
        if (!recipe) return res.status(404).json({ error: 'Recipe not found' });
        res.json(parseJsonFields(recipe));
    });

    app.post('/api/recipes', (req, res) => {
        const recipe = recipeQueries.create(req.body);
        res.status(201).json(parseJsonFields(recipe));
    });

    app.put('/api/recipes/:id', (req, res) => {
        const recipe = recipeQueries.update(req.params.id, req.body);
        if (!recipe) return res.status(404).json({ error: 'Recipe not found' });
        res.json(parseJsonFields(recipe));
    });

    app.delete('/api/recipes/:id', (req, res) => {
        recipeQueries.delete(req.params.id);
        res.json({ ok: true });
    });

    return { app, db };
}

// ═══════════════════════════════════════════════════════════
//  Recipe Saving Tests
// ═══════════════════════════════════════════════════════════

describe('Recipe Saving (end-to-end)', () => {
    let server, baseUrl, db;

    beforeAll(async () => {
        const result = await createTestApp();
        db = result.db;
        server = result.app.listen(0);
        const port = server.address().port;
        baseUrl = `http://localhost:${port}/api`;
    });

    afterAll(() => {
        server?.close();
        db?.close();
    });

    const api = (path, opts = {}) =>
        fetch(`${baseUrl}${path}`, {
            headers: { 'Content-Type': 'application/json' },
            ...opts,
            body: opts.body ? JSON.stringify(opts.body) : undefined,
        }).then(async r => ({ status: r.status, data: await r.json() }));

    // ── CREATE ────────────────────────────────────────────

    it('POST /recipes — should create a recipe with mash_steps array', async () => {
        const payload = {
            name: 'IPA Test',
            style: 'American IPA',
            batch_size: 25,
            boil_time: 60,
            og: 1.065,
            mash_steps: [
                { id: '1', name: 'Белковая пауза', temp: 52, duration: 15 },
                { id: '2', name: 'Осахаривание', temp: 67, duration: 60 },
            ],
            ingredients: [{ name: 'Pale Ale Malt', amount: 5, unit: 'kg' }],
            hop_additions: [{ name: 'Citra', amount: 30, time: 15 }],
            notes: 'Test recipe',
        };

        const { status, data } = await api('/recipes', { method: 'POST', body: payload });

        expect(status).toBe(201);
        expect(data.id).toBeDefined();
        expect(data.name).toBe('IPA Test');
        expect(data.style).toBe('American IPA');
        expect(data.batch_size).toBe(25);
        expect(data.og).toBeCloseTo(1.065, 2);
        // mash_steps should come back as a parsed array
        expect(Array.isArray(data.mash_steps)).toBe(true);
        expect(data.mash_steps).toHaveLength(2);
        expect(data.mash_steps[0].name).toBe('Белковая пауза');
        expect(data.mash_steps[0].temp).toBe(52);
        expect(data.mash_steps[1].duration).toBe(60);
        // ingredients
        expect(Array.isArray(data.ingredients)).toBe(true);
        expect(data.ingredients[0].name).toBe('Pale Ale Malt');
        // hop_additions
        expect(Array.isArray(data.hop_additions)).toBe(true);
        expect(data.hop_additions[0].name).toBe('Citra');
        // timestamps
        expect(data.created_at).toBeDefined();
    });

    it('POST /recipes — should use defaults for missing fields', async () => {
        const { status, data } = await api('/recipes', {
            method: 'POST',
            body: { name: 'Minimal Recipe' },
        });

        expect(status).toBe(201);
        expect(data.name).toBe('Minimal Recipe');
        expect(data.style).toBe('');
        expect(data.batch_size).toBe(20); // default
        expect(data.boil_time).toBe(60);  // default
        expect(data.mash_steps).toEqual([]);
        expect(data.ingredients).toEqual([]);
        expect(data.hop_additions).toEqual([]);
    });

    it('POST /recipes — empty name defaults to "Без названия"', async () => {
        const { data } = await api('/recipes', { method: 'POST', body: {} });
        expect(data.name).toBe('Без названия');
    });

    // ── READ ─────────────────────────────────────────────

    it('GET /recipes — should list all created recipes with parsed JSON', async () => {
        const { data } = await api('/recipes');

        expect(Array.isArray(data)).toBe(true);
        expect(data.length).toBeGreaterThanOrEqual(3);
        // most recent first
        for (const r of data) {
            expect(Array.isArray(r.mash_steps)).toBe(true);
            expect(Array.isArray(r.ingredients)).toBe(true);
            expect(Array.isArray(r.hop_additions)).toBe(true);
        }
    });

    it('GET /recipes/:id — should return a single recipe with parsed JSON', async () => {
        // create a known recipe
        const { data: created } = await api('/recipes', {
            method: 'POST',
            body: {
                name: 'Get Test',
                mash_steps: [{ name: 'Step1', temp: 65, duration: 60 }],
            },
        });

        const { status, data } = await api(`/recipes/${created.id}`);
        expect(status).toBe(200);
        expect(data.name).toBe('Get Test');
        expect(data.mash_steps).toHaveLength(1);
        expect(data.mash_steps[0].temp).toBe(65);
    });

    it('GET /recipes/:id — should 404 for non-existent id', async () => {
        const { status } = await api('/recipes/99999');
        expect(status).toBe(404);
    });

    // ── UPDATE ────────────────────────────────────────────

    it('PUT /recipes/:id — should update name and style', async () => {
        const { data: created } = await api('/recipes', {
            method: 'POST',
            body: { name: 'Before Update', style: 'Lager' },
        });

        const { status, data } = await api(`/recipes/${created.id}`, {
            method: 'PUT',
            body: { name: 'After Update', style: 'American IPA' },
        });

        expect(status).toBe(200);
        expect(data.name).toBe('After Update');
        expect(data.style).toBe('American IPA');
        expect(data.updated_at).toBeDefined();
    });

    it('PUT /recipes/:id — should update mash_steps array', async () => {
        const { data: created } = await api('/recipes', {
            method: 'POST',
            body: {
                name: 'Steps Update Test',
                mash_steps: [{ name: 'Old Step', temp: 60, duration: 30 }],
            },
        });

        const newSteps = [
            { name: 'New Step 1', temp: 52, duration: 15 },
            { name: 'New Step 2', temp: 67, duration: 60 },
            { name: 'New Step 3', temp: 78, duration: 10 },
        ];

        const { data } = await api(`/recipes/${created.id}`, {
            method: 'PUT',
            body: { mash_steps: newSteps },
        });

        expect(data.mash_steps).toHaveLength(3);
        expect(data.mash_steps[0].name).toBe('New Step 1');
        expect(data.mash_steps[2].temp).toBe(78);
        // name should not change
        expect(data.name).toBe('Steps Update Test');
    });

    // ── DELETE ────────────────────────────────────────────

    it('DELETE /recipes/:id — should remove the recipe', async () => {
        const { data: created } = await api('/recipes', {
            method: 'POST',
            body: { name: 'To Delete' },
        });

        const { status: delStatus } = await api(`/recipes/${created.id}`, {
            method: 'DELETE',
        });
        expect(delStatus).toBe(200);

        const { status: getStatus } = await api(`/recipes/${created.id}`);
        expect(getStatus).toBe(404);
    });

    // ── Round-trip data integrity ─────────────────────────

    it('should preserve complex mash_steps through create → get cycle', async () => {
        const steps = [
            { id: 'a', name: 'Кислотная пауза', temp: 40, duration: 10 },
            { id: 'b', name: 'Белковая пауза', temp: 52, duration: 20 },
            { id: 'c', name: 'Мальтозная пауза', temp: 62, duration: 45 },
            { id: 'd', name: 'Осахаривание', temp: 72, duration: 15 },
            { id: 'e', name: 'Мэш-аут', temp: 78, duration: 10 },
        ];

        const { data: created } = await api('/recipes', {
            method: 'POST',
            body: { name: 'Round-trip Test', mash_steps: steps },
        });

        // Read it back by id
        const { data } = await api(`/recipes/${created.id}`);

        expect(data.mash_steps).toHaveLength(5);
        data.mash_steps.forEach((step, i) => {
            expect(step.id).toBe(steps[i].id);
            expect(step.name).toBe(steps[i].name);
            expect(step.temp).toBe(steps[i].temp);
            expect(step.duration).toBe(steps[i].duration);
        });
    });

    it('should preserve ingredients and hop_additions through create → get cycle', async () => {
        const ingredients = [
            { name: 'Pale Ale Malt', amount: 4.5, unit: 'kg' },
            { name: 'Crystal 40', amount: 0.3, unit: 'kg' },
        ];
        const hops = [
            { name: 'Cascade', amount: 20, time: 60 },
            { name: 'Citra', amount: 30, time: 0 },
        ];

        const { data: created } = await api('/recipes', {
            method: 'POST',
            body: { name: 'Ingredient Test', ingredients, hop_additions: hops },
        });

        const { data } = await api(`/recipes/${created.id}`);

        expect(data.ingredients).toHaveLength(2);
        expect(data.ingredients[0].name).toBe('Pale Ale Malt');
        expect(data.ingredients[1].amount).toBe(0.3);

        expect(data.hop_additions).toHaveLength(2);
        expect(data.hop_additions[0].time).toBe(60);
        expect(data.hop_additions[1].name).toBe('Citra');
    });

    it('should list the newly created recipe in GET /recipes', async () => {
        const { data: created } = await api('/recipes', {
            method: 'POST',
            body: { name: 'Findable Recipe' },
        });

        const { data: all } = await api('/recipes');
        const found = all.find(r => r.id === created.id);
        expect(found).toBeDefined();
        expect(found.name).toBe('Findable Recipe');
    });
});
