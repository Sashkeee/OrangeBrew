  /**
 * OrangeBrew ESP32-S3 — Диагностический скетч
 *
 * Проверяет:
 *   1. Чип и память
 *   2. WiFi MAC и инициализацию
 *   3. Точку доступа (AP) — видимость с телефона
 *   4. Датчики DS18B20 (OneWire на GPIO 4)
 *   5. Пины нагревателя (GPIO 5) и насоса (GPIO 6)
 *   6. Встроенный LED (GPIO 21)
 *
 * Прошивается вместо основной прошивки.
 * После диагностики — вернуть OrangeBrew_ESP32S3.ino
 *
 * Arduino IDE:
 *   Board:            ESP32S3 Dev Module
 *   USB CDC On Boot:  Enabled   ← Serial не появится без этого!
 *   Upload Speed:     921600
 *
 * Распиновка:
 *   GPIO  4 — OneWire DATA (DS18B20), резистор 4.7кОм между DATA и 3.3V
 *   GPIO  5 — Реле нагревателя
 *   GPIO  6 — Реле насоса
 *   GPIO 21 — Встроенный синий LED
 *   GPIO  0 — Кнопка BOOT
 */

#include <Arduino.h>
#include <WiFi.h>
#include "esp_wifi.h"
#include <OneWire.h>
#include <DallasTemperature.h>

// ─── ПИНЫ ─────────────────────────────────────────────────
#define ONE_WIRE_BUS  4
#define HEATER_PIN    5
#define PUMP_PIN      6
#define LED_PIN      21
#define BOOT_PIN      0

OneWire           oneWire(ONE_WIRE_BUS);
DallasTemperature sensors(&oneWire);

// ─── ВСПОМОГАТЕЛЬНЫЕ ──────────────────────────────────────
void separator(const char* title) {
    Serial.println();
    Serial.println("════════════════════════════════════");
    Serial.println(title);
    Serial.println("════════════════════════════════════");
}

void pass(const char* msg) {
    Serial.print("  ✅  ");
    Serial.println(msg);
}

void fail(const char* msg) {
    Serial.print("  ❌  ");
    Serial.println(msg);
}

void info(const char* label, String value) {
    Serial.printf("  %-20s %s\n", label, value.c_str());
}

void ledBlink(int times, int ms = 150) {
    for (int i = 0; i < times; i++) {
        digitalWrite(LED_PIN, HIGH);
        delay(ms);
        digitalWrite(LED_PIN, LOW);
        if (i < times - 1) delay(ms);
    }
}

// ─── 1. ЧИП ───────────────────────────────────────────────
void diagChip() {
    separator("1. ЧИП И ПАМЯТЬ");
    info("Модель:",        String(ESP.getChipModel()) + " rev" + ESP.getChipRevision());
    info("Ядра:",          String(ESP.getChipCores()) + " (Xtensa LX7, dual-core)");
    info("CPU MHz:",       String(ESP.getCpuFreqMHz()));
    info("Flash:",         String(ESP.getFlashChipSize() / 1024) + " KB");
    info("RAM свободно:",  String(ESP.getFreeHeap() / 1024) + " KB");
    info("PSRAM:",         ESP.getPsramSize() > 0
                            ? String(ESP.getPsramSize() / 1024) + " KB"
                            : "нет");
    info("Uptime:",        String(millis() / 1000) + " сек");

    if (ESP.getFreeHeap() < 50000) {
        fail("Мало свободной RAM (<50 KB) — возможны сбои");
    } else {
        pass("RAM в норме");
    }
}

// ─── 2. WiFi MAC ───────────────────────────────────────────
void diagMac() {
    separator("2. WiFi MAC");

    WiFi.mode(WIFI_STA);
    delay(100);

    String mac = WiFi.macAddress();
    info("MAC (STA):", mac);

    if (mac == "00:00:00:00:00:00" || mac.isEmpty()) {
        fail("MAC = 00:00:00:00:00:00 — WiFi не инициализировался");
        fail("Возможно: плохое питание или дефект чипа");
    } else {
        pass("MAC получен успешно");
    }

    WiFi.mode(WIFI_OFF);
    delay(100);
}

// ─── 3. ТОЧКА ДОСТУПА ─────────────────────────────────────
void diagAP() {
    separator("3. ТОЧКА ДОСТУПА (AP)");

    WiFi.disconnect(true);
    WiFi.mode(WIFI_OFF);
    delay(300);

    WiFi.mode(WIFI_AP);
    delay(200);

    WiFi.setTxPower(WIFI_POWER_19_5dBm);

    bool ok = WiFi.softAP("OrangeBrew-S3-DIAG", nullptr, 1, 0, 4);
    delay(500);

    String ip    = WiFi.softAPIP().toString();
    String mac   = WiFi.softAPmacAddress();
    int8_t power = 0;
    esp_wifi_get_max_tx_power(&power);

    info("softAP():", ok ? "true (OK)" : "false (ОШИБКА!)");
    info("IP:",       ip);
    info("MAC (AP):", mac);
    info("Канал:",    "1");
    info("TX power:", String(power * 0.25f, 1) + " dBm");

    if (!ok) {
        fail("softAP() вернул false");
        fail("Попробуй: передёрни питание, проверь напряжение 3.3V");
        return;
    }

    if (ip == "0.0.0.0") {
        fail("IP = 0.0.0.0 — AP не готова");
        return;
    }

    pass("AP запущена");
    Serial.println();
    Serial.println("  >>> Подключись телефоном к сети «OrangeBrew-S3-DIAG»");
    Serial.println("  >>> Жду 60 секунд...");

    unsigned long deadline = millis() + 60000;
    bool connected = false;
    int lastBlink = 0;

    while (millis() < deadline) {
        int clients = WiFi.softAPgetStationNum();
        if (clients > 0) {
            connected = true;
            Serial.printf("\n  [AP] Клиент подключился! Всего: %d\n", clients);
            break;
        }
        // Моргаем LED раз в 2 сек пока ждём
        if ((int)(millis() / 2000) != lastBlink) {
            lastBlink = millis() / 2000;
            ledBlink(1, 100);
        }
        delay(500);
        Serial.print(".");
    }
    Serial.println();

    if (connected) {
        ledBlink(3, 200);
        pass("Телефон подключился к AP — антенна и радио работают");
    } else {
        fail("За 60 сек никто не подключился");
        Serial.println("  Проверь: видна ли сеть «OrangeBrew-S3-DIAG» на телефоне?");
        Serial.println("  Если не видна — проблема с антенной или RF-блоком");
    }

    WiFi.softAPdisconnect(true);
    WiFi.mode(WIFI_OFF);
    delay(200);
}

// ─── 4. ДАТЧИКИ DS18B20 ───────────────────────────────────
void diagSensors() {
    separator("4. ДАТЧИКИ DS18B20");

    info("OneWire GPIO:", String(ONE_WIRE_BUS));
    Serial.println("  Убедись: резистор 4.7кОм между GPIO4 и 3.3V!");

    sensors.begin();
    int count = sensors.getDeviceCount();
    Serial.printf("  Найдено датчиков: %d\n", count);

    if (count == 0) {
        fail("Датчики не найдены");
        Serial.println("  Проверь:");
        Serial.println("    1. Подтяжка 4.7кОм на GPIO4 (между DATA и 3.3V)");
        Serial.println("    2. Питание датчика (VCC → 3.3V, GND → GND)");
        Serial.println("    3. Правильный GPIO (должен быть GPIO4)");
        return;
    }

    sensors.requestTemperatures();
    delay(750);

    for (int i = 0; i < count; i++) {
        DeviceAddress addr;
        if (!sensors.getAddress(addr, i)) continue;

        String addrStr = "";
        for (int j = 0; j < 8; j++) {
            if (addr[j] < 16) addrStr += "0";
            addrStr += String(addr[j], HEX);
        }

        float t = sensors.getTempC(addr);

        if (t == DEVICE_DISCONNECTED_C) {
            Serial.printf("  [%d] %s → ❌ DISCONNECTED\n", i, addrStr.c_str());
        } else if (t == 85.0f) {
            Serial.printf("  [%d] %s → ⚠  85.0°C (не успел сконвертировать — норм при первом чтении)\n",
                          i, addrStr.c_str());
        } else {
            Serial.printf("  [%d] %s → ✅ %.2f°C\n", i, addrStr.c_str(), t);
        }
    }

    if (count > 0) pass("Датчики отвечают");
}

// ─── 5. ПИНЫ РЕЛЕ ─────────────────────────────────────────
void diagPins() {
    separator("5. ПИНЫ НАГРЕВАТЕЛЯ И НАСОСА");

    pinMode(HEATER_PIN, OUTPUT);
    pinMode(PUMP_PIN,   OUTPUT);
    digitalWrite(HEATER_PIN, LOW);
    digitalWrite(PUMP_PIN,   LOW);

    Serial.println("  Оба реле переключаются раз в секунду.");
    Serial.println("  Отправь STOP в Serial Monitor чтобы остановить.");
    Serial.println();

    bool state = false;
    int tick = 0;
    while (true) {
        state = !state;
        digitalWrite(HEATER_PIN, state ? HIGH : LOW);
        digitalWrite(PUMP_PIN,   state ? HIGH : LOW);
        Serial.printf("  [%d] GPIO5 (Heater) + GPIO6 (Pump) → %s\n",
                      ++tick, state ? "HIGH ▲" : "LOW  ▼");

        // Ждём 1 сек, но проверяем Serial каждые 50 мс
        unsigned long t = millis();
        while (millis() - t < 1000) {
            if (Serial.available()) {
                String cmd = Serial.readStringUntil('\n');
                cmd.trim();
                if (cmd.equalsIgnoreCase("STOP")) {
                    digitalWrite(HEATER_PIN, LOW);
                    digitalWrite(PUMP_PIN,   LOW);
                    Serial.println("\n  Остановлено.");
                    pass("GPIO5 + GPIO6 проверены");
                    return;
                }
            }
            delay(50);
        }
    }
}

// ─── 6. ВСТРОЕННЫЙ LED ────────────────────────────────────
void diagLed() {
    separator("6. ВСТРОЕННЫЙ LED (GPIO21)");
    Serial.println("  Моргаю 5 раз...");
    for (int i = 0; i < 5; i++) {
        digitalWrite(LED_PIN, HIGH);
        Serial.printf("  [%d] HIGH\n", i + 1);
        delay(300);
        digitalWrite(LED_PIN, LOW);
        delay(300);
    }
    pass("LED GPIO21 работает (если видел моргание)");
}

// ─── ИТОГ ─────────────────────────────────────────────────
void diagSummary() {
    separator("ГОТОВО");
    Serial.println("  Диагностика завершена.");
    Serial.println();
    Serial.println("  Распиновка OrangeBrew ESP32-S3 Super Mini:");
    Serial.printf ("    GPIO %2d  — OneWire DATA (DS18B20)\n", ONE_WIRE_BUS);
    Serial.printf ("    GPIO %2d  — Реле нагревателя\n",       HEATER_PIN);
    Serial.printf ("    GPIO %2d  — Реле насоса\n",            PUMP_PIN);
    Serial.printf ("    GPIO %2d  — LED (встроенный синий)\n",  LED_PIN);
    Serial.printf ("    GPIO %2d  — BOOT кнопка\n",            BOOT_PIN);
    Serial.println();
    Serial.println("  После проверки — прошей OrangeBrew_ESP32S3.ino");
    Serial.println("  Отправь RESET в Serial Monitor чтобы запустить диагностику снова.");
}

// ─── SETUP / LOOP ─────────────────────────────────────────
void setup() {
    // LED инициализируем до Serial — визуальная обратная связь при старте
    pinMode(LED_PIN, OUTPUT);
    digitalWrite(LED_PIN, HIGH);

    Serial.begin(115200);
    // ESP32-S3 с USB CDC — ждём появления Serial (до 3 сек)
    {
        unsigned long t = millis();
        while (!Serial && millis() - t < 3000);
    }
    delay(200);

    digitalWrite(LED_PIN, LOW);

    Serial.println(F("\n╔══════════════════════════════════════╗"));
    Serial.println(F("║  OrangeBrew ESP32-S3  ДИАГНОСТИКА    ║"));
    Serial.println(F("╚══════════════════════════════════════╝"));

    diagChip();
    diagMac();
    diagLed();
    diagAP();
    diagSensors();
    diagPins();
    diagSummary();
}

void loop() {
    if (Serial.available()) {
        String cmd = Serial.readStringUntil('\n');
        cmd.trim();
        if (cmd.equalsIgnoreCase("RESET")) {
            ESP.restart();
        }
    }
    delay(100);
}
