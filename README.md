# OrangeBrew

**OrangeBrew** — IoT-платформа для автоматизации пивоварения и дистилляции.
Управление процессом через единый веб-интерфейс: затирание, кипячение, ферментация, дистилляция, ректификация.
ESP32/ESP8266 собирают данные с датчиков DS18B20, backend управляет ПИД-регулятором и ведёт сценарий варки.

Multi-tenant SaaS архитектура: данные изолированы по пользователям, каждый пользователь имеет свой набор устройств и процессов.

---

## Стек технологий

| Слой | Технологии |
|------|-----------|
| **Frontend** | React 19, Vite 7, React Router 7, Recharts, Framer Motion, Lucide React, CodeMirror |
| **Backend** | Node.js (ESM), Express 4, WebSocket (`ws`), JWT auth, bcrypt, Pino structured logging |
| **Database** | SQLite (better-sqlite3), FTS5 полнотекстовый поиск |
| **Hardware** | ESP32 / ESP32-C3 / ESP32-S3 / ESP8266 через WiFi WebSocket или MockSerial (симуляция) |
| **PID** | PID-контроллер с двумя режимами (heating/holding), Kalman-фильтр, автотюнинг (relay-метод) |
| **Infrastructure** | Docker, Caddy (reverse proxy), GitHub Actions CI/CD, Vector + Betterstack (логи) |
| **Тесты** | Vitest, @testing-library/react, Playwright |

---

## Быстрый старт

```bash
# 1. Backend
cd backend
npm install
cp .env.example .env   # настроить JWT_SECRET
node --watch server.js  # http://localhost:3001

# 2. Frontend (в другом терминале)
cd frontend
npm install
npm run dev             # http://localhost:5173
```

При первом запуске создаётся пользователь `admin` (пароль: `admin`). Измените пароль после входа.

---

## Структура проекта

```
OrangeBrew/
├── backend/
│   ├── server.js              # Точка входа: Express + WS + per-user ProcessManager
│   ├── swagger.js             # Swagger/OpenAPI конфигурация
│   ├── config/                # env.js (валидация), constants.js (именованные константы)
│   ├── utils/                 # logger.js (Pino), audit.js, sensorMapper.js, scaleRecipe.js
│   ├── beerxml/               # BeerXML импорт/экспорт (parser, generator, mapper)
│   ├── db/
│   │   ├── database.js        # better-sqlite3, все query-объекты
│   │   ├── schema.sql         # DDL схема
│   │   ├── migrate.js         # Система миграций
│   │   ├── migrations/        # SQL-миграции (001–005)
│   │   ├── trainer-seed.sql   # Данные для SQL Trainer (in-memory sandbox)
│   │   └── sql-tasks.json     # 43 SQL-задачи
│   ├── services/              # ProcessManager (конечный автомат), Telegram
│   ├── pid/                   # PidController, PidManager, PidTuner, KalmanFilter
│   ├── ws/liveServer.js       # WebSocket сервер (UI + ESP32 + паринг + keepalive)
│   ├── serial/                # MockSerial (симулятор), RealSerial (deprecated)
│   ├── routes/                # REST API (auth, recipes, sessions, sensors, control, process, settings, devices, admin, trainer, beerxml, recipe-social)
│   └── middleware/            # JWT authenticate, requireAdmin, ban check, errorHandler
├── frontend/
│   ├── src/
│   │   ├── App.jsx            # Роутер (PrivateRoute, PublicRoute, AdminRoute)
│   │   ├── contexts/          # AuthContext (JWT, login/logout, wsClient disconnect)
│   │   ├── api/               # HTTP client (централизованный fetch), WebSocket client (singleton)
│   │   ├── hooks/             # useProcess, useSensors, useControl, useRecipes, useSession, useAdmin
│   │   ├── pages/             # ~20 страниц (Brewing, Mashing, Boiling, Fermentation, Distillation, Rectification, RecipeConstructor, Settings, AdminPanel, SqlTrainer и др.)
│   │   ├── components/        # DeviceSelector, SensorSelector, ConnectionIndicator, ActiveProcessIndicator
│   │   └── utils/             # constants, formatTime, ingredients (справочники)
│   └── package.json
├── firmware/
│   ├── esp32/                 # Прошивка Node32 (ESP32)
│   ├── esp32c3/               # Прошивка ESP32-C3 Super Mini + диагностика
│   ├── esp32s3/               # Прошивка ESP32-S3 Super Mini v1.2.0 + диагностика
│   └── esp8266/               # Прошивка ESP8266
├── docker-compose.prod.yml    # Production
├── docker-compose.test.yml    # Test + Vector
├── CLAUDE.md                  # Руководство для Claude AI
└── SCHEMA.md                  # Схема БД
```

---

## Архитектура

### Multi-tenant SaaS
- Все данные изолированы по `user_id` (устройства, рецепты, сессии, датчики, настройки)
- Per-user `ProcessManager` — каждый пользователь имеет свой конечный автомат варки
- Per-device `api_key` — ESP32 аутентифицируются индивидуально (не глобальный ключ)
- Паринг устройств через 6-символьный код → WebSocket handshake

### Процесс варки (ProcessManager)
Конечный автомат: `IDLE → HEATING → HOLDING → COMPLETED` (+ `PAUSED`).
Управляет ПИД-регулятором, логирует температуры, уведомляет через Telegram.

### WebSocket
- **UI-клиенты**: JWT в query string, per-user broadcast
- **Hardware-клиенты**: per-device `api_key`, ping/pong keepalive (10s)
- Race condition защита: close/error handlers проверяют `ws === current.ws`
- Token change detection: wsClient переподключается при смене JWT

### PID-регулятор
- Два режима: `heating` (быстрый нагрев) и `holding` (поддержание через PID)
- Kalman-фильтр для шумоподавления датчиков
- Автотюнинг relay-методом (PidTuner)

### Рецепты
- CRUD + BeerXML импорт/экспорт + масштабирование
- Социальные функции: публикация, лайки, комментарии, trending, FTS5 поиск

---

## Переменные окружения

| Переменная | По умолчанию | Описание |
|-----------|-------------|---------|
| `PORT` | `3001` | Порт backend |
| `DB_PATH` | `./data/orangebrew.db` | Путь к SQLite |
| `CONNECTION_TYPE` | `mock` | `mock` или `wifi` |
| `JWT_SECRET` | *обязателен* | Секрет для JWT токенов |
| `LOG_FORMAT` | auto | `json` для Docker |
| `LOG_LEVEL` | `debug`/`info` | Уровень логирования |
| `NODE_ENV` | `development` | Влияет на логи и CORS |
| `FRONTEND_URL` | `http://localhost:5173` | URL фронтенда для CORS |
| `SWAGGER_ENABLED` | `true` (dev) | Swagger UI на `/api-docs` |
| `VITE_API_URL` | `http://localhost:3001` | URL backend для frontend |

---

## Процессы

### Затирание (Mashing)
Пошаговый нагрев сусла с паузами для активации ферментов.
Выбор конкретного датчика и устройства перед запуском.

### Кипячение (Boiling)
Кипячение с расписанием добавки хмеля. Обратный отсчёт.

### Ферментация (Fermentation)
Длительный мониторинг: температура, плотность, ABV. Стадии: primary / secondary / conditioning.

### Дистилляция / Ректификация
Разделение на фракции (головы/тело/хвосты), управление дефлегматором, PID-контроль.

---

## API

Базовый URL: `http://localhost:3001`

### Аутентификация
| Метод | Эндпоинт | Описание |
|-------|----------|---------|
| `POST` | `/auth/login` | Вход (username + password) |
| `POST` | `/auth/register` | Регистрация |
| `POST` | `/auth/logout` | Выход |
| `GET` | `/auth/me` | Текущий пользователь |

### Рецепты
| Метод | Эндпоинт | Описание |
|-------|----------|---------|
| `GET/POST` | `/api/recipes` | Список / создание |
| `GET/PUT/DELETE` | `/api/recipes/:id` | Чтение / обновление / удаление |
| `GET/POST` | `/api/recipes/export`, `/import` | Экспорт / импорт JSON |
| `POST` | `/api/recipes/:id/scale` | Масштабирование |
| `GET` | `/api/recipes/public` | Публичные рецепты |
| `GET` | `/api/recipes/trending` | Трендовые рецепты |
| `GET` | `/api/recipes/search?q=` | FTS5 поиск |
| `POST` | `/api/recipes/:id/like` | Лайк/анлайк |
| `GET/POST` | `/api/recipes/:id/comments` | Комментарии |
| `POST/GET` | `/api/beerxml/import`, `/export/:id` | BeerXML |

### Процесс
| Метод | Эндпоинт | Описание |
|-------|----------|---------|
| `GET` | `/api/process/status` | Состояние процесса |
| `POST` | `/api/process/start` | Запуск |
| `POST` | `/api/process/stop` | Остановка |
| `POST` | `/api/process/pause` | Пауза |
| `POST` | `/api/process/resume` | Продолжение |
| `POST` | `/api/process/skip` | Пропуск шага |

### Управление оборудованием
| Метод | Эндпоинт | Описание |
|-------|----------|---------|
| `POST` | `/api/control/heater` | Нагреватель (0-100%) |
| `POST` | `/api/control/cooler` | Охладитель |
| `POST` | `/api/control/pump` | Насос |
| `POST` | `/api/control/dephleg` | Дефлегматор |
| `POST` | `/api/control/emergency-stop` | Аварийная остановка |

### Датчики
| Метод | Эндпоинт | Описание |
|-------|----------|---------|
| `GET` | `/api/sensors` | Текущие показания |
| `GET` | `/api/sensors/discovered` | Обнаруженные датчики |
| `GET/PUT` | `/api/sensors/config` | Конфигурация датчиков |

### Устройства
| Метод | Эндпоинт | Описание |
|-------|----------|---------|
| `GET` | `/api/devices` | Список устройств |
| `POST` | `/api/devices/pair/init` | Инициировать паринг |
| `GET` | `/api/devices/pair/status` | Статус паринга |

### Админ-панель (admin only)
| Метод | Эндпоинт | Описание |
|-------|----------|---------|
| `GET` | `/api/admin/users` | Пользователи |
| `GET` | `/api/admin/audit` | Аудит-лог |
| `POST` | `/api/admin/users/:id/ban` | Бан |
| `POST` | `/api/admin/users/:id/unban` | Разбан |

### SQL Trainer
| Метод | Эндпоинт | Описание |
|-------|----------|---------|
| `GET` | `/api/trainer/tasks` | Список задач |
| `GET` | `/api/trainer/schema` | Схема учебной БД |
| `POST` | `/api/trainer/execute` | Выполнить SQL |

Полная документация доступна на `/api-docs` (Swagger UI).

---

## Тестирование

```bash
cd backend && npm test    # Vitest backend
cd frontend && npm test   # Vitest frontend
```

---

## Deploy

Docker + GitHub Actions CI/CD. Caddy как reverse proxy.

```bash
docker compose -f docker-compose.prod.yml up -d
```

---

## Схема БД

| Таблица | Назначение |
|---------|-----------|
| `users` | Пользователи (username, email, role, subscription, ban) |
| `devices` | ESP32 устройства (api_key, status, user_id) |
| `device_pairings` | Временные коды паринга |
| `recipes` | Рецепты (ингредиенты, шаги затирания, хмель, social) |
| `recipes_fts` | FTS5 индекс для поиска рецептов |
| `recipe_likes` | Лайки рецептов |
| `recipe_comments` | Комментарии к рецептам |
| `brew_sessions` | Сессии варки/дистилляции |
| `temperature_log` | Лог температур |
| `fermentation_entries` | Записи ферментации |
| `distillation_sessions` | Параметры дистилляции |
| `fraction_log` | Лог фракций |
| `sensors` | Именованные конфигурации датчиков (per-user) |
| `settings_v2` | Настройки (per-user, key-value) |
| `audit_log` | Аудит-лог действий (30 дней retention) |
| `payments` | Платежи (YooKassa, заготовка) |

Подробная схема: `SCHEMA.md`

---

## Лицензия

MIT
