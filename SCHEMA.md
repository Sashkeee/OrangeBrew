# SCHEMA.md — OrangeBrew

Полная схема SQLite базы данных. Файл DDL: `backend/db/schema.sql`. Запросы: `backend/db/database.js`.
Миграции (добавление колонок для мультитенантности): `backend/db/migrate.js`.
Миграции в `backend/db/migrations/`: `001_multitenancy.sql`, `002_sensors_table.sql`, `002_recipe_social_v1.sql`.

---

## Настройки БД

```sql
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
PRAGMA synchronous = NORMAL;
```

---

## Таблицы

### `devices`

ESP32 устройства, подключённые к системе.

| Поле | Тип | Описание |
|------|-----|----------|
| `id` | TEXT PK | Уникальный ID устройства (напр., MAC-адрес) |
| `name` | TEXT NOT NULL | Понятное имя устройства |
| `role` | TEXT | Роль: `'unassigned'` (default) |
| `status` | TEXT | Статус: `'offline'` (default), `'online'` |
| `last_seen` | TEXT | datetime('now') — последний раз онлайн |
| `created_at` | TEXT | datetime('now') |
| `user_id` | INTEGER FK → `users(id)` | Владелец устройства (добавлено через migrate.js) |
| `api_key` | TEXT UNIQUE | Per-device ключ аутентификации ESP32 (добавлено через migrate.js) |

**Query-объект:** `deviceQueries`
- `getAll(userId)` — устройства пользователя, сортировка по `last_seen DESC`
- `getById(id)`
- `getByApiKey(apiKey)` — поиск устройства по per-device api_key (для hardware auth)
- `upsert(id, name, role)` — INSERT OR UPDATE: при конфликте обновляет `status='online'` и `last_seen`
- `updateStatus(id, status)` — обновить статус и `last_seen`
- `setApiKey(id, apiKey)` — сохранить per-device api_key после паринга
- `rename(id, name)`
- `setRole(id, role)`
- `delete(id)`

---

### `device_pairings`

Временные коды для паринга новых ESP32 устройств.

| Поле | Тип | Описание |
|------|-----|----------|
| `id` | INTEGER PK AUTOINCREMENT | |
| `user_id` | INTEGER NOT NULL FK → `users(id)` | Кто инициировал паринг (CASCADE DELETE) |
| `pairing_code` | TEXT NOT NULL UNIQUE | 6-символьный код (генерируется сервером) |
| `expires_at` | TEXT NOT NULL | Время истечения кода (ISO timestamp) |
| `used_at` | TEXT | datetime('now') при использовании, NULL пока не использован |
| `device_id` | TEXT | ID устройства после успешного паринга |

**Query-объект:** `pairingQueries`
- `create(userId, code, expiresAt)` — создать новый паринг-код
- `getByCode(code)` — найти запись по коду (только не истёкшие и не использованные: `expires_at > now AND used_at IS NULL`)
- `getByCodeAny(code)` — найти запись по коду (любой статус)
- `markUsed(id, deviceId)` — отметить как использованный: `used_at = datetime('now')`, привязать `device_id`
- `cleanup()` — удалить записи старше 24 часов (`expires_at < datetime('now', '-1 day')`)

**Индексы:**
- `idx_pairings_code (pairing_code)`
- `idx_pairings_user (user_id)`

---

### `recipes`

Рецепты пива/дистиллята.

| Поле | Тип | Описание |
|------|-----|----------|
| `id` | INTEGER PK AUTOINCREMENT | |
| `name` | TEXT NOT NULL | Название рецепта |
| `style` | TEXT | Стиль пива, default `''` |
| `og` | REAL | Original Gravity, default `0` |
| `fg` | REAL | Final Gravity, default `0` |
| `ibu` | REAL | Горечь (IBU), default `0` |
| `abv` | REAL | Крепость (%), default `0` |
| `batch_size` | REAL | Объём варки (л), default `20` |
| `boil_time` | INTEGER | Время кипячения (мин), default `60` |
| `ingredients` | TEXT | JSON: `[{name, amount, unit, type}]` |
| `mash_steps` | TEXT | JSON: `[{name, temp, duration}]` |
| `hop_additions` | TEXT | JSON: `[{name, amount, time, type}]` |
| `notes` | TEXT | Заметки, default `''` |
| `created_at` | TEXT | datetime('now') |
| `updated_at` | TEXT | datetime('now') |
| `user_id` | INTEGER FK → `users(id)` | Владелец рецепта (добавлено через migrate.js) |
| `is_public` | INTEGER | 0/1 — публичный рецепт (добавлено через migrate.js) |
| `likes_count` | INTEGER | Счётчик лайков, default `0` (добавлено через migrate.js) |
| `comments_count` | INTEGER | Счётчик комментариев, default `0` (добавлено через migrate.js) |

**Query-объект:** `recipeQueries`
- `getAll(userId)` — рецепты пользователя, `ORDER BY created_at DESC`
- `getById(id, userId?)` — один рецепт (опционально фильтр по user_id)
- `create(recipe, userId)` — вставка + возврат созданного
- `update(id, recipe, userId)` — частичное обновление; JSON-поля сериализуются
- `delete(id, userId)`
- `setPublic(id, userId, isPublic)`

**Query-объект:** `recipeSearchQueries` (FTS5 поиск)
- `search(query, userId)` — полнотекстовый поиск через `recipes_fts`

**Query-объект:** `recipeTrendingQueries`
- `getTrending(limit)` — публичные рецепты по убыванию `likes_count`

**Query-объект:** `recipeLikesQueries`
- `toggle(recipeId, userId)` — лайк/анлайк; возвращает `{ liked, count }`
- `getCount(recipeId)`
- `isLiked(recipeId, userId)`

**Query-объект:** `recipeCommentsQueries`
- `getByRecipe(recipeId, limit=50, offset=0)` — комментарии к рецепту (с пагинацией, `is_deleted = 0`); возвращает `{ comments, total }`
- `create(recipeId, userId, text)` — создать комментарий, возвращает с `username`
- `softDelete(commentId, userId)` — мягкое удаление (`is_deleted = 1`, `updated_at = datetime('now')`)

**Индекс:** `idx_recipes_user (user_id)`

---

### `recipes_fts`

FTS5 таблица для полнотекстового поиска рецептов.

```sql
CREATE VIRTUAL TABLE recipes_fts USING fts5(name, style, notes, content='recipes', content_rowid='id');
```

Триггеры поддерживают синхронизацию с `recipes`.

---

### `recipe_likes`

Лайки рецептов (many-to-many).

| Поле | Тип | Описание |
|------|-----|----------|
| `id` | INTEGER PK AUTOINCREMENT | |
| `recipe_id` | INTEGER FK → `recipes(id)` | CASCADE DELETE |
| `user_id` | INTEGER FK → `users(id)` | CASCADE DELETE |
| `created_at` | TEXT | datetime('now') |

**UNIQUE:** `(recipe_id, user_id)`

**Триггеры:** `trg_like_insert` / `trg_like_delete` — автоматически обновляют `recipes.likes_count`.

**Индексы:**
- `idx_recipe_likes_recipe (recipe_id)`
- `idx_recipe_likes_user (user_id)`

---

### `recipe_comments`

Комментарии к рецептам (с мягким удалением).

| Поле | Тип | Описание |
|------|-----|----------|
| `id` | INTEGER PK AUTOINCREMENT | |
| `recipe_id` | INTEGER FK → `recipes(id)` | CASCADE DELETE |
| `user_id` | INTEGER FK → `users(id)` | CASCADE DELETE |
| `text` | TEXT NOT NULL | Текст комментария |
| `is_deleted` | INTEGER | 0/1 — мягкое удаление, default `0` |
| `created_at` | TEXT | datetime('now') |
| `updated_at` | TEXT | datetime('now') |

**Триггеры:** `trg_comment_insert` / `trg_comment_soft_delete` — автоматически обновляют `recipes.comments_count`.

**Индекс:** `idx_recipe_comments_recipe (recipe_id, created_at)`

---

### `brew_sessions`

Сессии варки/перегонки.

| Поле | Тип | Описание |
|------|-----|----------|
| `id` | INTEGER PK AUTOINCREMENT | |
| `recipe_id` | INTEGER FK → `recipes(id)` | SET NULL при удалении рецепта |
| `device_id` | TEXT FK → `devices(id)` | SET NULL при удалении устройства |
| `type` | TEXT NOT NULL | CHECK: `'brewing'`, `'mash'`, `'boil'`, `'fermentation'`, `'distillation'`, `'rectification'` |
| `status` | TEXT NOT NULL | CHECK: `'active'`, `'paused'`, `'completed'`, `'cancelled'`; default `'active'` |
| `started_at` | TEXT | datetime('now') |
| `finished_at` | TEXT | NULL пока не завершена |
| `notes` | TEXT | default `''` |
| `user_id` | INTEGER FK → `users(id)` | Владелец сессии (добавлено через migrate.js) |

**Query-объект:** `sessionQueries`
- `getAll(type?, userId)` — сессии пользователя; при `type` — JOIN с `recipes`
- `getById(id)`
- `create(session, userId)` — поля: `recipe_id`, `type`, `status`, `notes`
- `update(id, data, userId)` — частичное обновление
- `delete(id, userId)`
- `complete(id)` — `status='completed'`, `finished_at=NOW`
- `cancel(id)` — `status='cancelled'`, `finished_at=NOW`

**Индексы:**
- `idx_sessions_type (type, status)`
- `idx_sessions_user (user_id)`

---

### `users`

Пользователи системы.

| Поле | Тип | Описание |
|------|-----|----------|
| `id` | INTEGER PK AUTOINCREMENT | |
| `username` | TEXT NOT NULL UNIQUE | Логин |
| `password_hash` | TEXT NOT NULL | bcrypt хэш пароля |
| `role` | TEXT | default `'admin'`; значения: `'admin'`, `'user'` |
| `created_at` | TEXT | datetime('now') |
| `email` | TEXT UNIQUE | Email (добавлено через migrate.js) |
| `subscription_tier` | TEXT | `'free'`, `'trial'`, `'pro'` — тарифный план |
| `subscription_status` | TEXT | `'active'`, `'expired'`, `'cancelled'` |
| `subscription_expires_at` | TEXT | Дата истечения подписки |
| `consent_given_at` | TEXT | Дата согласия на обработку данных (152-ФЗ) |

**Query-объект:** `userQueries`
- `getAll()` — все пользователи (без password_hash)
- `getById(id)`
- `getByUsername(username)`
- `getByEmail(email)`
- `create({ username, password_hash, role, email })` — создание с trial-подпиской (14 дней)
- `updatePassword(id, password_hash)`
- `updateSubscription(id, { tier, status, expiresAt })`
- `setConsent(id)` — записать `consent_given_at = datetime('now')`

*Управление через `backend/routes/users.js`. Начальный admin создаётся через `backend/db/seedAuth.js`.*
*Регистрация новых пользователей: `POST /auth/register`.*

---

### `sensors`

Именованные конфигурации датчиков (per-user). Заменяет role-based маппинг в `settings_v2`.

| Поле | Тип | Описание |
|------|-----|----------|
| `id` | INTEGER PK AUTOINCREMENT | |
| `user_id` | INTEGER NOT NULL FK → `users(id)` | CASCADE DELETE — владелец датчика |
| `address` | TEXT NOT NULL | 1-Wire адрес, напр. `'28-ABCDEF123456'` |
| `name` | TEXT NOT NULL | Имя от пользователя (`'Куб'`, `'Колонна'`), default `''` |
| `color` | TEXT NOT NULL | Hex-цвет для графиков, default `'#FF6B35'` (одна из 10 цветов палитры) |
| `offset` | REAL NOT NULL | Калибровочное смещение (°C), default `0` |
| `enabled` | INTEGER NOT NULL | 0/1, default `1` |
| `created_at` | TEXT | datetime('now') |

**UNIQUE:** `(user_id, address)`

**Query-объект:** `sensorQueries`
- `getAll(userId)` — все настроенные датчики пользователя, `ORDER BY id ASC`
- `getByAddress(userId, address)` — датчик по адресу для пользователя
- `upsert(userId, address, { name, color, offset, enabled })` — INSERT OR UPDATE с цветом по умолчанию из палитры если не указан
- `delete(userId, address)` — удалить конфигурацию датчика

**Индекс:**
- `idx_sensors_user (user_id)`

---

### `temperature_log`

Лог показаний датчиков температуры.

| Поле | Тип | Описание |
|------|-----|----------|
| `id` | INTEGER PK AUTOINCREMENT | |
| `session_id` | INTEGER NOT NULL FK → `brew_sessions(id)` | CASCADE DELETE |
| `sensor` | TEXT NOT NULL | Роль датчика: `'boiler'`, `'column'` и т.д. |
| `value` | REAL NOT NULL | Температура (°C) |
| `timestamp` | TEXT | datetime('now') |

**Query-объект:** `temperatureQueries`
- `getBySession(sessionId, limit=500)` — `ORDER BY timestamp DESC LIMIT ?`
- `getRecent(minutes=10)` — за последние N минут
- `insert(sessionId, sensor, value)`
- `insertBatch(rows)` — транзакция, `rows = [{session_id, sensor, value}]`

**Индексы:**
- `idx_temp_log_session (session_id, timestamp)`
- `idx_temp_log_sensor (sensor, timestamp)`

---

### `fermentation_entries`

Записи дневника брожения.

| Поле | Тип | Описание |
|------|-----|----------|
| `id` | INTEGER PK AUTOINCREMENT | |
| `session_id` | INTEGER NOT NULL FK → `brew_sessions(id)` | CASCADE DELETE |
| `stage` | TEXT | `'primary'` (default) |
| `temperature` | REAL | Температура (°C), nullable |
| `gravity` | REAL | Плотность (SG), nullable |
| `abv` | REAL | Крепость (%), nullable |
| `notes` | TEXT | default `''` |
| `timestamp` | TEXT | datetime('now') |

**Query-объект:** `fermentationQueries`
- `getBySession(sessionId)` — `ORDER BY timestamp ASC`
- `insert(entry)` — поля: `session_id`, `stage`, `temperature`, `gravity`, `abv`, `notes`

---

### `distillation_sessions`

Параметры сессии перегонки/ректификации.

| Поле | Тип | Описание |
|------|-----|----------|
| `id` | INTEGER PK AUTOINCREMENT | |
| `session_id` | INTEGER NOT NULL FK → `brew_sessions(id)` | CASCADE DELETE |
| `mode` | TEXT NOT NULL | CHECK: `'distillation'`, `'rectification'` |
| `reflux_ratio` | REAL | Флегмовое число, default `3` |
| `target_abv` | REAL | Целевая крепость (%), default `96` |
| `total_volume` | REAL | Итоговый объём (мл), default `0` |
| `started_at` | TEXT | datetime('now') |
| `finished_at` | TEXT | NULL пока не завершена |

*Нет выделенного query-объекта — запросы напрямую в `backend/routes/sessions.js`.*

---

### `fraction_log`

Лог фракций при перегонке.

| Поле | Тип | Описание |
|------|-----|----------|
| `id` | INTEGER PK AUTOINCREMENT | |
| `session_id` | INTEGER NOT NULL FK → `brew_sessions(id)` | CASCADE DELETE |
| `phase` | TEXT NOT NULL | CHECK: `'heads'`, `'hearts'`, `'tails'` |
| `volume` | REAL NOT NULL | Объём фракции (мл), default `0` |
| `abv` | REAL | Крепость (%), default `0` |
| `temp_boiler` | REAL | Температура куба (°C), nullable |
| `temp_column` | REAL | Температура колонны (°C), nullable |
| `notes` | TEXT | default `''` |
| `timestamp` | TEXT | datetime('now') |

**Query-объект:** `fractionQueries`
- `getBySession(sessionId)` — `ORDER BY timestamp ASC`
- `insert(fraction)` — поля: `session_id`, `phase`, `volume`, `abv`, `temp_boiler`, `temp_column`, `notes`

**Индекс:** `idx_fraction_session (session_id, timestamp)`

---

### `settings`

Хранилище настроек (legacy, single-user). Фактически новые запросы используют `settings_v2`.

| Поле | Тип | Описание |
|------|-----|----------|
| `key` | TEXT PK | Ключ настройки |
| `value` | TEXT NOT NULL | Значение (строка или JSON) |
| `updated_at` | TEXT | datetime('now') |

---

### `settings_v2`

Настройки с поддержкой мультипользовательности. Заменяет `settings` в `settingsQueries`.

| Поле | Тип | Описание |
|------|-----|----------|
| `key` | TEXT NOT NULL | Ключ настройки |
| `value` | TEXT NOT NULL | Значение (строка или JSON) |
| `user_id` | INTEGER | NULL = глобальный дефолт; конкретный user_id = переопределение пользователя |
| `updated_at` | TEXT | datetime('now') |

**PK:** `(key, user_id)` (UNIQUE)

**Известные ключи:**

| Ключ | Тип значения | Описание |
|------|-------------|----------|
| `pid` | object `{kp, ki, kd}` | PID коэффициенты (вложенный объект) |
| `pid_p`, `pid_i`, `pid_d` | number | Устаревший формат PID коэффициентов (legacy) |
| `pid_tuned` | boolean | Флаг завершения автотюнинга |
| `kalman_enabled` | boolean | Включить фильтр Калмана на сенсорах (default `true`) |
| `kalman_q` | number | Шум процесса KalmanFilter (Process Noise Covariance), default `0.01` |
| `kalman_r` | number | Шум измерения KalmanFilter (Measurement Noise Covariance), default `0.05` |
| `sensors` | object | Маппинг адресов DS18B20 → роли (`boiler`, `column`) — legacy, заменён таблицей `sensors` |
| `hardware` | object `{connectionType}` | Тип подключения к ESP32 (`mock`, `serial`, `wifi`); по умолчанию читается из `CONNECTION_TYPE` env |
| `telegram_token` | string | Токен Telegram-бота |
| `telegram_chat_id` | string | ID чата для уведомлений |

**Query-объект:** `settingsQueries`
- `getAll(userId?)` — возвращает объект `{key: parsedValue}`, мержит глобальные дефолты + переопределения пользователя
- `get(key, userId?)` — одна настройка с fallback на глобальный дефолт
- `set(key, value, userId?)` — UPSERT; автосериализация не-строковых значений
- `setBulk(settings, userId?)` — транзакция UPSERT всего объекта настроек

---

### `payments`

История платежей / подписок (YooKassa).

| Поле | Тип | Описание |
|------|-----|----------|
| `id` | TEXT PK | ID платежа (от YooKassa) |
| `user_id` | INTEGER NOT NULL FK → `users(id)` | |
| `amount` | INTEGER NOT NULL | Сумма платежа (в копейках) |
| `currency` | TEXT NOT NULL | Валюта, default `'RUB'` |
| `status` | TEXT NOT NULL | Статус платежа |
| `yookassa_id` | TEXT UNIQUE | ID транзакции в YooKassa |
| `tier` | TEXT | Тарифный план, за который платили |
| `created_at` | TEXT | datetime('now') |

**Query-объект:** `paymentQueries`
- `create({ id, userId, amount, currency, status, yookassaId, tier })`
- `updateStatus(id, status)`
- `getByUser(userId)`
- `getById(id)`
- `getByYookassaId(yookassaId)`

---

## Диаграмма связей

```
users ─────────────────────────────────────────────────────────────────────┐
  │                                                                         │ user_id
  │ user_id          user_id            user_id                             │
  ▼                  ▼                  ▼                                   │
devices           recipes           brew_sessions                           │
  │ (api_key)        │ (is_public)       │                                  │
  │                  │ recipe_id (FK)    │ device_id (FK)                   │
  │                  ▼                  │                                   │
  │           recipe_likes  ←──────────┤                                   │
  │           recipe_comments ◄────────┤                                   │
  │           recipes_fts (FTS5 index) │                                   │
  │                                    │                                    │
  │                     ┌──────────────┼──────────────┐                    │
  │                     │ CASCADE      │ CASCADE       │ CASCADE             │
  │                     ▼             ▼               ▼                    │
  │             temperature_log  fermentation   fraction_log               │
  │                           entries      distillation_sessions (CASCADE)  │
  │                                                                         │
  ▼                                                                         │
device_pairings ◄──────────────────────────────────────────────────────────┘
payments ◄─────────────────────────────────────────────────────────────────┘
sensors ◄──────────────────────────────────────────────────────────────────┘

settings_v2 — user_id FK → users(id), NULL = глобальный дефолт
settings — legacy таблица (одиночный пользователь)
```
