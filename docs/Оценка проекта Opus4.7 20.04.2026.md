# Оценка проекта OrangeBrew — Opus 4.7, 20.04.2026

Структурированный отчёт с верифицированными находками (каждая проверена по коду). Находки, которые при проверке оказались опровергнутыми или уже закрытыми, отфильтрованы.

---

## 🔴 Критические (безопасность / потеря данных)

### 1. XXE уязвимость в BeerXML парсере
- **Файл:** `backend/beerxml/parser.js:138`
- **Что:** `parseStringPromise()` вызывается без опций защиты от XXE. Конфиг — только `explicitArray`, `trim`, `explicitCharkey`. DTD/ENTITY не отключены.
- **Риск:** Загрузка рецепта с `<!DOCTYPE foo [<!ENTITY xxe SYSTEM "file:///etc/passwd">]>` может привести к чтению произвольных файлов.
- **Решение:** Предобработать XML (strip DTD), либо перейти на парсер с безопасным дефолтом (fast-xml-parser с `processEntities: false`).

### 2. JWT в query string WebSocket
- **Файл:** `frontend/src/api/wsClient.js:38`, `backend/ws/liveServer.js`
- **Что:** `ws://backend/ws?token=JWT` — токен попадает в proxy/access логи, history браузера, Vector/Betterstack.
- **Решение:** Отправлять токен первым сообщением `{type:'auth', token}` после open, либо cookie-based auth. Закрывать WS если auth не пришёл за N секунд.

### 3. Нет валидации recipe в `/api/process/start`
- **Файл:** `backend/routes/process.js`, `backend/services/ProcessManager.js:74`
- **Что:** `req.body` передаётся прямо в `ProcessManager.start()`. Есть только `if (steps.length === 0) throw`. Malformed step с `temp=NaN`, `duration=-1`, `duration=Infinity` пройдёт и может вызвать зависание таймеров или мгновенный skip всех шагов.
- **Решение:** Joi/Zod schema для recipe: `mash_steps[].temperature ∈ [0,110]`, `duration ∈ [1,600] минут`, `required fields`.

### 4. Нет safety limit по температуре в PID
- **Файл:** `backend/pid/PidManager.js`
- **Что:** `setTarget()` принимает любое число. Нет hard-stop при температуре >110°C или при разносе (термобегство).
- **Риск:** На реальном ТЭНе 5кВт — пожароопасно. API-клиент может выставить target=200.
- **Решение:** Валидация target ∈ [0,105°C]; watchdog: если измеренная T > SAFETY_MAX_TEMP (напр. 110°C) — emergency_stop + audit. Уже есть `SAFETY` в constants.js — использовать.

### 5. Cleanup `processManagers` при удалении пользователя отсутствует
- **Файл:** `backend/server.js:175`, `backend/routes/admin.js`
- **Что:** `Map<userId, ProcessManager>` растёт монотонно. В admin.js нет endpoint DELETE user с очисткой. При будущем self-delete аккаунта — утечка PID + таймеров.
- **Решение:** При удалении/бане пользователя — `pm.stop()`, `pidManager.destroy()`, `processManagers.delete(userId)`. Также очистить `latestReadingsMap` и `discoveredSensors` по userId.

---

## 🟠 Высокие (утечки ресурсов / race conditions)

### 6. Утечка listeners в `PidManager`
- **Файл:** `backend/pid/PidManager.js:60-79`
- **Что:** `serial.on('data', ...)` подписывается в конструкторе **и** в `setSerial()`. Старый listener не снимается. При смене serial (mock→wifi или пересоздании) listeners накапливаются → утечка + дублирующие обработки кадров датчиков.
- **Решение:** Сохранить reference на callback, вызвать `serial.off('data', cb)` перед новой подпиской.

### 7. Утечка polling interval в `useSensors`
- **Файл:** `frontend/src/hooks/useSensors.js:28`
- **Что:** `pollingRef` не очищается в cleanup effect. При частых remount/WS flap может запускаться несколько `setInterval` параллельно.
- **Решение:** `return () => clearInterval(pollingRef.current)` в useEffect cleanup + обнулять ref.

### 8. Нет валидации mash-step полей (temp/duration)
- **Файл:** `backend/services/ProcessManager.js:74`
- **Что:** Пустой массив ловится, но step с `duration: 0`/отрицательным или `temperature: null` — нет. Может привести к мгновенному проходу всех шагов или delay=0 цикл.
- **Решение:** Вынести валидацию steps в отдельную функцию, вызвать перед `start()`.

---

## 🟡 Средние (архитектура / изоляция)

### 9. Rate limit не применён к `/process` и `/control`
- **Файл:** `backend/server.js`
- **Что:** Общий `apiLimiter` (200/мин) — но критичные endpoints управления железом не имеют своего лимитера. `/api/process/start` можно спамить → накладка нескольких start-ов, дёрганье реле.
- **Решение:** Отдельный `controlLimiter` (10-20/мин) на `/api/process/*` и `/api/control/*`.

### 10. Дублирование `RecipeConstructor_V1…V7`
- **Файлы:** `frontend/src/pages/RecipeConstructor.jsx`, `RecipeConstructor_V2.jsx`, `RecipeConstructor_V3.jsx` … `RecipeConstructor_V7.jsx` (V3-V7 untracked)
- **Что:** 7 версий в рабочем дереве, V3-V7 вне git. Путаница какая актуальна, рассинхронизация логики валидации/полей.
- **Решение:** Выбрать финальную версию, удалить остальные (предварительно закоммитить V3-V7 в экспериментальную ветку, чтобы не потерять наработки).

### 11. `console.error` в критичной точке инициализации
- **Файл:** `backend/config/env.js:15`
- **Что:** Нарушает политику CLAUDE.md #12 — все `console.*` должны быть на Pino. Не попадёт в Vector → Betterstack.
- **Решение:** `logger.fatal()` + `process.exit(1)`; либо bootstrap logger до инициализации env.

### 12. Диагностический лог cross-talk `28ff36e07116047a`
- **Файл:** `backend/server.js` (TODO #29 из CLAUDE.md)
- **Что:** Временный отладочный лог с захардкоженным адресом датчика — шум в логах и когнитивный долг.
- **Решение:** Удалить, либо вынести за feature flag `DEBUG_SENSOR_CROSSTALK`.

### 13. `boiling_temp` тестовый хак в продакшн-коде
- **Файл:** `backend/services/ProcessManager.js`, `backend/routes/settings.js` (TODO #30)
- **Что:** Настройка позволяет «кипятить» при 40°C для стенда с лампочками — опасно если утечёт в прод.
- **Решение:** Обернуть в `if (process.env.ALLOW_FAKE_BOIL === '1')`; иначе всегда 100°C.

### 14. Sensor grace period отсутствует (TODO #28)
- **Файл:** `frontend/src/hooks/useSensors.js`
- **Что:** При одном пропуске OneWire-цикла датчик пропадает из UI. На реальном железе DS18B20 иногда не отвечает.
- **Решение:** Stale-флаг после 1-2 пропусков, удаление из списка после 5.

### 15. Device-bound sensor binding отсутствует (TODO #27)
- **Файл:** `backend/utils/sensorMapper.js`
- **Что:** Если у двух устройств одного user случайно совпадут адреса датчиков (например, подменили зонд) — данные будут смешиваться.
- **Решение:** В таблице `sensors` ключ `(user_id, device_id, address)`. Игнорировать пакет если `(device_id, address)` не зарегистрирован.

---

## 🔵 Производительность

### 16. Индексы в БД не подтверждены
- **Файл:** `backend/db/schema.sql`, `backend/db/migrations/`
- **Что:** Нужно явно аудировать индексы на:
  - `recipes(user_id)`, `brew_sessions(user_id, status)`
  - `temperature_readings(session_id, timestamp)` — главный hot-path для истории
  - `audit_log(user_id, created_at)` — для cleanup 30-day и admin-панели
  - `sensors(user_id, address)`
- **Решение:** Аудит + новая миграция `006_indexes.sql` при необходимости.

### 17. Batching показаний датчиков отсутствует
- **Файл:** `backend/server.js` `onHardwareData`
- **Что:** Каждый WS-пакет → `mapSensors()` → несколько DB-запросов + broadcast. При высокой частоте (каждые 1-2 с от N устройств) — лишние обращения.
- **Решение:** Batch insert `temperature_readings` раз в N секунд (buffer + flush).

---

## 🟢 Рефакторинг / техдолг

### 18. `routes/users.js` использует `getDb()` напрямую (TODO #7)
Отрефакторить через `userQueries` для консистентности с остальным кодом.

### 19. `global._latestProcessState` в telegram.js (TODO #5)
Антипаттерн. Передавать через параметр или subscribe на ProcessManager emit.

### 20. Мёртвый код `sql.js` зависимость (TODO #8)
Удалить из `backend/package.json`.

### 21. ESP32-C3: `Serial.println` не мигрирован на `log()` (TODO #10)
Логи устройств не попадают в Betterstack. Миграция рутинная, но полезная для операционной наблюдаемости.

### 22. ESP32-S3 WSS без CA (TODO #23)
`wsClient.beginSSL()` без `setCACert()` — MITM возможен. Для prod необходимо.

---

## 🧪 Тестовое покрытие — белые пятна

Критичные модули без явных unit-тестов:
- **ProcessManager state machine** — переходы IDLE→HEATING→HOLDING→COMPLETED, skip на границах, pause/resume, восстановление после падения backend
- **PidManager heating↔holding switch** — переход при `target - 1°C`, anti-windup, поведение при резких изменениях setpoint
- **Multi-user изоляция** — e2e: user A stream датчиков не появляется у user B ни через REST, ни через WS
- **Pairing race** — два устройства с одинаковым deviceId у разных пользователей (UUID fallback, проверка что чужой api_key не перезаписан)
- **WS token change** — смена пользователя в той же вкладке → старые события не прилетают

---

## Предлагаемый порядок работ

**Спринт 1 — безопасность (критично перед prod):**
1. XXE в BeerXML (#1)
2. Валидация recipe + PID safety limits (#3, #4)
3. Rate limit на /process /control (#9)
4. JWT убрать из query string (#2)

**Спринт 2 — стабильность:**
5. Listener leak в PidManager (#6)
6. Polling leak в useSensors (#7)
7. Cleanup processManagers при удалении user (#5)
8. Удалить тестовый хак `boiling_temp` и диагностический лог cross-talk (#12, #13)

**Спринт 3 — качество и UX:**
9. Grace period + device-bound binding для датчиков (#14, #15)
10. Чистка RecipeConstructor V1-V7 (#10)
11. Индексы БД (#16)
12. Закрытие рутинных TODO #5, #7, #8, #10

**Спринт 4 — observability / тесты:**
13. Тесты ProcessManager, PidManager, multi-user изоляции
14. Миграция console.error в env.js на Pino (#11)
15. ESP32-C3 миграция логов на `log()`

---

**Методология:** анализ проведён в два прохода — первичный обзор кодовой базы + верификация каждого утверждения по конкретным файлам (file:line + цитата). Опровергнутые находки (off-by-one в advanceStep, race condition в close/error WS, валидация control.level, ban check в auth middleware, anti-windup в PidController) в отчёт не включены.
