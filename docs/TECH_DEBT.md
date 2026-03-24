# Технический долг и план улучшений

Результат аудита бэкенда OrangeBrew (март 2026). Проблемы отсортированы по приоритету — сначала быстрые критические фиксы, затем архитектурные улучшения.

---

## Фаза 1: Quick Wins (< 1 часа, делать первыми)

### 1.1 🔴 Убрать fallback JWT_SECRET

**Проблема:** Если `.env` не загрузится — API работает с публично известным секретом.

**Файлы:** `middleware/auth.js`, `ws/liveServer.js`

```js
// ❌ Сейчас
const JWT_SECRET = process.env.JWT_SECRET || 'fallback_super_secret_for_orangebrew';

// ✅ После
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
    throw new Error('FATAL: JWT_SECRET env variable is not set');
}
```

**Время:** 5 минут

---

### 1.2 🔴 Добавить обработку uncaughtException / unhandledRejection

**Проблема:** Необработанные исключения убивают процесс без следа в логах.

**Файл:** `server.js` — добавить в начало `main()`:

```js
process.on('uncaughtException', (err) => {
    logger.fatal({ err }, 'Uncaught exception');
    process.exit(1);
});

process.on('unhandledRejection', (reason) => {
    logger.error({ err: reason }, 'Unhandled rejection');
});
```

**Время:** 5 минут

---

### 1.3 🟡 Централизованный error handler middleware

**Проблема:** Каждый роут ловит ошибки сам, с разным форматом. Возможна утечка `err.message` с деталями SQL наружу.

**Файл:** [NEW] `middleware/errorHandler.js`

```js
import logger from '../utils/logger.js';
const log = logger.child({ module: 'ErrorHandler' });

export function errorHandler(err, req, res, next) {
    const status = err.status || 500;
    const isServer = status >= 500;

    if (isServer) {
        log.error({ err, method: req.method, url: req.url, userId: req.user?.id }, 'Unhandled route error');
    } else {
        log.warn({ status, message: err.message, url: req.url }, 'Client error');
    }

    res.status(status).json({
        error: isServer ? 'Internal server error' : err.message,
    });
}
```

**Файл:** `server.js` — добавить **после всех роутов**, перед `server.listen()`:
```js
app.use(errorHandler);
```

**Файл:** роуты — заменить `try/catch` на `next(err)`:
```js
// ❌ Сейчас (в каждом роуте)
catch (err) { res.status(500).json({ error: err.message }); }

// ✅ После
catch (err) { next(err); }
```

**Время:** 30 минут

---

## Фаза 2: Надёжность (1-2 дня)

### 2.1 🔴 Input validation (Zod)

**Проблема:** Ни один роут не валидирует тело запроса. Мусорный JSON может сломать бизнес-логику или вызвать неожиданное поведение БД.

**Подход:** Использовать [Zod](https://zod.dev/) — лёгкий, TypeScript-совместимый:

```js
import { z } from 'zod';

const loginSchema = z.object({
    username: z.string().min(3).max(50),
    password: z.string().min(6),
});

// middleware
function validate(schema) {
    return (req, res, next) => {
        const result = schema.safeParse(req.body);
        if (!result.success) {
            return res.status(400).json({ error: 'Validation failed', details: result.error.issues });
        }
        req.body = result.data; // очищенные данные
        next();
    };
}

// использование
router.post('/login', validate(loginSchema), async (req, res) => { ... });
```

**Приоритетные роуты для валидации:**

| Роут | Что валидировать |
|------|-----------------|
| `POST /auth/login` | username (string 3-50), password (string 6+) |
| `POST /auth/register` | username, password, email (optional email format) |
| `POST /recipes` | name (string), batch_size (number > 0), ingredients (array) |
| `POST /sessions` | recipe_id (number), type (enum: mash/boil/distillation) |
| `POST /process/start` | recipe (object), mode (enum), deviceId (string) |
| `PATCH /devices/:id` | name (string, optional), role (enum, optional) |
| `PUT /settings` | object с известными ключами |

**Время:** 1-2 дня

---

### 2.2 🟡 Вынести магические числа в конфиг

**Проблема:** Критические параметры закопаны прямо в коде.

| Файл | Значение | Что это |
|------|----------|---------|
| `PidTuner.js` | `98` | Max safe temperature (°C) |
| `PidTuner.js` | `1.5` | Hysteresis deadband (°C) |
| `PidTuner.js` | `0.4` | EMA alpha |
| `PidTuner.js` | `3` | Confirm samples |
| `ProcessManager.js` | `10000` | Temp log interval (ms) |
| `server.js` | `5000` | Shutdown timeout (ms) |
| `server.js` | `30000` | HW data log interval (ms) |
| `liveServer.js` | `10000` | Ping interval (ms) |
| `liveServer.js` | `10000` | Auth timeout (ms) |

**Решение:** `backend/config/constants.js` с именованными экспортами:
```js
export const SAFETY = {
    MAX_TEMP_C: 98,
    HYSTERESIS_C: 1.5,
};

export const INTERVALS = {
    TEMP_LOG_MS: 10_000,
    WS_PING_MS: 10_000,
    SHUTDOWN_TIMEOUT_MS: 5_000,
    HW_DATA_LOG_MS: 30_000,
};
```

**Время:** 30 минут

---

## Фаза 3: Архитектура (неделя+)

### 3.1 🟡 Разбить `database.js` (913 строк)

**Проблема:** Один файл содержит запросы для 10+ сущностей.

**Целевая структура:**
```
db/
├── connection.js        ← initDatabase, getDb, closeDatabase
├── migrate.js           ← как есть
├── queries/
│   ├── users.js         ← userQueries
│   ├── recipes.js       ← recipeQueries + recipeSearchQueries
│   ├── sessions.js      ← sessionQueries
│   ├── devices.js       ← deviceQueries + pairingQueries
│   ├── sensors.js       ← sensorQueries
│   ├── temperature.js   ← temperatureQueries + fractionQueries + fermentationQueries
│   ├── payments.js      ← paymentQueries
│   └── social.js        ← recipeLikesQueries + recipeCommentsQueries
└── schema.sql
```

Каждый файл экспортирует свои queries, импортирует `getDb()` из `connection.js`.

**Время:** 2-3 часа (механический рефакторинг, без изменения логики)

---

### 3.2 🟡 Декаплинг Telegram из ProcessManager

**Проблема:** `ProcessManager.js` напрямую вызывает `telegram.sendMessage()` в 10+ местах. Невозможно добавить другие каналы уведомлений без правки бизнес-логики.

**Решение:** ProcessManager только эмитит события:
```js
// ProcessManager.js
this.emit('notification', {
    type: 'phase_change',
    phase: 'mash',
    message: 'Начало затирания',
    details: `Рецепт: ${recipe.name}`
});

// server.js — подписка
pm.on('notification', (notification) => {
    telegram.handleNotification(notification);
    // Завтра: pushService.handleNotification(notification);
    // Послезавтра: webhookService.handleNotification(notification);
});
```

**Время:** 1-2 часа

---

### 3.3 🟢 Расширение тестового покрытия

> Проект уже имеет хорошую базу: **15 тест-файлов** на backend (vitest) и **7 на frontend**.
> Покрыты: PID-контроллер, ProcessManager, database, API, multiuser isolation, BeerXML, social.

**Что ещё не покрыто и стоит добавить:**

| Модуль | Тип теста | Зачем |
|--------|-----------|-------|
| `PidTuner.js` | Unit | Z-N расчёты (peaks → Ku, Tu → Kp/Ki/Kd), safety stop edge cases |
| `middleware/auth.js` | Unit | Невалидный токен, истёкший токен, отсутствие заголовка |
| Input validation (Zod) | Unit | Если добавим схемы — автоматически тестировать граничные случаи |

---

### 3.4 🟢 TypeScript (перспектива)

Полная миграция на TypeScript — большой проект, но можно начать постепенно:
1. Добавить `tsconfig.json` с `allowJs: true`
2. Новые файлы писать на `.ts`
3. Постепенно переводить существующие, начиная с `PidTuner` и `ProcessManager` (state machine — типы критически полезны)

**Время:** 1+ неделя

---

## Чистка

### Удалить deprecated файлы
- `serial/realSerial.js` — закомментирован в `server.js`, не используется

### Удалить неиспользуемый код
- `paymentQueries` — определены в `database.js`, но не импортируются ни одним роутом (платёжная система не подключена?)

---

## Сводка: дорожная карта

```
Неделя 1:
  ├── [1 час]  Фаза 1: JWT fix + uncaught handlers + error middleware
  ├── [1 день] Логирование: миграция console.* → pino (см. MIGRATION_LOGGING.md)
  └── [30 мин] Магические числа → constants.js

Неделя 2:
  ├── [1-2 дня] Input validation (Zod) на критичных роутах
  ├── [2-3 часа] Разбить database.js
  └── [1-2 часа] Декаплинг Telegram

Неделя 3+:
  ├── [2-3 дня] Vitest: тесты на PID, auth, ProcessManager
  └── [ongoing] Постепенный переход на TypeScript
```
