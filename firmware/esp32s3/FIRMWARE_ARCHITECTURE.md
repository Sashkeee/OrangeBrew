# OrangeBrew ESP32-S3 — Архитектура прошивки

> Этот документ — обязательное чтение перед любыми изменениями прошивки.
> Описывает v1.2.0 (базовая) и v1.3.x (FastPWM).

---

## Файлы

```
firmware/esp32s3/
├── OrangeBrew_ESP32S3/
│   └── OrangeBrew_ESP32S3.ino     ← v1.2.0 (базовая, gitignored — содержит WiFi пароль)
├── OrangeBrew_ESP32S3_FastPWM/
│   ├── OrangeBrew_ESP32S3_FastPWM.ino  ← v1.3.1 (единственное отличие: LEDC PWM вместо burst)
│   └── (portal_html.h берётся из OrangeBrew_ESP32S3/ — один файл для обеих)
├── OrangeBrew_ESP32S3_Diag/
│   └── OrangeBrew_ESP32S3_Diag.ino    ← диагностика железа (AP, датчики, пины)
├── test_fast_PWM/
│   └── test_fast_PWM.ino              ← минимальный тест LEDC PWM без WiFi/WS
└── FIRMWARE_ARCHITECTURE.md           ← этот файл
```

---

## Распиновка

| GPIO | Функция | Примечание |
|------|---------|-----------|
| 4 | OneWire DS18B20 | Подтяжка 4.7 кОм между DATA и 3.3V |
| 5 | Нагреватель | v1.2.0: реле/SSR zero-crossing / v1.3.x: MOSFET или SSR random-firing |
| 6 | Насос | Реле (HIGH=вкл) |
| 21 | LED встроенный | Синий |
| 0 | Кнопка BOOT | Удержание 3с = сброс NVS |
| 19,20 | USB D-/D+ | ⛔ Не использовать |
| 43,44 | UART0 TX/RX | ⛔ Не использовать (Serial Monitor) |
| 45,46 | Strapping pins | ⛔ Не использовать |

---

## Совместимость с силовыми ключами

| Тип ключа | v1.2.0 (burst) | v1.3.x (FastPWM 1кГц) | Примечание |
|-----------|:--------------:|:---------------------:|-----------|
| Механическое реле | ✅ | ❌ | Только для насоса/индикаторов (GPIO 6) |
| SSR **zero-crossing** (SSR25-DA, Fotek SSR-40DA и большинство SSR с AliExpress) | ✅ | ❌ | Переключается только в момент перехода AC через 0 (каждые 10мс). 1кГц PWM игнорируется — результат непредсказуем |
| SSR **random-firing** | ✅ | ✅ | Переключается мгновенно по входному сигналу |
| MOSFET (IRF540N, IRLZ44N и др.) | ✅ | ✅ | Только для DC нагрузки |

**Текущий стенд:** SSR25-DA (zero-crossing) → используй **v1.2.0**.
FastPWM имеет смысл только после замены на random-firing SSR или MOSFET.

---

## Машина состояний

```
                    ┌─────────────┐
    старт           │   S_PORTAL  │  AP "Orange_XXXXXX" + DNS + HTTP портал
    (нет NVS)  ───► │             │  Ждёт SSID+pass+pairing_code из формы
                    └──────┬──────┘
                           │ connectWiFi() OK
                           ▼
                    ┌─────────────┐
                    │  S_PAIRING  │  WiFi есть, api_key нет
                    │             │  WS → wsSendPair() → ждёт {type:"paired"}
                    └──────┬──────┘
                           │ получен api_key → сохранён в NVS → ESP.restart()
                           ▼
    старт           ┌─────────────┐
    (NVS есть) ───► │  S_NORMAL   │  Рабочий режим
                    │             │  WS → wsSendAuth() → датчики + heartbeat
                    └─────────────┘

    Сброс (BOOT 3с или RESET) → nvsClearAll() → ESP.restart() → S_PORTAL
```

---

## Ключевые компоненты

### NVS (Preferences, namespace "ob")

| Ключ | Что хранит | Когда записывается |
|------|-----------|-------------------|
| `wifi_ssid` | SSID сети | После успешного паринга / команда WIFI |
| `wifi_pass` | Пароль сети | То же |
| `api_key` | Per-device ключ от сервера | После получения {type:"paired"} |

---

### WebSocket — типы сообщений

**Исходящие (ESP → сервер):**

| type | Когда | Содержимое |
|------|-------|-----------|
| `pair` | S_PAIRING + WS connected | `pairing_code`, `deviceId`, `name`, `fw_version` |
| `auth` | S_NORMAL + WS connected | `api_key` |
| `sensors_raw` | каждые 1500мс | `sensors[]` (address + temp), `heater%`, `pump` |
| `heartbeat` | каждые 60с | `uptime`, `heap` |
| `device_log` | при каждом logI/logW/logE | `level`, `msg`, `uptime` → Betterstack |

**Входящие (сервер → ESP):**

| type / cmd | Действие |
|-----------|---------|
| `{type:"paired", api_key}` | Сохранить api_key в NVS → restart |
| `{type:"error", message}` | logE |
| `{cmd:"setHeater", value:0-100}` | Установить мощность нагревателя |
| `{cmd:"setPump", value:bool}` | Включить/выключить насос |

---

### LED — неблокирующие паттерны (`updateLed()`)

| Состояние | Паттерн | Цикл |
|----------|---------|------|
| WS подключён | Горит постоянно | — |
| WiFi OK, WS нет | Двойная вспышка: вкл100–выкл100–вкл100–выкл1000 | 1300мс |
| Нет WiFi | 2 вспышки/сек: вкл250–выкл250 | 500мс |

`ledBlink(N)` — **блокирующий**, только для разовых событий:
- 1 вспышка при старте
- 3 вспышки при запуске портала
- 5 вспышек при успешном паринге
- OTA progress

---

### Логирование

```cpp
logD("msg")  // debug  → Serial + WS device_log
logI("msg")  // info   → Serial + WS device_log → Betterstack
logW("msg")  // warn   → Serial + WS device_log → Betterstack
logE("msg")  // error  → Serial + WS device_log → Betterstack
```

Все логи пишутся в Serial **всегда**. В WS — только если `wsConnected == true`.

---

### Device ID

```cpp
// Все 6 байт eFuse MAC → "ESP32S3_AABBCCDDEEFF"
// НЕ использовать (uint32_t)ESP.getEfuseMac() — даёт только 4 байта → коллизии!
uint64_t mac64 = ESP.getEfuseMac();
snprintf(buf, sizeof(buf), "ESP32S3_%02X%02X%02X%02X%02X%02X",
         (uint8_t)(mac64), (uint8_t)(mac64>>8), ...);
```

---

### Портал (`S_PORTAL`)

Реализован через **WebServer + DNSServer** — без сторонних библиотек.

| Эндпоинт | Метод | Назначение |
|---------|-------|-----------|
| `/` | GET | Главная страница (из `portal_html.h`) |
| `/scan` | GET | JSON список WiFi-сетей (результат `scanWifi()`) |
| `/save` | POST | Принять SSID+pass+code → `formSubmitted=true` |
| `*` | ANY | Редирект на `192.168.4.1` (captive portal) |

HTML страницы — в файле `portal_html.h` (константа `PORTAL_HTML`).
Плейсхолдеры: `%%STATUS%%`, `%%DEVICE_ID%%`, `%%HOST%%`.

---

### OTA

- Хост: `deviceId` (виден в Arduino IDE как `ESP32S3_AABBCC...`)
- Пароль: `OTA_PASSWORD` (константа в прошивке)
- При старте OTA: нагреватель выключается, насос выключается

---

### Watchdog

```cpp
// ESP32 core 3.x — конфигурация через структуру (не через старый API)
esp_task_wdt_deinit();  // сброс после WDT-reboot
esp_task_wdt_config_t wdt_cfg = { .timeout_ms = 30000, .trigger_panic = true };
esp_task_wdt_init(&wdt_cfg);
esp_task_wdt_add(NULL);

// В loop() — ПЕРВАЯ строка:
esp_task_wdt_reset();
// Также внутри connectWiFi() в цикле delay(500)
```

---

## Что отличается между v1.2.0 и v1.3.1

### v1.2.0 — Burst firing (механическое реле / SSR)

```cpp
#define HEATER_WINDOW_MS 200UL  // 20 полупериодов при 50 Гц, шаг 5%

void updateHeater() {
    static unsigned long windowStart = 0;
    unsigned long now = millis();
    if (now - windowStart >= HEATER_WINDOW_MS) windowStart = now;
    long onTime = (HEATER_WINDOW_MS * heaterPct) / 100;
    digitalWrite(HEATER_PIN, (now - windowStart < onTime) ? HIGH : LOW);
}
// Вызывается в loop() каждую итерацию
```

### v1.3.1 — LEDC PWM 1кГц (MOSFET / SSR random-firing)

```cpp
// API ESP32 core 3.x (3.0+) — нет каналов, pin-based:
#define PWM_FREQ       1000
#define PWM_RESOLUTION 10        // 0..1023

// В setup():
ledcAttach(HEATER_PIN, PWM_FREQ, PWM_RESOLUTION);
ledcWrite(HEATER_PIN, 0);

// В wsHandleMessage() при setHeater:
uint32_t duty = map(heaterPct, 0, 100, 0, PWM_MAX_DUTY);
ledcWrite(HEATER_PIN, duty);  // применяется немедленно, не в loop()

// updateHeater() — УДАЛЕНА
// Вызов в loop() — УДАЛЁН
```

**⚠️ Важно:** `ledcWrite(HEATER_PIN, 0)` вместо `digitalWrite(HEATER_PIN, LOW)` везде где выключается нагреватель (OTA, аварийная остановка).

**⚠️ Совместимость:** `ledcSetup()` / `ledcAttachPin()` — это API core **2.x**, в core **3.x удалены**. Используй только `ledcAttach(pin, freq, res)` + `ledcWrite(pin, duty)`.

---

## Библиотеки

| Библиотека | Автор | Используется для |
|-----------|-------|----------------|
| ArduinoJson | Benoit Blanchon | JSON сериализация/десериализация |
| OneWire | Jim Studt | Шина DS18B20 |
| DallasTemperature | Miles Burton | Чтение температуры с DS18B20 |
| WebSocketsClient | Links2004 (Markus Sattler) | WS клиент |
| WiFi | встроена в ESP32 core | WiFi |
| WebServer | встроена в ESP32 core | HTTP сервер портала |
| DNSServer | встроена в ESP32 core | Captive portal DNS |
| ArduinoOTA | встроена в ESP32 core | OTA обновления |
| Preferences | встроена в ESP32 core | NVS хранилище |
| esp_task_wdt | встроена в ESP32 core (IDF) | Watchdog timer |

**WiFiManager (tzapu) — НЕ используется.** Портал реализован кастомно.

---

## Serial команды

| Команда | Действие |
|---------|---------|
| `RESET` | Очистить NVS + перезагрузка |
| `STATUS` | Вывести состояние (uptime, IP, RSSI, WS, нагрев, датчики) |
| `SCAN` | Сканировать WiFi сети |
| `WIFI <ssid> [pass]` | Подключиться к сети, сохранить в NVS |
| `PAIR <6-значный код>` | Отправить pairing запрос на сервер |
| `HELP` | Список команд |

---

## Arduino IDE настройки (обязательно)

| Параметр | Значение |
|---------|---------|
| Board | ESP32S3 Dev Module |
| USB CDC On Boot | **Enabled** ← без этого нет Serial |
| Upload Speed | 921600 |
| Flash Size | 4MB (QIO) |
| Partition Scheme | **Minimal SPIFFS (1.9MB APP with OTA)** ← нужно для OTA |

---

## Правила при изменении прошивки

1. **Не заменять кастомный портал** на WiFiManager или другие библиотеки — портал реализован самостоятельно через WebServer+DNSServer+`portal_html.h`
2. **Не убирать `esp_task_wdt_reset()`** из начала `loop()` и из `connectWiFi()`
3. **Не использовать `(uint32_t)ESP.getEfuseMac()`** — только `uint64_t` с побайтовой распаковкой
4. **Не ставить `digitalWrite(HEATER_PIN, ...)` в v1.3.x** — только `ledcWrite(PWM_CHANNEL, ...)`
5. **Не управлять LED напрямую** в обработчиках WS-событий — LED управляется только через `updateLed()` и `ledBlink()`
6. **Минимальный diff** при переписывании — менять только то что нужно, остальное оставлять как есть
7. **`portal_html.h` gitignored** (лежит рядом с `.ino`, содержит большой HTML) — файл есть локально у разработчика
