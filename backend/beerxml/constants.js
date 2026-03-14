/**
 * BeerXML 1.0 constants and mappings.
 *
 * Unit conventions:
 *   BeerXML uses KG for ALL weights (fermentables AND hops).
 *   OrangeBrew stores fermentable amounts in KG, hop amounts in GRAMS.
 *   ⟹ hop import:  beerxml_kg  × 1000  → OB grams
 *   ⟹ hop export:  OB_grams   / 1000  → beerxml_kg
 *   Temperatures: both in °C (no conversion needed).
 *   Times:        both in minutes (no conversion needed).
 *   Volumes:      both in litres (no conversion needed).
 */

export const BEERXML_VERSION = 1;

// ─── Fermentable types ────────────────────────────────────
export const FERMENTABLE_TYPE_TO_OB = {
    'Grain':       'grain',
    'Sugar':       'sugar',
    'Extract':     'extract',
    'Dry Extract': 'dry_extract',
    'Adjunct':     'adjunct',
};

export const OB_TO_FERMENTABLE_TYPE = Object.fromEntries(
    Object.entries(FERMENTABLE_TYPE_TO_OB).map(([k, v]) => [v, k])
);

// ─── Hop use types ────────────────────────────────────────
export const HOP_USE_TO_OB = {
    'Boil':       'boil',
    'Dry Hop':    'dry_hop',
    'Mash':       'mash',
    'First Wort': 'first_wort',
    'Aroma':      'aroma',
};

export const OB_TO_HOP_USE = Object.fromEntries(
    Object.entries(HOP_USE_TO_OB).map(([k, v]) => [v, k])
);

// ─── Yeast types ──────────────────────────────────────────
export const YEAST_TYPE_TO_OB = {
    'Ale':       'ale',
    'Lager':     'lager',
    'Wheat':     'wheat',
    'Wine':      'wine',
    'Champagne': 'champagne',
};

export const OB_TO_YEAST_TYPE = Object.fromEntries(
    Object.entries(YEAST_TYPE_TO_OB).map(([k, v]) => [v, k])
);

// ─── Yeast forms ──────────────────────────────────────────
export const YEAST_FORM_TO_OB = {
    'Liquid':  'liquid',
    'Dry':     'dry',
    'Slant':   'slant',
    'Culture': 'culture',
};

export const OB_TO_YEAST_FORM = Object.fromEntries(
    Object.entries(YEAST_FORM_TO_OB).map(([k, v]) => [v, k])
);

// ─── Required BeerXML RECIPE fields ──────────────────────
export const REQUIRED_RECIPE_FIELDS = [
    'NAME', 'VERSION', 'TYPE', 'BREWER',
    'BATCH_SIZE', 'BOIL_SIZE', 'BOIL_TIME', 'EFFICIENCY',
];

// ─── Unit conversion helpers ──────────────────────────────
/** BeerXML hop kg → OrangeBrew grams */
export const hopKgToGrams  = (kg)  => kg  * 1000;
/** OrangeBrew hop grams → BeerXML kg */
export const hopGramsToKg  = (g)   => g   / 1000;
