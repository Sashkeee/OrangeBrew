# OrangeBrew ESP32 Firmware v2.1

## Необходимые библиотеки (Arduino IDE / PlatformIO)

| Библиотека | Версия | Установка |
|---|---|---|
| ArduinoJson | ≥ 6.x | Arduino Library Manager |
| WebSockets (Markus Sattler) | ≥ 2.4 | Arduino Library Manager |
| OneWire | любая | Arduino Library Manager |
| DallasTemperature | любая | Arduino Library Manager |
| ESP32 Arduino Core | ≥ 2.x | Boards Manager |

`WiFi`, `WebServer`, `DNSServer`, `Preferences` — входят в состав ESP32 Arduino Core, устанавливать отдельно не нужно.

---

## Первый запуск после прошивки

```
ESP32 стартует
  → нет api_key в NVS
  → поднимает Wi-Fi точку доступа «Orange_XXXXXX» (без пароля)
  → запускает DNS-сервер (captive portal)
  → запускает веб-сервер на 192.168.4.1
```

**Шаги:**

1. Подключиться к точке доступа **`Orange_XXXXXX`** с телефона или ноутбука (пароля нет)
2. Браузер автоматически откроет портал настройки (как в кафе/отеле).
   Если не открылся — вручную зайти на **`192.168.4.1`**
3. Заполнить форму:
   - **Сеть** — название вашего домашнего Wi-Fi
   - **Пароль** — пароль от Wi-Fi
   - **Код сопряжения** — 6 символов, получить на **`test.orangebrew.ru/devices/pair`**
4. Нажать **«Подключить»**

```
ESP подключается к Wi-Fi
  → WebSocket к test.orangebrew.ru/ws
  → отправляет {type:"pair", pairing_code:"ABCDEF", deviceId:"ESP32_xx"}
  → сервер создаёт устройство, возвращает {type:"paired", api_key:"uuid"}
  → ESP сохраняет api_key в NVS (flash)
  → ESP.restart()  ← уходит в обычный режим
```

---

## Обычный запуск (после сопряжения)

AP не поднимается. ESP сразу:
1. Читает `api_key` из NVS
2. Подключается к сохранённому Wi-Fi
3. Открывает WebSocket к серверу
4. Отправляет `{type:"auth", api_key:"..."}` → сервер авторизует устройство
5. Начинает слать показания датчиков каждые 1.5 сек

---

## Сброс к заводским настройкам

| Способ | Действие |
|---|---|
| **Кнопка BOOT** | Удержать **3 секунды** — NVS очищается, ESP перезагружается в режим портала |
| **Serial Monitor** | Отправить команду `RESET` |

После сброса ESP снова поднимет точку доступа и попросит ввести настройки.

---

## Serial Monitor команды (115200 baud)

| Команда | Результат |
|---|---|
| `RESET` | Очистить NVS, перезагрузиться в портал |
| `STATUS` | Вывести текущее состояние (IP, наличие api_key) |

---

## Пины

| Пин GPIO | Функция |
|---|---|
| 13 | OneWire шина (DS18B20 датчики температуры) |
| 14 | Реле нагревателя (ТЭН) — медленный ШИМ, окно 2 сек |
| 12 | Реле насоса |
| 0  | Кнопка BOOT (сброс при удержании 3 сек) |

> Пины легко меняются константами `ONE_WIRE_BUS`, `HEATER_PIN`, `PUMP_PIN` в начале `.ino` файла.

---

## Протокол WebSocket

### Авторизация (есть сохранённый api_key)
```json
→ {"type": "auth", "api_key": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"}
```

### Сопряжение (первый раз, нет api_key)
```json
→ {"type": "pair", "pairing_code": "ABCDEF", "deviceId": "ESP32_abc123", "name": "OrangeBrew ESP32"}
← {"type": "paired", "api_key": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"}
```

### Данные датчиков (каждые 1.5 сек)
```json
→ {"type": "sensors_raw", "sensors": [{"address": "28ff1234...", "temp": 65.25}]}
```

### Команды от сервера
```json
← {"cmd": "setHeater", "value": 75}    // мощность ТЭНа 0–100%
← {"cmd": "setPump",   "value": true}  // насос вкл/выкл
```

---

## Описание ТЭНа (медленный ШИМ)

Используется software PWM с окном 2 секунды — специально для твердотельных реле (SSR) с функцией Zero-Cross. Быстрый `analogWrite` с такими реле не работает.

При `heaterPct = 75` → ТЭН включён 1.5 сек из каждых 2 сек.

---

## Идентификация датчиков DS18B20

Несколько датчиков висят параллельно на одном OneWire пине. Каждый имеет уникальный 8-байтный HEX-адрес. В настройках `test.orangebrew.ru/settings` можно назначить каждому адресу роль («Куб», «Колонна» и т.д.) с поправочным коэффициентом offset.
