import { describe, it, expect } from 'vitest';
import { orangeBrewToBeerxml } from '../beerxml/mapper.js';
import { parseXmlString } from '../beerxml/parser.js';
import { generateBeerXmlString } from '../beerxml/generator.js';

// ─── Fixtures ─────────────────────────────────────────────

const OB_RECIPE = {
    id: 1,
    user_id: 1,
    name: 'West Coast IPA',
    style: 'IPA',
    batch_size: 20,
    boil_time: 60,
    efficiency: 75,
    og: 1.065,
    fg: 1.012,
    ibu: 50,
    abv: 7.0,
    notes: 'Hoppy and dry',
    ingredients: [
        { name: 'Pale Malt',    amount: 5.0, unit: 'kg',  type: 'grain' },
        { name: 'Crystal 40',  amount: 0.5, unit: 'kg',  type: 'grain' },
        { name: 'US-05',       amount: 11.5, unit: 'g',  type: 'yeast', yeast_type: 'ale', form: 'dry', lab: 'Fermentis' },
    ],
    hop_additions: [
        { name: 'Centennial', amount: 28.0, time: 60, type: 'boil',  alpha: 10.5 },
        { name: 'Cascade',    amount: 56.0, time: 5,  type: 'aroma', alpha: 5.5 },
    ],
    mash_steps: [
        { name: 'Mash In',  temp: 67, duration: 60 },
        { name: 'Mash Out', temp: 76, duration: 10 },
    ],
};

// ─── Tests: orangeBrewToBeerxml ───────────────────────────

describe('orangeBrewToBeerxml', () => {
    it('has required BeerXML top-level fields', () => {
        const bx = orangeBrewToBeerxml(OB_RECIPE);
        expect(bx.NAME).toBe('West Coast IPA');
        expect(bx.VERSION).toBe(1);
        expect(bx.BATCH_SIZE).toBe('20.0');
        expect(bx.BOIL_TIME).toBe(60);
    });

    it('splits ingredients: fermentables vs yeasts', () => {
        const bx = orangeBrewToBeerxml(OB_RECIPE);
        const ferms = bx.FERMENTABLES.FERMENTABLE;
        const yests = bx.YEASTS.YEAST;
        expect(ferms).toHaveLength(2);
        expect(yests).toHaveLength(1);
        expect(yests[0].NAME).toBe('US-05');
    });

    it('converts hop amounts from grams to kg', () => {
        const bx = orangeBrewToBeerxml(OB_RECIPE);
        const hops = bx.HOPS.HOP;
        // Centennial: 28g → 0.0280 kg
        expect(parseFloat(hops[0].AMOUNT)).toBeCloseTo(0.028, 4);
        // Cascade: 56g → 0.0560 kg
        expect(parseFloat(hops[1].AMOUNT)).toBeCloseTo(0.056, 4);
    });

    it('hop boil times are preserved', () => {
        const bx = orangeBrewToBeerxml(OB_RECIPE);
        expect(bx.HOPS.HOP[0].TIME).toBe(60);
        expect(bx.HOPS.HOP[1].TIME).toBe(5);
    });

    it('mash steps exported correctly', () => {
        const bx = orangeBrewToBeerxml(OB_RECIPE);
        const steps = bx.MASH.MASH_STEPS.MASH_STEP;
        expect(steps).toHaveLength(2);
        expect(parseFloat(steps[0].STEP_TEMP)).toBeCloseTo(67);
        expect(steps[0].STEP_TIME).toBe(60);
    });

    it('works with JSON-string fields (raw DB row)', () => {
        const rawRecipe = {
            ...OB_RECIPE,
            ingredients:   JSON.stringify(OB_RECIPE.ingredients),
            hop_additions: JSON.stringify(OB_RECIPE.hop_additions),
            mash_steps:    JSON.stringify(OB_RECIPE.mash_steps),
        };
        const bx = orangeBrewToBeerxml(rawRecipe);
        expect(bx.FERMENTABLES.FERMENTABLE).toHaveLength(2);
    });

    it('handles recipe with no hops/yeasts gracefully', () => {
        const minimal = { ...OB_RECIPE, hop_additions: [], ingredients: [] };
        const bx = orangeBrewToBeerxml(minimal);
        expect(Array.isArray(bx.HOPS.HOP)).toBe(true);
        expect(bx.HOPS.HOP).toHaveLength(0);
    });
});

// ─── Tests: roundtrip ────────────────────────────────────

describe('BeerXML roundtrip (OB → XML → OB)', () => {
    it('preserves name, batch_size, boil_time', async () => {
        const bxObj = orangeBrewToBeerxml(OB_RECIPE);
        const xml    = generateBeerXmlString(bxObj);
        const parsed = await parseXmlString(xml);
        const r = parsed[0];
        expect(r.name).toBe('West Coast IPA');
        expect(r.batch_size).toBe(20);
        expect(r.boil_time).toBe(60);
    });

    it('preserves hop amounts (grams) through roundtrip', async () => {
        const bxObj = orangeBrewToBeerxml(OB_RECIPE);
        const xml    = generateBeerXmlString(bxObj);
        const parsed = await parseXmlString(xml);
        // hop_additions[0] = Centennial, originally 28g
        expect(parsed[0].hop_additions[0].amount).toBeCloseTo(28.0, 1);
    });

    it('fermentable amounts preserved', async () => {
        const bxObj = orangeBrewToBeerxml(OB_RECIPE);
        const xml    = generateBeerXmlString(bxObj);
        const parsed = await parseXmlString(xml);
        const grains = parsed[0].ingredients.filter(i => i.type !== 'yeast');
        expect(grains[0].amount).toBeCloseTo(5.0, 2);
    });
});
