/**
 * BeerXML 1.0 XML generator.
 *
 * Converts a BeerXML-structured JS object (from mapper.js) into a well-formatted
 * XML string. Built without extra dependencies — uses simple recursive serialisation.
 */

// ─── XML escaping ─────────────────────────────────────────

const XML_ESCAPE_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' };

function escapeXml(str) {
    return String(str).replace(/[&<>"']/g, c => XML_ESCAPE_MAP[c]);
}

// ─── Recursive serialiser ─────────────────────────────────

/**
 * Serialise a JS value to XML lines with the given tag name and indentation.
 *
 * Rules:
 *  - null/undefined → skip
 *  - Array          → emit each element wrapped in tagName
 *  - Plain object   → emit opening tag, recurse for each child key, closing tag
 *  - Scalar         → emit <tag>value</tag>
 */
function serialise(tagName, value, indent = '') {
    if (value === null || value === undefined) return '';

    if (Array.isArray(value)) {
        return value.map(item => serialise(tagName, item, indent)).join('\n');
    }

    if (typeof value === 'object') {
        const children = Object.entries(value)
            .filter(([, v]) => v !== null && v !== undefined)
            .map(([k, v]) => serialise(k, v, indent + '  '))
            .filter(Boolean)
            .join('\n');
        return `${indent}<${tagName}>\n${children}\n${indent}</${tagName}>`;
    }

    // Scalar: string, number, boolean
    return `${indent}<${tagName}>${escapeXml(value)}</${tagName}>`;
}

// ─── Public API ───────────────────────────────────────────

/**
 * Generate a BeerXML string for a single recipe.
 *
 * @param {Object} recipeObj - Output of mapper.orangeBrewToBeerxml()
 * @returns {string} Full BeerXML XML string (UTF-8).
 */
export function generateBeerXmlString(recipeObj) {
    const recipeXml = serialise('RECIPE', recipeObj, '  ');
    return [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<RECIPES>',
        recipeXml,
        '</RECIPES>',
    ].join('\n');
}

/**
 * Generate a BeerXML string for multiple recipes in one file.
 *
 * @param {Array<Object>} recipeObjects - Array of mapper.orangeBrewToBeerxml() outputs
 * @returns {string} BeerXML XML string.
 */
export function generateMultipleRecipes(recipeObjects) {
    const body = recipeObjects
        .map(r => serialise('RECIPE', r, '  '))
        .join('\n');
    return [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<RECIPES>',
        body,
        '</RECIPES>',
    ].join('\n');
}
