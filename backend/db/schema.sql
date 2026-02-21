-- OrangeBrew Database Schema v1

CREATE TABLE IF NOT EXISTS recipes (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT    NOT NULL,
    style       TEXT    DEFAULT '',
    og          REAL    DEFAULT 0,
    fg          REAL    DEFAULT 0,
    ibu         REAL    DEFAULT 0,
    abv         REAL    DEFAULT 0,
    batch_size  REAL    DEFAULT 20,
    boil_time   INTEGER DEFAULT 60,
    ingredients TEXT    DEFAULT '[]',      -- JSON array of {name, amount, unit, type}
    mash_steps  TEXT    DEFAULT '[]',      -- JSON array of {name, temp, duration}
    hop_additions TEXT  DEFAULT '[]',      -- JSON array of {name, amount, time, type}
    notes       TEXT    DEFAULT '',
    created_at  TEXT    DEFAULT (datetime('now')),
    updated_at  TEXT    DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS brew_sessions (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    recipe_id   INTEGER REFERENCES recipes(id) ON DELETE SET NULL,
    type        TEXT    NOT NULL CHECK(type IN ('brewing','mash','boil','fermentation','distillation','rectification')),
    status      TEXT    NOT NULL DEFAULT 'active' CHECK(status IN ('active','paused','completed','cancelled')),
    started_at  TEXT    DEFAULT (datetime('now')),
    finished_at TEXT,
    notes       TEXT    DEFAULT ''
);

CREATE TABLE IF NOT EXISTS temperature_log (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id  INTEGER NOT NULL REFERENCES brew_sessions(id) ON DELETE CASCADE,
    sensor      TEXT    NOT NULL,
    value       REAL    NOT NULL,
    timestamp   TEXT    DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS fermentation_entries (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id  INTEGER NOT NULL REFERENCES brew_sessions(id) ON DELETE CASCADE,
    stage       TEXT    DEFAULT 'primary',
    temperature REAL,
    gravity     REAL,
    abv         REAL,
    notes       TEXT    DEFAULT '',
    timestamp   TEXT    DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS distillation_sessions (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id  INTEGER NOT NULL REFERENCES brew_sessions(id) ON DELETE CASCADE,
    mode        TEXT    NOT NULL CHECK(mode IN ('distillation','rectification')),
    reflux_ratio REAL   DEFAULT 3,
    target_abv  REAL    DEFAULT 96,
    total_volume REAL   DEFAULT 0,
    started_at  TEXT    DEFAULT (datetime('now')),
    finished_at TEXT
);

CREATE TABLE IF NOT EXISTS fraction_log (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id  INTEGER NOT NULL REFERENCES brew_sessions(id) ON DELETE CASCADE,
    phase       TEXT    NOT NULL CHECK(phase IN ('heads','hearts','tails')),
    volume      REAL    NOT NULL DEFAULT 0,
    abv         REAL    DEFAULT 0,
    temp_boiler REAL,
    temp_column REAL,
    notes       TEXT    DEFAULT '',
    timestamp   TEXT    DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS settings (
    key         TEXT    PRIMARY KEY,
    value       TEXT    NOT NULL,
    updated_at  TEXT    DEFAULT (datetime('now'))
);

-- Indexes for fast queries
CREATE INDEX IF NOT EXISTS idx_temp_log_session ON temperature_log(session_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_temp_log_sensor  ON temperature_log(sensor, timestamp);
CREATE INDEX IF NOT EXISTS idx_fraction_session  ON fraction_log(session_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_sessions_type     ON brew_sessions(type, status);
