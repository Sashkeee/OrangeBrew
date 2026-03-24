/**
 * Создаёт 3 тестовых пользователя для стенда.
 * Запуск: node backend/db/seedTestUsers.js
 *
 * Логины:
 *   user1 / test123
 *   user2 / test123
 *   user3 / test123
 */

import { getDb, initDatabase } from './database.js';
import bcrypt from 'bcrypt';

await initDatabase('./data/orangebrew.db');
const db = getDb();

const users = [
    { username: 'user1', email: 'user1@test.local' },
    { username: 'user2', email: 'user2@test.local' },
    { username: 'user3', email: 'user3@test.local' },
];

const password  = 'test123';
const expiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();

const insert = db.prepare(`
    INSERT OR IGNORE INTO users
        (username, email, password_hash, role, subscription_tier, subscription_status, subscription_expires_at, consent_given_at)
    VALUES
        (?, ?, ?, 'user', 'pro', 'active', ?, datetime('now'))
`);

for (const u of users) {
    const hash = await bcrypt.hash(password, 10);
    const result = insert.run(u.username, u.email, hash, expiresAt);
    if (result.changes > 0) {
        console.log(`✅ Создан: ${u.username} / ${password}`);
    } else {
        console.log(`⏭  Уже существует: ${u.username} — пропущен`);
    }
}

console.log('\nГотово. Можно логиниться на /login');
