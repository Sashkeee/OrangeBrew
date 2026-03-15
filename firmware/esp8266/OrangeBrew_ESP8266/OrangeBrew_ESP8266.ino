/**
 * OrangeBrew ESP8266 Firmware v2.2
 * Адаптирован для NodeMCU v3 (ESP-12E Module, CH340)
 *
 * Первый запуск:
 *   1. ESP поднимает AP "Orange_XXXXXX" (без пароля)
 *   2. Пользователь подключается к AP → браузер открывает портал
 *   3. В форме выбирает Wi-Fi сеть из списка (или вводит вручную) + пароль + код сопряжения
 *   4. ESP подключается к Wi-Fi, проводит pairing, сохраняет api_key в LittleFS
 *   5. Перезагрузка → обычный режим (auth + датчики)
 *
 * Сброс: Serial> RESET  или удержание BOOT-кнопки 3 сек
 * Статус: Serial> STATUS
 * Сканировать сети: Serial> SCAN
 *
 * Необходимые библиотеки (Arduino IDE):
 *   - ESP8266 Arduino Core (Boards Manager: http://arduino.esp8266.com/stable/package_esp8266com_index.json)
 *   - ArduinoJson >= 6.x
 *   - WebSockets by Markus Sattler >= 2.4
 *   - OneWire
 *   - DallasTemperature
 *   LittleFS, ESP8266WiFi, ESP8266WebServer, DNSServer — входят в ESP8266 Core
 */

#include <Arduino.h>
#include <ArduinoJson.h>
#include <OneWire.h>
#include <DallasTemperature.h>
#include <LittleFS.h>
#include <ESP8266WiFi.h>
#include <ESP8266WebServer.h>
#include <DNSServer.h>
#include <WebSocketsClient.h>

// ─── СЕРВЕРНЫЕ НАСТРОЙКИ ──────────────────────────────────
const char* WS_HOST = "test.orangebrew.ru";
const int   WS_PORT = 443;
const char* WS_PATH = "/ws";

// ─── ПИНЫ (NodeMCU v3 / ESP-12E) ──────────────────────────
// D4 = GPIO2  — встроенный светодиод (активный LOW)
// D5 = GPIO14 — OneWire шина DS18B20
// D6 = GPIO12 — насос
// D7 = GPIO13 — нагреватель (твёрдотельное реле)
// D3 = GPIO0  — кнопка FLASH/BOOT (встроенная)
#define ONE_WIRE_BUS  14   // D5
#define HEATER_PIN    13   // D7
#define PUMP_PIN      12   // D6
#define LED_PIN        2   // D4 (активный LOW)
#define BOOT_PIN       0   // D3 — кнопка BOOT/FLASH, удержание 3 сек = сброс

// ─── ОБЪЕКТЫ ──────────────────────────────────────────────
WebSocketsClient  wsClient;
OneWire           oneWire(ONE_WIRE_BUS);
DallasTemperature tempSensors(&oneWire);
ESP8266WebServer  portalServer(80);
DNSServer         dnsServer;

// ─── СОСТОЯНИЕ ────────────────────────────────────────────
enum AppState { S_PORTAL, S_PAIRING, S_NORMAL };
AppState state = S_PORTAL;

String deviceId  = "";
String apiKey    = "";
String wifiSsid  = "";
String wifiPass  = "";

// Portal
String pairingCode    = "";
bool   formSubmitted  = false;
unsigned long formSubmitAt = 0;

// Управление
int  heaterPct = 0;
bool pumpOn    = false;
unsigned long lastTempSend  = 0;
unsigned long lastHeartbeat = 0;
unsigned long wsConnectedAt = 0;
bool          wsConnected   = false;
uint32_t      wsTxCount     = 0;
#define TEMP_INTERVAL_MS   2000   // ESP8266 медленнее — 2 сек достаточно
#define HEARTBEAT_INTERVAL 60000

// Кэш WiFi-сканирования
struct WifiNet { String ssid; int32_t rssi; uint8_t enc; };
static WifiNet scannedNets[20];
static int     scannedCount = 0;

// ─── LittleFS (NVS-замена) ────────────────────────────────
bool fsReady = false;

void fsInit() {
    fsReady = LittleFS.begin();
    if (!fsReady) {
        Serial.println("[FS] ❌ LittleFS не смонтировалась, форматирую...");
        LittleFS.format();
        fsReady = LittleFS.begin();
    }
    if (fsReady) Serial.println("[FS] LittleFS готова");
    else         Serial.println("[FS] ❌ Не удалось смонтировать LittleFS!");
}

void nvsSave(const char* k, const String& v) {
    if (!fsReady) return;
    String path = "/" + String(k) + ".txt";
    File f = LittleFS.open(path, "w");
    if (f) { f.print(v); f.close(); }
}

String nvsLoad(const char* k) {
    if (!fsReady) return "";
    String path = "/" + String(k) + ".txt";
    File f = LittleFS.open(path, "r");
    if (!f) return "";
    String v = f.readString();
    f.close();
    return v;
}

void nvsClearAll() {
    LittleFS.format();
    Serial.println("[NVS] Сброс выполнен (LittleFS отформатирована)");
}

// ─── DEVICE ID ────────────────────────────────────────────
String buildDeviceId() {
    char buf[20];
    snprintf(buf, sizeof(buf), "ESP8266_%06X", ESP.getChipId());
    return String(buf);
}

// ─── WIFI SCAN ────────────────────────────────────────────
void scanWifi() {
    Serial.println("[WiFi] Сканирую сети...");
    // Для сканирования нужен режим STA или AP+STA
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
                i + 1,
                WiFi.SSID(i).c_str(),
                WiFi.RSSI(i),
                WiFi.encryptionType(i) == ENC_TYPE_NONE ? "открытая" : "🔒");
            scannedCount++;
        }
    }
    WiFi.scanDelete();
}

// Сигнал качества по RSSI
const char* rssiIcon(int32_t rssi) {
    if (rssi >= -50) return "▂▄▆█";
    if (rssi >= -65) return "▂▄▆_";
    if (rssi >= -75) return "▂▄__";
    return "▂___";
}

// ─── HTML ПОРТАЛА ─────────────────────────────────────────
// Определён в portal_html.h (вынесен туда из-за бага препроцессора Arduino IDE
// с raw string literals в .ino файлах)
#include "portal_html.h"

// ─── HTTP HANDLERS ────────────────────────────────────────

String buildPage(const String& statusBlock) {
    String html = String(PORTAL_HTML);
    html.replace("%%STATUS%%",    statusBlock);
    html.replace("%%DEVICE_ID%%", "ID: " + deviceId);
    html.replace("%%HOST%%",      String(WS_HOST));
    return html;
}

void handleRoot() {
    portalServer.send(200, "text/html; charset=utf-8", buildPage(""));
}

void handleScan() {
    String json = "[";
    for (int i = 0; i < scannedCount; i++) {
        if (i > 0) json += ",";
        String sig = String(rssiIcon(scannedNets[i].rssi)) + " " + String(scannedNets[i].rssi) + " dBm";
        bool open = (scannedNets[i].enc == ENC_TYPE_NONE);
        String ssid = scannedNets[i].ssid;
        ssid.replace("\\", "\\\\");
        ssid.replace("\"", "\\\"");
        json += "{\"ssid\":\"" + ssid + "\""
                ",\"rssi\":"  + String(scannedNets[i].rssi) +
                ",\"signal\":\"" + sig + "\""
                ",\"open\":"  + String(open ? "true" : "false") + "}";
    }
    json += "]";
    portalServer.send(200, "application/json", json);
}

void handleSave() {
    String ssid = portalServer.arg("ssid");
    String pass = portalServer.arg("pass");
    String code = portalServer.arg("code");
    code.trim();
    code.toUpperCase();

    if (ssid.isEmpty() || code.length() != 6) {
        portalServer.send(400, "text/html; charset=utf-8",
            buildPage("<div class='msg msg-err'>❌ Проверьте поля: нужны SSID и 6-значный код.</div>"));
        return;
    }

    wifiSsid    = ssid;
    wifiPass    = pass;
    pairingCode = code;
    formSubmitted = true;
    formSubmitAt  = millis();

    Serial.printf("[Portal] Форма: SSID='%s', код='%s'\n", ssid.c_str(), code.c_str());

    portalServer.send(200, "text/html; charset=utf-8",
        buildPage("<div class='msg msg-info'>⏳ Подключаюсь к «" + ssid + "»…<br>"
                  "AP отключится через несколько секунд.</div>"));
}

void handleNotFound() {
    portalServer.sendHeader("Location", "http://192.168.4.1/", true);
    portalServer.send(302, "text/plain", "");
}

// ─── ЗАПУСК ПОРТАЛА ───────────────────────────────────────
void startPortal(const String& errorHint = "") {
    state = S_PORTAL;
    formSubmitted = false;

    scanWifi();  // сканируем ДО поднятия AP

    String apName = "Orange_" + deviceId.substring(deviceId.indexOf('_') + 1);

    Serial.println(F("\n╔════════════════════════════════╗"));
    Serial.println(F("║        РЕЖИМ НАСТРОЙКИ         ║"));
    Serial.println(F("╚════════════════════════════════╝"));
    Serial.println("[Portal] AP: " + apName + " (без пароля)");

    WiFi.mode(WIFI_AP);
    WiFi.softAP(apName.c_str());
    delay(300);

    IPAddress ip = WiFi.softAPIP();
    Serial.println("[Portal] IP портала: " + ip.toString());
    Serial.println("[Portal] Подключитесь к AP и откройте браузер");

    dnsServer.start(53, "*", ip);

    portalServer.on("/",      HTTP_GET,  handleRoot);
    portalServer.on("/scan",  HTTP_GET,  handleScan);
    portalServer.on("/save",  HTTP_POST, handleSave);
    portalServer.onNotFound(handleNotFound);
    portalServer.begin();

    if (errorHint.length()) {
        Serial.println("[Portal] ⚠  " + errorHint);
    }
    Serial.println("[Portal] Ожидаю подключения...");
}

// ─── WI-FI ПОДКЛЮЧЕНИЕ ────────────────────────────────────
bool connectWiFi(const String& ssid, const String& pass) {
    WiFi.mode(WIFI_STA);
    WiFi.begin(ssid.c_str(), pass.c_str());
    Serial.printf("[WiFi] Подключаюсь к «%s»", ssid.c_str());

    for (int i = 0; i < 40 && WiFi.status() != WL_CONNECTED; i++) {
        delay(500);
        Serial.print(".");
        // Мигаем светодиодом
        digitalWrite(LED_PIN, i % 2);
    }
    Serial.println();
    digitalWrite(LED_PIN, HIGH); // LED off

    if (WiFi.status() == WL_CONNECTED) {
        Serial.println(F("┌─────────────────────────────────┐"));
        Serial.println(F("│         Wi-Fi подключён          │"));
        Serial.println(F("└─────────────────────────────────┘"));
        Serial.println("  SSID    : " + WiFi.SSID());
        Serial.println("  IP      : " + WiFi.localIP().toString());
        Serial.println("  Шлюз    : " + WiFi.gatewayIP().toString());
        Serial.println("  DNS     : " + WiFi.dnsIP().toString());
        Serial.println("  MAC     : " + WiFi.macAddress());
        Serial.printf ("  RSSI    : %d dBm (%s)\n", WiFi.RSSI(), rssiIcon(WiFi.RSSI()));
        Serial.printf ("  Канал   : %d\n", WiFi.channel());
        digitalWrite(LED_PIN, LOW); // LED on = подключены
        return true;
    }

    Serial.printf("[WiFi] ❌ Не удалось (статус=%d)\n", WiFi.status());
    switch (WiFi.status()) {
        case WL_NO_SSID_AVAIL:   Serial.println("[WiFi]    Сеть не найдена"); break;
        case WL_CONNECT_FAILED:  Serial.println("[WiFi]    Неверный пароль"); break;
        case WL_CONNECTION_LOST: Serial.println("[WiFi]    Соединение прервано"); break;
        default: break;
    }
    return false;
}

// ─── WEBSOCKET ────────────────────────────────────────────
void wsSendAuth() {
    StaticJsonDocument<128> doc;
    doc["type"]    = "auth";
    doc["api_key"] = apiKey;
    String s; serializeJson(doc, s);
    wsClient.sendTXT(s);
    String keyPreview = apiKey.length() >= 8 ? apiKey.substring(0, 8) + "..." : apiKey;
    Serial.println("[WS] → auth  (api_key: " + keyPreview + ")");
}

void wsSendPair() {
    StaticJsonDocument<256> doc;
    doc["type"]         = "pair";
    doc["pairing_code"] = pairingCode;
    doc["deviceId"]     = deviceId;
    doc["name"]         = "OrangeBrew ESP8266";
    String s; serializeJson(doc, s);
    wsClient.sendTXT(s);
    Serial.println("[WS] → pair  (код: " + pairingCode + ", deviceId: " + deviceId + ")");
}

void wsHandleMessage(const char* payload) {
    StaticJsonDocument<256> doc;
    if (deserializeJson(doc, payload)) {
        Serial.println("[WS] ⚠  Не удалось разобрать JSON");
        return;
    }
    const char* type = doc["type"] | "";

    if (strcmp(type, "paired") == 0) {
        const char* newKey = doc["api_key"];
        if (newKey && strlen(newKey) > 0) {
            nvsSave("api_key",   String(newKey));
            nvsSave("wifi_ssid", wifiSsid);
            nvsSave("wifi_pass", wifiPass);
            Serial.println(F("┌─────────────────────────────────┐"));
            Serial.println(F("│     ✅  СОПРЯЖЕНИЕ ВЫПОЛНЕНО     │"));
            Serial.println(F("└─────────────────────────────────┘"));
            Serial.println("  api_key сохранён в LittleFS");
            Serial.println("  Перезагрузка через 1 сек...");
            delay(1000);
            ESP.restart();
        }
        return;
    }

    if (strcmp(type, "error") == 0) {
        Serial.printf("[WS] ❌ Ошибка сервера: %s\n", doc["message"] | "unknown");
        return;
    }

    const char* cmd = doc["cmd"] | "";
    if (strcmp(cmd, "setHeater") == 0) {
        heaterPct = constrain((int)(doc["value"] | 0), 0, 100);
        Serial.printf("[CMD] 🔥 Нагрев → %d%%\n", heaterPct);
    } else if (strcmp(cmd, "setPump") == 0) {
        pumpOn = (bool)(doc["value"] | false);
        digitalWrite(PUMP_PIN, pumpOn ? HIGH : LOW);
        Serial.printf("[CMD] 💧 Насос → %s\n", pumpOn ? "ВКЛ" : "ВЫКЛ");
    }
}

void wsEvent(WStype_t type, uint8_t* payload, size_t len) {
    switch (type) {
        case WStype_CONNECTED:
            wsConnected   = true;
            wsConnectedAt = millis();
            wsTxCount     = 0;
            Serial.println(F("┌─────────────────────────────────┐"));
            Serial.println(F("│      WebSocket подключён         │"));
            Serial.println(F("└─────────────────────────────────┘"));
            Serial.printf ("  Хост   : %s:%d%s\n", WS_HOST, WS_PORT, WS_PATH);
            Serial.printf ("  RSSI   : %d dBm (%s)\n", WiFi.RSSI(), rssiIcon(WiFi.RSSI()));
            (state == S_PAIRING) ? wsSendPair() : wsSendAuth();
            break;

        case WStype_DISCONNECTED:
            wsConnected = false;
            if (wsConnectedAt > 0) {
                unsigned long upSec = (millis() - wsConnectedAt) / 1000;
                Serial.printf("[WS] ❌ Отключён (был подключён %lu сек, пакетов: %lu)\n",
                              upSec, (unsigned long)wsTxCount);
            } else {
                Serial.println("[WS] ❌ Отключён");
            }
            Serial.println("[WS] Повтор через 5 сек...");
            break;

        case WStype_TEXT:
            Serial.printf("[WS] ← %s\n", payload);
            wsHandleMessage((char*)payload);
            break;

        case WStype_ERROR:
            Serial.printf("[WS] ⚠  Ошибка (код %u)\n", (unsigned int)(payload ? *payload : 0));
            break;

        case WStype_PING:
            Serial.println("[WS] ← ping");
            break;

        case WStype_PONG:
            Serial.println("[WS] ← pong");
            break;

        default: break;
    }
}

void startWebSocket() {
    Serial.printf("[WS] Подключаюсь к wss://%s:%d%s\n", WS_HOST, WS_PORT, WS_PATH);
    wsClient.beginSSL(WS_HOST, WS_PORT, WS_PATH);
    wsClient.onEvent(wsEvent);
    wsClient.setReconnectInterval(5000);
}

// ─── ТЕМПЕРАТУРНЫЕ ДАННЫЕ ─────────────────────────────────
void sendTemperatures() {
    tempSensors.requestTemperatures();
    int count = tempSensors.getDeviceCount();
    if (count == 0) return;

    StaticJsonDocument<512> doc;
    doc["type"] = "sensors_raw";
    JsonArray arr = doc.createNestedArray("sensors");

    for (int i = 0; i < count; i++) {
        DeviceAddress addr;
        if (!tempSensors.getAddress(addr, i)) continue;
        float t = tempSensors.getTempC(addr);
        if (t == DEVICE_DISCONNECTED_C || t == 85.0f) continue;

        JsonObject s = arr.createNestedObject();
        String addrStr = "";
        for (int j = 0; j < 8; j++) {
            if (addr[j] < 16) addrStr += "0";
            addrStr += String(addr[j], HEX);
        }
        s["address"] = addrStr;
        s["temp"]    = t;
    }

    String msg; serializeJson(doc, msg);
    wsClient.sendTXT(msg);
    wsTxCount++;
}

// ─── HEARTBEAT ────────────────────────────────────────────
void printHeartbeat() {
    unsigned long upSec = millis() / 1000;
    tempSensors.requestTemperatures();
    int cnt = tempSensors.getDeviceCount();

    Serial.println(F("\n── Статус ──────────────────────────"));
    Serial.printf ("  Uptime   : %02lu:%02lu:%02lu\n",
                   upSec/3600, (upSec%3600)/60, upSec%60);
    Serial.printf ("  IP       : %s\n",
                   WiFi.status() == WL_CONNECTED ? WiFi.localIP().toString().c_str() : "нет");
    Serial.printf ("  RSSI     : %d dBm\n", WiFi.RSSI());
    Serial.printf ("  WS       : %s  (пакетов: %lu)\n",
                   wsConnected ? "подключён" : "отключён", (unsigned long)wsTxCount);
    Serial.printf ("  Нагрев   : %d%%\n", heaterPct);
    Serial.printf ("  Насос    : %s\n", pumpOn ? "ВКЛ" : "ВЫКЛ");
    Serial.printf ("  Датчиков : %d\n", cnt);
    for (int i = 0; i < cnt; i++) {
        DeviceAddress addr;
        if (tempSensors.getAddress(addr, i)) {
            float t = tempSensors.getTempC(addr);
            String addrStr = "";
            for (int j = 0; j < 8; j++) {
                if (addr[j] < 16) addrStr += "0";
                addrStr += String(addr[j], HEX);
            }
            Serial.printf("    [%d] %s  %.2f°C\n", i, addrStr.c_str(), t);
        }
    }
    Serial.printf ("  Free RAM : %d байт\n", ESP.getFreeHeap());
    Serial.println(F("────────────────────────────────────"));
}

// ─── HEATER PWM (медленный ШИМ, окно 2 сек) ──────────────
void updateHeater() {
    static unsigned long windowStart = 0;
    unsigned long now = millis();
    if (now - windowStart > 2000) windowStart = now;
    long onTime = (2000L * heaterPct) / 100;
    digitalWrite(HEATER_PIN, (now - windowStart < onTime) ? HIGH : LOW);
}

// ─── КНОПКА BOOT (удержание 3 сек = сброс) ───────────────
void checkResetButton() {
    static unsigned long btnHoldSince = 0;
    static int lastPrint = 0;
    if (digitalRead(BOOT_PIN) == LOW) {
        if (btnHoldSince == 0) {
            btnHoldSince = millis();
            Serial.println("[BTN] Удерживайте 3 сек для сброса...");
        }
        int held = (millis() - btnHoldSince) / 1000;
        if (held != lastPrint && held > 0) {
            lastPrint = held;
            Serial.printf("[BTN] %d сек...\n", held);
        }
        if (millis() - btnHoldSince > 3000) {
            Serial.println("[BTN] 🔄 Сброс настроек!");
            nvsClearAll();
            delay(300);
            ESP.restart();
        }
    } else {
        btnHoldSince = 0;
        lastPrint = 0;
    }
}

// ─── SETUP ────────────────────────────────────────────────
void setup() {
    Serial.begin(115200);
    delay(500);

    Serial.println(F("\n╔══════════════════════════════════════╗"));
    Serial.println(F("║  OrangeBrew ESP8266 Firmware v2.2    ║"));
    Serial.println(F("║  NodeMCU v3 (ESP-12E, CH340)         ║"));
    Serial.println(F("╚══════════════════════════════════════╝"));
    Serial.printf ("  Chip ID  : 0x%06X\n", ESP.getChipId());
    Serial.printf ("  Flash    : %d KB\n", ESP.getFlashChipSize() / 1024);
    Serial.printf ("  CPU freq : %d MHz\n", ESP.getCpuFreqMHz());
    Serial.printf ("  Free RAM : %d байт\n", ESP.getFreeHeap());
    Serial.printf ("  SDK      : %s\n", ESP.getSdkVersion());
    Serial.printf ("  MAC      : %s\n", WiFi.macAddress().c_str());

    pinMode(HEATER_PIN, OUTPUT);
    pinMode(PUMP_PIN,   OUTPUT);
    pinMode(LED_PIN,    OUTPUT);
    pinMode(BOOT_PIN,   INPUT);
    digitalWrite(HEATER_PIN, LOW);
    digitalWrite(PUMP_PIN,   LOW);
    digitalWrite(LED_PIN,    HIGH); // LED off (активный LOW)

    fsInit();

    // Датчики
    tempSensors.begin();
    tempSensors.setWaitForConversion(true);  // блокирующий режим — ждём завершения конвертации всех датчиков
    int sensorCount = tempSensors.getDeviceCount();
    Serial.printf ("  DS18B20  : %d датчик(ов) на шине\n", sensorCount);
    if (sensorCount > 0) {
        for (int i = 0; i < sensorCount; i++) {
            DeviceAddress addr;
            if (tempSensors.getAddress(addr, i)) {
                String a = "";
                for (int j = 0; j < 8; j++) {
                    if (addr[j] < 16) a += "0";
                    a += String(addr[j], HEX);
                }
                Serial.printf("    [%d] %s\n", i, a.c_str());
            }
        }
    }

    deviceId = buildDeviceId();
    Serial.println("  Device   : " + deviceId);

    wifiSsid = nvsLoad("wifi_ssid");
    wifiPass = nvsLoad("wifi_pass");
    apiKey   = nvsLoad("api_key");

    Serial.printf ("  NVS SSID : %s\n", wifiSsid.length() ? wifiSsid.c_str() : "(не задан)");
    Serial.printf ("  NVS key  : %s\n", apiKey.length() ? "задан" : "(не задан)");
    Serial.println();

    bool configured = wifiSsid.length() > 0 && apiKey.length() > 0;

    if (configured) {
        Serial.println("[Boot] Конфигурация найдена, подключаюсь...");
        if (connectWiFi(wifiSsid, wifiPass)) {
            state = S_NORMAL;
            startWebSocket();
        } else {
            startPortal("Wi-Fi недоступен — проверьте пароль или введите заново");
        }
    } else {
        Serial.println("[Boot] Нет конфигурации — запускаю портал настройки");
        startPortal();
    }
}

// ─── LOOP ─────────────────────────────────────────────────
void loop() {
    checkResetButton();

    if (Serial.available()) {
        String cmd = Serial.readStringUntil('\n');
        cmd.trim();
        if      (cmd.equalsIgnoreCase("RESET"))  { Serial.println("[CMD] Сброс..."); nvsClearAll(); delay(300); ESP.restart(); }
        else if (cmd.equalsIgnoreCase("STATUS")) { printHeartbeat(); }
        else if (cmd.equalsIgnoreCase("SCAN"))   { scanWifi(); }
        else if (cmd.equalsIgnoreCase("HELP"))   { Serial.println("Команды: RESET | STATUS | SCAN | HELP"); }
    }

    // ── PORTAL ──
    if (state == S_PORTAL) {
        dnsServer.processNextRequest();
        portalServer.handleClient();

        if (formSubmitted && millis() - formSubmitAt > 600) {
            formSubmitted = false;
            dnsServer.stop();
            portalServer.stop();
            WiFi.softAPdisconnect(true);
            delay(300);

            Serial.println("[Portal] Подключаюсь к Wi-Fi...");
            if (connectWiFi(wifiSsid, wifiPass)) {
                state = S_PAIRING;
                Serial.println("[Pairing] Подключаюсь к серверу для сопряжения...");
                startWebSocket();
            } else {
                startPortal("Не удалось подключиться к «" + wifiSsid + "». Проверьте пароль.");
            }
        }
        return;
    }

    // ── PAIRING + NORMAL ──
    wsClient.loop();

    if (state == S_NORMAL) {
        updateHeater();
        unsigned long now = millis();

        if (now - lastTempSend >= TEMP_INTERVAL_MS) {
            lastTempSend = now;
            sendTemperatures();
        }

        if (now - lastHeartbeat >= HEARTBEAT_INTERVAL) {
            lastHeartbeat = now;
            printHeartbeat();
        }
    }
}
