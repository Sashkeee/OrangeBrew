/**
 * OrangeBrew ESP32 Firmware v2.1
 *
 * Первый запуск:
 *   1. ESP поднимает AP "Orange_XXXXXX" (без пароля)
 *   2. Пользователь подключается к AP → браузер открывает портал
 *   3. В форме вводит: SSID/пароль Wi-Fi + код сопряжения с сайта
 *   4. ESP подключается к Wi-Fi, проводит pairing, сохраняет api_key в NVS
 *   5. Перезагрузка → обычный режим (auth + датчики)
 *
 * Сброс: Serial> RESET  или удержание BOOT-кнопки 3 сек
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

// ─── СЕРВЕРНЫЕ НАСТРОЙКИ ──────────────────────────────────
const char* WS_HOST = "test.orangebrew.ru";
const int   WS_PORT = 443;
const char* WS_PATH = "/ws";

// ─── ПИНЫ ─────────────────────────────────────────────────
#define ONE_WIRE_BUS  13
#define HEATER_PIN    14
#define PUMP_PIN      12
#define BOOT_PIN       0   // Кнопка BOOT/FLASH — удержание 3 сек = сброс

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

// Portаl — данные из формы
String pairingCode    = "";
bool   formSubmitted  = false;
unsigned long formSubmitAt = 0;

// Управление нагревателем/насосом
int  heaterPct = 0;
bool pumpOn    = false;
unsigned long lastTempSend = 0;
#define TEMP_INTERVAL_MS 1500

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

// ─── DEVICE ID ────────────────────────────────────────────
String buildDeviceId() {
    char buf[20];
    snprintf(buf, sizeof(buf), "ESP32_%06X", (uint32_t)ESP.getEfuseMac());
    return String(buf);
}

// ─── HTML ПОРТАЛА ─────────────────────────────────────────
// Хранится в flash (PROGMEM), не занимает RAM
static const char PORTAL_HTML[] PROGMEM = R"(
<!DOCTYPE html><html lang="ru">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>OrangeBrew Setup</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,sans-serif;background:#111;color:#fff;min-height:100vh;
     display:flex;align-items:center;justify-content:center;padding:20px}
.card{background:#1e1e1e;border:1px solid #2e2e2e;border-radius:16px;
      padding:32px;width:100%;max-width:420px}
.header{display:flex;align-items:center;gap:12px;margin-bottom:24px}
.logo{font-size:2.2rem}
h1{font-size:1.3rem;color:#ffa000;line-height:1.2}
.sub{font-size:.85rem;color:#666;margin-top:2px}
.block{margin-bottom:20px}
.block-title{font-size:.7rem;text-transform:uppercase;letter-spacing:1.5px;
             color:#ffa000;margin-bottom:10px}
label{display:block;font-size:.82rem;color:#999;margin-bottom:4px}
input{width:100%;padding:11px 14px;background:#111;border:1px solid #333;
      border-radius:8px;color:#fff;font-size:.95rem;transition:border .2s}
input:focus{outline:none;border-color:#ffa000}
.code-input{letter-spacing:6px;font-size:1.6rem;text-align:center;
            text-transform:uppercase;font-family:monospace}
.hint{font-size:.78rem;color:#555;margin-top:5px}
.hint a{color:#ffa000;text-decoration:none}
.btn{display:block;width:100%;background:#ffa000;color:#000;border:none;
     padding:14px;border-radius:8px;font-size:1rem;font-weight:700;
     cursor:pointer;margin-top:24px;transition:background .15s}
.btn:hover{background:#ffb300}
.msg{padding:12px 14px;border-radius:8px;margin-top:16px;font-size:.88rem}
.msg-ok  {background:#0d2b0d;border:1px solid #2e7d32;color:#81c784}
.msg-err {background:#2b0d0d;border:1px solid #c62828;color:#ef9a9a}
.msg-info{background:#0d1a2b;border:1px solid #1565c0;color:#90caf9}
.footer{font-size:.7rem;color:#333;text-align:center;margin-top:20px;font-family:monospace}
</style>
</head>
<body>
<div class="card">
  <div class="header">
    <span class="logo">🍺</span>
    <div><h1>OrangeBrew Setup</h1><div class="sub">Настройка контроллера</div></div>
  </div>

  <form method="POST" action="/save">
    <div class="block">
      <div class="block-title">📡 Wi-Fi</div>
      <label>Название сети</label>
      <input type="text" name="ssid" placeholder="Имя вашей Wi-Fi сети" required>
      <label style="margin-top:10px">Пароль</label>
      <input type="password" name="pass" placeholder="Пароль (если есть)">
    </div>

    <div class="block">
      <div class="block-title">🔗 Код сопряжения</div>
      <input class="code-input" type="text" name="code"
             placeholder="XXXXXX" maxlength="6" required>
      <p class="hint">Получите код на
        <a href="https://test.orangebrew.ru/devices/pair" target="_blank">
          test.orangebrew.ru/devices/pair
        </a>
      </p>
    </div>

    <button class="btn" type="submit">✓ Подключить</button>
  </form>

  %%STATUS%%

  <div class="footer">%%DEVICE_ID%%</div>
</div>
</body></html>
)";

// ─── HTTP HANDLERS ────────────────────────────────────────

String buildPage(const String& statusBlock) {
    String html = String(PORTAL_HTML);
    html.replace("%%STATUS%%",    statusBlock);
    html.replace("%%DEVICE_ID%%", deviceId);
    return html;
}

void handleRoot() {
    portalServer.send(200, "text/html; charset=utf-8", buildPage(""));
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

    // Сохраняем данные и планируем подключение через 600мс
    // (чтобы браузер успел получить ответ до отключения AP)
    wifiSsid    = ssid;
    wifiPass    = pass;
    pairingCode = code;
    formSubmitted = true;
    formSubmitAt  = millis();

    portalServer.send(200, "text/html; charset=utf-8",
        buildPage("<div class='msg msg-info'>⏳ Подключаюсь к «" + ssid + "»…<br>"
                  "AP отключится через несколько секунд.</div>"));
}

// Captive portal: любой DNS-запрос → 192.168.4.1
void handleNotFound() {
    portalServer.sendHeader("Location", "http://192.168.4.1/", true);
    portalServer.send(302, "text/plain", "");
}

// ─── ЗАПУСК ПОРТАЛА ───────────────────────────────────────
void startPortal(const String& errorHint = "") {
    state = S_PORTAL;
    formSubmitted = false;

    // Имя AP: Orange_ + последние 6 цифр MAC
    String apName = "Orange_" + deviceId.substring(deviceId.indexOf('_') + 1);

    Serial.println("\n[Portal] Запускаю AP: " + apName + " (без пароля)");

    WiFi.mode(WIFI_AP);
    WiFi.softAP(apName.c_str());
    delay(300);

    IPAddress ip = WiFi.softAPIP(); // 192.168.4.1
    Serial.println("[Portal] IP: " + ip.toString());

    dnsServer.start(53, "*", ip);

    portalServer.on("/",       HTTP_GET,  handleRoot);
    portalServer.on("/save",   HTTP_POST, handleSave);
    portalServer.onNotFound(handleNotFound);
    portalServer.begin();

    if (errorHint.length()) {
        Serial.println("[Portal] " + errorHint);
    }
    Serial.println("[Portal] Подключитесь к «" + apName + "» и откройте браузер.");
}

// ─── WI-FI ПОДКЛЮЧЕНИЕ ────────────────────────────────────
bool connectWiFi(const String& ssid, const String& pass) {
    WiFi.mode(WIFI_STA);
    WiFi.begin(ssid.c_str(), pass.c_str());
    Serial.printf("[WiFi] Подключаюсь к «%s»", ssid.c_str());
    for (int i = 0; i < 30 && WiFi.status() != WL_CONNECTED; i++) {
        delay(500);
        Serial.print(".");
    }
    Serial.println();
    if (WiFi.status() == WL_CONNECTED) {
        Serial.println("[WiFi] Подключён: " + WiFi.localIP().toString());
        return true;
    }
    Serial.println("[WiFi] Не удалось подключиться.");
    return false;
}

// ─── WEBSOCKET ────────────────────────────────────────────
void wsSendAuth() {
    StaticJsonDocument<128> doc;
    doc["type"]    = "auth";
    doc["api_key"] = apiKey;
    String s; serializeJson(doc, s);
    wsClient.sendTXT(s);
    Serial.println("[WS] → auth");
}

void wsSendPair() {
    StaticJsonDocument<256> doc;
    doc["type"]         = "pair";
    doc["pairing_code"] = pairingCode;
    doc["deviceId"]     = deviceId;
    doc["name"]         = "OrangeBrew ESP32";
    String s; serializeJson(doc, s);
    wsClient.sendTXT(s);
    Serial.println("[WS] → pair: " + pairingCode);
}

void wsHandleMessage(const char* payload) {
    StaticJsonDocument<256> doc;
    if (deserializeJson(doc, payload)) return;
    const char* type = doc["type"] | "";

    if (strcmp(type, "paired") == 0) {
        const char* newKey = doc["api_key"];
        if (newKey && strlen(newKey) > 0) {
            nvsSave("api_key",   String(newKey));
            nvsSave("wifi_ssid", wifiSsid);
            nvsSave("wifi_pass", wifiPass);
            Serial.println("[WS] ✅ Paired! Перезагрузка...");
            delay(800);
            ESP.restart();
        }
        return;
    }

    if (strcmp(type, "error") == 0) {
        Serial.printf("[WS] ❌ %s\n", doc["message"] | "error");
        return;
    }

    const char* cmd = doc["cmd"] | "";
    if (strcmp(cmd, "setHeater") == 0) {
        heaterPct = constrain((int)(doc["value"] | 0), 0, 100);
        Serial.printf("[CMD] Heater → %d%%\n", heaterPct);
    } else if (strcmp(cmd, "setPump") == 0) {
        pumpOn = (bool)(doc["value"] | false);
        digitalWrite(PUMP_PIN, pumpOn ? HIGH : LOW);
        Serial.printf("[CMD] Pump → %s\n", pumpOn ? "ON" : "OFF");
    }
}

void wsEvent(WStype_t type, uint8_t* payload, size_t len) {
    switch (type) {
        case WStype_CONNECTED:
            Serial.println("[WS] Подключён");
            (state == S_PAIRING) ? wsSendPair() : wsSendAuth();
            break;
        case WStype_DISCONNECTED:
            Serial.println("[WS] Отключён");
            break;
        case WStype_TEXT:
            Serial.printf("[WS] ← %s\n", payload);
            wsHandleMessage((char*)payload);
            break;
        case WStype_ERROR:
            Serial.println("[WS] Ошибка");
            break;
        default: break;
    }
}

void startWebSocket() {
    Serial.printf("[WS] → wss://%s%s\n", WS_HOST, WS_PATH);
    wsClient.beginSSL(WS_HOST, WS_PORT, WS_PATH);
    wsClient.onEvent(wsEvent);
    wsClient.setReconnectInterval(5000);
}

// ─── ТЕМПЕРАТУРНЫЕ ДАННЫЕ ─────────────────────────────────
void sendTemperatures() {
    tempSensors.requestTemperatures();
    int count = tempSensors.getDeviceCount();
    StaticJsonDocument<512> doc;
    doc["type"] = "sensors_raw";
    JsonArray arr = doc.createNestedArray("sensors");
    for (int i = 0; i < count; i++) {
        DeviceAddress addr;
        if (tempSensors.getAddress(addr, i)) {
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
    }
    String msg; serializeJson(doc, msg);
    wsClient.sendTXT(msg);
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
    if (digitalRead(BOOT_PIN) == LOW) {
        if (btnHoldSince == 0) btnHoldSince = millis();
        if (millis() - btnHoldSince > 3000) {
            Serial.println("[BTN] Сброс настроек!");
            nvsClearAll();
            delay(300);
            ESP.restart();
        }
    } else {
        btnHoldSince = 0;
    }
}

// ─── SETUP ────────────────────────────────────────────────
void setup() {
    Serial.begin(115200);
    delay(400);
    Serial.println(F("\n╔═══════════════════════════╗"));
    Serial.println(F("║  OrangeBrew ESP32 v2.1   ║"));
    Serial.println(F("╚═══════════════════════════╝"));

    pinMode(HEATER_PIN, OUTPUT);
    pinMode(PUMP_PIN,   OUTPUT);
    pinMode(BOOT_PIN,   INPUT_PULLUP);
    digitalWrite(HEATER_PIN, LOW);
    digitalWrite(PUMP_PIN,   LOW);

    tempSensors.begin();
    tempSensors.setWaitForConversion(false);

    deviceId = buildDeviceId();
    Serial.println("[Device] " + deviceId);

    // Загрузить конфигурацию из NVS
    wifiSsid = nvsLoad("wifi_ssid");
    wifiPass = nvsLoad("wifi_pass");
    apiKey   = nvsLoad("api_key");

    bool configured = wifiSsid.length() > 0 && apiKey.length() > 0;

    if (configured) {
        Serial.println("[Boot] Конфигурация найдена, подключаюсь...");
        if (connectWiFi(wifiSsid, wifiPass)) {
            state = S_NORMAL;
            startWebSocket();
        } else {
            startPortal("Wi-Fi недоступен — проверьте пароль");
        }
    } else {
        Serial.println("[Boot] Нет конфигурации — запускаю портал");
        startPortal();
    }
}

// ─── LOOP ─────────────────────────────────────────────────
void loop() {
    checkResetButton();

    // Serial команды
    if (Serial.available()) {
        String cmd = Serial.readStringUntil('\n');
        cmd.trim();
        if (cmd.equalsIgnoreCase("RESET")) {
            nvsClearAll(); delay(300); ESP.restart();
        } else if (cmd.equalsIgnoreCase("STATUS")) {
            Serial.printf("state=%d ip=%s api=%s\n",
                state,
                WiFi.status() == WL_CONNECTED ? WiFi.localIP().toString().c_str() : "none",
                apiKey.length() ? "ok" : "none");
        }
    }

    // ── PORTAL ──
    if (state == S_PORTAL) {
        dnsServer.processNextRequest();
        portalServer.handleClient();

        // Обработать форму после небольшой задержки (браузер должен получить ответ)
        if (formSubmitted && millis() - formSubmitAt > 600) {
            formSubmitted = false;
            dnsServer.stop();
            portalServer.stop();
            WiFi.softAPdisconnect(true);
            delay(300);

            if (connectWiFi(wifiSsid, wifiPass)) {
                state = S_PAIRING;
                startWebSocket();
            } else {
                // Перезапустить портал с ошибкой
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
    }
}
