-- Migration 001: Multi-tenancy
-- Adds user_id to all user-owned entities.
-- Adds subscription fields to users.
-- Adds per-device api_key.
-- Adds device_pairings table.
-- Existing data is preserved (user_id defaults to NULL; seeded to admin in database.js post-migration).

-- ─── users: subscription fields ───────────────────────────
ALTER TABLE users ADD COLUMN email            TEXT;
ALTER TABLE users ADD COLUMN subscription_tier   TEXT DEFAULT 'trial';
ALTER TABLE users ADD COLUMN subscription_status TEXT DEFAULT 'active';
ALTER TABLE users ADD COLUMN subscription_expires_at TEXT;
ALTER TABLE users ADD COLUMN consent_given_at TEXT;

-- ─── devices: bind to owner, give per-device api key ──────
ALTER TABLE devices ADD COLUMN user_id  INTEGER REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE devices ADD COLUMN api_key  TEXT UNIQUE;

-- ─── recipes: isolate by user ─────────────────────────────
ALTER TABLE recipes ADD COLUMN user_id INTEGER REFERENCES users(id) ON DELETE CASCADE;

-- ─── brew_sessions: isolate by user ───────────────────────
ALTER TABLE brew_sessions ADD COLUMN user_id INTEGER REFERENCES users(id) ON DELETE CASCADE;

-- ─── settings: make per-user (add user_id column) ─────────
-- Settings become user-scoped: PRIMARY KEY changes to (key, user_id).
-- We create a new table and migrate data.
CREATE TABLE IF NOT EXISTS settings_v2 (
    key        TEXT    NOT NULL,
    user_id    INTEGER REFERENCES users(id) ON DELETE CASCADE,
    value      TEXT    NOT NULL,
    updated_at TEXT    DEFAULT (datetime('now')),
    PRIMARY KEY (key, user_id)
);
-- Copy global settings (user_id = NULL = system-wide defaults)
INSERT OR IGNORE INTO settings_v2 (key, user_id, value, updated_at)
SELECT key, NULL, value, updated_at FROM settings;

-- ─── device_pairings: pairing codes ───────────────────────
CREATE TABLE IF NOT EXISTS device_pairings (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    pairing_code TEXT    NOT NULL UNIQUE,
    expires_at   TEXT    NOT NULL,
    used_at      TEXT,
    device_id    TEXT
);

-- ─── payments: payment history ────────────────────────────
CREATE TABLE IF NOT EXISTS payments (
    id           TEXT    PRIMARY KEY,
    user_id      INTEGER NOT NULL REFERENCES users(id),
    amount       INTEGER NOT NULL,
    currency     TEXT    NOT NULL DEFAULT 'RUB',
    status       TEXT    NOT NULL,
    yookassa_id  TEXT    UNIQUE,
    tier         TEXT,
    created_at   TEXT    DEFAULT (datetime('now'))
);

-- ─── Indexes ──────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_recipes_user        ON recipes(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_user       ON brew_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_devices_user        ON devices(user_id);
CREATE INDEX IF NOT EXISTS idx_devices_api_key     ON devices(api_key);
CREATE INDEX IF NOT EXISTS idx_pairings_code       ON device_pairings(pairing_code);
CREATE INDEX IF NOT EXISTS idx_pairings_user       ON device_pairings(user_id);
