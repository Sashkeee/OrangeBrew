/**
 * multiUserTestUtils.js — helpers for multi-user integration tests.
 */

import jwt from 'jsonwebtoken';
import { userQueries, recipeQueries, deviceQueries } from '../db/database.js';

const JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

/**
 * Generate a JWT token for a user (matches auth middleware format).
 * @param {number} userId
 * @param {string} username
 * @param {string} role
 */
export function generateToken(userId, username = 'testuser', role = 'user') {
    return jwt.sign({ id: userId, username, role }, JWT_SECRET, { expiresIn: '1h' });
}

/**
 * Create a test user (or return existing one).
 * @param {string} username
 * @param {string} role
 * @returns {{ id, username, token }}
 */
export function createTestUser(username, role = 'user') {
    const existing = userQueries.getByUsername(username);
    if (existing) {
        return { ...existing, token: generateToken(existing.id, existing.username, existing.role) };
    }
    userQueries.create({ username, password_hash: 'test-hash', role });
    const user = userQueries.getByUsername(username);
    return { ...user, token: generateToken(user.id, user.username, user.role) };
}

/**
 * Create a test recipe for a user (public or private).
 * @param {number} userId
 * @param {Partial<object>} overrides
 * @returns {object} created recipe
 */
export function createTestRecipe(userId, overrides = {}) {
    const recipe = recipeQueries.create({
        name:          `Test Recipe ${Date.now()}`,
        style:         'IPA',
        batch_size:    20,
        boil_time:     60,
        og:            1.060,
        fg:            1.012,
        ibu:           40,
        abv:           6.2,
        notes:         '',
        ingredients:   [],
        mash_steps:    [],
        hop_additions: [],
        ...overrides,
    }, userId);
    return recipe;
}

/**
 * Create a test device for a user.
 * @param {string} deviceId
 * @param {number} userId
 * @param {string} apiKey
 */
export function createTestDevice(deviceId, userId, apiKey = null) {
    const key = apiKey || `test-key-${deviceId}`;
    deviceQueries.upsert(deviceId, `Device ${deviceId}`, userId, key, 'boiler');
    return { deviceId, userId, apiKey: key };
}
