-- Migration 004: Audit log + user ban support

CREATE TABLE IF NOT EXISTS audit_log (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    action     TEXT    NOT NULL,
    detail     TEXT    DEFAULT '',
    admin_id   INTEGER REFERENCES users(id) ON DELETE SET NULL,
    ip         TEXT,
    created_at TEXT    DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_audit_user    ON audit_log(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at);

-- Ban support
ALTER TABLE users ADD COLUMN banned_at TEXT;
ALTER TABLE users ADD COLUMN banned_reason TEXT DEFAULT '';
