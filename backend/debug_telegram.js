import initSqlJs from 'sql.js';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function testTelegram() {
    const DB_PATH = './data/orangebrew.db';
    const SQL = await initSqlJs();
    const dbData = readFileSync(DB_PATH);
    const db = new SQL.Database(dbData);

    const row = db.prepare('SELECT value FROM settings WHERE key = ?').getAsObject(['telegram']);
    const config = JSON.parse(row.value);

    console.log('Using config:', { ...config, botToken: config.botToken ? '***' : null });

    if (!config.enabled || !config.botToken || !config.chatId) {
        console.error('Telegram is not fully configured or enabled in DB');
        return;
    }

    const url = `https://api.telegram.org/bot${config.botToken}/sendMessage`;
    const payload = {
        chat_id: config.chatId,
        text: '🛠 *OrangeBrew Debug Test*\n\nIf you see this, the Telegram service can reach the API.',
        parse_mode: 'Markdown'
    };

    console.log('Sending request to Telegram API...');
    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        console.log('Response status:', res.status);
        console.log('Response data:', JSON.stringify(data, null, 2));
    } catch (err) {
        console.error('Fetch failed:', err.message);
        if (err.cause) console.error('Cause:', err.cause);
    }
}

testTelegram();
