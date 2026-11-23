import { getDb } from '../db/database.js';

export const notificationDelivery = {
    claim(eventId, userId, now = Date.now()) {
        return getDb().transaction(() => {
            const current = getDb().prepare('SELECT * FROM notification_delivery WHERE event_id=? AND channel=?').get(eventId, 'telegram');
            if (current && current.user_id !== userId) throw new Error('Notification owner mismatch');
            if (current && ['sent', 'skipped'].includes(current.status)) return 'done';
            if (current?.status === 'sending' && current.lease_until > now) return 'busy';
            getDb().prepare(`INSERT INTO notification_delivery(event_id,channel,user_id,status,attempts,lease_until,updated_at)
                VALUES(?,'telegram',?,'sending',1,?,?) ON CONFLICT(event_id,channel) DO UPDATE SET
                status='sending',attempts=attempts+1,lease_until=excluded.lease_until,updated_at=excluded.updated_at`)
                .run(eventId, userId, now + 30000, now);
            return 'claimed';
        })();
    },
    finish(eventId, status, now = Date.now()) {
        if (!['sent', 'skipped', 'failed'].includes(status)) throw new Error('Invalid notification status');
        getDb().prepare("UPDATE notification_delivery SET status=?,lease_until=0,updated_at=? WHERE event_id=? AND channel='telegram'").run(status, now, eventId);
    },
    cleanup(before = Date.now() - 45 * 86400000) {
        return getDb().prepare('DELETE FROM notification_delivery WHERE updated_at < ?').run(before);
    },
};
