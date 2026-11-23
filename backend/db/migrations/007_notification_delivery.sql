-- Direct and Kafka sends share this ledger across transport cutovers.
CREATE TABLE IF NOT EXISTS notification_delivery (
    event_id TEXT NOT NULL,
    channel TEXT NOT NULL DEFAULT 'telegram',
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status TEXT NOT NULL CHECK(status IN ('sending', 'sent', 'skipped', 'failed')),
    attempts INTEGER NOT NULL DEFAULT 0,
    lease_until INTEGER NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY(event_id, channel)
);
CREATE INDEX IF NOT EXISTS idx_notification_delivery_updated ON notification_delivery(updated_at);
