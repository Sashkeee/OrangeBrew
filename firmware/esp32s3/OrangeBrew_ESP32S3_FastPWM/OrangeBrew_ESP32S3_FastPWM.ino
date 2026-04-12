/**
 * OrangeBrew ESP32-S3 Firmware v1.3.1 (FastPWM)
 *
 * Основана на v1.2.0. Единственное отличие:
 *   updateHeater() (burst firing 200мс) → LEDC PWM 1кГц
 *
 * ⚠️  ТРЕБУЕТ MOSFET или SSR random-firing вместо механического реле.
 *     Механическое реле НЕ выдержит 1кГц.
 *
 * Плата: ESP32-S3 Super Mini
 * Чип:  ESP32-S3 (Xtensa LX7, dual-core, 240 MHz)
 *
 * Arduino IDE настройки:
 *   Board:              ESP32S3 Dev Module
 *   USB CDC On Boot:    Enabled   ← важно для Serial через USB
 *   Upload Speed:       921600
 *   Flash Size:         4MB (QIO)
 *   Partition Scheme:   Minimal SPIFFS (1.9MB APP with OTA)  ← нужно для OTA!
 *
 * Первый запуск:
 *   1. ESP поднимает AP "Orange_XXXXXX" (без пароля)
 *   2. Пользователь подключается к AP → браузер открывает портал
 *   3. В форме выбирает Wi-Fi сеть из списка + пароль + код сопряжения
 *   4. ESP подключается к Wi-Fi, проводит pairing, сохраняет api_key в NVS
 *   5. Перезагрузка → обычный режим (auth + датчики)
 *
 * Сброс: Serial> RESET  или удержание BOOT-кнопки 3 сек
 * Статус: Serial> STATUS
 *
 * Распиновка ESP32-S3 Super Mini:
 *   GPIO  4  — OneWire шина (DS18B20), подтяжка 4.7кОм на 3.3V
 *   GPIO  5  — PWM нагреватель → MOSFET gate (или SSR input)
 *   GPIO  6  — Реле насоса     (HIGH = включён)
 *   GPIO 21  — Встроенный LED (синий)
 *   GPIO  0  — Кнопка BOOT (удержание 3 сек = сброс NVS)
 *
 * ⚠ НЕ ИСПОЛЬЗОВАТЬ для выходов:
 *   GPIO 19, 20 — USB D-/D+
 *   GPIO 43, 44 — UART0 TX/RX (Serial monitor)
 *   GPIO 45, 46 — Strapping pins
 *
 * Индикация LED (GPIO 21):
 *   Горит постоянно              — WebSocket подключён
 *   2 вспышки, 1 сек пауза       — WiFi есть, WS не подключён (цикл ~1300ms)
 *   Мигает 2 раза в секунду      — нет подключения к WiFi (250ms вкл/выкл)
 */

#include <Arduino.h>
#include <ArduinoJson.h>
#include <OneWire.h>
#include <DallasTemperature.h>
#include <Preferences.h>
#include <WiFi.h>
#include <WebServer.h>
#include <DNSServer.h>
#include <WebSocketsClient.h>
#include <ArduinoOTA.h>
#include <esp_task_wdt.h>
#include "portal_html.h"

// ─── ВЕРСИЯ ПРОШИВКИ ──────────────────────────────────────
#define FW_VERSION "1.3.1"

// ─── OTA ПАРОЛЬ ───────────────────────────────────────────
#define OTA_PASSWORD "orangebrew"

// ─── WATCHDOG ─────────────────────────────────────────────
#define WDT_TIMEOUT_SEC 30

// ─── СЕРВЕРНЫЕ НАСТРОЙКИ ──────────────────────────────────
const char* WS_HOST = "test.orangebrew.ru";
const int   WS_PORT = 443;
const char* WS_PATH = "/ws";

// ─── ПИНЫ ─────────────────────────────────────────────────
#define ONE_WIRE_BUS  4
#define HEATER_PIN    5
#define PUMP_PIN      6
#define LED_PIN      21
#define BOOT_PIN      0

// ─── LEDC PWM (замена burst firing) ──────────────────────
// v1.2.0: burst firing 200мс = 20 полупериодов 50 Гц, шаг 5%
// v1.3.1: LEDC 1кГц/10-bit — нет видимого мерцания лампочки
// API ESP32 core 3.x: ledcAttach(pin, freq, res) + ledcWrite(pin, duty)
//   (в core 2.x было ledcSetup(ch,f,r) + ledcAttachPin(pin,ch) — удалено в 3.x)
#define PWM_FREQ       1000
#define PWM_RESOLUTION 10                            // бит
#define PWM_MAX_DUTY   ((1 << PWM_RESOLUTION) - 1)  // 1023

// ─── ОБЪЕКТЫ ──────────────────────────────────────────────
WebSocketsClient wsClient;
OneWire          oneWire(ONE_WIRE_BUS);
DallasTemperature tempSensors(&oneWire);
Preferences      prefs;
WebServer        portalServer(80);
DNSServer        dnsServer;

// ─── СОСТОЯНИЕ ────────────────────────────────────────────
enum AppState { S_PORTAL, S_PAIRING, S_NORMAL };
AppState state = S_PORTAL;

String deviceId  = "";
String apiKey    = "";
String wifiSsid  = "";
String wifiPass  = "";

String pairingCode    = "";
bool   formSubmitted  = false;
unsigned long formSubmitAt = 0;

int  heaterPct = 0;
bool pumpOn    = false;
unsigned long lastTempSend    = 0;
unsigned long lastHeartbeat   = 0;
unsigned long wsConnectedAt   = 0;
bool          wsConnected     = false;
uint32_t      wsTxCount       = 0;
#define TEMP_INTERVAL_MS      1500
#define HEARTBEAT_INTERVAL   60000
#define TEMP_LOG_INTERVAL    10000
#define RSSI_WARN_THRESHOLD    -80
#define RSSI_CHECK_INTERVAL  15000

unsigned long lastTempLog   = 0;
unsigned long lastRssiCheck = 0;

struct WifiNet { String ssid; int32_t rssi; uint8_t enc; };
static WifiNet scannedNets[20];
static int     scannedCount = 0;

// ─── NVS ──────────────────────────────────────────────────
void nvsSave(const char* k, const String& v) {
    prefs.begin("ob", false);
    prefs.putString(k, v);
    prefs.end();
}
String nvsLoad(const char* k) {
    prefs.begin("ob", true);
    String v = prefs.getString(k, "");
    prefs.end();
    return v;
}
void nvsClearAll() {
    prefs.begin("ob", false);
    prefs.clear();
    prefs.end();
    Serial.println("[NVS] Сброс выполнен");
}

// ─── DEVICE LOG ───────────────────────────────────────────
void _wsLog(const char* level, const String& msg) {
    Serial.printf("[%s] %s\n", level, msg.c_str());
    if (!wsConnected) return;
    StaticJsonDocument<256> doc;
    doc["type"]   = "device_log";
    doc["level"]  = level;
    doc["msg"]    = msg;
    doc["uptime"] = millis() / 1000;
    String s; serializeJson(doc, s);
    wsClient.sendTXT(s);
}
void logD(const String& msg) { _wsLog("debug", msg); }
void logI(const String& msg) { _wsLog("info",  msg); }
void logW(const String& msg) { _wsLog("warn",  msg); }
void logE(const String& msg) { _wsLog("error", msg); }

// ─── DEVICE ID ────────────────────────────────────────────
String buildDeviceId() {
    uint64_t mac64 = ESP.getEfuseMac();
    char buf[24];
    snprintf(buf, sizeof(buf), "ESP32S3_%02X%02X%02X%02X%02X%02X",
             (uint8_t)(mac64),
             (uint8_t)(mac64 >> 8),
             (uint8_t)(mac64 >> 16),
             (uint8_t)(mac64 >> 24),
             (uint8_t)(mac64 >> 32),
             (uint8_t)(mac64 >> 40));
    return String(buf);
}

// ─── LED ──────────────────────────────────────────────────
void ledBlink(int times, int ms = 200) {
    for (int i = 0; i < times; i++) {
        digitalWrite(LED_PIN, HIGH); delay(ms);
        digitalWrite(LED_PIN, LOW);
        if (i < times - 1) delay(ms);
    }
}

void updateLed() {
    if (wsConnected) {
        digitalWrite(LED_PIN, HIGH);
        return;
    }
    static unsigned long phaseStart = 0;
    static uint8_t       phase      = 0;
    static uint8_t       lastMode   = 255;

    bool wifiOk = (WiFi.status() == WL_CONNECTED);
    uint8_t mode = wifiOk ? 1 : 0;
    unsigned long now = millis();

    if (mode != lastMode) {
        lastMode = mode; phase = 0; phaseStart = now;
        digitalWrite(LED_PIN, HIGH);
        return;
    }

    if (wifiOk) {
        static const uint16_t dur[] = {100, 100, 100, 1000};
        static const uint8_t  lvl[] = {HIGH, LOW, HIGH, LOW};
        if (now - phaseStart >= dur[phase]) {
            phase = (phase + 1) % 4;
            phaseStart = now;
            digitalWrite(LED_PIN, lvl[phase]);
        }
    } else {
        if (now - phaseStart >= 250) {
            phase = (phase + 1) % 2;
            phaseStart = now;
            digitalWrite(LED_PIN, phase == 0 ? HIGH : LOW);
        }
    }
}

// ─── WIFI SCAN ────────────────────────────────────────────
void scanWifi() {
    Serial.println("[WiFi] Сканирую сети...");
    WiFi.mode(WIFI_STA);
    int n = WiFi.scanNetworks();
    scannedCount = 0;
    if (n <= 0) {
        Serial.println("[WiFi] Сети не найдены");
    } else {
        Serial.printf("[WiFi] Найдено сетей: %d\n", n);
        for (int i = 0; i < n && scannedCount < 20; i++) {
            scannedNets[scannedCount].ssid = WiFi.SSID(i);
            scannedNets[scannedCount].rssi = WiFi.RSSI(i);
            scannedNets[scannedCount].enc  = WiFi.encryptionType(i);
            Serial.printf("  [%2d] %-32s  RSSI: %4d dBm  %s\n",
                i + 1, WiFi.SSID(i).c_str(), WiFi.RSSI(i),
                WiFi.encryptionType(i) == WIFI_AUTH_OPEN ? "открытая" : "🔒");
            scannedCount++;
        }
    }
    WiFi.scanDelete();
}

const char* rssiIcon(int32_t rssi) {
    if (rssi >= -50) return "▂▄▆█";
    if (rssi >= -65) return "▂▄▆_";
    if (rssi >= -75) return "▂▄__";
    return "▂___";
}

// ─── HTTP HANDLERS ────────────────────────────────────────
String buildPage(const String& statusBlock) {
    String html = String(PORTAL_HTML);
    html.replace("%%STATUS%%",    statusBlock);
    html.replace("%%DEVICE_ID%%", "ID: " + deviceId);
    html.replace("%%HOST%%",      String(WS_HOST));
    return html;
}

void handleRoot()  { portalServer.send(200, "text/html; charset=utf-8", buildPage("")); }

void handleScan() {
    String json = "[";
    for (int i = 0; i < scannedCount; i++) {
        if (i > 0) json += ",";
        String sig = String(rssiIcon(scannedNets[i].rssi)) + " " + String(scannedNets[i].rssi) + " dBm";
        bool open = (scannedNets[i].enc == WIFI_AUTH_OPEN);
        json += "{\"ssid\":\"";
        String ssid = scannedNets[i].ssid; ssid.replace("\"", "\\\"");
        json += ssid;
        json += "\",\"rssi\":" + String(scannedNets[i].rssi);
        json += ",\"signal\":\"" + sig + "\"";
        json += ",\"open\":" + String(open ? "true" : "false") + "}";
    }
    json += "]";
    portalServer.send(200, "application/json", json);
}

void handleSave() {
    String ssid = portalServer.arg("ssid");
    String pass = portalServer.arg("pass");
    String code = portalServer.arg("code");
    code.trim(); code.toUpperCase();

    if (ssid.isEmpty() || code.length() != 6) {
        portalServer.send(400, "text/html; charset=utf-8",
            buildPage("<div class='msg msg-err'>❌ Проверьте поля: нужны SSID и 6-значный код.</div>"));
        return;
    }
    wifiSsid = ssid; wifiPass = pass; pairingCode = code;
    formSubmitted = true; formSubmitAt = millis();
    logI("Portal: форма получена SSID='" + ssid + "' код='" + code + "'");
    portalServer.send(200, "text/html; charset=utf-8",
        buildPage("<div class='msg msg-info'>⏳ Подключаюсь к «" + ssid + "»…<br>"
                  "AP отключится через несколько секунд.<br>"
                  "<small>Следите за статусом в Serial Monitor.</small></div>"));
}

void handleNotFound() {
    portalServer.sendHeader("Location", "http://192.168.4.1/", true);
    portalServer.send(302, "text/plain", "");
}

// ─── ЗАПУСК ПОРТАЛА ───────────────────────────────────────
void startPortal(const String& errorHint = "") {
    state = S_PORTAL; formSubmitted = false; wsConnected = false;
    scanWifi();
    String apName = "Orange_" + deviceId.substring(deviceId.indexOf('_') + 1);
    Serial.println("\n╔════════════════════════════════╗");
    Serial.println("║        РЕЖИМ НАСТРОЙКИ         ║");
    Serial.println("╚════════════════════════════════╝");
    WiFi.mode(WIFI_AP);
    WiFi.softAP(apName.c_str());
    delay(300);
    ledBlink(3, 100);
    IPAddress ip = WiFi.softAPIP();
    logI("Portal запущен. AP='" + apName + "' IP=" + ip.toString());
    dnsServer.start(53, "*", ip);
    portalServer.on("/",     HTTP_GET,  handleRoot);
    portalServer.on("/scan", HTTP_GET,  handleScan);
    portalServer.on("/save", HTTP_POST, handleSave);
    portalServer.onNotFound(handleNotFound);
    portalServer.begin();
    if (errorHint.length()) logW("Portal: " + errorHint);
}

// ─── WI-FI ПОДКЛЮЧЕНИЕ ────────────────────────────────────
bool connectWiFi(const String& ssid, const String& pass) {
    WiFi.mode(WIFI_STA);
    WiFi.begin(ssid.c_str(), pass.c_str());
    Serial.printf("[WiFi] Подключаюсь к «%s»", ssid.c_str());
    for (int i = 0; i < 40 && WiFi.status() != WL_CONNECTED; i++) {
        esp_task_wdt_reset();
        delay(500); Serial.print(".");
        digitalWrite(LED_PIN, i % 2 == 0 ? HIGH : LOW);
    }
    digitalWrite(LED_PIN, LOW); Serial.println();
    if (WiFi.status() == WL_CONNECTED) {
        logI("WiFi подключён. SSID=" + WiFi.SSID() +
             " IP=" + WiFi.localIP().toString() +
             " RSSI=" + String(WiFi.RSSI()) + "dBm ch=" + String(WiFi.channel()));
        return true;
    }
    String reason;
    switch (WiFi.status()) {
        case WL_NO_SSID_AVAIL:   reason = "сеть не найдена";    break;
        case WL_CONNECT_FAILED:  reason = "неверный пароль";    break;
        case WL_CONNECTION_LOST: reason = "соединение прервано"; break;
        default: reason = "статус=" + String(WiFi.status());    break;
    }
    logW("WiFi не подключён: " + reason + " SSID='" + ssid + "'");
    return false;
}

// ─── WEBSOCKET ────────────────────────────────────────────
void wsSendAuth() {
    StaticJsonDocument<128> doc;
    doc["type"] = "auth"; doc["api_key"] = apiKey;
    String s; serializeJson(doc, s);
    wsClient.sendTXT(s);
}

void wsSendPair() {
    StaticJsonDocument<256> doc;
    doc["type"]         = "pair";
    doc["pairing_code"] = pairingCode;
    doc["deviceId"]     = deviceId;
    doc["name"]         = "OrangeBrew ESP32-S3";
    doc["fw_version"]   = FW_VERSION;
    String s; serializeJson(doc, s);
    wsClient.sendTXT(s);
    logI("Pairing: код=" + pairingCode + " deviceId=" + deviceId);
}

void wsHandleMessage(const char* payload) {
    StaticJsonDocument<256> doc;
    if (deserializeJson(doc, payload)) { Serial.println("[WS] ⚠ Не удалось разобрать JSON"); return; }
    const char* type = doc["type"] | "";

    if (strcmp(type, "paired") == 0) {
        const char* newKey = doc["api_key"];
        if (newKey && strlen(newKey) > 0) {
            nvsSave("api_key",   String(newKey));
            nvsSave("wifi_ssid", wifiSsid);
            nvsSave("wifi_pass", wifiPass);
            logI("Сопряжение выполнено. Перезагрузка...");
            ledBlink(5, 100);
            delay(500); ESP.restart();
        }
        return;
    }
    if (strcmp(type, "error") == 0) {
        logE(String("Ошибка сервера: ") + (doc["message"] | "unknown")); return;
    }

    const char* cmd = doc["cmd"] | "";
    if (strcmp(cmd, "setHeater") == 0) {
        heaterPct = constrain((int)(doc["value"] | 0), 0, 100);
        // LEDC PWM: применяем мощность немедленно
        uint32_t duty = map(heaterPct, 0, 100, 0, PWM_MAX_DUTY);
        ledcWrite(HEATER_PIN, duty);
        logI("Нагрев → " + String(heaterPct) + "% (duty=" + String(duty) + "/" + String(PWM_MAX_DUTY) + ")");
    } else if (strcmp(cmd, "setPump") == 0) {
        pumpOn = (bool)(doc["value"] | false);
        digitalWrite(PUMP_PIN, pumpOn ? HIGH : LOW);
        logI(String("Насос → ") + (pumpOn ? "ВКЛ" : "ВЫКЛ"));
    }
}

void wsEvent(WStype_t type, uint8_t* payload, size_t len) {
    switch (type) {
        case WStype_CONNECTED:
            wsConnected = true; wsConnectedAt = millis();
            Serial.println("┌─────────────────────────────────┐");
            Serial.println("│      WebSocket подключён         │");
            Serial.println("└─────────────────────────────────┘");
            Serial.printf ("  Хост   : %s:%d%s\n", WS_HOST, WS_PORT, WS_PATH);
            (state == S_PAIRING) ? wsSendPair() : wsSendAuth();
            logI("WS подключён. IP=" + WiFi.localIP().toString() +
                 " RSSI=" + String(WiFi.RSSI()) + "dBm" +
                 " FW=" + String(FW_VERSION) + " PWM=" + String(PWM_FREQ) + "Hz");
            break;
        case WStype_DISCONNECTED:
            wsConnected = false;
            if (wsConnectedAt > 0) {
                Serial.printf("[WS] Отключён (был %lu сек, пакетов: %lu)\n",
                              (millis() - wsConnectedAt) / 1000, wsTxCount);
            }
            break;
        case WStype_TEXT:
            Serial.printf("[WS] ← %s\n", payload);
            wsHandleMessage((char*)payload);
            break;
        case WStype_ERROR:
            Serial.printf("[WS] ⚠ Ошибка (код %d)\n", (int)(payload ? *payload : 0)); break;
        case WStype_PING: Serial.println("[WS] ← ping"); break;
        case WStype_PONG: Serial.println("[WS] ← pong"); break;
        default: break;
    }
}

// ─── OTA ──────────────────────────────────────────────────
void startOTA() {
    ArduinoOTA.setHostname(deviceId.c_str());
    ArduinoOTA.setPassword(OTA_PASSWORD);
    ArduinoOTA.onStart([]() {
        // Безопасное отключение нагревателя через LEDC
        heaterPct = 0;
        ledcWrite(HEATER_PIN, 0);
        digitalWrite(PUMP_PIN, LOW); pumpOn = false;
        logW("OTA: начало. Нагреватель и насос выключены.");
    });
    ArduinoOTA.onEnd([]()   { logI("OTA: завершено. Перезагрузка..."); ledBlink(5, 100); });
    ArduinoOTA.onProgress([](unsigned int progress, unsigned int total) {
        static int lastPct = -1;
        int pct = progress * 100 / total;
        if (pct != lastPct && pct % 10 == 0) {
            lastPct = pct;
            Serial.printf("[OTA] %d%%\n", pct);
            digitalWrite(LED_PIN, pct % 20 == 0 ? HIGH : LOW);
        }
    });
    ArduinoOTA.onError([](ota_error_t error) {
        String err;
        switch (error) {
            case OTA_AUTH_ERROR:    err = "Неверный пароль";   break;
            case OTA_BEGIN_ERROR:   err = "Ошибка начала";     break;
            case OTA_CONNECT_ERROR: err = "Ошибка соединения"; break;
            case OTA_RECEIVE_ERROR: err = "Ошибка получения";  break;
            case OTA_END_ERROR:     err = "Ошибка завершения"; break;
            default:                err = "Неизвестно";        break;
        }
        logE("OTA ошибка: " + err);
    });
    ArduinoOTA.begin();
    Serial.printf("[OTA] Готов. Хост: %s\n", deviceId.c_str());
}

void startWebSocket() {
    Serial.printf("[WS] Подключаюсь к wss://%s:%d%s\n", WS_HOST, WS_PORT, WS_PATH);
    wsTxCount = 0;
    wsClient.beginSSL(WS_HOST, WS_PORT, WS_PATH);
    wsClient.onEvent(wsEvent);
    wsClient.setReconnectInterval(5000);
}

// ─── ДАТЧИКИ ──────────────────────────────────────────────
void sendTemperatures() {
    tempSensors.requestTemperatures();
    int count = tempSensors.getDeviceCount();
    StaticJsonDocument<512> doc;
    doc["type"] = "sensors_raw";
    JsonArray arr = doc.createNestedArray("sensors");
    bool anyValid = false;
    for (int i = 0; i < count; i++) {
        DeviceAddress addr;
        if (tempSensors.getAddress(addr, i)) {
            float t = tempSensors.getTempC(addr);
            if (t == DEVICE_DISCONNECTED_C || t == 85.0f) continue;
            anyValid = true;
            JsonObject s = arr.createNestedObject();
            String addrStr = "";
            for (int j = 0; j < 8; j++) { if (addr[j] < 16) addrStr += "0"; addrStr += String(addr[j], HEX); }
            s["address"] = addrStr; s["temp"] = t;
        }
    }
    if (!anyValid && count == 0) return;
    String msg; serializeJson(doc, msg);
    wsClient.sendTXT(msg); wsTxCount++;
}

// ─── HEARTBEAT ────────────────────────────────────────────
void printHeartbeat() {
    unsigned long upSec = millis() / 1000;
    Serial.println("\n── Статус ──────────────────────────");
    Serial.printf ("  Uptime   : %02lu:%02lu:%02lu\n", upSec/3600, (upSec%3600)/60, upSec%60);
    Serial.printf ("  IP       : %s\n", WiFi.status() == WL_CONNECTED ? WiFi.localIP().toString().c_str() : "нет");
    Serial.printf ("  RSSI     : %d dBm\n", WiFi.RSSI());
    Serial.printf ("  WS       : %s\n", wsConnected ? "подключён" : "отключён");
    Serial.printf ("  Нагрев   : %d%% (LEDC %dГц)\n", heaterPct, PWM_FREQ);
    Serial.printf ("  Насос    : %s\n", pumpOn ? "ВКЛ" : "ВЫКЛ");
    int cnt = tempSensors.getDeviceCount();
    Serial.printf ("  Датчиков : %d\n", cnt);
    for (int i = 0; i < cnt; i++) {
        DeviceAddress addr;
        if (tempSensors.getAddress(addr, i)) {
            float t = tempSensors.getTempC(addr);
            String addrStr = "";
            for (int j = 0; j < 8; j++) { if (addr[j] < 16) addrStr += "0"; addrStr += String(addr[j], HEX); }
            Serial.printf("    [%d] %s  →  %.2f°C\n", i, addrStr.c_str(), t);
        }
    }
    Serial.println("────────────────────────────────────");
}

// ─── КНОПКА BOOT ──────────────────────────────────────────
void checkResetButton() {
    static unsigned long btnHoldSince = 0;
    static int lastPrint = 0;
    if (digitalRead(BOOT_PIN) == LOW) {
        if (btnHoldSince == 0) { btnHoldSince = millis(); Serial.println("[BTN] Удерживайте 3 сек для сброса..."); }
        int held = (millis() - btnHoldSince) / 1000;
        if (held != lastPrint && held > 0) { lastPrint = held; Serial.printf("[BTN] %d сек...\n", held); }
        if (millis() - btnHoldSince > 3000) { Serial.println("[BTN] 🔄 Сброс!"); nvsClearAll(); delay(300); ESP.restart(); }
    } else { btnHoldSince = 0; lastPrint = 0; }
}

// ─── SETUP ────────────────────────────────────────────────
void setup() {
    Serial.begin(115200);
    { unsigned long t = millis(); while (!Serial && millis() - t < 3000); }
    delay(200);

    esp_task_wdt_deinit();
    esp_task_wdt_config_t wdt_cfg = {
        .timeout_ms     = WDT_TIMEOUT_SEC * 1000,
        .idle_core_mask = 0,
        .trigger_panic  = true
    };
    esp_task_wdt_init(&wdt_cfg);
    esp_task_wdt_add(NULL);

    Serial.println(F("\n╔════════════════════════════════════╗"));
    Serial.printf(  "║  OrangeBrew ESP32-S3 FW v%-12s║\n", FW_VERSION);
    Serial.println(F("╚════════════════════════════════════╝"));
    Serial.printf ("  Чип      : %s  rev%d\n", ESP.getChipModel(), ESP.getChipRevision());
    Serial.printf ("  RAM      : %d KB free\n", ESP.getFreeHeap() / 1024);
    Serial.printf ("  MAC      : %s\n", WiFi.macAddress().c_str());
    Serial.printf ("  PWM      : %d Гц / %d-bit (LEDC, нет мерцания)\n", PWM_FREQ, PWM_RESOLUTION);

    pinMode(LED_PIN,  OUTPUT);
    pinMode(PUMP_PIN, OUTPUT);
    pinMode(BOOT_PIN, INPUT_PULLUP);
    // HEATER_PIN настраивается через ledcAttach, не через pinMode

    // ── LEDC PWM для нагревателя (ESP32 core 3.x API) ──
    ledcAttach(HEATER_PIN, PWM_FREQ, PWM_RESOLUTION);
    ledcWrite(HEATER_PIN, 0);  // нагреватель выключен

    digitalWrite(PUMP_PIN, LOW);

    ledBlink(1, 500);

    tempSensors.begin();
    tempSensors.setWaitForConversion(false);
    int sensorCount = tempSensors.getDeviceCount();
    Serial.printf ("  DS18B20  : %d датчик(ов)\n", sensorCount);

    deviceId = buildDeviceId();
    Serial.println("  Device   : " + deviceId);

    wifiSsid = nvsLoad("wifi_ssid");
    wifiPass = nvsLoad("wifi_pass");
    apiKey   = nvsLoad("api_key");

    bool configured = wifiSsid.length() > 0 && apiKey.length() > 0;
    Serial.printf ("  NVS SSID : %s\n", wifiSsid.length() ? wifiSsid.c_str() : "(не задан)");
    Serial.printf ("  NVS key  : %s\n", apiKey.length() ? "задан" : "(не задан)");
    Serial.println();

    if (configured) {
        if (connectWiFi(wifiSsid, wifiPass)) {
            state = S_NORMAL;
            startOTA();
            startWebSocket();
        } else {
            startPortal("Wi-Fi недоступен — проверьте пароль или введите заново");
        }
    } else {
        startPortal();
    }
}

// ─── LOOP ─────────────────────────────────────────────────
void loop() {
    esp_task_wdt_reset();
    checkResetButton();
    updateLed();

    if (Serial.available()) {
        String cmd = Serial.readStringUntil('\n');
        cmd.trim();

        if (cmd.equalsIgnoreCase("RESET")) {
            nvsClearAll(); delay(300); ESP.restart();
        } else if (cmd.equalsIgnoreCase("STATUS")) {
            printHeartbeat();
        } else if (cmd.equalsIgnoreCase("SCAN")) {
            scanWifi();
        } else if (cmd.startsWith("WIFI ")) {
            String args = cmd.substring(5); args.trim();
            int sp = args.indexOf(' ');
            String newSsid = sp == -1 ? args : args.substring(0, sp);
            String newPass = sp == -1 ? ""   : args.substring(sp + 1);
            if (state == S_PORTAL) { dnsServer.stop(); portalServer.stop(); WiFi.softAPdisconnect(true); delay(200); }
            wifiSsid = newSsid; wifiPass = newPass;
            if (connectWiFi(wifiSsid, wifiPass)) {
                nvsSave("wifi_ssid", wifiSsid); nvsSave("wifi_pass", wifiPass);
                state = apiKey.length() > 0 ? S_NORMAL : S_PAIRING;
                startOTA(); startWebSocket();
            } else {
                startPortal();
            }
        } else if (cmd.startsWith("PAIR ")) {
            String code = cmd.substring(5); code.trim(); code.toUpperCase();
            if (code.length() != 6) { Serial.println("[CMD] Код должен быть 6 символов"); }
            else if (WiFi.status() != WL_CONNECTED) { Serial.println("[CMD] Сначала подключись к WiFi"); }
            else { pairingCode = code; state = S_PAIRING; wsClient.disconnect(); delay(300); startWebSocket(); }
        } else if (cmd.equalsIgnoreCase("HELP")) {
            Serial.println("Команды: WIFI <ssid> [pass] | PAIR <код> | STATUS | SCAN | RESET");
        }
    }

    // ── PORTAL ──
    if (state == S_PORTAL) {
        dnsServer.processNextRequest();
        portalServer.handleClient();
        if (formSubmitted && millis() - formSubmitAt > 600) {
            formSubmitted = false;
            dnsServer.stop(); portalServer.stop();
            WiFi.softAPdisconnect(true); delay(300);
            if (connectWiFi(wifiSsid, wifiPass)) {
                state = S_PAIRING; startOTA(); startWebSocket();
            } else {
                startPortal("Не удалось подключиться к «" + wifiSsid + "»");
            }
        }
        return;
    }

    // ── PAIRING + NORMAL ──
    ArduinoOTA.handle();

    if (WiFi.status() != WL_CONNECTED) {
        static unsigned long lastReconnect = 0;
        static int reconnectAttempts = 0;
        if (millis() - lastReconnect > 10000) {
            lastReconnect = millis(); reconnectAttempts++;
            logW("WiFi потерян. Попытка #" + String(reconnectAttempts));
            WiFi.reconnect();
            if (reconnectAttempts >= 5) { logE("WiFi не восстановлен. Перезагрузка..."); delay(500); ESP.restart(); }
        }
        return;
    }

    wsClient.loop();

    if (state == S_NORMAL) {
        // updateHeater() удалена — LEDC применяется сразу в wsHandleMessage

        unsigned long now = millis();

        if (now - lastTempSend >= TEMP_INTERVAL_MS) {
            lastTempSend = now;
            sendTemperatures();
        }

        if (now - lastTempLog >= TEMP_LOG_INTERVAL) {
            lastTempLog = now;
            int cnt = tempSensors.getDeviceCount();
            if (cnt > 0) {
                String s = "Температуры:";
                for (int i = 0; i < cnt; i++) {
                    DeviceAddress addr;
                    if (tempSensors.getAddress(addr, i)) {
                        float t = tempSensors.getTempC(addr);
                        if (t != DEVICE_DISCONNECTED_C && t != 85.0f)
                            s += " [" + String(i) + "]=" + String(t, 1) + "°C";
                    }
                }
                logD(s);
            }
        }

        if (now - lastRssiCheck >= RSSI_CHECK_INTERVAL) {
            lastRssiCheck = now;
            int rssi = WiFi.RSSI();
            if (rssi < RSSI_WARN_THRESHOLD)
                logW("Слабый WiFi: " + String(rssi) + " dBm");
        }

        if (now - lastHeartbeat >= HEARTBEAT_INTERVAL) {
            lastHeartbeat = now;
            printHeartbeat();
            logI("heartbeat fw=" + String(FW_VERSION) +
                 " rssi=" + String(WiFi.RSSI()) +
                 " heap=" + String(ESP.getFreeHeap() / 1024) + "KB" +
                 " heater=" + String(heaterPct) + "%" +
                 " pump=" + String(pumpOn ? 1 : 0) +
                 " sensors=" + String(tempSensors.getDeviceCount()) +
                 " uptime=" + String(millis() / 1000) + "s");
        }
    }
}
