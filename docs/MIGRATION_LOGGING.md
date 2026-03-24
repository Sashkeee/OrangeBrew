# План миграции: console.* → pino

## Цель

Перевести все `console.log/error/warn` вызовы в бэкенде OrangeBrew на структурированный логгер pino. Это обеспечит:
- Все логи в едином JSON-формате → Vector → Betterstack
- Фильтрация по уровню (`LOG_LEVEL`), модулю, userId
- Удобный поиск и алертинг в Betterstack

---

## Что уже на pino ✅

| Файл | Child logger |
|------|-------------|
| `server.js` | `logger` (основной) |
| `services/ProcessManager.js` | `logger.child({ module: 'ProcessManager' })` |
| `pid/PidManager.js` | `logger.child({ module: 'PidManager' })` |
| `utils/sensorMapper.js` | `logger` через DI |
| `ws/liveServer.js` | `logger.child({ module: 'ESP32' })` — **но 8 строк остались на console.\*** |

---

## Файлы для миграции (11 файлов, ~85 вызовов)

### Группа 1: 🔴 Критическая (ошибки не видны в мониторинге)

---

### `services/telegram.js` — 14 вызовов
- **Child logger:** `logger.child({ module: 'Telegram' })`

| Строка | Было | Станет | Уровень |
|--------|------|--------|---------|
| 31 | `console.warn('[Telegram] Skip send: botToken or chatId missing')` | `log.warn('Skip send: botToken or chatId missing')` | warn |
| 35 | `console.warn('[Telegram] Skip send: service disabled')` | `log.warn('Skip send: service disabled')` | warn |
| 53 | `console.error('[Telegram] API error:', data.description)` | `log.error({ apiError: data.description }, 'API error')` | error |
| 55 | `console.log('[Telegram] Message sent successfully')` | `log.debug('Message sent')` | **debug** ← понижаем, т.к. шум |
| 59 | `console.error('[Telegram] Send failed:', err.message)` | `log.error({ err }, 'Send failed')` | error |
| 73 | `console.log('[Telegram] Phase change notify disabled')` | `log.debug('Phase change notify disabled')` | debug |
| 83 | `console.log('[Telegram] notifyPhaseChange: ...')` | `log.info({ phase: phaseName }, 'notifyPhaseChange')` | info |
| 130 | `console.log('[Telegram] Generating report...')` | `log.debug({ processType, isBrewing }, 'Generating report')` | debug |
| 215 | `console.log('[Telegram] notifyBoilMilestone: ...')` | `log.info({ type }, 'notifyBoilMilestone')` | info |
| 238 | `console.log('[Telegram] Process type set to: ...')` | `log.info({ type }, 'Process type set')` | info |
| 280 | `console.log('[Telegram] Init: ...')` | `log.info({ enabled, hasToken, chatId }, 'Init')` | info |
| 283 | `console.log('[Telegram] Service is disabled...')` | `log.info('Service disabled or missing credentials')` | info |
| 287 | `console.log('[Telegram] Initialized OK')` | `log.info('Initialized OK')` | info |
| 294 | `console.log('[Telegram] Periodic reports...')` | `log.info({ intervalMin }, 'Periodic reports started')` | info |
| 300 | `console.error('[Telegram] Initialization failed:')` | `log.error({ err }, 'Initialization failed')` | error |

---

### `routes/auth.js` — 4 вызова
- **Child logger:** `logger.child({ module: 'Auth' })`

| Строка | Было | Станет | Уровень |
|--------|------|--------|---------|
| 22 | `console.log('[Auth] Login attempt for user: ...')` | `log.info({ username }, 'Login attempt')` | info |
| 56 | `console.error('[Auth API] Login error:', error)` | `log.error({ err: error }, 'Login error')` | error |
| 98 | `console.log('[Auth] New user registered: ...')` | `log.info({ username, email }, 'User registered')` | info |
| 117 | `console.error('[Auth API] Register error:', error)` | `log.error({ err: error }, 'Register error')` | error |

---

### `ws/liveServer.js` — 8 вызовов
- **Уже есть** `hwLog = logger.child({ module: 'ESP32' })`
- **Добавить:** `const wsLog = logger.child({ module: 'WS' })`

| Строка | Было | Станет | Уровень |
|--------|------|--------|---------|
| 73 | `console.log('[WS] Unknown api_key attempt: ...')` | `wsLog.warn({ apiKey, deviceId }, 'Unknown api_key')` | warn |
| 112 | `console.log('[WS] Hardware ping timeout: ...')` | `wsLog.warn({ deviceId }, 'Hardware ping timeout')` | warn |
| 122 | `console.log('[WS] WebSocket server initialized...')` | `wsLog.info('WebSocket server initialized on /ws')` | info |
| 156 | `console.log('[WS] Device paired: ...')` | `wsLog.info({ deviceId, userId }, 'Device paired')` | info |
| 169 | `console.log('[WS] UI client connected...')` | `wsLog.info({ userId, total: uiClients.size }, 'UI client connected')` | info |
| 188 | `console.log('[WS] UI client disconnected...')` | `wsLog.info({ userId, total: uiClients.size }, 'UI client disconnected')` | info |
| 203 | `console.log('[WS] Hardware connected: ...')` | `wsLog.info({ deviceId, userId, name }, 'Hardware connected')` | info |
| 214 | `console.error('[WS] Invalid JSON from hardware...')` | `wsLog.error({ deviceId }, 'Invalid JSON from hardware')` | error |
| 224 | `console.log('[WS] Hardware disconnected: ...')` | `wsLog.info({ deviceId }, 'Hardware disconnected')` | info |

---

### Группа 2: 🟡 Важная (рутовые операции)

---

### `db/database.js` — 5 вызовов
- **Child logger:** `logger.child({ module: 'DB' })`

| Строка | Станет | Уровень |
|--------|--------|---------|
| 33 | `log.info({ changes, table, adminId }, 'Assigned orphaned rows')` | info |
| 54 | `log.info({ path }, 'Opening database')` | info |
| 72 | `log.info('Database initialized successfully')` | info |
| 74 | `log.error({ err }, 'Failed to initialize database')` | error |
| 104 | `log.info('Database connection closed')` | info |

### `db/migrate.js` — 4 вызова
- **Child logger:** `logger.child({ module: 'Migration' })`

| Строка | Станет | Уровень |
|--------|--------|---------|
| 42 | `log.info({ file }, 'Applying migration')` | info |
| 52 | `log.info({ file }, 'Migration applied')` | info |
| 56 | `log.info('All migrations up to date')` | info |
| 58 | `log.info({ count }, 'Migrations applied')` | info |

### `db/seedAuth.js` — 2 вызова
- **Child logger:** `logger.child({ module: 'Auth' })`

| Строка | Станет | Уровень |
|--------|--------|---------|
| 9 | `log.info('No users found, creating default admin')` | info |
| 20 | `log.warn('Default admin created — PLEASE CHANGE PASSWORD')` | warn |

### `routes/sessions.js` — 3 вызова
- **Child logger:** `logger.child({ module: 'Sessions' })`

| Строка | Станет | Уровень |
|--------|--------|---------|
| 31 | `log.info({ type }, 'Creating new session')` | info |
| 40 | `log.info({ type, recipeName }, 'Notifying Telegram')` | info |
| 50 | `log.error({ err }, 'Error creating session')` | error |

### `routes/recipe-social.js` — 10 вызовов
- **Child logger:** `logger.child({ module: 'Social' })`
- Все `console.error` в catch-блоках → `log.error({ err }, '...')`

| Строка | Было | Станет |
|--------|------|--------|
| 44 | `console.error('[public] list failed:', err)` | `log.error({ err }, 'Public list failed')` |
| 70 | `console.error('[search] failed:', err)` | `log.error({ err }, 'Search failed')` |
| 83 | `console.error('[styles] failed:', err)` | `log.error({ err }, 'Styles failed')` |
| 107 | `console.error('[publish] toggle failed:', err)` | `log.error({ err }, 'Publish toggle failed')` |
| 131 | `console.error('[trending] failed:', err)` | `log.error({ err }, 'Trending failed')` |
| 156 | `console.error('[similar] failed:', err)` | `log.error({ err }, 'Similar failed')` |
| 172 | `console.error('[like] toggle failed:', err)` | `log.error({ err }, 'Like toggle failed')` |
| 186 | `console.error('[like] getStatus failed:', err)` | `log.error({ err }, 'Like getStatus failed')` |
| 211 | `console.error('[comments] create failed:', err)` | `log.error({ err }, 'Comment create failed')` |
| 228 | `console.error('[comments] list failed:', err)` | `log.error({ err }, 'Comment list failed')` |
| 244 | `console.error('[comments] delete failed:', err)` | `log.error({ err }, 'Comment delete failed')` |

### `routes/settings.js` — 1 вызов
- **Child logger:** `logger.child({ module: 'Settings' })`

| Строка | Станет | Уровень |
|--------|--------|---------|
| 41 | `log.info({ kp, ki, kd }, 'Applied PID tunings')` | info |

---

### Группа 3: 🟢 Второстепенная

---

### `pid/PidTuner.js` — 17 вызовов
- **Child logger:** `logger.child({ module: 'PidTuner' })`
- **Оптимизация уровней:**
  - Relay ON/OFF → `debug` (иначе спам каждые ~5 сек)
  - PEAK/VALLEY → `info`
  - Safety stop → `error`
  - Tuning complete/results → `info`
  - Start/phase messages → `info`

### `serial/mockSerial.js` — 9 вызовов
- **Child logger:** `logger.child({ module: 'MockSerial' })`
- **Оптимизация:** `Received: cmd` → `debug` (слишком частые — каждую секунду)

### `serial/realSerial.js` — 7 вызовов *(deprecated, но мигрируем для консистентности)*
- **Child logger:** `logger.child({ module: 'RealSerial' })`

### ⏭️ `db/migrateDevices.js` — SKIP
- Одноразовый скрипт, запускается вручную — мигрировать не нужно

---

## Оптимизация уровней логгирования

> **ВАЖНО:** Не всё должно быть `info`. Правильные уровни — ключ к удобству мониторинга.

| Уровень | Когда использовать | Примеры |
|---------|-------------------|---------|
| `error` | Что-то сломалось, требует внимания | API ошибки, сбой отправки, safety stop |
| `warn` | Нештатно, но работает | Отсутствие токена, неизвестное устройство |
| `info` | Бизнес-события, этапные точки | Логин, регистрация, старт сессии, paired |
| `debug` | Детали работы (только для расследований) | Relay ON/OFF, каждое сообщение, парсинг команд |

---

## Подключение Vector в prod

После миграции — добавить Vector в `docker-compose.prod.yml` (сейчас он есть только в test).

---

## Порядок выполнения

| # | Файл | Вызовов | Приоритет |
|---|-------|---------|-----------|
| 1 | `services/telegram.js` | 14 | 🔴 Критический |
| 2 | `routes/auth.js` | 4 | 🔴 Критический |
| 3 | `ws/liveServer.js` | 8 | 🔴 Критический |
| 4 | `db/database.js` | 5 | 🟡 Важный |
| 5 | `db/migrate.js` | 4 | 🟡 Важный |
| 6 | `db/seedAuth.js` | 2 | 🟡 Важный |
| 7 | `routes/sessions.js` | 3 | 🟡 Важный |
| 8 | `routes/recipe-social.js` | 10 | 🟡 Важный |
| 9 | `routes/settings.js` | 1 | 🟡 Важный |
| 10 | `pid/PidTuner.js` | 17 | 🟢 Второстепенный |
| 11 | `serial/mockSerial.js` | 9 | 🟢 Второстепенный |
| 12 | `serial/realSerial.js` | 7 | 🟢 Второстепенный |

---

## Новые логи (сейчас отсутствуют в проекте)

Помимо миграции существующих `console.*`, в проекте есть «тёмные зоны» — места, где логи критически необходимы, но их нет вообще.

### 🔴 Критические (безопасность + стабильность)

#### 1. `uncaughtException` / `unhandledRejection` → `server.js`

Сейчас если вылетает необработанное исключение — процесс падает **без следа** в логах.

```js
process.on('uncaughtException', (err) => {
    logger.fatal({ err }, 'Uncaught exception');
    process.exit(1);
});
process.on('unhandledRejection', (reason) => {
    logger.error({ err: reason }, 'Unhandled rejection');
});
```

#### 2. Auth Middleware → `middleware/auth.js`

Сейчас 0 логов. При невалидном токене просто 401, но в мониторинге — тишина. Нужно:

| Событие | Уровень | Данные |
|---------|---------|--------|
| Невалидный токен | `warn` | `{ ip: req.ip, userAgent }` |
| Истёкший токен | `info` | `{ ip: req.ip, userId }` |
| Отсутствие заголовка | `debug` | `{ ip: req.ip, url: req.url }` |

#### 3. Неудачный логин + IP → `routes/auth.js`

Сейчас логируется username, но **не IP**. Для защиты от брутфорса:
```js
log.warn({ username, ip: req.ip }, 'Failed login attempt')
```

---

### 🟡 Бизнес-события (аудит действий)

#### 4. `routes/devices.js` — 0 логов!
- Создание pairing кода → `info` (кто, когда)
- Успешная привязка устройства → `info`
- Удаление устройства → `warn` (деструктивное действие)
- Ошибки → `error`

#### 5. `routes/recipes.js` — 0 логов!
- Создание рецепта → `info({ userId, recipeName })`
- Удаление рецепта → `warn({ userId, recipeId })`
- Импорт BeerXML → `info({ userId, count })`

#### 6. `routes/users.js` — 0 логов!
- Удаление пользователя → `warn({ adminId, deletedUserId })`
- Смена роли → `warn({ adminId, targetUserId, newRole })`
- Обновление подписки → `info({ userId, tier, status })`

---

### 🟢 Операционный мониторинг

#### 7. Startup diagnostics → `server.js`

При старте логировать ключевые параметры окружения одной строкой:
```js
logger.info({
    module: 'Server',
    nodeVersion: process.version,
    env: process.env.NODE_ENV,
    dbPath: DB_PATH,
    connectionType: CONNECTION_TYPE,
    memoryMb: Math.round(process.memoryUsage().rss / 1024 / 1024)
}, 'Environment info')
```

#### 8. Periodic heartbeat → `server.js`

Раз в 5 минут — позволяет строить графики и алертить при утечке памяти:
```js
setInterval(() => {
    logger.info({
        module: 'Health',
        rssMemMb: Math.round(process.memoryUsage().rss / 1024 / 1024),
        heapUsedMb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
        uiClients: getClientCount(),
        hwClients: getHardwareCount(),
        uptime: Math.round(process.uptime())
    }, 'Heartbeat');
}, 5 * 60 * 1000);
```

#### 9. Slow queries → `db/database.js`

Обернуть базовые хелперы в таймер — ловить тяжёлые запросы:
```js
function queryAll(sql, params = []) {
    const start = performance.now();
    const result = db.prepare(sql).all(params);
    const ms = performance.now() - start;
    if (ms > 100) log.warn({ sql: sql.slice(0, 80), ms: Math.round(ms) }, 'Slow query');
    return result;
}
```

---

### Сводка новых логов

| # | Что | Где | Приоритет |
|---|-----|-----|-----------|
| 1 | `uncaughtException` / `unhandledRejection` | `server.js` | 🔴 Критический |
| 2 | Auth failure + IP | `middleware/auth.js` | 🔴 Критический |
| 3 | Login failure + IP | `routes/auth.js` | 🔴 Критический |
| 4 | Device lifecycle | `routes/devices.js` | 🟡 Важный |
| 5 | Recipe CRUD | `routes/recipes.js` | 🟡 Важный |
| 6 | User management audit | `routes/users.js` | 🟡 Важный |
| 7 | Startup diagnostics | `server.js` | 🟢 Второстепенный |
| 8 | Heartbeat (RAM, clients, uptime) | `server.js` | 🟢 Второстепенный |
| 9 | Slow queries | `db/database.js` | 🟢 Второстепенный |

---

## Verification Plan

### Automated Tests
- Запустить бэкенд в dev-режиме — убедиться что логи выводятся через pino-pretty
- Установить `LOG_FORMAT=json` — убедиться что выход чистый JSON
- Проверить что `LOG_LEVEL=warn` скрывает `info`/`debug` сообщения
- Поиск по проекту: `grep -r "console\." backend/ --include="*.js"` — не должно быть результатов (кроме `migrateDevices.js`)

### Manual Verification
- Залогиниться → проверить что в логах видны `module:Auth` + `info`
- Запустить сессию → проверить `module:Sessions` + `module:Telegram`
- Подключить/отключить WS клиент → проверить `module:WS`
- Проверить heartbeat в логах раз в 5 минут
- Спровоцировать 401 → убедиться что в логах видны `ip` и `userAgent`
