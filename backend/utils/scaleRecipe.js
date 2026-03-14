/**
 * Recipe scaling utility.
 *
 * Rules:
 *   - Ingredients (fermentables + yeasts) and hop amounts scale proportionally.
 *   - Boil time, mash step temperatures and times DO NOT scale
 *     (process parameters are independent of batch volume).
 *   - OG, FG, IBU, ABV stay the same — when both volume and ingredients scale
 *     equally the gravity/bitterness ratios are preserved.
 */

function round(value, decimals) {
    const factor = 10 ** decimals;
    return Math.round(value * factor) / factor;
}

/**
 * Scale a recipe to a new batch size and return a new recipe object (not saved).
 *
 * @param {Object} recipe        - Recipe row from DB (JSON fields already parsed).
 * @param {number} targetBatchSize - Desired batch size in litres.
 * @returns {Object} Scaled recipe (no `id`, no `created_at`, no `updated_at`).
 * @throws {Error} If targetBatchSize is invalid or recipe.batch_size is missing/zero.
 */
export function scaleRecipe(recipe, targetBatchSize) {
    const sourceBatchSize = parseFloat(recipe.batch_size);

    if (!sourceBatchSize || sourceBatchSize <= 0) {
        throw new Error('Recipe batch_size must be a positive number');
    }
    if (!targetBatchSize || targetBatchSize <= 0 || !isFinite(targetBatchSize)) {
        throw new Error('targetBatchSize must be a positive finite number');
    }

    const factor = targetBatchSize / sourceBatchSize;

    // Parse JSON fields if they arrive as strings (raw DB row)
    const ingredients  = typeof recipe.ingredients  === 'string' ? JSON.parse(recipe.ingredients  || '[]') : (recipe.ingredients  || []);
    const hopAdditions = typeof recipe.hop_additions === 'string' ? JSON.parse(recipe.hop_additions || '[]') : (recipe.hop_additions || []);
    const mashSteps    = typeof recipe.mash_steps    === 'string' ? JSON.parse(recipe.mash_steps    || '[]') : (recipe.mash_steps    || []);

    const scaledIngredients = ingredients.map(ing => ({
        ...ing,
        amount: round(parseFloat(ing.amount || 0) * factor, 3),
    }));

    const scaledHops = hopAdditions.map(hop => ({
        ...hop,
        amount: round(parseFloat(hop.amount || 0) * factor, 1),
        // time (minutes in kettle) and alpha acid — unchanged
    }));

    // Mash steps: temp and duration are process constants — NOT scaled
    const scaledMashSteps = mashSteps.map(step => ({ ...step }));

    // eslint-disable-next-line no-unused-vars
    const { id, created_at, updated_at, user_id, ...rest } = recipe;

    return {
        ...rest,
        name:          `${recipe.name} (${targetBatchSize}л)`,
        batch_size:    targetBatchSize,
        ingredients:   scaledIngredients,
        hop_additions: scaledHops,
        mash_steps:    scaledMashSteps,
        // og, fg, ibu, abv, boil_time — preserved unchanged
    };
}
