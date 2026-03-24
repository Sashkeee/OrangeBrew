# OrangeBrew ESP32-C3 Firmware v2.2-C3

Адаптация прошивки для ESP32-C3 (RISC-V, одноядерный).

---

## Отличия от ESP32-варианта

| | ESP32 | ESP32-C3 |
|---|---|---|
| Архитектура | Xtensa LX6, 2 ядра | RISC-V, 1 ядро |
| GPIO запрещены | — | 12–17 (SPI Flash) |
| BOOT-кнопка | GPIO 0 | GPIO 9 |
| Serial | UART0 (USB-UART чип) | USB CDC (нативный USB) |
| Device ID | `ESP32_XXXXXX` | `ESP32C3_XXXXXX` |

---

## Необходимые библиотеки (те же, что для ESP32)

| Библиотека | Версия | Установка |
|---|---|---|
| ArduinoJson | ≥ 6.x | Arduino Library Manager |
| WebSockets (Markus Sattler) | ≥ 2.4 | Arduino Library Manager |
| OneWire | любая | Arduino Library Manager |
| DallasTemperature | любая | Arduino Library Manager |
| ESP32 Arduino Core | ≥ 2.x | Boards Manager |

---

## Настройки Arduino IDE

```
Плата:            ESP32C3 Dev Module
USB CDC On Boot:  Enabled       ← обязательно для Serial через USB
CPU Frequency:    160 MHz
Flash Size:       4MB
Partition Scheme: Default 4MB
```

> Если Serial в мониторе порта не появляется — нажмите RESET на плате после открытия монитора.

---

## Пины

| GPIO | Функция |
|---|---|
| **5** | OneWire шина (DS18B20 датчики температуры) |
| **6** | Реле нагревателя (ТЭН, SSR) — медленный ШИМ 2 сек |
| **7** | Реле насоса |
| **9** | Кнопка BOOT (сброс при удержании 3 сек) |

**Запрещённые GPIO на ESP32-C3:** 11 (VDD_SPI), 12–17 (подключены к SPI Flash).
GPIO 2/3 — UART0 (TX/RX), лучше не занимать.

---

## Первый запуск после прошивки

```
ESP32-C3 стартует
  → нет api_key в NVS
  → поднимает Wi-Fi точку доступа «Orange_XXXXXX» (без пароля)
  → запускает DNS-сервер (captive portal)
  → запускает веб-сервер на 192.168.4.1
```

**Шаги:**

1. Подключиться к точке доступа **`Orange_XXXXXX`** (пароля нет)
2. Браузер автоматически откроет портал. Если нет — открыть **`192.168.4.1`** вручную
3. Заполнить форму:
   - **Сеть** — ваш Wi-Fi
   - **Пароль** — пароль от Wi-Fi
   - **Код сопряжения** — 6 символов, получить на **`test.orangebrew.ru/devices/pair`**
4. Нажать **«Подключить»**

---

## Сброс к заводским настройкам

| Способ | Действие |
|---|---|
| **Кнопка BOOT (GPIO 9)** | Удержать **3 секунды** |
| **Serial Monitor** | Отправить `RESET` |

---

## Serial Monitor (115200 baud)

| Команда | Результат |
|---|---|
| `RESET` | Очистить NVS, перезагрузиться в портал |
| `STATUS` | Текущее состояние (IP, датчики, нагрев) |
| `SCAN` | Пересканировать Wi-Fi сети |
| `HELP` | Список команд |

---

## Протокол WebSocket

Идентичен ESP32-варианту. Отличие только в `name` и `deviceId`:

```json
→ {"type": "pair", "pairing_code": "ABCDEF", "deviceId": "ESP32C3_abc123", "name": "OrangeBrew ESP32-C3"}
← {"type": "paired", "api_key": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"}
```

```json
→ {"type": "auth", "api_key": "..."}
→ {"type": "sensors_raw", "sensors": [{"address": "28ff...", "temp": 65.25}]}
← {"cmd": "setHeater", "value": 75}
← {"cmd": "setPump",   "value": true}
```
