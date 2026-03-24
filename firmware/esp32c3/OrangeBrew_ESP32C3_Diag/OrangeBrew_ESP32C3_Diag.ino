/**
 * OrangeBrew ESP32-C3 — Диагностический скетч
 *
 * Проверяет:
 *   1. Чип и память
 *   2. WiFi MAC и инициализацию
 *   3. Точку доступа (AP) — видимость с телефона
 *   4. Датчики DS18B20
 *   5. Пины нагревателя и насоса
 *
 * Прошивается вместо основной прошивки.
 * После диагностики — вернуть OrangeBrew_ESP32C3.ino
 *
 * Arduino IDE: ESP32C3 Dev Module, USB CDC On Boot: Enabled
 */

#include <Arduino.h>
#include <WiFi.h>
#include "esp_wifi.h"
#include <OneWire.h>
#include <DallasTemperature.h>

// ─── ПИНЫ ─────────────────────────────────────────────────
#define ONE_WIRE_BUS  5
#define HEATER_PIN    6
#define PUMP_PIN      7
#define BOOT_PIN      9

OneWire          oneWire(ONE_WIRE_BUS);
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
    Serial.printf("  %-18s %s\n", label, value.c_str());
}

// ─── 1. ЧИП ───────────────────────────────────────────────
void diagChip() {
    separator("1. ЧИП И ПАМЯТЬ");
    info("Модель:",      String(ESP.getChipModel()) + " rev" + ESP.getChipRevision());
    info("Ядра:",        String(ESP.getChipCores()) + " (RISC-V)");
    info("CPU MHz:",     String(ESP.getCpuFreqMHz()));
    info("Flash:",       String(ESP.getFlashChipSize() / 1024) + " KB");
    info("RAM свободно:", String(ESP.getFreeHeap() / 1024) + " KB");
    info("Uptime:",      String(millis() / 1000) + " сек");

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

    Serial.println("  Последовательность: OFF → AP (важно для ESP32-C3)");

    WiFi.disconnect(true);
    WiFi.mode(WIFI_OFF);
    delay(300);

    WiFi.mode(WIFI_AP);
    delay(200);

    // Максимальная мощность передатчика
    WiFi.setTxPower(WIFI_POWER_19_5dBm);

    // Канал 1 — самый универсальный, меньше проблем с совместимостью
    bool ok = WiFi.softAP("OrangeBrew-DIAG", nullptr, 1, 0, 4);
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
        fail("Проблема с антенной или питанием");
        return;
    }

    pass("AP запущена");
    Serial.println();
    Serial.println("  >>> Подключись телефоном к сети «OrangeBrew-DIAG»");
    Serial.println("  >>> Жду 60 секунд...");

    unsigned long deadline = millis() + 60000;
    bool connected = false;

    while (millis() < deadline) {
        int clients = WiFi.softAPgetStationNum();
        if (clients > 0) {
            connected = true;
            Serial.printf("\n  [AP] Клиент подключился! Всего: %d\n", clients);
            break;
        }
        delay(500);
        Serial.print(".");
    }
    Serial.println();

    if (connected) {
        pass("Телефон подключился к AP — антенна и радио работают");
    } else {
        fail("За 30 сек никто не подключился");
        Serial.println("  Проверь: видна ли сеть «OrangeBrew-DIAG» на телефоне?");
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

    sensors.begin();
    int count = sensors.getDeviceCount();
    Serial.printf("  Найдено датчиков: %d\n", count);

    if (count == 0) {
        fail("Датчики не найдены");
        Serial.println("  Проверь: подтяжка 4.7кОм на GPIO5, питание датчика");
        return;
    }

    sensors.requestTemperatures();
    delay(750);

    for (int i = 0; i < count; i++) {
        DeviceAddress addr;
        if (!sensors.getAddress(addr, i)) {
            continue;
        }

        String addrStr = "";
        for (int j = 0; j < 8; j++) {
            if (addr[j] < 16) addrStr += "0";
            addrStr += String(addr[j], HEX);
        }

        float t = sensors.getTempC(addr);

        if (t == DEVICE_DISCONNECTED_C) {
            Serial.printf("  [%d] %s → ❌ DISCONNECTED\n", i, addrStr.c_str());
        } else if (t == 85.0f) {
            Serial.printf("  [%d] %s → ⚠  85.0°C (не успел сконвертировать)\n", i, addrStr.c_str());
        } else {
            Serial.printf("  [%d] %s → ✅ %.2f°C\n", i, addrStr.c_str(), t);
        }
    }
}

// ─── 5. ПИНЫ ──────────────────────────────────────────────
void diagPins() {
    separator("5. ПИНЫ НАГРЕВАТЕЛЯ И НАСОСА");

    pinMode(HEATER_PIN, OUTPUT);
    pinMode(PUMP_PIN,   OUTPUT);

    Serial.println("  Нагреватель (GPIO6): HIGH на 1 сек...");
    digitalWrite(HEATER_PIN, HIGH);
    delay(1000);
    digitalWrite(HEATER_PIN, LOW);
    pass("GPIO6 HIGH/LOW выполнен");

    delay(300);

    Serial.println("  Насос (GPIO7): HIGH на 1 сек...");
    digitalWrite(PUMP_PIN, HIGH);
    delay(1000);
    digitalWrite(PUMP_PIN, LOW);
    pass("GPIO7 HIGH/LOW выполнен");

    Serial.println();
    Serial.println("  Проверь мультиметром или реле что переключались");
}

// ─── ИТОГ ─────────────────────────────────────────────────
void diagSummary() {
    separator("ГОТОВО");
    Serial.println("  Диагностика завершена.");
    Serial.println("  После проверки — прошей OrangeBrew_ESP32C3.ino");
}

// ─── SETUP / LOOP ─────────────────────────────────────────
void setup() {
    Serial.begin(115200);
    {
        unsigned long t = millis();
        while (!Serial && millis() - t < 3000);
    }
    delay(200);

    Serial.println(F("\n╔══════════════════════════════════════╗"));
    Serial.println(F("║   OrangeBrew ESP32-C3  ДИАГНОСТИКА   ║"));
    Serial.println(F("╚══════════════════════════════════════╝"));

    diagChip();
    diagMac();
    diagAP();
    diagSensors();
    diagPins();
    diagSummary();
}

void loop() {
    // Ничего — диагностика однократная при старте
    // Отправь RESET в Serial Monitor чтобы запустить снова
    if (Serial.available()) {
        String cmd = Serial.readStringUntil('\n');
        cmd.trim();
        if (cmd.equalsIgnoreCase("RESET")) {
            ESP.restart();
        }
    }
    delay(100);
}
