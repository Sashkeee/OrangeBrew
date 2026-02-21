import { getDb } from '../db/database.js';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'fallback_super_secret_for_orangebrew';

export async function addDefaultAdminIfNoneExists() {
    const db = getDb();
    const countRow = db.prepare('SELECT COUNT(*) as count FROM users').get();

    if (countRow.count === 0) {
        console.log('[Auth] No users found. Creating default admin (admin / admin123)...');
        const salt = await bcrypt.genSalt(10);
        const hash = await bcrypt.hash('admin123', salt);

        db.prepare(`
            INSERT INTO users (username, password_hash, role) 
            VALUES (?, ?, ?)
        `).run('admin', hash, 'admin');
        console.log('[Auth] Default admin created successfully. PLEASE CHANGE PASSWORD AFTER LOGIN!');
    }
}
