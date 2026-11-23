-- Durable process facts. These records must never replay hardware commands.
CREATE TABLE IF NOT EXISTS process_runtime_state (
    session_id INTEGER PRIMARY KEY REFERENCES brew_sessions(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    snapshot TEXT NOT NULL,
    sequence INTEGER NOT NULL DEFAULT 0,
    recovery_required INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_process_runtime_user ON process_runtime_state(user_id, recovery_required);

CREATE TABLE IF NOT EXISTS event_outbox (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id TEXT NOT NULL UNIQUE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    aggregate_id TEXT NOT NULL,
    aggregate_sequence INTEGER NOT NULL,
    topic TEXT NOT NULL,
    message_key TEXT NOT NULL,
    payload TEXT NOT NULL,
    payload_bytes INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    published_at TEXT,
    attempts INTEGER NOT NULL DEFAULT 0,
    next_attempt_at INTEGER NOT NULL DEFAULT 0,
    last_error TEXT,
    UNIQUE(aggregate_id, aggregate_sequence)
);
CREATE INDEX IF NOT EXISTS idx_outbox_pending ON event_outbox(published_at, next_attempt_at, id);
CREATE INDEX IF NOT EXISTS idx_outbox_aggregate ON event_outbox(aggregate_id, aggregate_sequence, published_at);

CREATE TABLE IF NOT EXISTS processed_events (
    consumer_name TEXT NOT NULL,
    event_id TEXT NOT NULL,
    processed_at TEXT NOT NULL,
    PRIMARY KEY(consumer_name, event_id)
);

CREATE TABLE IF NOT EXISTS process_event_projection (
    consumer_name TEXT NOT NULL,
    aggregate_id TEXT NOT NULL,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    sequence INTEGER NOT NULL,
    event_type TEXT NOT NULL,
    event_id TEXT NOT NULL,
    payload TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY(consumer_name, aggregate_id)
);
