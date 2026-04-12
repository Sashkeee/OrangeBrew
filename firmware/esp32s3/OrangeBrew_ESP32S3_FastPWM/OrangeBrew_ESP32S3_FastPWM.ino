/**
 * OrangeBrew_ESP32S3_FastPWM — v1.3.0
 * ESP32-S3 Super Mini
 *
 * Полная прошивка OrangeBrew с LEDC PWM вместо burst firing.
 * Использует ledcWrite() на частоте 1кГц — нет видимого мерцания.
 *
 * ⚠️  ТРЕБУЕТ: MOSFET (IRF540N, IRLZ44N) или SSR random-firing.
 *     Механическое реле НЕ поддерживает 1кГц PWM и сломается.
 *
 * Отличия от v1.2.0 (burst firing):
 *   - Нагреватель: burst firing (200мс window) → LEDC PWM 1кГц, 10-bit
 *   - Нет HEATER_WINDOW_MS / windowStart логики
 *   - setHeaterPower() напрямую вызывает ledcWrite()
 *
 * Распиновка ESP32-S3 Super Mini:
 *   GPIO 4  — OneWire DS18B20 (4.7кОм между DATA и 3.3V)
 *   GPIO 5  — PWM нагреватель → MOSFET gate (или SSR input)
 *   GPIO 6  — Реле насоса (HIGH = включён)
 *   GPIO 21 — Встроенный LED (синий)
 *   GPIO 0  — Кнопка BOOT (удержание 3с = сброс NVS)
 *
 * Board: ESP32S3 Dev Module, USB CDC On Boot: Enabled
 * Libraries: WiFiManager (tzapu), WebSockets (Links2004/arduinoWebSockets),
 *             ArduinoJson, DallasTemperature, OneWire, ArduinoOTA, Preferences
 */

#include <WiFi.h>
#include <WiFiManager.h>
#include <WebSocketsClient.h>
#include <ArduinoJson.h>
#include <OneWire.h>
#include <DallasTemperature.h>
#include <ArduinoOTA.h>
#include <Preferences.h>
#include <esp_task_wdt.h>

// ── Версия ──────────────────────────────────────────────────
#define FW_VERSION "1.3.0"

// ── OTA пароль (задать перед прошивкой) ─────────────────────
#define OTA_PASSWORD "orangebrew_ota"

// ── Пины ────────────────────────────────────────────────────
#define ONE_WIRE_PIN  4
#define HEATER_PIN    5
#define PUMP_PIN      6
#define LED_PIN       21
#define BOOT_PIN      0

// ── LEDC PWM ────────────────────────────────────────────────
#define PWM_CHANNEL    0
#define PWM_FREQ       1000                           // Гц
#define PWM_RESOLUTION 10                             // бит
#define PWM_MAX_DUTY   ((1 << PWM_RESOLUTION) - 1)   // 1023

// ── WebSocket ────────────────────────────────────────────────
// Задать адрес сервера. Для local dev: WS_HOST = IP, WS_PORT = 3001, WS_SECURE = false
#define WS_HOST   "test.orangebrew.ru"
#define WS_PORT   443
#define WS_PATH   "/ws"
#define WS_SECURE true

// ── Таймауты ─────────────────────────────────────────────────
#define WDT_TIMEOUT_S      30
#define SENSOR_INTERVAL_MS 1500
#define HEARTBEAT_MS       10000
#define BOOT_HOLD_MS       3000

// ── Состояния прошивки ───────────────────────────────────────
enum FwState { S_PORTAL, S_PAIRING, S_NORMAL };
FwState fwState = S_PORTAL;

// ── Объекты ──────────────────────────────────────────────────
OneWire           oneWire(ONE_WIRE_PIN);
DallasTemperature tempSensors(&oneWire);
WebSocketsClient  wsClient;
Preferences       prefs;
WiFiManager       wifiManager;

// ── Переменные состояния ─────────────────────────────────────
String  deviceId;
String  apiKey;
bool    wsConnected  = false;
int     heaterPower  = 0;      // 0..100%
bool    pumpState    = false;

// ── Таймеры ──────────────────────────────────────────────────
unsigned long lastSensorSend = 0;
unsigned long lastHeartbeat  = 0;

// ── LED ──────────────────────────────────────────────────────
unsigned long ledTimer = 0;
int           ledPhase = 0;

// ── Прототипы ────────────────────────────────────────────────
String buildDeviceId();
void   setupLedc();
void   setHeaterPower(int pct);
void   setPump(bool on);
void   updateLed();
void   ledBlink(int times, int onMs = 100, int offMs = 100);
void   wsConnect();
void   wsEvent(WStype_t type, uint8_t* payload, size_t length);
void   sendSensors();
void   sendLog(const char* level, const String& msg);
void   startPairing(const String& code);
void   handleServerCommand(const String& cmd);
void   processSerial();
void   checkBootButton();
void   resetNvs();
void   setupOTA();

// ════════════════════════════════════════════════════════════
// SETUP
// ════════════════════════════════════════════════════════════
void setup() {
    Serial.begin(115200);
    delay(300);

    // WDT
    esp_task_wdt_init(WDT_TIMEOUT_S, true);
    esp_task_wdt_add(NULL);

    // GPIO
    pinMode(LED_PIN,  OUTPUT);
    pinMode(PUMP_PIN, OUTPUT);
    pinMode(BOOT_PIN, INPUT_PULLUP);

    setupLedc();
    setHeaterPower(0);
    setPump(false);

    tempSensors.begin();

    // Загрузить api_key из NVS
    prefs.begin("orangebrew", false);
    apiKey = prefs.getString("api_key", "");
    prefs.end();

    deviceId = buildDeviceId();

    Serial.printf("\n=== OrangeBrew ESP32-S3 FastPWM v%s ===\n", FW_VERSION);
    Serial.printf("Device ID  : %s\n", deviceId.c_str());
    Serial.printf("API key    : %s\n", apiKey.isEmpty() ? "(none — need pairing)" : "set");
    Serial.printf("PWM freq   : %d Hz, %d-bit\n", PWM_FREQ, PWM_RESOLUTION);
    Serial.println("Type HELP for serial commands.\n");

    ledBlink(1);

    // WiFiManager
    wifiManager.setConfigPortalTimeout(180);
    wifiManager.setConnectTimeout(20);

    fwState = S_PORTAL;
    if (!wifiManager.autoConnect(deviceId.c_str())) {
        Serial.println("WiFi portal timeout — restarting");
        ESP.restart();
    }

    Serial.printf("WiFi OK — SSID: %s, IP: %s\n",
                  WiFi.SSID().c_str(), WiFi.localIP().toString().c_str());

    fwState = apiKey.isEmpty() ? S_PAIRING : S_NORMAL;
    if (fwState == S_PAIRING) ledBlink(3);

    setupOTA();
    wsConnect();
}

// ════════════════════════════════════════════════════════════
// LOOP
// ════════════════════════════════════════════════════════════
void loop() {
    esp_task_wdt_reset();

    checkBootButton();
    ArduinoOTA.handle();
    wsClient.loop();
    processSerial();
    updateLed();

    if (fwState != S_NORMAL || !wsConnected) return;

    unsigned long now = millis();

    // Данные датчиков
    if (now - lastSensorSend >= SENSOR_INTERVAL_MS) {
        sendSensors();
        lastSensorSend = now;
    }

    // Heartbeat
    if (now - lastHeartbeat >= HEARTBEAT_MS) {
        StaticJsonDocument<128> doc;
        doc["type"]   = "heartbeat";
        doc["device"] = deviceId;
        doc["uptime"] = millis() / 1000;
        doc["heap"]   = ESP.getFreeHeap();
        String out;
        serializeJson(doc, out);
        wsClient.sendTXT(out);
        lastHeartbeat = now;
    }
}

// ════════════════════════════════════════════════════════════
// LEDC PWM — нагреватель
// ════════════════════════════════════════════════════════════
void setupLedc() {
    ledcSetup(PWM_CHANNEL, PWM_FREQ, PWM_RESOLUTION);
    ledcAttachPin(HEATER_PIN, PWM_CHANNEL);
    ledcWrite(PWM_CHANNEL, 0);
}

void setHeaterPower(int pct) {
    pct = constrain(pct, 0, 100);
    heaterPower = pct;
    uint32_t duty = map(pct, 0, 100, 0, PWM_MAX_DUTY);
    ledcWrite(PWM_CHANNEL, duty);
}

void setPump(bool on) {
    pumpState = on;
    digitalWrite(PUMP_PIN, on ? HIGH : LOW);
}

// ════════════════════════════════════════════════════════════
// LED — неблокирующая индикация
// ════════════════════════════════════════════════════════════
void updateLed() {
    unsigned long now = millis();

    if (wsConnected) {
        // Горит постоянно
        digitalWrite(LED_PIN, HIGH);
        ledPhase = 0;
        ledTimer = now;
        return;
    }

    if (WiFi.status() == WL_CONNECTED) {
        // WiFi есть, WS нет — двойная вспышка
        // on100 – off100 – on100 – off1000  (цикл 1300мс)
        static const unsigned long pattern[4] = {100, 100, 100, 1000};
        if (ledPhase >= 4) { ledPhase = 0; ledTimer = now; }
        if (now - ledTimer >= pattern[ledPhase]) {
            ledTimer = now;
            ledPhase++;
        }
        digitalWrite(LED_PIN, (ledPhase == 0 || ledPhase == 2) ? HIGH : LOW);
    } else {
        // Нет WiFi / портал — 2 вспышки в секунду (500мс цикл)
        if (now - ledTimer >= 250) {
            ledTimer = now;
            ledPhase ^= 1;
            digitalWrite(LED_PIN, ledPhase ? HIGH : LOW);
        }
    }
}

// Блокирующее мигание — только для разовых событий
void ledBlink(int times, int onMs, int offMs) {
    for (int i = 0; i < times; i++) {
        digitalWrite(LED_PIN, HIGH); delay(onMs);
        digitalWrite(LED_PIN, LOW);  if (i < times - 1) delay(offMs);
    }
}

// ════════════════════════════════════════════════════════════
// WebSocket
// ════════════════════════════════════════════════════════════
void wsConnect() {
#if WS_SECURE
    wsClient.beginSSL(WS_HOST, WS_PORT, WS_PATH);
#else
    wsClient.begin(WS_HOST, WS_PORT, WS_PATH);
#endif
    wsClient.onEvent(wsEvent);
    wsClient.setReconnectInterval(3000);
}

void wsEvent(WStype_t type, uint8_t* payload, size_t length) {
    switch (type) {

    case WStype_CONNECTED:
        wsConnected = true;
        Serial.println("WS: connected");
        sendLog("info", String("Connected. FW=") + FW_VERSION + " PWM=" + PWM_FREQ + "Hz");
        if (fwState == S_NORMAL && !apiKey.isEmpty()) {
            StaticJsonDocument<128> auth;
            auth["type"]    = "auth";
            auth["api_key"] = apiKey;
            String out; serializeJson(auth, out);
            wsClient.sendTXT(out);
        }
        break;

    case WStype_DISCONNECTED:
        wsConnected = false;
        Serial.println("WS: disconnected");
        break;

    case WStype_TEXT: {
        StaticJsonDocument<512> doc;
        if (deserializeJson(doc, payload, length)) break;

        const char* msgType = doc["type"] | "";

        // Паринг завершён
        if (strcmp(msgType, "paired") == 0) {
            const char* key = doc["api_key"] | "";
            if (strlen(key) > 0) {
                apiKey = String(key);
                prefs.begin("orangebrew", false);
                prefs.putString("api_key", apiKey);
                prefs.end();
                fwState = S_NORMAL;
                ledBlink(5);
                Serial.println("WS: paired — api_key saved");
                // Аутентифицируемся сразу
                StaticJsonDocument<128> auth;
                auth["type"]    = "auth";
                auth["api_key"] = apiKey;
                String out; serializeJson(auth, out);
                wsClient.sendTXT(out);
            }
        }

        // Управление нагревателем
        else if (strcmp(msgType, "heater") == 0) {
            int pwr = doc["power"] | 0;
            setHeaterPower(pwr);
            Serial.printf("Heater: %d%%\n", heaterPower);
        }

        // Управление насосом
        else if (strcmp(msgType, "pump") == 0) {
            bool on = doc["state"] | false;
            setPump(on);
            Serial.printf("Pump: %s\n", pumpState ? "ON" : "OFF");
        }

        // Серверная команда
        else if (strcmp(msgType, "command") == 0) {
            handleServerCommand(String(doc["command"] | ""));
        }

        break;
    }

    default: break;
    }
}

// ════════════════════════════════════════════════════════════
// ДАТЧИКИ
// ════════════════════════════════════════════════════════════
void sendSensors() {
    tempSensors.requestTemperatures();
    int count = tempSensors.getDeviceCount();
    if (count == 0) return;

    StaticJsonDocument<1024> doc;
    doc["type"]   = "sensors";
    doc["device"] = deviceId;
    JsonArray arr = doc.createNestedArray("sensors");

    for (int i = 0; i < count; i++) {
        DeviceAddress addr;
        if (!tempSensors.getAddress(addr, i)) continue;

        char addrStr[17];
        for (int b = 0; b < 8; b++) sprintf(addrStr + b * 2, "%02x", addr[b]);
        addrStr[16] = '\0';

        float t = tempSensors.getTempC(addr);
        if (t == DEVICE_DISCONNECTED_C) continue;

        JsonObject s = arr.createNestedObject();
        s["address"] = addrStr;
        s["temp"]    = round(t * 10.0f) / 10.0f;
    }

    doc["heater"] = heaterPower;
    doc["pump"]   = pumpState;

    String out;
    serializeJson(doc, out);
    wsClient.sendTXT(out);
}

// ════════════════════════════════════════════════════════════
// DEVICE LOG (виден в Betterstack)
// ════════════════════════════════════════════════════════════
void sendLog(const char* level, const String& msg) {
    if (!wsConnected) return;
    StaticJsonDocument<256> doc;
    doc["type"]   = "device_log";
    doc["level"]  = level;
    doc["msg"]    = msg;
    doc["uptime"] = millis() / 1000;
    String out;
    serializeJson(doc, out);
    wsClient.sendTXT(out);
}

// ════════════════════════════════════════════════════════════
// ПАРИНГ
// ════════════════════════════════════════════════════════════
void startPairing(const String& code) {
    if (!wsConnected) { Serial.println("Pair: not connected"); return; }
    StaticJsonDocument<128> doc;
    doc["type"]         = "pair";
    doc["pairing_code"] = code;
    doc["deviceId"]     = deviceId;
    String out;
    serializeJson(doc, out);
    wsClient.sendTXT(out);
    Serial.printf("Pair: sent code [%s]\n", code.c_str());
}

// ════════════════════════════════════════════════════════════
// OTA
// ════════════════════════════════════════════════════════════
void setupOTA() {
    ArduinoOTA.setHostname(deviceId.c_str());
    ArduinoOTA.setPassword(OTA_PASSWORD);
    ArduinoOTA.onStart([]() {
        setHeaterPower(0);   // безопасность при OTA
        setPump(false);
        Serial.println("OTA: start");
        sendLog("warn", "OTA update started — heater OFF");
    });
    ArduinoOTA.onEnd([]() { Serial.println("OTA: complete"); });
    ArduinoOTA.onError([](ota_error_t err) {
        Serial.printf("OTA error [%u]\n", err);
    });
    ArduinoOTA.begin();
    Serial.printf("OTA ready — host: %s\n", deviceId.c_str());
}

// ════════════════════════════════════════════════════════════
// СЕРВЕРНАЯ КОМАНДА
// ════════════════════════════════════════════════════════════
void handleServerCommand(const String& cmd) {
    if (cmd == "reboot") {
        sendLog("info", "Rebooting by server command");
        delay(300);
        ESP.restart();
    }
}

// ════════════════════════════════════════════════════════════
// КНОПКА BOOT — удержание 3с → сброс NVS
// ════════════════════════════════════════════════════════════
void checkBootButton() {
    static unsigned long pressedAt = 0;
    if (digitalRead(BOOT_PIN) == LOW) {
        if (pressedAt == 0) pressedAt = millis();
        if (millis() - pressedAt >= BOOT_HOLD_MS) resetNvs();
    } else {
        pressedAt = 0;
    }
}

void resetNvs() {
    Serial.println("NVS reset + WiFi erase — restarting...");
    setHeaterPower(0);
    setPump(false);
    prefs.begin("orangebrew", false);
    prefs.clear();
    prefs.end();
    wifiManager.resetSettings();
    ledBlink(10, 50, 50);
    ESP.restart();
}

// ════════════════════════════════════════════════════════════
// SERIAL КОМАНДЫ
// ════════════════════════════════════════════════════════════
void processSerial() {
    if (!Serial.available()) return;
    String line = Serial.readStringUntil('\n');
    line.trim();
    String cmd = line;
    cmd.toUpperCase();

    if (cmd == "RESET") {
        resetNvs();
    }
    else if (cmd == "STATUS") {
        Serial.println("┌─ STATUS ─────────────────────────");
        Serial.printf( "│ FW        : v%s (FastPWM)\n", FW_VERSION);
        Serial.printf( "│ DeviceID  : %s\n", deviceId.c_str());
        Serial.printf( "│ API key   : %s\n", apiKey.isEmpty() ? "(none)" : "set");
        Serial.printf( "│ State     : %s\n",
                        fwState == S_PORTAL  ? "PORTAL"  :
                        fwState == S_PAIRING ? "PAIRING" : "NORMAL");
        Serial.printf( "│ WiFi      : %s (%s)\n",
                        WiFi.SSID().c_str(), WiFi.localIP().toString().c_str());
        Serial.printf( "│ WS        : %s\n", wsConnected ? "connected" : "disconnected");
        Serial.printf( "│ Heater    : %d%%  (PWM %dHz %dbit)\n",
                        heaterPower, PWM_FREQ, PWM_RESOLUTION);
        Serial.printf( "│ Pump      : %s\n", pumpState ? "ON" : "OFF");
        Serial.printf( "│ Sensors   : %d\n", tempSensors.getDeviceCount());
        Serial.printf( "│ Uptime    : %lus\n", millis() / 1000);
        Serial.printf( "│ Free heap : %u B\n", ESP.getFreeHeap());
        Serial.println("└──────────────────────────────────");
    }
    else if (cmd == "SCAN") {
        tempSensors.begin();
        int n = tempSensors.getDeviceCount();
        Serial.printf("Sensors found: %d\n", n);
        for (int i = 0; i < n; i++) {
            DeviceAddress addr;
            if (!tempSensors.getAddress(addr, i)) continue;
            char addrStr[17];
            for (int b = 0; b < 8; b++) sprintf(addrStr + b * 2, "%02x", addr[b]);
            addrStr[16] = '\0';
            Serial.printf("  [%d] %s\n", i, addrStr);
        }
    }
    else if (cmd.startsWith("WIFI ")) {
        String rest = line.substring(5);  // оригинальный регистр
        int sp = rest.indexOf(' ');
        String ssid = sp < 0 ? rest : rest.substring(0, sp);
        String pass = sp < 0 ? ""   : rest.substring(sp + 1);
        Serial.printf("Connecting to [%s]...\n", ssid.c_str());
        WiFi.begin(ssid.c_str(), pass.c_str());
    }
    else if (cmd.startsWith("PAIR ")) {
        startPairing(line.substring(5));
    }
    else if (cmd == "HELP") {
        Serial.println("Commands: RESET | STATUS | SCAN | WIFI <ssid> [pass] | PAIR <code> | HELP");
    }
    else if (line.length() > 0) {
        Serial.println("Unknown command. Type HELP.");
    }
}

// ════════════════════════════════════════════════════════════
// DEVICE ID — все 6 байт MAC
// ════════════════════════════════════════════════════════════
String buildDeviceId() {
    uint64_t mac = ESP.getEfuseMac();
    uint8_t b[6];
    b[0] = (mac >> 40) & 0xFF;
    b[1] = (mac >> 32) & 0xFF;
    b[2] = (mac >> 24) & 0xFF;
    b[3] = (mac >> 16) & 0xFF;
    b[4] = (mac >>  8) & 0xFF;
    b[5] = (mac >>  0) & 0xFF;
    char id[32];
    sprintf(id, "ESP32S3_%02X%02X%02X%02X%02X%02X",
            b[0], b[1], b[2], b[3], b[4], b[5]);
    return String(id);
}
