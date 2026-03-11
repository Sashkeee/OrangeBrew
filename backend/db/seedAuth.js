import { getDb } from '../db/database.js';
import bcrypt from 'bcrypt';

export async function addDefaultAdminIfNoneExists() {
    const db = getDb();
    const countRow = db.prepare('SELECT COUNT(*) as count FROM users').get();

    if (countRow.count === 0) {
        console.log('[Auth] No users found. Creating default admin (admin / admin123)...');
        const hash = await bcrypt.hash('admin123', 10);

        // Trial subscription seeded to far future for the built-in admin
        const expiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();

        db.prepare(`
            INSERT INTO users (username, password, role, subscription_tier, subscription_status, subscription_expires_at)
            VALUES (?, ?, 'admin', 'pro', 'active', ?)
        `).run('admin', hash, expiresAt);

        console.log('[Auth] Default admin created successfully. PLEASE CHANGE PASSWORD AFTER LOGIN!');
    }
}
