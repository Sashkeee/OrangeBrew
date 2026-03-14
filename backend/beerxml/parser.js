/**
 * BeerXML 1.0 parser.
 *
 * Parses an XML string into a list of OrangeBrew recipe objects.
 * All conversions (units, types) are handled here; the caller gets
 * clean OB-format data ready for DB insertion.
 */

import { parseStringPromise } from 'xml2js';
import {
    FERMENTABLE_TYPE_TO_OB,
    HOP_USE_TO_OB,
    YEAST_TYPE_TO_OB,
    YEAST_FORM_TO_OB,
    hopKgToGrams,
} from './constants.js';

// ─── Internal helpers ─────────────────────────────────────

/** Ensure node is always an array (xml2js may return object for single child). */
function toArray(node) {
    if (!node) return [];
    return Array.isArray(node) ? node : [node];
}

function safeFloat(val, fallback = 0) {
    const n = parseFloat(val);
    return isFinite(n) ? n : fallback;
}

function safeInt(val, fallback = 0) {
    const n = parseInt(val, 10);
    return isFinite(n) ? n : fallback;
}

// ─── Section parsers ──────────────────────────────────────

/**
 * Parse FERMENTABLES section into OrangeBrew ingredient objects.
 * @param {*} node - FERMENTABLES node from xml2js (object or array)
 * @returns {Array<{name, amount, unit, type}>}
 */
export function parseFermentables(node) {
    return toArray(node?.FERMENTABLE).map(F => ({
        name:   String(F.NAME   || '').trim(),
        amount: safeFloat(F.AMOUNT, 0),   // already in kg
        unit:   'kg',
        type:   FERMENTABLE_TYPE_TO_OB[F.TYPE] || 'grain',
    }));
}

/**
 * Parse HOPS section.
 * CRITICAL: BeerXML stores hop amounts in KG → convert to grams for OrangeBrew.
 * @param {*} node - HOPS node
 * @returns {Array<{name, amount, time, type, alpha?}>}
 */
export function parseHops(node) {
    return toArray(node?.HOP).map(H => ({
        name:   String(H.NAME || '').trim(),
        amount: hopKgToGrams(safeFloat(H.AMOUNT, 0)), // kg → g
        time:   safeInt(H.TIME, 0),
        type:   HOP_USE_TO_OB[H.USE] || 'boil',
        ...(H.ALPHA !== undefined ? { alpha: safeFloat(H.ALPHA) } : {}),
    }));
}

/**
 * Parse YEASTS section into OrangeBrew ingredient objects (type='yeast').
 * @param {*} node - YEASTS node
 * @returns {Array}
 */
export function parseYeasts(node) {
    return toArray(node?.YEAST).map(Y => ({
        name:   String(Y.NAME || '').trim(),
        lab:    String(Y.LABORATORY || '').trim(),
        type:   'yeast',
        yeast_type: YEAST_TYPE_TO_OB[Y.TYPE] || 'ale',
        form:   YEAST_FORM_TO_OB[Y.FORM]   || 'dry',
        amount: safeFloat(Y.AMOUNT, 0),
    }));
}

/**
 * Parse MASH section into OrangeBrew mash steps.
 * @param {*} node - MASH node
 * @returns {Array<{name, temp, duration}>}
 */
export function parseMashSteps(node) {
    const steps = toArray(node?.MASH_STEPS?.MASH_STEP);
    return steps
        .map(MS => ({
            name:     String(MS.NAME || 'Mash Step').trim(),
            temp:     safeFloat(MS.STEP_TEMP, 0),
            duration: safeInt(MS.STEP_TIME, 0),
        }))
        .filter(s => s.temp > 0 && s.temp < 120 && s.duration > 0);
}

/**
 * Collect rarely-used sections (MISCS, WATERS, STYLE) as a JSON-serialised string
 * appended to notes so no data is silently dropped on import.
 * @param {Object} R - recipe node
 * @returns {string}
 */
export function parseExtras(R) {
    const sections = {};
    if (R.MISCS)  sections.MISCS  = R.MISCS;
    if (R.WATERS) sections.WATERS = R.WATERS;
    if (R.STYLE)  sections.STYLE  = R.STYLE;
    if (Object.keys(sections).length === 0) return '';
    return '\n--- BeerXML Extras ---\n' + JSON.stringify(sections, null, 2);
}

/**
 * Light validation of a parsed OrangeBrew recipe object.
 * @param {Object} recipe
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateRecipe(recipe) {
    const errors = [];
    if (!recipe.name || !recipe.name.trim()) errors.push('name is required');
    if (!recipe.batch_size || recipe.batch_size <= 0) errors.push('batch_size must be > 0');
    if (!Array.isArray(recipe.ingredients)) errors.push('ingredients must be an array');
    if (!Array.isArray(recipe.mash_steps))  errors.push('mash_steps must be an array');
    return { valid: errors.length === 0, errors };
}

// ─── Main entry point ─────────────────────────────────────

/**
 * Parse a BeerXML string into a list of OrangeBrew recipe objects.
 *
 * @param {string} xmlString
 * @returns {Promise<Array<Object>>} Array of OrangeBrew recipe objects.
 * @throws {Error} If XML is malformed or missing RECIPES element.
 */
export async function parseXmlString(xmlString) {
    let raw;
    try {
        raw = await parseStringPromise(xmlString, {
            explicitArray: false,
            trim: true,
            explicitCharkey: false,
        });
    } catch (e) {
        throw new Error(`Invalid XML: ${e.message}`);
    }

    if (!raw?.RECIPES?.RECIPE) {
        throw new Error('Invalid BeerXML: missing <RECIPES><RECIPE> structure');
    }

    const recipeNodes = toArray(raw.RECIPES.RECIPE);

    return recipeNodes.map(R => {
        const fermentables = parseFermentables(R.FERMENTABLES);
        const yeasts       = parseYeasts(R.YEASTS);
        const hops         = parseHops(R.HOPS);
        const mashSteps    = parseMashSteps(R.MASH);
        const extras       = parseExtras(R);

        return {
            name:          String(R.NAME  || '').trim(),
            style:         String(R.STYLE?.NAME || R.TYPE || '').trim(),
            og:            safeFloat(R.OG,      0),
            fg:            safeFloat(R.FG,      0),
            ibu:           safeFloat(R.IBU,     0),
            abv:           safeFloat(R.EST_ABV, 0),
            batch_size:    safeFloat(R.BATCH_SIZE, 20),
            boil_time:     safeInt(R.BOIL_TIME, 60),
            efficiency:    safeFloat(R.EFFICIENCY, 75),
            notes:         (String(R.NOTES || '').trim() + extras).trim(),
            ingredients:   [...fermentables, ...yeasts],
            mash_steps:    mashSteps,
            hop_additions: hops,
        };
    });
}
