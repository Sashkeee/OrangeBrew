import { describe, it, expect } from 'vitest';
import {
    parseXmlString,
    parseFermentables,
    parseHops,
    parseYeasts,
    parseMashSteps,
    validateRecipe,
} from '../beerxml/parser.js';

// ─── Fixtures ─────────────────────────────────────────────

const MINIMAL_BEERXML = `<?xml version="1.0" encoding="UTF-8"?>
<RECIPES>
  <RECIPE>
    <NAME>Test IPA</NAME>
    <VERSION>1</VERSION>
    <TYPE>All Grain</TYPE>
    <BREWER>Tester</BREWER>
    <BATCH_SIZE>20</BATCH_SIZE>
    <BOIL_SIZE>24</BOIL_SIZE>
    <BOIL_TIME>60</BOIL_TIME>
    <EFFICIENCY>75</EFFICIENCY>
    <FERMENTABLES>
      <FERMENTABLE>
        <NAME>Pale Malt</NAME>
        <TYPE>Grain</TYPE>
        <AMOUNT>5.0</AMOUNT>
      </FERMENTABLE>
    </FERMENTABLES>
    <HOPS>
      <HOP>
        <NAME>Centennial</NAME>
        <AMOUNT>0.028</AMOUNT>
        <USE>Boil</USE>
        <TIME>60</TIME>
        <ALPHA>10.5</ALPHA>
      </HOP>
    </HOPS>
    <YEASTS>
      <YEAST>
        <NAME>US-05</NAME>
        <TYPE>Ale</TYPE>
        <FORM>Dry</FORM>
        <AMOUNT>0.0115</AMOUNT>
      </YEAST>
    </YEASTS>
    <MASH>
      <MASH_STEPS>
        <MASH_STEP>
          <NAME>Mash In</NAME>
          <TYPE>Infusion</TYPE>
          <STEP_TEMP>67</STEP_TEMP>
          <STEP_TIME>60</STEP_TIME>
        </MASH_STEP>
      </MASH_STEPS>
    </MASH>
  </RECIPE>
</RECIPES>`;

const MULTI_RECIPE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<RECIPES>
  <RECIPE>
    <NAME>IPA</NAME>
    <VERSION>1</VERSION>
    <TYPE>All Grain</TYPE>
    <BREWER>A</BREWER>
    <BATCH_SIZE>20</BATCH_SIZE>
    <BOIL_SIZE>24</BOIL_SIZE>
    <BOIL_TIME>60</BOIL_TIME>
    <EFFICIENCY>75</EFFICIENCY>
    <FERMENTABLES><FERMENTABLE><NAME>Pale</NAME><TYPE>Grain</TYPE><AMOUNT>5</AMOUNT></FERMENTABLE></FERMENTABLES>
    <HOPS></HOPS>
    <YEASTS></YEASTS>
    <MASH><MASH_STEPS><MASH_STEP><NAME>Mash</NAME><TYPE>Infusion</TYPE><STEP_TEMP>67</STEP_TEMP><STEP_TIME>60</STEP_TIME></MASH_STEP></MASH_STEPS></MASH>
  </RECIPE>
  <RECIPE>
    <NAME>Stout</NAME>
    <VERSION>1</VERSION>
    <TYPE>All Grain</TYPE>
    <BREWER>B</BREWER>
    <BATCH_SIZE>25</BATCH_SIZE>
    <BOIL_SIZE>30</BOIL_SIZE>
    <BOIL_TIME>90</BOIL_TIME>
    <EFFICIENCY>72</EFFICIENCY>
    <FERMENTABLES><FERMENTABLE><NAME>Maris Otter</NAME><TYPE>Grain</TYPE><AMOUNT>6</AMOUNT></FERMENTABLE></FERMENTABLES>
    <HOPS></HOPS>
    <YEASTS></YEASTS>
    <MASH><MASH_STEPS><MASH_STEP><NAME>Mash</NAME><TYPE>Infusion</TYPE><STEP_TEMP>68</STEP_TEMP><STEP_TIME>75</STEP_TIME></MASH_STEP></MASH_STEPS></MASH>
  </RECIPE>
</RECIPES>`;

const XML_WITH_MISCS = MINIMAL_BEERXML.replace(
    '</RECIPE>',
    '<MISCS><MISC><NAME>Irish Moss</NAME><TYPE>Fining</TYPE></MISC></MISCS></RECIPE>'
);

// ─── Tests: parseXmlString ────────────────────────────────

describe('parseXmlString', () => {
    it('parses a minimal valid BeerXML', async () => {
        const recipes = await parseXmlString(MINIMAL_BEERXML);
        expect(recipes).toHaveLength(1);
        const r = recipes[0];
        expect(r.name).toBe('Test IPA');
        expect(r.batch_size).toBe(20);
        expect(r.boil_time).toBe(60);
    });

    it('parses multiple recipes', async () => {
        const recipes = await parseXmlString(MULTI_RECIPE_XML);
        expect(recipes).toHaveLength(2);
        expect(recipes[0].name).toBe('IPA');
        expect(recipes[1].name).toBe('Stout');
        expect(recipes[1].batch_size).toBe(25);
    });

    it('parses without optional fields (OG/FG/IBU/ABV default to 0)', async () => {
        const recipes = await parseXmlString(MINIMAL_BEERXML);
        expect(recipes[0].og).toBe(0);
        expect(recipes[0].fg).toBe(0);
        expect(recipes[0].ibu).toBe(0);
        expect(recipes[0].abv).toBe(0);
    });

    it('throws on invalid XML', async () => {
        await expect(parseXmlString('<broken>xml')).rejects.toThrow(/invalid xml/i);
    });

    it('throws when RECIPES element is missing', async () => {
        await expect(parseXmlString('<FOO><BAR>x</BAR></FOO>')).rejects.toThrow(/invalid beerxml/i);
    });

    it('converts hop amount from kg to grams', async () => {
        const recipes = await parseXmlString(MINIMAL_BEERXML);
        // Centennial: AMOUNT=0.028 kg → 28g
        expect(recipes[0].hop_additions[0].amount).toBeCloseTo(28.0, 1);
    });

    it('appends MISCS to notes', async () => {
        const recipes = await parseXmlString(XML_WITH_MISCS);
        expect(recipes[0].notes).toContain('BeerXML Extras');
        expect(recipes[0].notes).toContain('MISCS');
    });

    it('combines fermentables and yeasts in ingredients[]', async () => {
        const recipes = await parseXmlString(MINIMAL_BEERXML);
        const { ingredients } = recipes[0];
        const grains  = ingredients.filter(i => i.type !== 'yeast');
        const yeasts  = ingredients.filter(i => i.type === 'yeast');
        expect(grains.length).toBeGreaterThan(0);
        expect(yeasts.length).toBe(1);
        expect(yeasts[0].name).toBe('US-05');
    });
});

// ─── Tests: section parsers ───────────────────────────────

describe('parseFermentables', () => {
    it('maps TYPE correctly', () => {
        const node = { FERMENTABLE: { NAME: 'Sugar', TYPE: 'Sugar', AMOUNT: '0.5' } };
        const result = parseFermentables(node);
        expect(result[0].type).toBe('sugar');
        expect(result[0].unit).toBe('kg');
    });

    it('defaults unknown type to grain', () => {
        const node = { FERMENTABLE: { NAME: 'X', TYPE: 'UnknownType', AMOUNT: '1' } };
        const result = parseFermentables(node);
        expect(result[0].type).toBe('grain');
    });

    it('returns empty array for missing node', () => {
        expect(parseFermentables(null)).toEqual([]);
        expect(parseFermentables({})).toEqual([]);
    });
});

describe('parseHops', () => {
    it('converts kg to grams', () => {
        const node = { HOP: { NAME: 'Cascade', AMOUNT: '0.056', USE: 'Aroma', TIME: '5' } };
        const result = parseHops(node);
        expect(result[0].amount).toBeCloseTo(56.0, 1);
    });

    it('preserves alpha acid', () => {
        const node = { HOP: { NAME: 'Centennial', AMOUNT: '0.028', USE: 'Boil', TIME: '60', ALPHA: '10.5' } };
        expect(parseHops(node)[0].alpha).toBeCloseTo(10.5);
    });

    it('handles missing ALPHA gracefully', () => {
        const node = { HOP: { NAME: 'X', AMOUNT: '0.01', USE: 'Boil', TIME: '10' } };
        expect(parseHops(node)[0].alpha).toBeUndefined();
    });
});

describe('parseMashSteps', () => {
    it('parses temp and duration', () => {
        const node = {
            MASH_STEPS: {
                MASH_STEP: { NAME: 'Sacc Rest', TYPE: 'Infusion', STEP_TEMP: '68', STEP_TIME: '75' }
            }
        };
        const steps = parseMashSteps(node);
        expect(steps[0].temp).toBe(68);
        expect(steps[0].duration).toBe(75);
    });

    it('filters out invalid steps (temp=0)', () => {
        const node = {
            MASH_STEPS: {
                MASH_STEP: [
                    { NAME: 'Good', TYPE: 'Infusion', STEP_TEMP: '67', STEP_TIME: '60' },
                    { NAME: 'Bad',  TYPE: 'Infusion', STEP_TEMP: '0',  STEP_TIME: '0' },
                ]
            }
        };
        expect(parseMashSteps(node)).toHaveLength(1);
    });
});

// ─── Tests: validateRecipe ────────────────────────────────

describe('validateRecipe', () => {
    it('passes for a valid recipe', () => {
        const { valid } = validateRecipe({ name: 'IPA', batch_size: 20, ingredients: [], mash_steps: [] });
        expect(valid).toBe(true);
    });

    it('fails when name is empty', () => {
        const { valid, errors } = validateRecipe({ name: '', batch_size: 20, ingredients: [], mash_steps: [] });
        expect(valid).toBe(false);
        expect(errors.some(e => e.includes('name'))).toBe(true);
    });

    it('fails when batch_size is 0', () => {
        const { valid } = validateRecipe({ name: 'X', batch_size: 0, ingredients: [], mash_steps: [] });
        expect(valid).toBe(false);
    });

    it('fails when ingredients is not an array', () => {
        const { valid } = validateRecipe({ name: 'X', batch_size: 20, ingredients: null, mash_steps: [] });
        expect(valid).toBe(false);
    });
});
