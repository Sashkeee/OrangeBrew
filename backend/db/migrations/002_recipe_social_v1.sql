-- Migration 002: Social features v1 (likes + comments)
-- Adds public recipe library, likes, and comments.

-- ─── recipes: public visibility + social counters ─────────
ALTER TABLE recipes ADD COLUMN is_public      INTEGER DEFAULT 0;
ALTER TABLE recipes ADD COLUMN likes_count    INTEGER DEFAULT 0;
ALTER TABLE recipes ADD COLUMN comments_count INTEGER DEFAULT 0;

-- ─── recipe_likes ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS recipe_likes (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    recipe_id  INTEGER NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
    user_id    INTEGER NOT NULL REFERENCES users(id)   ON DELETE CASCADE,
    created_at TEXT    DEFAULT (datetime('now')),
    UNIQUE (recipe_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_recipe_likes_recipe ON recipe_likes(recipe_id);
CREATE INDEX IF NOT EXISTS idx_recipe_likes_user   ON recipe_likes(user_id);

-- ─── recipe_comments ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS recipe_comments (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    recipe_id  INTEGER NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
    user_id    INTEGER NOT NULL REFERENCES users(id)   ON DELETE CASCADE,
    text       TEXT    NOT NULL,
    is_deleted INTEGER DEFAULT 0,
    created_at TEXT    DEFAULT (datetime('now')),
    updated_at TEXT    DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_recipe_comments_recipe ON recipe_comments(recipe_id, created_at);

-- ─── Triggers: auto-update likes_count ────────────────────
CREATE TRIGGER IF NOT EXISTS trg_like_insert
AFTER INSERT ON recipe_likes
BEGIN
    UPDATE recipes SET likes_count = likes_count + 1
    WHERE id = NEW.recipe_id;
END;

CREATE TRIGGER IF NOT EXISTS trg_like_delete
AFTER DELETE ON recipe_likes
BEGIN
    UPDATE recipes SET likes_count = MAX(0, likes_count - 1)
    WHERE id = OLD.recipe_id;
END;

-- ─── Triggers: auto-update comments_count ─────────────────
CREATE TRIGGER IF NOT EXISTS trg_comment_insert
AFTER INSERT ON recipe_comments
BEGIN
    UPDATE recipes SET comments_count = comments_count + 1
    WHERE id = NEW.recipe_id;
END;

CREATE TRIGGER IF NOT EXISTS trg_comment_soft_delete
AFTER UPDATE OF is_deleted ON recipe_comments
WHEN NEW.is_deleted = 1 AND OLD.is_deleted = 0
BEGIN
    UPDATE recipes SET comments_count = MAX(0, comments_count - 1)
    WHERE id = NEW.recipe_id;
END;
