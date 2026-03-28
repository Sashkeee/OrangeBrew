-- OrangeBrew SQL Trainer — Seed Data
-- Simplified schema for learning SQL. No sensitive data.

CREATE TABLE users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    username      TEXT    NOT NULL UNIQUE,
    role          TEXT    DEFAULT 'user',
    email         TEXT    UNIQUE,
    subscription_tier TEXT DEFAULT 'free',
    created_at    TEXT    DEFAULT (datetime('now'))
);

CREATE TABLE recipes (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    name           TEXT    NOT NULL,
    style          TEXT    DEFAULT '',
    og             REAL   DEFAULT 0,
    fg             REAL   DEFAULT 0,
    ibu            REAL   DEFAULT 0,
    abv            REAL   DEFAULT 0,
    batch_size     REAL   DEFAULT 20,
    boil_time      INTEGER DEFAULT 60,
    ingredients    TEXT   DEFAULT '[]',
    mash_steps     TEXT   DEFAULT '[]',
    hop_additions  TEXT   DEFAULT '[]',
    notes          TEXT   DEFAULT '',
    is_public      INTEGER DEFAULT 0,
    likes_count    INTEGER DEFAULT 0,
    comments_count INTEGER DEFAULT 0,
    user_id        INTEGER REFERENCES users(id),
    created_at     TEXT   DEFAULT (datetime('now')),
    updated_at     TEXT   DEFAULT (datetime('now'))
);

CREATE TABLE brew_sessions (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    recipe_id   INTEGER REFERENCES recipes(id) ON DELETE SET NULL,
    type        TEXT    NOT NULL CHECK(type IN ('brewing','mash','boil','fermentation','distillation','rectification')),
    status      TEXT    NOT NULL DEFAULT 'active' CHECK(status IN ('active','paused','completed','cancelled')),
    started_at  TEXT    DEFAULT (datetime('now')),
    finished_at TEXT,
    notes       TEXT    DEFAULT '',
    user_id     INTEGER REFERENCES users(id)
);

CREATE TABLE temperature_log (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id  INTEGER NOT NULL REFERENCES brew_sessions(id) ON DELETE CASCADE,
    sensor      TEXT    NOT NULL,
    value       REAL    NOT NULL,
    timestamp   TEXT    DEFAULT (datetime('now'))
);

CREATE TABLE recipe_likes (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    recipe_id  INTEGER NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT    DEFAULT (datetime('now')),
    UNIQUE(recipe_id, user_id)
);

CREATE TABLE recipe_comments (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    recipe_id  INTEGER NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    text       TEXT    NOT NULL,
    is_deleted INTEGER DEFAULT 0,
    created_at TEXT    DEFAULT (datetime('now'))
);

CREATE TABLE devices (
    id         TEXT    PRIMARY KEY,
    name       TEXT    NOT NULL,
    role       TEXT    DEFAULT 'unassigned',
    status     TEXT    DEFAULT 'offline',
    last_seen  TEXT,
    user_id    INTEGER REFERENCES users(id),
    created_at TEXT    DEFAULT (datetime('now'))
);

-- ═══════════════════════════════════════════════════
-- Sample data
-- ═══════════════════════════════════════════════════

INSERT INTO users (id, username, role, email, subscription_tier, created_at) VALUES
(1, 'brewmaster',  'admin', 'brewmaster@orangebrew.io', 'pro',   '2025-01-15 10:00:00'),
(2, 'hophead',     'user',  'hophead@example.com',      'trial', '2025-02-20 14:30:00'),
(3, 'maltking',    'user',  'maltking@example.com',     'free',  '2025-03-01 09:00:00'),
(4, 'yeastwhisp',  'user',  'yeast@example.com',        'pro',   '2025-03-10 16:45:00'),
(5, 'tempuser',    'user',  'temp@example.com',         'free',  '2025-04-01 12:00:00');

INSERT INTO recipes (id, name, style, og, fg, ibu, abv, batch_size, boil_time, ingredients, mash_steps, hop_additions, notes, is_public, likes_count, comments_count, user_id, created_at) VALUES
(1, 'Pale Ale Classic',    'American Pale Ale', 1.050, 1.010, 35, 5.3, 20, 60,
   '[{"name":"Pale Malt","amount":4.5,"unit":"kg","type":"grain"},{"name":"Crystal 40","amount":0.3,"unit":"kg","type":"grain"}]',
   '[{"name":"Mash In","temp":67,"duration":60},{"name":"Mash Out","temp":76,"duration":10}]',
   '[{"name":"Cascade","amount":30,"time":60,"type":"bittering"},{"name":"Cascade","amount":20,"time":5,"type":"aroma"}]',
   'Classic American Pale Ale with Cascade hops', 1, 5, 2, 1, '2025-02-01 12:00:00'),

(2, 'Wheat Beer',          'German Hefeweizen',  1.048, 1.012, 15, 4.7, 20, 60,
   '[{"name":"Wheat Malt","amount":2.5,"unit":"kg","type":"grain"},{"name":"Pilsner Malt","amount":2.0,"unit":"kg","type":"grain"}]',
   '[{"name":"Protein Rest","temp":52,"duration":15},{"name":"Saccharification","temp":65,"duration":45},{"name":"Mash Out","temp":76,"duration":10}]',
   '[{"name":"Hallertau","amount":15,"time":60,"type":"bittering"}]',
   'Bavarian-style wheat beer with banana and clove notes', 1, 3, 1, 2, '2025-02-15 09:00:00'),

(3, 'Imperial Stout',      'Russian Imperial Stout', 1.090, 1.020, 65, 9.2, 20, 90,
   '[{"name":"Pale Malt","amount":6.0,"unit":"kg","type":"grain"},{"name":"Roasted Barley","amount":0.5,"unit":"kg","type":"grain"},{"name":"Chocolate Malt","amount":0.4,"unit":"kg","type":"grain"},{"name":"Flaked Oats","amount":0.3,"unit":"kg","type":"grain"}]',
   '[{"name":"Mash In","temp":68,"duration":60},{"name":"Mash Out","temp":76,"duration":10}]',
   '[{"name":"Magnum","amount":40,"time":60,"type":"bittering"},{"name":"East Kent Goldings","amount":20,"time":15,"type":"flavor"}]',
   'Rich and complex imperial stout, age for 6 months', 1, 8, 3, 1, '2025-03-01 15:00:00'),

(4, 'Session IPA',         'Session IPA',        1.042, 1.008, 45, 4.5, 25, 60,
   '[{"name":"Pale Malt","amount":3.8,"unit":"kg","type":"grain"},{"name":"Munich Malt","amount":0.3,"unit":"kg","type":"grain"}]',
   '[{"name":"Mash In","temp":66,"duration":60}]',
   '[{"name":"Citra","amount":25,"time":10,"type":"flavor"},{"name":"Mosaic","amount":30,"time":0,"type":"aroma"}]',
   'Low ABV, high hop flavor', 0, 0, 0, 3, '2025-03-10 11:00:00'),

(5, 'Czech Pilsner',       'Czech Pilsner',      1.046, 1.010, 38, 4.7, 20, 90,
   '[{"name":"Bohemian Pilsner Malt","amount":4.2,"unit":"kg","type":"grain"}]',
   '[{"name":"Acid Rest","temp":40,"duration":10},{"name":"Protein Rest","temp":52,"duration":15},{"name":"Saccharification","temp":67,"duration":60},{"name":"Mash Out","temp":76,"duration":10}]',
   '[{"name":"Saaz","amount":35,"time":60,"type":"bittering"},{"name":"Saaz","amount":15,"time":15,"type":"flavor"},{"name":"Saaz","amount":10,"time":0,"type":"aroma"}]',
   'Traditional triple-decoction Czech lager', 1, 12, 4, 4, '2025-03-15 08:00:00'),

(6, 'Oatmeal Stout',       'Oatmeal Stout',      1.054, 1.014, 30, 5.2, 20, 60,
   '[{"name":"Pale Malt","amount":4.0,"unit":"kg","type":"grain"},{"name":"Flaked Oats","amount":0.5,"unit":"kg","type":"grain"},{"name":"Chocolate Malt","amount":0.3,"unit":"kg","type":"grain"}]',
   '[{"name":"Mash In","temp":68,"duration":60},{"name":"Mash Out","temp":76,"duration":10}]',
   '[{"name":"Fuggle","amount":30,"time":60,"type":"bittering"}]',
   'Smooth and creamy oatmeal stout', 1, 2, 0, 2, '2025-04-01 14:00:00'),

(7, 'Belgian Dubbel',      'Belgian Dubbel',     1.065, 1.012, 20, 7.0, 20, 90,
   '[{"name":"Pilsner Malt","amount":5.0,"unit":"kg","type":"grain"},{"name":"Special B","amount":0.3,"unit":"kg","type":"grain"},{"name":"Dark Candi Sugar","amount":0.5,"unit":"kg","type":"sugar"}]',
   '[{"name":"Mash In","temp":67,"duration":60},{"name":"Mash Out","temp":76,"duration":10}]',
   '[{"name":"Styrian Goldings","amount":25,"time":60,"type":"bittering"}]',
   'Classic Trappist-style dubbel with dark fruit notes', 0, 0, 0, 1, '2025-04-10 10:00:00');

INSERT INTO brew_sessions (id, recipe_id, type, status, started_at, finished_at, notes, user_id) VALUES
(1, 1, 'mash',         'completed', '2025-02-05 08:00:00', '2025-02-05 12:00:00', 'First brew, went well',     1),
(2, 1, 'boil',         'completed', '2025-02-05 12:30:00', '2025-02-05 13:30:00', 'Good hot break',            1),
(3, 2, 'brewing',      'completed', '2025-02-20 07:00:00', '2025-02-20 14:00:00', 'Full brew day',             2),
(4, 1, 'fermentation', 'completed', '2025-02-05 14:00:00', '2025-02-19 14:00:00', 'Fermented at 18C for 14d',  1),
(5, 3, 'mash',         'completed', '2025-03-05 09:00:00', '2025-03-05 13:00:00', 'Long mash for imperial',    1),
(6, 5, 'brewing',      'completed', '2025-03-20 06:00:00', '2025-03-20 16:00:00', 'Triple decoction — exhausting!', 4),
(7, 4, 'mash',         'active',    '2025-03-25 10:00:00', NULL,                   'Currently mashing',         3),
(8, 3, 'fermentation', 'active',    '2025-03-05 14:00:00', NULL,                   'Still fermenting',          1),
(9, 6, 'brewing',      'cancelled', '2025-04-02 08:00:00', '2025-04-02 09:30:00', 'Equipment failure',         2),
(10, 5, 'distillation', 'completed', '2025-04-01 10:00:00', '2025-04-01 18:00:00', 'Experimental hop distillate', 4);

INSERT INTO temperature_log (session_id, sensor, value, timestamp) VALUES
(1, 'boiler', 25.0, '2025-02-05 08:00:00'),
(1, 'boiler', 45.5, '2025-02-05 08:15:00'),
(1, 'boiler', 62.3, '2025-02-05 08:30:00'),
(1, 'boiler', 67.0, '2025-02-05 08:45:00'),
(1, 'boiler', 67.2, '2025-02-05 09:00:00'),
(1, 'boiler', 67.1, '2025-02-05 09:30:00'),
(1, 'boiler', 67.0, '2025-02-05 10:00:00'),
(1, 'boiler', 76.0, '2025-02-05 10:15:00'),
(5, 'boiler', 24.0, '2025-03-05 09:00:00'),
(5, 'boiler', 55.0, '2025-03-05 09:20:00'),
(5, 'boiler', 68.0, '2025-03-05 09:45:00'),
(5, 'boiler', 68.1, '2025-03-05 10:45:00'),
(5, 'column', 65.0, '2025-03-05 09:45:00'),
(5, 'column', 66.0, '2025-03-05 10:45:00'),
(6, 'boiler', 40.0, '2025-03-20 06:30:00'),
(6, 'boiler', 52.0, '2025-03-20 07:00:00'),
(6, 'boiler', 67.0, '2025-03-20 07:30:00'),
(6, 'boiler', 76.0, '2025-03-20 08:30:00'),
(6, 'boiler', 99.5, '2025-03-20 09:00:00'),
(6, 'boiler', 100.1, '2025-03-20 10:00:00');

INSERT INTO recipe_likes (recipe_id, user_id, created_at) VALUES
(1, 2, '2025-02-10 12:00:00'),
(1, 3, '2025-02-11 14:00:00'),
(1, 4, '2025-02-12 09:00:00'),
(3, 1, '2025-03-02 10:00:00'),
(3, 2, '2025-03-03 11:00:00'),
(3, 3, '2025-03-04 15:00:00'),
(3, 4, '2025-03-05 08:00:00'),
(5, 1, '2025-03-16 10:00:00'),
(5, 2, '2025-03-17 12:00:00'),
(5, 3, '2025-03-18 14:00:00'),
(2, 1, '2025-02-20 16:00:00'),
(2, 4, '2025-02-21 11:00:00'),
(6, 1, '2025-04-02 10:00:00'),
(6, 3, '2025-04-03 09:00:00');

INSERT INTO recipe_comments (recipe_id, user_id, text, is_deleted, created_at) VALUES
(1, 2, 'Great recipe! I added a bit more Cascade at flameout.', 0, '2025-02-10 12:30:00'),
(1, 3, 'Brewed this last weekend, turned out amazing!', 0, '2025-02-15 18:00:00'),
(3, 2, 'The roasted barley really shines here.', 0, '2025-03-03 11:30:00'),
(3, 4, 'How long do you recommend aging?', 0, '2025-03-06 09:00:00'),
(3, 1, 'At least 6 months in a cool dark place.', 0, '2025-03-06 10:00:00'),
(2, 4, 'Classic hefeweizen, love the banana notes!', 0, '2025-02-22 15:00:00'),
(5, 1, 'Saaz hops make all the difference.', 0, '2025-03-16 11:00:00'),
(5, 2, 'Triple decoction is worth the effort.', 0, '2025-03-18 14:30:00'),
(5, 3, 'My favorite lager recipe so far.', 0, '2025-03-20 10:00:00'),
(5, 4, 'Fermented at 10C for 4 weeks — perfect.', 0, '2025-03-22 16:00:00'),
(1, 4, 'This comment was inappropriate', 1, '2025-02-12 09:30:00');

INSERT INTO devices (id, name, role, status, last_seen, user_id, created_at) VALUES
('ESP32-AA:BB:CC:DD:01', 'Main Kettle Controller', 'brewing',    'online',  '2025-03-25 10:00:00', 1, '2025-01-20 12:00:00'),
('ESP32-AA:BB:CC:DD:02', 'Fermentation Chamber',   'fermenter',  'offline', '2025-03-20 18:00:00', 1, '2025-02-01 10:00:00'),
('ESP32-AA:BB:CC:DD:03', 'HopHead Brew Rig',       'brewing',    'online',  '2025-03-25 09:30:00', 2, '2025-02-25 14:00:00'),
('ESP8266-11:22:33:44',  'Temp Monitor',            'unassigned', 'offline', '2025-03-01 12:00:00', 3, '2025-03-01 11:00:00'),
('ESP32C3-55:66:77:88',  'Distillation Unit',       'distillation','online', '2025-03-25 10:05:00', 4, '2025-03-12 09:00:00');
