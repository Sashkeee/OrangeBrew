-- Migration 002: Named sensor configurations per user
-- Replaces role-based sensor config (boiler/column/...) in settings_v2
-- with address-based sensor registry that supports auto-discovery.

CREATE TABLE IF NOT EXISTS sensors (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    address    TEXT    NOT NULL,                  -- 1-Wire address, e.g. '28-ABCDEF123456'
    name       TEXT    NOT NULL DEFAULT '',       -- User-given name, e.g. 'Куб', 'Колонна'
    color      TEXT    NOT NULL DEFAULT '#FF6B35', -- Hex color for graph lines
    offset     REAL    NOT NULL DEFAULT 0,        -- Calibration offset (°C)
    enabled    INTEGER NOT NULL DEFAULT 1,        -- 0/1
    created_at TEXT    DEFAULT (datetime('now')),
    UNIQUE(user_id, address)
);

CREATE INDEX IF NOT EXISTS idx_sensors_user ON sensors(user_id);
