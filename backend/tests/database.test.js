import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
    initDatabase, closeDatabase,
    recipeQueries, sessionQueries, temperatureQueries,
    fractionQueries, fermentationQueries, settingsQueries,
} from '../db/database.js';
import { join } from 'path';
import { existsSync, unlinkSync, mkdirSync } from 'fs';

const TEST_DB = join(import.meta.dirname, '..', 'data', 'test_unit.db');

beforeAll(async () => {
    if (existsSync(TEST_DB)) unlinkSync(TEST_DB);
    await initDatabase(TEST_DB);
});

afterAll(() => {
    closeDatabase();
    if (existsSync(TEST_DB)) unlinkSync(TEST_DB);
});

// ═══════════════════════════════════════════════════════════
//  Recipes CRUD
// ═══════════════════════════════════════════════════════════

describe('recipeQueries', () => {
    let recipeId;

    it('create() should insert a recipe and return it', () => {
        const recipe = recipeQueries.create({
            name: 'Test IPA',
            style: 'IPA',
            og: 1.065,
            fg: 1.012,
            ibu: 60,
            abv: 6.9,
            batch_size: 20,
            boil_time: 60,
            ingredients: [{ name: 'Pale Malt', amount: 5, unit: 'kg' }],
            mash_steps: [{ name: 'Mash', temp: 65, duration: 60 }],
            hop_additions: [{ name: 'Citra', amount: 30, time: 60 }],
            notes: 'Test recipe',
        });

        expect(recipe).toBeDefined();
        expect(recipe.id).toBeDefined();
        expect(recipe.name).toBe('Test IPA');
        recipeId = recipe.id;
    });

    it('getAll() should return array with recipes', () => {
        const all = recipeQueries.getAll();
        expect(Array.isArray(all)).toBe(true);
        expect(all.length).toBeGreaterThanOrEqual(1);
    });

    it('getById() should return the correct recipe', () => {
        const recipe = recipeQueries.getById(recipeId);
        expect(recipe).toBeDefined();
        expect(recipe.name).toBe('Test IPA');
        expect(recipe.style).toBe('IPA');
    });

    it('getById() should return null for non-existent id', () => {
        const recipe = recipeQueries.getById(99999);
        expect(recipe).toBeNull();
    });

    it('update() should modify recipe fields', () => {
        const updated = recipeQueries.update(recipeId, { name: 'Updated IPA', ibu: 70 });
        expect(updated.name).toBe('Updated IPA');
    });

    it('delete() should remove the recipe', () => {
        recipeQueries.delete(recipeId);
        const recipe = recipeQueries.getById(recipeId);
        expect(recipe).toBeNull();
    });
});

// ═══════════════════════════════════════════════════════════
//  Sessions CRUD
// ═══════════════════════════════════════════════════════════

describe('sessionQueries', () => {
    let sessionId;

    it('create() should insert a session', () => {
        const session = sessionQueries.create({ type: 'mash', notes: 'Test session' });
        expect(session).toBeDefined();
        expect(session.id).toBeDefined();
        expect(session.type).toBe('mash');
        expect(session.status).toBe('active');
        sessionId = session.id;
    });

    it('getAll() should return sessions', () => {
        sessionQueries.create({ type: 'boil' });
        const all = sessionQueries.getAll();
        expect(all.length).toBeGreaterThanOrEqual(2);
    });

    it('getAll(type) should filter by type', () => {
        const mashOnly = sessionQueries.getAll('mash');
        expect(mashOnly.every(s => s.type === 'mash')).toBe(true);
    });

    it('getById() should return a session', () => {
        const session = sessionQueries.getById(sessionId);
        expect(session.type).toBe('mash');
    });

    it('update() should modify session', () => {
        const updated = sessionQueries.update(sessionId, { notes: 'Updated notes' });
        expect(updated.notes).toBe('Updated notes');
    });

    it('complete() should mark session as completed', () => {
        const completed = sessionQueries.complete(sessionId);
        expect(completed.status).toBe('completed');
        expect(completed.finished_at).toBeTruthy();
    });

    it('delete() should remove session', () => {
        sessionQueries.delete(sessionId);
        const session = sessionQueries.getById(sessionId);
        expect(session).toBeNull();
    });
});

// ═══════════════════════════════════════════════════════════
//  Temperature Log
// ═══════════════════════════════════════════════════════════

describe('temperatureQueries', () => {
    let sessionId;

    beforeAll(() => {
        const session = sessionQueries.create({ type: 'mash' });
        sessionId = session.id;
    });

    it('insert() should add a temperature reading', () => {
        expect(() => temperatureQueries.insert(sessionId, 'boiler', 65.5)).not.toThrow();
    });

    it('getBySession() should return temperature history', () => {
        temperatureQueries.insert(sessionId, 'boiler', 66.0);
        temperatureQueries.insert(sessionId, 'column', 60.0);

        const temps = temperatureQueries.getBySession(sessionId);
        expect(temps.length).toBeGreaterThanOrEqual(2);
        expect(temps[0]).toHaveProperty('sensor');
        expect(temps[0]).toHaveProperty('value');
    });

    it('insertBatch() should add multiple readings', () => {
        const batch = [
            { session_id: sessionId, sensor: 'boiler', value: 70 },
            { session_id: sessionId, sensor: 'column', value: 65 },
            { session_id: sessionId, sensor: 'output', value: 30 },
        ];
        expect(() => temperatureQueries.insertBatch(batch)).not.toThrow();

        const all = temperatureQueries.getBySession(sessionId, 100);
        expect(all.length).toBeGreaterThanOrEqual(5);
    });

    it('getBySession() should respect limit', () => {
        const limited = temperatureQueries.getBySession(sessionId, 2);
        expect(limited.length).toBe(2);
    });
});

// ═══════════════════════════════════════════════════════════
//  Fraction Log
// ═══════════════════════════════════════════════════════════

describe('fractionQueries', () => {
    let sessionId;

    beforeAll(() => {
        const session = sessionQueries.create({ type: 'distillation' });
        sessionId = session.id;
    });

    it('insert() should add a fraction entry', () => {
        expect(() => fractionQueries.insert({
            session_id: sessionId,
            phase: 'heads',
            volume: 50,
            abv: 85,
            notes: 'First cut',
        })).not.toThrow();
    });

    it('getBySession() should return fractions', () => {
        fractionQueries.insert({
            session_id: sessionId,
            phase: 'hearts',
            volume: 200,
            abv: 78,
        });

        const fractions = fractionQueries.getBySession(sessionId);
        expect(fractions.length).toBe(2);
        expect(fractions[0].phase).toBe('heads');
        expect(fractions[1].phase).toBe('hearts');
    });
});

// ═══════════════════════════════════════════════════════════
//  Fermentation Entries
// ═══════════════════════════════════════════════════════════

describe('fermentationQueries', () => {
    let sessionId;

    beforeAll(() => {
        const session = sessionQueries.create({ type: 'fermentation' });
        sessionId = session.id;
    });

    it('insert() should add a fermentation entry', () => {
        expect(() => fermentationQueries.insert({
            session_id: sessionId,
            stage: 'primary',
            temperature: 20,
            gravity: 1.050,
            notes: 'Start',
        })).not.toThrow();
    });

    it('getBySession() should return entries', () => {
        fermentationQueries.insert({
            session_id: sessionId,
            stage: 'secondary',
            temperature: 18,
            gravity: 1.012,
            abv: 5.0,
        });

        const entries = fermentationQueries.getBySession(sessionId);
        expect(entries.length).toBe(2);
        expect(entries[0].stage).toBe('primary');
    });
});

// ═══════════════════════════════════════════════════════════
//  Settings
// ═══════════════════════════════════════════════════════════

describe('settingsQueries', () => {
    it('set() should store a string setting', () => {
        expect(() => settingsQueries.set('theme', 'dark')).not.toThrow();
    });

    it('get() should retrieve a setting', () => {
        settingsQueries.set('port', 3001);
        expect(settingsQueries.get('port')).toBe(3001);
    });

    it('get() should return null for missing key', () => {
        expect(settingsQueries.get('nonexistent')).toBeNull();
    });

    it('set() should upsert (overwrite existing)', () => {
        settingsQueries.set('theme', 'light');
        expect(settingsQueries.get('theme')).toBe('light');
    });

    it('getAll() should return all settings as object', () => {
        settingsQueries.set('language', 'ru');
        const all = settingsQueries.getAll();
        expect(all).toHaveProperty('theme', 'light');
        expect(all).toHaveProperty('port', 3001);
        expect(all).toHaveProperty('language', 'ru');
    });

    it('setBulk() should set multiple settings at once', () => {
        settingsQueries.setBulk({ a: 1, b: 'two', c: true });
        const all = settingsQueries.getAll();
        expect(all.a).toBe(1);
        expect(all.b).toBe('two');
        expect(all.c).toBe(true);
    });

    it('should handle JSON objects as values', () => {
        settingsQueries.set('sensors', { boiler: true, column: true });
        const val = settingsQueries.get('sensors');
        expect(val).toEqual({ boiler: true, column: true });
    });
});
