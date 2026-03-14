import { describe, it, expect } from 'vitest';
import { scaleRecipe } from '../utils/scaleRecipe.js';

// ─── Fixture ──────────────────────────────────────────────

const BASE_RECIPE = {
    id: 1,
    user_id: 1,
    name: 'Test IPA',
    style: 'IPA',
    batch_size: 20,
    boil_time: 60,
    og: 1.065,
    fg: 1.012,
    ibu: 40,
    abv: 6.9,
    notes: 'Great beer',
    ingredients: [
        { name: 'Pale Malt', amount: 5.0, unit: 'kg', type: 'grain' },
        { name: 'Crystal 60', amount: 0.5, unit: 'kg', type: 'grain' },
        { name: 'US-05', amount: 11.5, unit: 'g', type: 'yeast' },
    ],
    hop_additions: [
        { name: 'Centennial', amount: 28.0, time: 60, type: 'boil', alpha: 10.5 },
        { name: 'Cascade', amount: 56.0, time: 5,  type: 'aroma', alpha: 5.5 },
    ],
    mash_steps: [
        { name: 'Mash In', temp: 67, duration: 60 },
        { name: 'Mash Out', temp: 76, duration: 10 },
    ],
    created_at: '2026-03-14T10:00:00.000Z',
    updated_at: '2026-03-14T10:00:00.000Z',
};

// ─── Tests ────────────────────────────────────────────────

describe('scaleRecipe', () => {
    it('scales ingredients proportionally (20→30, factor 1.5)', () => {
        const scaled = scaleRecipe(BASE_RECIPE, 30);

        expect(scaled.batch_size).toBe(30);
        // Pale Malt: 5.0 * 1.5 = 7.5
        expect(scaled.ingredients[0].amount).toBeCloseTo(7.5, 3);
        // Crystal: 0.5 * 1.5 = 0.75
        expect(scaled.ingredients[1].amount).toBeCloseTo(0.75, 3);
        // Yeast: 11.5 * 1.5 = 17.25
        expect(scaled.ingredients[2].amount).toBeCloseTo(17.25, 3);
    });

    it('scales hop amounts proportionally (20→30)', () => {
        const scaled = scaleRecipe(BASE_RECIPE, 30);

        // Centennial: 28 * 1.5 = 42.0
        expect(scaled.hop_additions[0].amount).toBeCloseTo(42.0, 1);
        // Cascade: 56 * 1.5 = 84.0
        expect(scaled.hop_additions[1].amount).toBeCloseTo(84.0, 1);
    });

    it('scales down correctly (20→10, factor 0.5)', () => {
        const scaled = scaleRecipe(BASE_RECIPE, 10);

        expect(scaled.batch_size).toBe(10);
        expect(scaled.ingredients[0].amount).toBeCloseTo(2.5, 3);
        expect(scaled.hop_additions[0].amount).toBeCloseTo(14.0, 1);
    });

    it('boil_time is NOT changed', () => {
        const scaled = scaleRecipe(BASE_RECIPE, 30);
        expect(scaled.boil_time).toBe(BASE_RECIPE.boil_time);
    });

    it('mash step temperatures are NOT changed', () => {
        const scaled = scaleRecipe(BASE_RECIPE, 30);
        expect(scaled.mash_steps[0].temp).toBe(67);
        expect(scaled.mash_steps[1].temp).toBe(76);
    });

    it('mash step durations are NOT changed', () => {
        const scaled = scaleRecipe(BASE_RECIPE, 30);
        expect(scaled.mash_steps[0].duration).toBe(60);
        expect(scaled.mash_steps[1].duration).toBe(10);
    });

    it('hop boil times are NOT changed', () => {
        const scaled = scaleRecipe(BASE_RECIPE, 30);
        expect(scaled.hop_additions[0].time).toBe(60);
        expect(scaled.hop_additions[1].time).toBe(5);
    });

    it('hop alpha acid is NOT changed', () => {
        const scaled = scaleRecipe(BASE_RECIPE, 30);
        expect(scaled.hop_additions[0].alpha).toBe(10.5);
    });

    it('OG, FG, IBU, ABV stay the same', () => {
        const scaled = scaleRecipe(BASE_RECIPE, 30);
        expect(scaled.og).toBe(BASE_RECIPE.og);
        expect(scaled.fg).toBe(BASE_RECIPE.fg);
        expect(scaled.ibu).toBe(BASE_RECIPE.ibu);
        expect(scaled.abv).toBe(BASE_RECIPE.abv);
    });

    it('result has no id, created_at, updated_at, user_id (not saved)', () => {
        const scaled = scaleRecipe(BASE_RECIPE, 30);
        expect(scaled.id).toBeUndefined();
        expect(scaled.created_at).toBeUndefined();
        expect(scaled.updated_at).toBeUndefined();
        expect(scaled.user_id).toBeUndefined();
    });

    it('name includes target batch size', () => {
        const scaled = scaleRecipe(BASE_RECIPE, 30);
        expect(scaled.name).toBe('Test IPA (30л)');
    });

    it('throws on targetBatchSize = 0', () => {
        expect(() => scaleRecipe(BASE_RECIPE, 0)).toThrow();
    });

    it('throws on negative targetBatchSize', () => {
        expect(() => scaleRecipe(BASE_RECIPE, -5)).toThrow();
    });

    it('throws on NaN targetBatchSize', () => {
        expect(() => scaleRecipe(BASE_RECIPE, NaN)).toThrow();
    });

    it('throws when recipe batch_size is 0', () => {
        expect(() => scaleRecipe({ ...BASE_RECIPE, batch_size: 0 }, 20)).toThrow();
    });

    it('works with JSON-string fields (raw DB row)', () => {
        const rawRecipe = {
            ...BASE_RECIPE,
            ingredients:   JSON.stringify(BASE_RECIPE.ingredients),
            hop_additions: JSON.stringify(BASE_RECIPE.hop_additions),
            mash_steps:    JSON.stringify(BASE_RECIPE.mash_steps),
        };
        const scaled = scaleRecipe(rawRecipe, 40);
        expect(scaled.batch_size).toBe(40);
        expect(scaled.ingredients[0].amount).toBeCloseTo(10.0, 3); // 5 * 2
    });

    it('works when recipe has empty collections', () => {
        const minimal = {
            name: 'Empty', batch_size: 20, boil_time: 60,
            ingredients: [], hop_additions: [], mash_steps: [],
        };
        const scaled = scaleRecipe(minimal, 40);
        expect(scaled.batch_size).toBe(40);
        expect(scaled.ingredients).toHaveLength(0);
        expect(scaled.hop_additions).toHaveLength(0);
    });
});
