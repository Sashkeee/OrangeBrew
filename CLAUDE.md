# CLAUDE.md — OrangeBrew

Руководство для Claude. Читать перед любыми изменениями в проекте.

---

## ОБЯЗАТЕЛЬНЫЙ ПОРЯДОК РАБОТЫ

**Перед выполнением ЛЮБОЙ задачи в этом проекте — прочитать все три файла:**

1. `CLAUDE.md` — архитектура, правила, что нельзя делать
2. `SCHEMA.md` — структура SQLite таблиц и поля
3. `~/.claude/projects/.../memory/MEMORY.md` — актуальное состояние, ключевые файлы, техдолги

Только после этого приступать к задаче.

---

## Что за проект

IoT-система автоматизации пивоварения и дистилляции.
ESP32/ESP8266 собирает данные с датчиков температуры (DS18B20) и отправляет их на Node.js backend.
Backend управляет ПИД-регулятором, ведёт сценарий варки, уведомляет через Telegram.
React frontend отображает состояние в реальном времени через WebSocket.

Архитектура трансформирована в multi-tenant SaaS: данные изолированы по `user_id`, каждый пользователь имеет свой ProcessManager и набор устройств.

**Запуск в dev:**
```bash
cd backend && node --watch server.js   # http://localhost:3001
cd frontend && npm run dev             # http://localhost:5173
```

**Тесты:**
```bash
cd backend && npm test
cd frontend && npm test
```

---

## Структура проекта

```
OrangeBrew/
├── backend/
│   ├── server.js              # Точка входа — Express + WS + per-user ProcessManager factory
│   ├── swagger.js             # Swagger/OpenAPI конфигурация (swagger-jsdoc + swagger-ui-express)
│   ├── config/
│   │   ├── env.js             # Централизованная валидация env vars (JWT_SECRET — обязателен)
│   │   └── constants.js       # Именованные константы (SAFETY, SIGNAL, INTERVALS, PID_TUNING)
│   ├── utils/
│   │   ├── logger.js          # Pino structured logger (JSON prod / pretty dev, child loggers per module)
│   │   ├── audit.js           # writeAudit() — fire-and-forget обёртка над auditQueries.insert
│   │   ├── sensorMapper.js    # mapSensors() — маппинг адресов датчиков к ролям
│   │   └── scaleRecipe.js     # Масштабирование рецепта
│   ├── beerxml/
│   │   ├── mapper.js          # beerxmlToOrangeBrew() + orangeBrewToBeerxml() — конвертация рецептов
│   │   ├── parser.js          # Парсинг XML + validateRecipe()
│   │   ├── generator.js       # Генерация BeerXML строки из объекта
│   │   └── constants.js       # Константы BeerXML формата
│   ├── db/
│   │   ├── database.js        # better-sqlite3, все SQL-запросы (queries objects)
│   │   ├── schema.sql         # DDL базовая схема таблиц
│   │   ├── migrate.js         # Миграции: применяет файлы из migrations/
│   │   ├── migrations/        # SQL-миграции (001_multitenancy, 002_sensors_table, 002_recipe_social_v1, 003_recipe_search, 004_audit_log)
│   │   ├── seedAuth.js        # Создание дефолтного admin при первом запуске
│   │   └── migrateDevices.js  # Миграция устройств (legacy)
│   ├── services/
│   │   ├── ProcessManager.js  # Конечный автомат варки (EventEmitter, per-user instance)
│   │   └── telegram.js        # Telegram-уведомления
│   ├── pid/
│   │   ├── PidController.js   # Базовый PID-алгоритм
│   │   ├── PidManager.js      # Оркестратор PID (heating/holding + Kalman + автотюнинг)
│   │   ├── PidTuner.js        # Relay-метод автоматического тюнинга
│   │   └── KalmanFilter.js    # Фильтр Калмана для шумоподавления датчиков
│   ├── ws/
│   │   └── liveServer.js      # WebSocket сервер (UI + ESP32 клиенты + паринг + ping/pong keepalive)
│   ├── serial/
│   │   ├── mockSerial.js      # Эмулятор ESP32 (multi-device: createDevice/writeToDevice)
│   │   └── realSerial.js      # @deprecated — USB Serial (не используется, сохранён для справки)
│   ├── routes/
│   │   ├── auth.js            # POST /auth/login (username+password), /auth/logout, /auth/register, GET /auth/me
│   │   ├── recipes.js         # CRUD рецептов + экспорт/импорт JSON + масштабирование
│   │   ├── sessions.js        # CRUD сессий варки + temperature/fractions/fermentation
│   │   ├── sensors.js         # GET показаний + /discovered + /config (CRUD именованных датчиков)
│   │   ├── control.js         # Управление нагревателем, насосом, дефлегматором (per-user)
│   │   ├── process.js         # Управление процессом (start/stop/pause/resume/skip/tune)
│   │   ├── settings.js        # Настройки (PID, сенсоры, Kalman) — factory createSettingsRouter()
│   │   ├── devices.js         # Список ESP32 устройств + паринг (pair/init, pair/status)
│   │   ├── telegram.js        # Настройки Telegram
│   │   ├── users.js           # Управление пользователями
│   │   ├── beerxml.js         # Импорт/экспорт BeerXML (multer для загрузки файлов)
│   │   ├── recipe-social.js   # Социальные функции рецептов (лайки, комментарии, публичные)
│   │   ├── admin.js           # Админ-панель: пользователи, аудит, бан/разбан, сброс пароля (requireAdmin)
│   │   └── trainer.js         # SQL Trainer: задачи, выполнение запросов (изолированная in-memory БД)
│   ├── middleware/
│   │   ├── auth.js            # JWT authenticate + requireAdmin + ban check
│   │   └── errorHandler.js    # Централизованный обработчик ошибок Express (next(err))
│   ├── tests/                 # Vitest тесты
│   └── data/
│       └── orangebrew.db      # SQLite БД (gitignored в prod)
├── frontend/
│   ├── src/
│   │   ├── App.jsx            # Роутер + PrivateRoute + PublicRoute + AuthProvider
│   │   ├── contexts/
│   │   │   └── AuthContext.jsx    # React Context для аутентификации (useAuth hook)
│   │   ├── api/
│   │   │   ├── client.js      # HTTP-клиент (централизованный fetch + auth + все API-объекты)
│   │   │   └── wsClient.js    # WebSocket клиент (singleton, JWT в query string)
│   │   ├── hooks/
│   │   │   ├── useProcess.js  # Состояние процесса варки (WS primary + HTTP polling fallback)
│   │   │   ├── useSensors.js  # Показания датчиков (rawSensors array + namedSensors + config)
│   │   │   ├── useControl.js  # Управление нагревателем/насосом
│   │   │   ├── useRecipes.js  # CRUD рецептов
│   │   │   ├── useSession.js  # Сессии варки
│   │   │   └── useAdmin.js    # Хук для админ-панели (users, audit, ban/unban)
│   │   ├── pages/
│   │   │   ├── Home.jsx
│   │   │   ├── Brewing.jsx
│   │   │   ├── Mashing.jsx            # Затирание (DeviceSelector + SensorSelector)
│   │   │   ├── Boiling.jsx            # Кипячение (DeviceSelector)
│   │   │   ├── Fermentation.jsx
│   │   │   ├── Distillation.jsx
│   │   │   ├── Rectification.jsx
│   │   │   ├── RecipeList.jsx
│   │   │   ├── RecipeConstructor.jsx       # v1 (простой дизайн)
│   │   │   ├── RecipeConstructor_V2.jsx    # v2 (glassmorphism, IBU/EBC расчёты)
│   │   │   ├── RecipeEditor.jsx
│   │   │   ├── RecipeDetail.jsx         # Просмотр одного рецепта (/brewing/recipes/:id)
│   │   │   ├── PublicLibrary.jsx        # Публичная библиотека рецептов (/brewing/library)
│   │   │   ├── History.jsx
│   │   │   ├── Settings.jsx           # Настройки (sub-components вынесены в module scope)
│   │   │   ├── Calculators.jsx
│   │   │   ├── IngredientsReference.jsx
│   │   │   ├── HopsReference.jsx      # Справочник хмеля (/brewing/hops)
│   │   │   ├── AdminPanel.jsx         # Админ-панель (пользователи, аудит, действия)
│   │   │   ├── SqlTrainer.jsx         # SQL-тренажёр (CodeMirror + задачи)
│   │   │   ├── Login.jsx
│   │   │   ├── Register.jsx           # Регистрация нового пользователя
│   │   │   ├── DevicePairing.jsx      # UI для паринга нового ESP32
│   │   │   └── LogoShowcase.jsx
│   │   ├── components/        # Переиспользуемые компоненты
│   │   │   ├── DeviceSelector.jsx     # Выбор устройства перед запуском процесса
│   │   │   ├── SensorSelector.jsx     # Выбор конкретного датчика температуры
│   │   │   ├── ConnectionIndicator.jsx    # Индикатор WS-соединения (overlay)
│   │   │   ├── ActiveProcessIndicator.jsx # Индикатор активного процесса (overlay)
│   │   │   └── ...
│   │   ├── utils/
│   │   │   ├── constants.js   # API_BASE, WS_URL, debugPost
│   │   │   ├── formatTime.js  # Форматирование времени
│   │   │   └── ingredients.js # Справочники солода, хмеля, дрожжей + getIngredientsFromStorage()
│   │   └── styles/
│   │       ├── index.css      # Глобальные стили (+ dark theme для native select)
│   │       └── pages.css      # Стили страниц
│   └── package.json
├── firmware/
│   ├── esp32/OrangeBrew_ESP32/
│   │   └── OrangeBrew_ESP32.ino       # Arduino скетч для Node32 (ESP32)
│   ├── esp32c3/
│   │   ├── OrangeBrew_ESP32C3/
│   │   │   └── OrangeBrew_ESP32C3.ino # Основная прошивка ESP32-C3 (gitignored — содержит BENCH_WIFI_PASS)
│   │   ├── OrangeBrew_ESP32C3_Diag/
│   │   │   └── OrangeBrew_ESP32C3_Diag.ino # Диагностика железа (AP, датчики, пины)
│   │   └── AP_Test/                   # Минимальный тест точки доступа
│   └── esp8266/OrangeBrew_ESP8266/
│       └── OrangeBrew_ESP8266.ino     # Arduino скетч для ESP8266
├── docker-compose.prod.yml    # Production: backend-prod (3000) + frontend-prod (8080)
├── docker-compose.test.yml    # Test: backend-test (3001) + frontend-test (8081) + vector
├── vector.test.toml           # Vector config: Docker logs → parse pino JSON → Betterstack
├── CLAUDE.md                  # Этот файл
├── SCHEMA.md                  # Схема SQLite таблиц
└── .antigravityrules
```

---

## Архитектурные решения

### 1. Единственный HTTP-клиент
**Решение:** весь fetch к backend — только через `frontend/src/api/client.js`.
Хуки не делают fetch напрямую.

**Правило:** новый запрос → сначала метод в `client.js`, потом хук.

---

### 2. WebSocket + HTTP polling fallback
**Решение:** `useProcess.js` подписывается на WS-события типа `process`. HTTP polling активируется **только при отключённом WS** (исправлено — раньше был всегда-активным).

`useSensors.js` аналогично: WS primary, polling fallback при отключении.

---

### 3. ProcessManager — конечный автомат (per-user)
**Состояния:** `IDLE → HEATING → HOLDING → COMPLETED` (+ `PAUSED`).
**Переходы:**
- `HEATING → HOLDING`: когда температура достигла целевой
- `HOLDING → HEATING`: при переходе к следующему шагу
- `* → COMPLETED`: все шаги пройдены
- `* → PAUSED`: pause()

**Мультитенантность:** `processManagers = new Map<userId, ProcessManager>()` в `server.js`.
`getOrCreateProcessManager(userId)` — ленивая инициализация. Каждый пользователь имеет изолированный экземпляр.

`constructor(pidManager, userId)` — принимает userId.
`start(recipe, sessionId, mode, deviceId, sensorAddress)` — принимает конкретный адрес датчика.

ProcessManager эмитит событие `update` при каждом изменении — `liveServer.js` транслирует через WS только нужному пользователю (`broadcastToUser(userId, ...)`).

---

### 4. Два типа клиентов WebSocket + паринг + keepalive
`liveServer.js` различает клиентов:
- **UI-клиенты** (браузер): аутентификация по JWT-токену в query string; `uiClients: Map<ws, {userId}>`
- **Hardware-клиенты** (ESP32/ESP8266): аутентификация по **per-device `api_key`** в первом сообщении `{type: 'auth', api_key}`; `hardwareClients: Map<deviceId, {ws, userId}>`

**Ping/pong keepalive:** сервер пингует всех клиентов каждые 10 секунд (`INTERVALS.WS_PING_MS`). Если клиент не отвечает pong до следующего пинга — соединение терминируется, устройство помечается offline. Это предотвращает разрыв соединений через Caddy reverse proxy.

**Паринг нового устройства:**
1. Пользователь открывает `POST /api/devices/pair/init` → получает 6-символьный `pairing_code`
2. ESP32 отправляет `{type: 'pair', pairing_code, deviceId}` по WebSocket
3. Сервер валидирует код, сохраняет `api_key` в `devices`, отправляет устройству `{type: 'paired', api_key}`
4. ESP32 переподключается с `{type: 'auth', api_key}`
5. Frontend поллит `GET /api/devices/pair/status` до завершения

`sendToUserHardware(userId, cmd)` — отправить команду всем устройствам пользователя.

---

### 5. Два режима подключения к железу
- `CONNECTION_TYPE=mock` — `MockSerial` (multi-device: `createDevice(deviceId, userId)`)
- `CONNECTION_TYPE=wifi` — WiFi-only: ESP подключаются через WebSocket (no-op serial stub)
- `CONNECTION_TYPE=serial` — deprecated, автоматически переключается на `wifi` с предупреждением

**Приоритет определения:** env `CONNECTION_TYPE` → `settings_v2` ключ `hardware.connectionType` → fallback `'mock'`.

**Примечание:** USB Serial (`realSerial.js`) — deprecated, файл сохранён для справки. Все современные подключения используют WiFi через WebSocket.

---

### 6. PID с двумя режимами + Kalman-фильтр
`PidManager` переключается между режимами:
- `heating`: полная мощность с торможением у цели (быстрый нагрев)
- `holding`: классический PID для поддержания температуры

**Kalman-фильтр:** применяется к показаниям датчика перед подачей в PID для шумоподавления.
Настраивается через `GET/POST /api/settings/kalman` (`enabled`, `q`, `r`).

**Специфический датчик:** `setSensorAddress(address)` — PID читает только с заданного адреса (не fallback на boiler).

Автотюнинг: `PidTuner` (relay-метод), результаты сохраняются в `settings_v2`.
Роуты автотюнинга: `POST /api/process/tune-start`, `POST /api/process/tune-stop`, `GET /api/process/tune-status`.

---

### 7. mapSensors — utils/sensorMapper.js
Функция маппинга адресов датчиков к ролям и имена. Вынесена в `backend/utils/sensorMapper.js`.
Принимает `(deviceId, rawData, userId, { sensorQueries, settingsQueries, logger })`.
**Приоритет маппинга:**
1. Таблица `sensors` (per-user, адрес → имя/цвет/offset)
2. Legacy `settings_v2` ключ `sensors` (role-based: адрес → роль)
3. Fallback: первый датчик = boiler, остальные = column

Результат преобразования:
- Возвращает объект с `boiler`, `column` и другими ролевыми ключами
- Применяет калибровочные смещения из конфига датчика

---

### 8. Deploy & Caddy Configuration
Docker → GitHub Actions CI/CD → VPS.
Caddy как reverse proxy (conf: `Caddyfile`).

**⚠️ КРИТИЧНО:** Порядок `handle` блоков в Caddyfile важен (first-match логика):
1. `/auth/*` → backend (MUST COME FIRST, иначе перехватывается catch-all)
2. `/api/*` → backend
3. `/ws` → backend
4. catch-all `{}` → frontend (MUST BE LAST)

Если `/auth/*` не прописан отдельно, все auth запросы уходят на React → 404.

Secrets: `VPS_IP`, `VPS_USERNAME`, `VPS_SSH_KEY`.
Structured logging: pino-http → stdout → Vector → Betterstack ClickHouse.

---

### 9. Rate limiting
- `authLimiter`: 20 запросов / 15 минут на `/auth/*`
- `apiLimiter`: 200 запросов / минуту на `/api/*`

---

### 10. Graceful Shutdown — правильный порядок
При получении SIGTERM/SIGINT важен порядок завершения:
```js
closeWebSocket();  // сначала — ESP32 отключается, новых данных не будет
closeDatabase();   // потом — БД закрывается чисто
server.close();    // последним — HTTP
```
**Нарушение порядка:** если `closeDatabase()` вызвать до `closeWebSocket()`, ESP32 успевает прислать последний пакет датчиков → `mapSensors()` → `db.prepare(null)` → краш.

`closeWebSocket()` экспортирована из `ws/liveServer.js`.

---

### 11. device_log — ESP32 логи в Betterstack
ESP32 может отправлять `{type: 'device_log', level, msg, uptime}` по WebSocket.
`liveServer.js` пишет их через `hwLog` (child logger с `module: 'ESP32'`) с полями `deviceId`, `userId`, `source: 'device'`.
Логи появляются в Betterstack и читаемы через `/логи`.

**Ограничение:** большинство `Serial.println()` в прошивке ещё не заменены на `log()` — device_log работает только там где явно используется `log()`/`logW()`/`logE()`.

---

### 12. Structured Logging — Pino → Vector → Betterstack

Все `console.*` вызовы в backend заменены на **Pino structured logging** (JSON).

**Pipeline:**
```
Pino (JSON на stdout) → Docker → Vector (парсинг + обогащение) → Betterstack (ClickHouse)
```

**logger.js** — базовый логгер с `base` полями `{app, env, service}`:
- `LOG_FORMAT=json` — принудительный JSON (для Docker); иначе `pino-pretty` в dev
- `LOG_LEVEL` — уровень логирования, default: `debug` (dev) / `info` (prod)

**Child loggers** — каждый модуль создаёт свой:
```js
import logger from '../utils/logger.js';
const log = logger.child({ module: 'Auth' });
log.warn({ username, ip: req.ip }, 'Failed login attempt');
```

**Модули:** `Auth`, `WS`, `DB`, `Server`, `Health`, `Telegram`, `PidTuner`, `MockSerial`, `RealSerial`, `Migration`, `Sessions`, `Social`, `Settings`, `Devices`, `Recipes`, `Users`, `ESP32`

**Уровни логирования:**
- `error` — критические ошибки (краш, safety stop PID)
- `warn` — проблемы (неудачный логин с IP, ping timeout ESP32, удаления, slow SQL >100ms)
- `info` — бизнес-события (логин, создание рецепта, паринг, автотюнинг complete)
- `debug` — техническая телеметрия (HTTP запросы, данные датчиков, relay ON/OFF)

**Специальные логи:**
- **Slow query detection:** `database.js` замеряет `performance.now()` для `queryAll`/`queryOne`/`runSql`; SQL >100ms → `log.warn`
- **Failed login tracking:** `auth.js` логирует `ip` и `username` при неудачных попытках входа
- **Heartbeat:** `server.js` каждые 5 минут пишет `{ module: 'Health', rssMemMb, heapUsedMb, uiClients, hwClients, uptime }`
- **Startup diagnostics:** при старте `{ module: 'Server', nodeVersion, env, dbPath, connectionType, memoryMb }`

**Vector** (`vector.test.toml`): парсит pino JSON, извлекает `http_method`, `http_url`, `http_status`, `response_time_ms`, `module`, `userId` на верхний уровень.

**Betterstack Dashboard** (8 графиков):
1. Warn rate over time
2. Log volume by level (stacked bar)
3. HTTP requests by status code (pie)
4. Top 10 slowest endpoints
5. Average HTTP response time (avg + max)
6. Unauthorized requests over time
7. Memory usage + Active WebSocket clients
8. ESP32 device activity

---

### 13. Settings.jsx — module-scope компоненты
Sub-компоненты (`SelectField`, `SettingRow`, `Toggle`) и объекты стилей (`inputStyle`, `selectStyle`, `labelStyle`, `toggleStyle`, `toggleDotStyle`) вынесены из render-функции `SettingsPage` в module scope. Это предотвращает пересоздание компонентов при частых ре-рендерах от `useSensors()` WebSocket обновлений (каждые ~1.5с).

---

### 14. Audit Log + Admin Panel
**audit_log** таблица хранит бизнес-события (~26 точек). `writeAudit()` (`utils/audit.js`) — fire-and-forget обёртка, ловит ошибки чтобы аудит никогда не ломал основной flow.

**Аудируемые действия:** `user.register`, `user.login`, `user.login_failed`, `user.profile_update`, `recipe.create`, `recipe.update`, `recipe.delete`, `recipe.import`, `recipe.publish`, `beerxml.import`, `session.create`, `session.complete`, `device.pair`, `device.delete`, `process.start`, `process.stop`, `settings.update`, `control.heater`, `control.cooler`, `control.pump`, `control.dephleg`, `control.emergency_stop`, `admin.ban`, `admin.unban`, `admin.reset_password`, `admin.delete_devices`, `admin.delete_user`.

**Retention:** 30 дней. Cleanup job: `setInterval` раз в 24ч + один раз при старте.

**Ban check:** `authenticate` middleware проверяет `banned_at` после jwt.verify. Забаненный пользователь → 403 `{ banned: true, reason }`.

**AdminPanel.jsx:** таблица пользователей + аудит-лог + действия (бан, сброс пароля, удаление устройств). `AdminRoute` в App.jsx проверяет `role === 'admin'`.

---

### 15. Swagger UI — OpenAPI документация
`swagger-jsdoc` собирает `@openapi` JSDoc аннотации из всех route-файлов. `swagger-ui-express` отдаёт UI на `/api-docs`.
Включается через `SWAGGER_ENABLED` env var (default: `true` в dev, `false` в prod).
JSON-спецификация доступна на `/api-docs.json`.

---

## Роутинг frontend

```
/login                          → Login (PublicRoute)
/register                       → Register (PublicRoute)
/                               → Home
/brewing                        → Brewing (хаб)
/brewing/recipes                → RecipeList
/brewing/recipes/new            → RecipeConstructor (v1)
/brewing/recipes/new-v2         → RecipeConstructor_V2 (v2)
/brewing/recipes/:id/edit       → RecipeEditor
/brewing/recipes/:id            → RecipeDetail
/brewing/library                → PublicLibrary
/brewing/mash/:sessionId        → Mashing
/brewing/boil/:sessionId        → Boiling
/brewing/history                → History
/brewing/ingredients            → IngredientsReference
/brewing/hops                   → HopsReference
/calculators                    → Calculators
/devices/pair                   → DevicePairing (PrivateRoute)
/fermentation                   → Fermentation
/distillation                   → Distillation
/rectification                  → Rectification
/settings                       → Settings
/admin                          → AdminPanel (AdminRoute — только admin)
/trainer                        → SqlTrainer
/branding                       → LogoShowcase
```

Все защищённые роуты — через `PrivateRoute`. Публичные (login/register) — через `PublicRoute`.
Админские — через `AdminRoute` (проверяет `isAuthenticated` + `role === 'admin'`).
Глобальные overlay-компоненты: `ConnectionIndicator`, `ActiveProcessIndicator`.

---

## REST API (ключевые роуты)

### Аутентификация

**`POST /auth/login`** — вход с username + password
```json
Request:  { "username": "string", "password": "string" }
Response: { "token": "jwt", "user": { "id", "username", "email", "role", "subscription_tier" } }
```
⚠️ **Важно:** используется `username`, **не email**. Email требуется при регистрации, но для входа нужен username.

**`POST /auth/register`** — регистрация
```json
Request:  { "username": "string", "email": "string", "password": "string", "consent": boolean }
Response: { "token": "jwt", "user": {...}, "message": "Registration successful. Trial period: 14 days." }
```

**`POST /auth/logout`** — выход (терминирует сессию)

**`GET /auth/me`** — информация текущего пользователя (requires JWT)

---

### Остальные маршруты

```
GET    /api/recipes
POST   /api/recipes
GET    /api/recipes/:id
PUT    /api/recipes/:id
DELETE /api/recipes/:id
GET    /api/recipes/export          → скачать все рецепты JSON
POST   /api/recipes/import          → загрузить рецепты из JSON
POST   /api/recipes/:id/scale       → предпросмотр масштабирования
POST   /api/recipes/:id/scale-and-save
GET    /api/recipes/public          → публичные рецепты
GET    /api/recipes/trending        → трендовые рецепты (score = likes*2 + comments)
GET    /api/recipes/search?q=       → FTS5 поиск по публичным рецептам
GET    /api/recipes/styles          → уникальные стили публичных рецептов (для фильтра)
POST   /api/recipes/:id/publish     → toggle is_public (владелец)
POST   /api/recipes/:id/like        → toggle лайк
GET    /api/recipes/:id/likes       → статус лайка + счётчик
GET    /api/recipes/:id/similar     → похожие рецепты по стилю
GET    /api/recipes/:id/comments    → комментарии (пагинация)
POST   /api/recipes/:id/comments    → добавить комментарий
DELETE /api/recipes/:id/comments/:commentId → мягкое удаление (автор)

POST   /api/beerxml/import          → загрузить BeerXML (multer или raw XML body)
GET    /api/beerxml/export/:id      → экспорт рецепта в BeerXML
GET    /api/beerxml/export-all      → экспорт всех рецептов в BeerXML

GET    /api/sessions
POST   /api/sessions
...

GET    /api/devices
POST   /api/devices/pair/init       → сгенерировать pairing_code
GET    /api/devices/pair/status     → проверить статус паринга
PATCH  /api/devices/:id             → переименовать / сменить роль
DELETE /api/devices/:id

GET    /api/process/status          → текущее состояние процесса
POST   /api/process/start
POST   /api/process/stop
POST   /api/process/pause
POST   /api/process/resume
POST   /api/process/skip
POST   /api/process/tune-start
POST   /api/process/tune-stop
GET    /api/process/tune-status

GET    /api/settings
PUT    /api/settings                → bulk update настроек
GET    /api/settings/kalman
POST   /api/settings/kalman
POST   /api/settings/test-connection
POST   /api/settings/test-telegram
POST   /api/settings/reload-telegram

GET    /api/sensors                 → текущие показания (role-mapped)
GET    /api/sensors/history         → история температур из БД
GET    /api/sensors/discovered      → обнаруженные датчики + сохранённые конфиги
GET    /api/sensors/config          → конфигурации именованных датчиков пользователя
PUT    /api/sensors/config          → сохранить конфигурации датчиков

GET    /api/control
POST   /api/control/heater
POST   /api/control/cooler
POST   /api/control/pump
POST   /api/control/dephleg
POST   /api/control/emergency-stop

GET    /api/admin/users              → список пользователей (admin only)
GET    /api/admin/users/:id          → детали пользователя
GET    /api/admin/audit              → глобальный аудит-лог
GET    /api/admin/audit/:userId      → аудит-лог пользователя
POST   /api/admin/users/:id/ban     → бан (body: { reason })
POST   /api/admin/users/:id/unban   → разбан
POST   /api/admin/users/:id/reset-password → сброс пароля
DELETE /api/admin/users/:id/devices → удалить все устройства пользователя

GET    /api/trainer/tasks            → список SQL-задач
GET    /api/trainer/schema           → схема учебной БД
POST   /api/trainer/execute          → выполнить SQL-запрос (body: { taskId, userQuery })
```

---

## Паттерны кода

### Добавить новый API endpoint
1. Создать/дополнить файл в `backend/routes/`
2. Зарегистрировать в `backend/server.js` с `authenticate` middleware
3. Добавить метод в `frontend/src/api/client.js`
4. Создать или дополнить хук в `frontend/src/hooks/`

### Добавить новую страницу
1. Создать файл в `frontend/src/pages/`
2. Добавить маршрут в `frontend/src/App.jsx`

### Per-user ProcessManager
```js
// В server.js
const processManagers = new Map(); // userId → ProcessManager

function getOrCreateProcessManager(userId) {
    if (!processManagers.has(userId)) {
        const pm = new ProcessManager(pidManager, userId);
        processManagers.set(userId, pm);
    }
    return processManagers.get(userId);
}

// В middleware для /api/process:
req.processManager = getOrCreateProcessManager(req.user.id);
```

---

## Что НЕ делать

- **Не писать fetch() в хуках напрямую** — только через `client.js`
- **Не хардкодить токен** — только из `localStorage.getItem('orangebrew_token')`
- **Не использовать `global.*`** — антипаттерн (уже есть `global._latestProcessState` в telegram.js, не множить)
- **Не добавлять роуты без `authenticate`** — все debug-роуты тоже должны быть защищены
- **Не дублировать логику** между `RecipeConstructor` и `RecipeConstructor_V2` — они уже расходятся
- **Не использовать глобальный `HARDWARE_API_KEY`** — устройства аутентифицируются по per-device `api_key`
- **Не определять React-компоненты внутри render-функций** — это вызывает пересоздание при каждом ре-рендере (выносить в module scope)
- **Не использовать `console.*` в backend** — только Pino через `logger.child({ module })`. Все console.* уже мигрированы

---

## Переменные окружения

| Переменная | Файл | Описание |
|-----------|------|---------|
| `PORT` | `backend/.env` | Порт backend. По умолчанию: `3001` |
| `DB_PATH` | `backend/.env` | Путь к SQLite файлу. По умолчанию: `./data/orangebrew.db` |
| `CONNECTION_TYPE` | `backend/.env` | `mock` или `wifi`. По умолчанию: `mock`. Также читается из `settings_v2` |
| `JWT_SECRET` | `backend/.env` | Секрет для подписи JWT токенов |
| `LOG_FORMAT` | `backend/.env` / `docker-compose` | `json` — принудительный JSON даже в dev (для Vector в Docker) |
| `LOG_LEVEL` | `backend/.env` | Уровень логирования Pino. Default: `debug` (dev) / `info` (prod) |
| `NODE_ENV` | `backend/.env` / `docker-compose` | `development` или `production`. Влияет на формат логов и CORS |
| `FRONTEND_URL` | `backend/.env` | URL фронтенда для CORS. Dev: `http://localhost:5173` |
| `SWAGGER_ENABLED` | `backend/.env` / `docker-compose` | `true`/`false`. Default: `true` (dev), `false` (prod). Включает Swagger UI на `/api-docs` |
| `VITE_API_URL` | `frontend/.env` | URL backend API. Dev: `http://localhost:3001` |

> `HARDWARE_API_KEY` удалён — ESP32 аутентифицируются по per-device `api_key` из таблицы `devices`.

---

## Известные долги (TODO)

| # | Проблема | Статус | Файл |
|---|---------|--------|------|
| 1 | `mapSensors()` вынесена в `utils/sensorMapper.js` | ✅ исправлено | `backend/utils/sensorMapper.js` |
| 2 | `runSql()` null-check отсутствовал | ✅ исправлено | `backend/db/database.js` |
| 3 | Graceful shutdown race: closeDatabase() до closeWebSocket() | ✅ исправлено | `backend/server.js` |
| 12 | Все `console.*` мигрированы на Pino structured logging (~85 вызовов в 18 файлах) | ✅ исправлено | весь backend |
| 13 | `postcss.config.js` и `tailwind.config.js` — мёртвый код, блокировал Docker build | ✅ удалено | frontend/ |
| 4 | `RecipeConstructor` и `RecipeConstructor_V2` — дублирование логики | открыто | `frontend/src/pages/` |
| 5 | `global._latestProcessState` — антипаттерн глобального состояния | открыто | `backend/services/telegram.js` |
| 6 | Валидация паузы в рецепте требует возрастания температур — неверно для реального пивоварения | открыто | `RecipeConstructor.jsx` |
| 7 | `backend/routes/users.js` использует `getDb()` напрямую вместо query-объектов | открыто | `backend/routes/users.js` |
| 8 | `sql.js` в backend/package.json — не используется | открыто | `backend/package.json` |
| 9 | `realSerial.js` deprecated — файл сохранён, но не используется | открыто | `backend/serial/realSerial.js` |
| 10 | ESP32 прошивка: `Serial.println()` не заменены на `log()` — device_log не работает для большинства строк | открыто | `firmware/esp32c3/` |
| 11 | `firmware/esp32c3/OrangeBrew_ESP32C3/` gitignored — прошивка не версионируется в git | открыто | `.gitignore` |

---

## Полная схема БД

→ см. `SCHEMA.md` в корне проекта.
