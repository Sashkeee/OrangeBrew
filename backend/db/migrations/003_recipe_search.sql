-- Migration 003: Full-text search (FTS5) for recipes
-- Creates a virtual FTS5 table and sync triggers.

-- ─── FTS5 virtual table ────────────────────────────────────
CREATE VIRTUAL TABLE IF NOT EXISTS recipes_fts USING fts5(
    name, style, notes,
    content='recipes',
    content_rowid='id'
);

-- Populate with existing recipes
INSERT INTO recipes_fts(rowid, name, style, notes)
    SELECT id, name, COALESCE(style, ''), COALESCE(notes, '') FROM recipes;

-- ─── Sync triggers ─────────────────────────────────────────
CREATE TRIGGER IF NOT EXISTS trg_recipes_fts_insert
AFTER INSERT ON recipes BEGIN
    INSERT INTO recipes_fts(rowid, name, style, notes)
    VALUES (new.id, new.name, COALESCE(new.style, ''), COALESCE(new.notes, ''));
END;

CREATE TRIGGER IF NOT EXISTS trg_recipes_fts_update
AFTER UPDATE ON recipes BEGIN
    INSERT INTO recipes_fts(recipes_fts, rowid, name, style, notes)
    VALUES ('delete', old.id, old.name, COALESCE(old.style, ''), COALESCE(old.notes, ''));
    INSERT INTO recipes_fts(rowid, name, style, notes)
    VALUES (new.id, new.name, COALESCE(new.style, ''), COALESCE(new.notes, ''));
END;

CREATE TRIGGER IF NOT EXISTS trg_recipes_fts_delete
AFTER DELETE ON recipes BEGIN
    INSERT INTO recipes_fts(recipes_fts, rowid, name, style, notes)
    VALUES ('delete', old.id, old.name, COALESCE(old.style, ''), COALESCE(old.notes, ''));
END;
