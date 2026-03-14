import { describe, it, expect } from 'vitest';
import { parseStringPromise } from 'xml2js';
import { generateBeerXmlString, generateMultipleRecipes } from '../beerxml/generator.js';
import { orangeBrewToBeerxml } from '../beerxml/mapper.js';

const OB_RECIPE = {
    name: 'Test Stout',
    style: 'Stout',
    batch_size: 20,
    boil_time: 90,
    efficiency: 72,
    og: 1.072,
    fg: 1.018,
    ibu: 35,
    abv: 7.1,
    notes: 'Rich & roasty — contains <special> chars & "quotes"',
    ingredients: [
        { name: 'Maris Otter', amount: 6.0, unit: 'kg', type: 'grain' },
    ],
    hop_additions: [
        { name: 'Fuggles', amount: 50.0, time: 60, type: 'boil', alpha: 4.5 },
    ],
    mash_steps: [
        { name: 'Sacc Rest', temp: 68, duration: 75 },
    ],
};

describe('generateBeerXmlString', () => {
    it('produces valid XML (parseable by xml2js)', async () => {
        const xml = generateBeerXmlString(orangeBrewToBeerxml(OB_RECIPE));
        await expect(parseStringPromise(xml)).resolves.toBeDefined();
    });

    it('starts with XML declaration', () => {
        const xml = generateBeerXmlString(orangeBrewToBeerxml(OB_RECIPE));
        expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    });

    it('wraps content in <RECIPES><RECIPE>', () => {
        const xml = generateBeerXmlString(orangeBrewToBeerxml(OB_RECIPE));
        expect(xml).toContain('<RECIPES>');
        expect(xml).toContain('<RECIPE>');
        expect(xml).toContain('</RECIPE>');
        expect(xml).toContain('</RECIPES>');
    });

    it('escapes special characters in text fields', () => {
        const xml = generateBeerXmlString(orangeBrewToBeerxml(OB_RECIPE));
        expect(xml).toContain('&amp;');      // & → &amp;
        expect(xml).toContain('&lt;special&gt;'); // <special>
        expect(xml).not.toContain('"quotes"'); // raw " should be escaped or in CDATA
    });

    it('includes recipe name', () => {
        const xml = generateBeerXmlString(orangeBrewToBeerxml(OB_RECIPE));
        expect(xml).toContain('<NAME>Test Stout</NAME>');
    });
});

describe('generateMultipleRecipes', () => {
    it('wraps all recipes inside one <RECIPES>', () => {
        const r1 = orangeBrewToBeerxml(OB_RECIPE);
        const r2 = orangeBrewToBeerxml({ ...OB_RECIPE, name: 'Second Recipe', ingredients: [], hop_additions: [], mash_steps: [] });
        const xml = generateMultipleRecipes([r1, r2]);

        const recipeCount = (xml.match(/<RECIPE>/g) || []).length;
        expect(recipeCount).toBe(2);
        expect((xml.match(/<RECIPES>/g) || []).length).toBe(1);
    });

    it('produces valid parseable XML for multiple recipes', async () => {
        const r1 = orangeBrewToBeerxml(OB_RECIPE);
        const r2 = orangeBrewToBeerxml({ ...OB_RECIPE, name: 'Another', ingredients: [], hop_additions: [], mash_steps: [] });
        await expect(parseStringPromise(generateMultipleRecipes([r1, r2]))).resolves.toBeDefined();
    });
});
