/**
 * BeerXML ↔ OrangeBrew mapper.
 *
 * beerxmlToOrangeBrew — wraps parser output, used internally by routes.
 * orangeBrewToBeerxml  — converts an OB recipe to a JS object ready for generator.
 */

import {
    BEERXML_VERSION,
    OB_TO_FERMENTABLE_TYPE,
    OB_TO_HOP_USE,
    OB_TO_YEAST_TYPE,
    OB_TO_YEAST_FORM,
    hopGramsToKg,
} from './constants.js';
import { parseXmlString } from './parser.js';

// ─── BeerXML → OrangeBrew ─────────────────────────────────

/**
 * Parse a BeerXML XML string and return OrangeBrew recipe objects.
 * Thin wrapper around parseXmlString; kept here for API symmetry.
 *
 * @param {string} xmlString
 * @returns {Promise<Array<Object>>}
 */
export async function beerxmlToOrangeBrew(xmlString) {
    return parseXmlString(xmlString);
}

// ─── OrangeBrew → BeerXML ─────────────────────────────────

function parseIfString(val) {
    if (typeof val === 'string') return JSON.parse(val || '[]');
    return val || [];
}

/**
 * Convert a single OrangeBrew recipe (DB row, JSON fields parsed or raw strings)
 * to a plain JS object matching BeerXML 1.0 schema.
 * The object is NOT an XML string yet — pass it to generator.js.
 *
 * @param {Object} recipe  - OrangeBrew recipe (from DB)
 * @returns {Object}       - BeerXML-structured JS object
 */
export function orangeBrewToBeerxml(recipe) {
    const ingredients  = parseIfString(recipe.ingredients);
    const hopAdditions = parseIfString(recipe.hop_additions);
    const mashSteps    = parseIfString(recipe.mash_steps);

    // Split ingredients into fermentables and yeasts
    const fermentables = ingredients.filter(i => i.type !== 'yeast');
    const yeasts       = ingredients.filter(i => i.type === 'yeast');

    const bxFermentables = fermentables.map(f => ({
        NAME:   f.name   || '',
        VERSION: BEERXML_VERSION,
        TYPE:   OB_TO_FERMENTABLE_TYPE[f.type] || 'Grain',
        AMOUNT: parseFloat(f.amount || 0).toFixed(3),   // kg
    }));

    const bxHops = hopAdditions.map(h => ({
        NAME:    h.name || '',
        VERSION: BEERXML_VERSION,
        AMOUNT:  hopGramsToKg(parseFloat(h.amount || 0)).toFixed(4), // g → kg
        USE:     OB_TO_HOP_USE[h.type] || 'Boil',
        TIME:    parseInt(h.time || 0, 10),
        ...(h.alpha !== undefined ? { ALPHA: parseFloat(h.alpha).toFixed(1) } : {}),
    }));

    const bxYeasts = yeasts.map(y => ({
        NAME:        y.name || '',
        VERSION:     BEERXML_VERSION,
        TYPE:        OB_TO_YEAST_TYPE[y.yeast_type] || 'Ale',
        FORM:        OB_TO_YEAST_FORM[y.form]       || 'Dry',
        AMOUNT:      parseFloat(y.amount || 0).toFixed(3),
        LABORATORY:  y.lab || '',
    }));

    const bxMashSteps = mashSteps.map(s => ({
        NAME:      s.name || 'Mash Step',
        TYPE:      'Infusion',
        STEP_TEMP: parseFloat(s.temp     || 0).toFixed(1),
        STEP_TIME: parseInt(s.duration   || 0, 10),
    }));

    return {
        NAME:       recipe.name       || '',
        VERSION:    BEERXML_VERSION,
        TYPE:       'All Grain',
        BREWER:     'OrangeBrew User',
        BATCH_SIZE: parseFloat(recipe.batch_size  || 20).toFixed(1),
        BOIL_SIZE:  parseFloat((recipe.batch_size || 20) * 1.2).toFixed(1), // estimate
        BOIL_TIME:  parseInt(recipe.boil_time  || 60, 10),
        EFFICIENCY: parseFloat(recipe.efficiency || 75).toFixed(1),
        OG:         parseFloat(recipe.og  || 0).toFixed(3),
        FG:         parseFloat(recipe.fg  || 0).toFixed(3),
        IBU:        parseFloat(recipe.ibu || 0).toFixed(1),
        EST_ABV:    parseFloat(recipe.abv || 0).toFixed(1),
        NOTES:      recipe.notes || '',
        STYLE: recipe.style ? { NAME: recipe.style, VERSION: BEERXML_VERSION } : undefined,
        FERMENTABLES: bxFermentables.length ? { FERMENTABLE: bxFermentables } : { FERMENTABLE: [] },
        HOPS:         bxHops.length       ? { HOP:         bxHops }         : { HOP:         [] },
        YEASTS:       bxYeasts.length     ? { YEAST:       bxYeasts }       : { YEAST:       [] },
        MASH: {
            NAME: 'Single Infusion',
            VERSION: BEERXML_VERSION,
            GRAIN_TEMP: '18.0',
            MASH_STEPS: { MASH_STEP: bxMashSteps },
        },
    };
}
