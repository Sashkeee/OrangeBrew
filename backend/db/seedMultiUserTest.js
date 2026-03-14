/**
 * seedMultiUserTest.js — seeds 3 test users + devices + recipes for multi-user testing.
 *
 * Run via: SEED_MULTIUSER_TEST=true node server.js
 * Or directly: node db/seedMultiUserTest.js
 *
 * Creates:
 *   Users:   alice, bob, carol  (passwords: test123)
 *   Devices: device-alice, device-bob, device-carol
 *   Recipes: 1 per user (public)
 *
 * SAFE: never modifies admin (id=1) or existing data.
 */

import { userQueries, recipeQueries, deviceQueries } from './database.js';
import bcrypt from 'bcryptjs';

const TEST_USERS = [
    { username: 'alice', password: 'test123', role: 'user' },
    { username: 'bob',   password: 'test123', role: 'user' },
    { username: 'carol', password: 'test123', role: 'user' },
];

const TEST_RECIPES = [
    {
        name: 'Alice IPA', style: 'IPA',
        batch_size: 20, boil_time: 60,
        og: 1.065, fg: 1.012, ibu: 55, abv: 7.0,
        notes: 'Alice test recipe',
        ingredients:   JSON.stringify([{ name: 'Pale Malt', amount: 4.5, type: 'grain' }]),
        mash_steps:    JSON.stringify([{ name: 'Saccharification', temp: 66, duration: 60 }]),
        hop_additions: JSON.stringify([{ name: 'Citra', amount: 30, time: 60, type: 'boil' }]),
    },
    {
        name: 'Bob Stout', style: 'Stout',
        batch_size: 25, boil_time: 90,
        og: 1.070, fg: 1.018, ibu: 35, abv: 7.0,
        notes: 'Bob test recipe',
        ingredients:   JSON.stringify([{ name: 'Maris Otter', amount: 5.5, type: 'grain' }, { name: 'Roasted Barley', amount: 0.5, type: 'grain' }]),
        mash_steps:    JSON.stringify([{ name: 'Mash', temp: 68, duration: 75 }]),
        hop_additions: JSON.stringify([{ name: 'Fuggle', amount: 50, time: 90, type: 'boil' }]),
    },
    {
        name: 'Carol Pilsner', style: 'Pilsner',
        batch_size: 30, boil_time: 70,
        og: 1.048, fg: 1.010, ibu: 25, abv: 5.0,
        notes: 'Carol test recipe',
        ingredients:   JSON.stringify([{ name: 'Pilsner Malt', amount: 6.0, type: 'grain' }]),
        mash_steps:    JSON.stringify([{ name: 'Protein Rest', temp: 52, duration: 15 }, { name: 'Saccharification', temp: 63, duration: 60 }]),
        hop_additions: JSON.stringify([{ name: 'Saaz', amount: 60, time: 70, type: 'boil' }]),
    },
];

export async function seedMultiUserTest() {
    console.log('[Seed] Starting multi-user test seed...');

    const createdUsers = [];

    for (let i = 0; i < TEST_USERS.length; i++) {
        const { username, password, role } = TEST_USERS[i];

        // Skip if user already exists
        const existing = userQueries.getByUsername(username);
        if (existing) {
            console.log(`[Seed] User '${username}' already exists — skipping`);
            createdUsers.push(existing);
            continue;
        }

        const passwordHash = bcrypt.hashSync(password, 10);
        userQueries.create({ username, password_hash: passwordHash, role });
        const user = userQueries.getByUsername(username);
        createdUsers.push(user);
        console.log(`[Seed] Created user: ${username} (id=${user.id})`);

        // Create device for user
        const deviceId = `device-${username}`;
        const apiKey   = `test-api-key-${username}`;
        deviceQueries.upsert(deviceId, `${username}'s ESP32`, user.id, apiKey, 'boiler');
        console.log(`[Seed] Created device: ${deviceId}`);

        // Create recipe for user (public)
        const recipe = recipeQueries.create(TEST_RECIPES[i], user.id);
        recipeQueries.setPublic(recipe.id, user.id, true);
        console.log(`[Seed] Created public recipe: ${recipe.name} (id=${recipe.id})`);
    }

    console.log('[Seed] Multi-user test seed complete.');
    return createdUsers;
}

// Run directly: node db/seedMultiUserTest.js
if (process.argv[1]?.endsWith('seedMultiUserTest.js')) {
    import('./database.js').then(async ({ initDatabase, closeDatabase }) => {
        const dbPath = process.env.DB_PATH || './data/orangebrew.db';
        await initDatabase(dbPath);
        await seedMultiUserTest();
        closeDatabase();
        process.exit(0);
    });
}
