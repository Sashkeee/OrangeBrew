/**
 * OrangeBrew ESP32 Firmware v2.2
 *
 * Первый запуск:
 *   1. ESP поднимает AP "Orange_XXXXXX" (без пароля)
 *   2. Пользователь подключается к AP → браузер открывает портал
 *   3. В форме выбирает Wi-Fi сеть из списка (или вводит вручную) + пароль + код сопряжения
 *   4. ESP подключается к Wi-Fi, проводит pairing, сохраняет api_key в NVS
 *   5. Перезагрузка → обычный режим (auth + датчики)
 *
 * Сброс: Serial> RESET  или удержание BOOT-кнопки 3 сек
 * Статус: Serial> STATUS
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

// Portal — данные из формы
String pairingCode    = "";
bool   formSubmitted  = false;
unsigned long formSubmitAt = 0;

// Управление нагревателем/насосом
int  heaterPct = 0;
bool pumpOn    = false;
unsigned long lastTempSend    = 0;
unsigned long lastHeartbeat   = 0;
unsigned long wsConnectedAt   = 0;
bool          wsConnected     = false;
uint32_t      wsTxCount       = 0;
#define TEMP_INTERVAL_MS   1500
#define HEARTBEAT_INTERVAL 60000  // авто-статус в Serial каждую минуту

// Кэш WiFi-сканирования для портала
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

// ─── DEVICE ID ────────────────────────────────────────────
String buildDeviceId() {
    char buf[20];
    snprintf(buf, sizeof(buf), "ESP32_%06X", (uint32_t)ESP.getEfuseMac());
    return String(buf);
}

// ─── WIFI SCAN ────────────────────────────────────────────
void scanWifi() {
    Serial.println("[WiFi] Сканирую сети...");
    // Временно переключаемся в STA для сканирования
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
                WiFi.encryptionType(i) == WIFI_AUTH_OPEN ? "открытая" : "🔒");
            scannedCount++;
        }
    }
    WiFi.scanDelete();
}

// Сигнал качества по RSSI: 4 уровня
const char* rssiIcon(int32_t rssi) {
    if (rssi >= -50) return "▂▄▆█";
    if (rssi >= -65) return "▂▄▆_";
    if (rssi >= -75) return "▂▄__";
    return "▂___";
}

// ─── HTML ПОРТАЛА ─────────────────────────────────────────
static const char PORTAL_HTML[] PROGMEM = R"rawhtml(
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
      padding:32px;width:100%;max-width:440px}
.header{display:flex;align-items:center;gap:12px;margin-bottom:24px}
.logo{font-size:2.2rem}
h1{font-size:1.3rem;color:#ffa000;line-height:1.2}
.sub{font-size:.85rem;color:#666;margin-top:2px}
.block{margin-bottom:20px}
.block-title{font-size:.7rem;text-transform:uppercase;letter-spacing:1.5px;
             color:#ffa000;margin-bottom:10px}
label{display:block;font-size:.82rem;color:#999;margin-bottom:4px;margin-top:10px}
label:first-child{margin-top:0}
input,select{width:100%;padding:11px 14px;background:#111;border:1px solid #333;
      border-radius:8px;color:#fff;font-size:.95rem;transition:border .2s;
      -webkit-appearance:none;appearance:none}
input:focus,select:focus{outline:none;border-color:#ffa000}
.select-wrap{position:relative}
.select-wrap select{padding-right:2.2rem;cursor:pointer}
.select-wrap::after{content:"▾";position:absolute;right:.9rem;top:50%;
                    transform:translateY(-50%);color:#888;pointer-events:none;font-size:1rem}
.net-item{display:flex;align-items:center;gap:8px;padding:9px 12px;
          border-radius:8px;cursor:pointer;transition:background .15s;border:1px solid transparent}
.net-item:hover{background:#2a2a2a;border-color:#3a3a3a}
.net-item.active{background:#1e2a0e;border-color:#ffa000}
.net-ssid{flex:1;font-size:.9rem}
.net-rssi{font-size:.7rem;color:#888;font-family:monospace;white-space:nowrap}
.net-lock{font-size:.8rem;color:#666}
.divider{display:flex;align-items:center;gap:8px;margin:12px 0;color:#444;font-size:.75rem}
.divider::before,.divider::after{content:"";flex:1;height:1px;background:#333}
.code-input{letter-spacing:6px;font-size:1.6rem;text-align:center;
            text-transform:uppercase;font-family:monospace}
.hint{font-size:.78rem;color:#555;margin-top:5px}
.hint a{color:#ffa000;text-decoration:none}
.btn{display:block;width:100%;background:#ffa000;color:#000;border:none;
     padding:14px;border-radius:8px;font-size:1rem;font-weight:700;
     cursor:pointer;margin-top:24px;transition:background .15s}
.btn:hover{background:#ffb300}
.btn:disabled{background:#555;color:#888;cursor:not-allowed}
.msg{padding:12px 14px;border-radius:8px;margin-top:16px;font-size:.88rem}
.msg-ok  {background:#0d2b0d;border:1px solid #2e7d32;color:#81c784}
.msg-err {background:#2b0d0d;border:1px solid #c62828;color:#ef9a9a}
.msg-info{background:#0d1a2b;border:1px solid #1565c0;color:#90caf9}
.footer{font-size:.7rem;color:#333;text-align:center;margin-top:20px;font-family:monospace}
.scanning{color:#888;font-size:.82rem;padding:8px 0}
</style>
</head>
<body>
<div class="card">
  <div class="header">
    <span class="logo">🍺</span>
    <div><h1>OrangeBrew Setup</h1><div class="sub">Настройка контроллера v2.2</div></div>
  </div>

  <form method="POST" action="/save" id="form">
    <div class="block">
      <div class="block-title">📡 Wi-Fi</div>

      <!-- Список найденных сетей -->
      <div id="net-list"><div class="scanning">⏳ Поиск сетей…</div></div>

      <div class="divider">или введите вручную</div>

      <label>Название сети</label>
      <input type="text" name="ssid" id="ssid-input"
             placeholder="Введите SSID вручную" autocomplete="off">

      <label>Пароль</label>
      <input type="password" name="pass" id="pass-input"
             placeholder="Пароль (если есть)">
    </div>

    <div class="block">
      <div class="block-title">🔗 Код сопряжения</div>
      <input class="code-input" type="text" name="code"
             placeholder="XXXXXX" maxlength="6" required
             oninput="this.value=this.value.toUpperCase()">
      <p class="hint">Получите код на
        <a href="https://%%HOST%%/devices/pair" target="_blank">%%HOST%%/devices/pair</a>
      </p>
    </div>

    <button class="btn" type="submit" id="submit-btn">✓ Подключить</button>
  </form>

  %%STATUS%%

  <div class="footer">%%DEVICE_ID%%</div>
</div>

<script>
var selectedSsid = '';

// Загрузить список сетей
fetch('/scan')
  .then(function(r){ return r.json(); })
  .then(function(nets){
    var el = document.getElementById('net-list');
    if (!nets || nets.length === 0) {
      el.innerHTML = '<div class="scanning">Сети не найдены — введите вручную</div>';
      return;
    }
    var html = '';
    nets.forEach(function(n){
      var lock = n.open ? '' : ' <span class="net-lock">🔒</span>';
      html += '<div class="net-item" onclick="selectNet(this,\''+escHtml(n.ssid)+'\')">' +
              '<span class="net-ssid">'+escHtml(n.ssid)+'</span>' +
              '<span class="net-rssi">'+n.signal+'</span>'+lock+'</div>';
    });
    el.innerHTML = html;
  })
  .catch(function(){
    document.getElementById('net-list').innerHTML =
      '<div class="scanning">Не удалось загрузить список — введите вручную</div>';
  });

function escHtml(s){
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function selectNet(el, ssid) {
  document.querySelectorAll('.net-item').forEach(function(x){ x.classList.remove('active'); });
  el.classList.add('active');
  selectedSsid = ssid;
  document.getElementById('ssid-input').value = ssid;
  document.getElementById('pass-input').focus();
}

document.getElementById('ssid-input').addEventListener('input', function(){
  if (this.value !== selectedSsid) {
    document.querySelectorAll('.net-item').forEach(function(x){ x.classList.remove('active'); });
    selectedSsid = '';
  }
});

document.getElementById('form').addEventListener('submit', function(e){
  var ssid = document.getElementById('ssid-input').value.trim();
  var code = document.querySelector('[name=code]').value.trim();
  if (!ssid) { e.preventDefault(); alert('Выберите или введите название Wi-Fi сети'); return; }
  if (code.length !== 6) { e.preventDefault(); alert('Код сопряжения должен быть 6 символов'); return; }
  document.getElementById('submit-btn').disabled = true;
  document.getElementById('submit-btn').textContent = '⏳ Подключаюсь…';
});
</script>
</body></html>
)rawhtml";

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

// GET /scan — возвращает JSON с найденными сетями
void handleScan() {
    String json = "[";
    for (int i = 0; i < scannedCount; i++) {
        if (i > 0) json += ",";
        String sig = String(rssiIcon(scannedNets[i].rssi)) + " " + String(scannedNets[i].rssi) + " dBm";
        bool open = (scannedNets[i].enc == WIFI_AUTH_OPEN);
        json += "{\"ssid\":\"";
        // Экранируем кавычки в SSID
        String ssid = scannedNets[i].ssid;
        ssid.replace("\"", "\\\"");
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

    Serial.printf("[Portal] Форма получена: SSID='%s', код='%s'\n", ssid.c_str(), code.c_str());

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
    state = S_PORTAL;
    formSubmitted = false;

    // Сканируем сети ДО поднятия AP (пока ещё в STA/idle режиме)
    scanWifi();

    String apName = "Orange_" + deviceId.substring(deviceId.indexOf('_') + 1);

    Serial.println("\n╔════════════════════════════════╗");
    Serial.println("║        РЕЖИМ НАСТРОЙКИ         ║");
    Serial.println("╚════════════════════════════════╝");
    Serial.println("[Portal] AP: " + apName + " (без пароля)");

    WiFi.mode(WIFI_AP);
    WiFi.softAP(apName.c_str());
    delay(300);

    IPAddress ip = WiFi.softAPIP();
    Serial.println("[Portal] IP портала:  " + ip.toString());
    Serial.println("[Portal] Откройте браузер после подключения к AP");

    dnsServer.start(53, "*", ip);

    portalServer.on("/",       HTTP_GET,  handleRoot);
    portalServer.on("/scan",   HTTP_GET,  handleScan);
    portalServer.on("/save",   HTTP_POST, handleSave);
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
    }
    Serial.println();

    if (WiFi.status() == WL_CONNECTED) {
        Serial.println("┌─────────────────────────────────┐");
        Serial.println("│         Wi-Fi подключён          │");
        Serial.println("└─────────────────────────────────┘");
        Serial.println("  SSID    : " + WiFi.SSID());
        Serial.println("  IP      : " + WiFi.localIP().toString());
        Serial.println("  Шлюз    : " + WiFi.gatewayIP().toString());
        Serial.println("  DNS     : " + WiFi.dnsIP().toString());
        Serial.println("  MAC     : " + WiFi.macAddress());
        Serial.printf ("  RSSI    : %d dBm (%s)\n", WiFi.RSSI(), rssiIcon(WiFi.RSSI()));
        Serial.printf ("  Канал   : %d\n", WiFi.channel());
        return true;
    }

    Serial.println("[WiFi] ❌ Не удалось подключиться (статус=" + String(WiFi.status()) + ")");
    // Расшифровка кодов статуса
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
    // Показываем только первые 8 символов ключа
    String keyPreview = apiKey.length() >= 8 ? apiKey.substring(0, 8) + "..." : apiKey;
    Serial.println("[WS] → auth  (api_key: " + keyPreview + ")");
}

void wsSendPair() {
    StaticJsonDocument<256> doc;
    doc["type"]         = "pair";
    doc["pairing_code"] = pairingCode;
    doc["deviceId"]     = deviceId;
    doc["name"]         = "OrangeBrew ESP32";
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
            Serial.println("┌─────────────────────────────────┐");
            Serial.println("│       ✅  СОПРЯЖЕНИЕ ВЫПОЛНЕНО   │");
            Serial.println("└─────────────────────────────────┘");
            Serial.println("  api_key сохранён в NVS");
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
            Serial.println("┌─────────────────────────────────┐");
            Serial.println("│      WebSocket подключён         │");
            Serial.println("└─────────────────────────────────┘");
            Serial.printf ("  Хост   : %s:%d%s\n", WS_HOST, WS_PORT, WS_PATH);
            Serial.println("  RSSI   : " + String(WiFi.RSSI()) + " dBm");
            (state == S_PAIRING) ? wsSendPair() : wsSendAuth();
            break;

        case WStype_DISCONNECTED:
            wsConnected = false;
            if (wsConnectedAt > 0) {
                unsigned long uptime = (millis() - wsConnectedAt) / 1000;
                Serial.printf("[WS] ❌ Отключён (был подключён %lu сек, отправлено пакетов: %lu)\n",
                              uptime, wsTxCount);
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
            Serial.printf("[WS] ⚠  Ошибка (код %d)\n", (int)(payload ? *payload : 0));
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
    wsTxCount = 0;
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

    bool anyValid = false;
    for (int i = 0; i < count; i++) {
        DeviceAddress addr;
        if (tempSensors.getAddress(addr, i)) {
            float t = tempSensors.getTempC(addr);
            if (t == DEVICE_DISCONNECTED_C || t == 85.0f) continue;
            anyValid = true;
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

    if (!anyValid && count == 0) return; // нет датчиков — не шлём

    String msg; serializeJson(doc, msg);
    wsClient.sendTXT(msg);
    wsTxCount++;
}

// ─── HEARTBEAT (авто-статус в Serial каждую минуту) ──────
void printHeartbeat() {
    unsigned long upSec = millis() / 1000;
    Serial.println("\n── Статус ──────────────────────────");
    Serial.printf ("  Uptime   : %02lu:%02lu:%02lu\n",
                   upSec/3600, (upSec%3600)/60, upSec%60);
    Serial.printf ("  IP       : %s\n",
                   WiFi.status() == WL_CONNECTED ? WiFi.localIP().toString().c_str() : "нет");
    Serial.printf ("  RSSI     : %d dBm\n", WiFi.RSSI());
    Serial.printf ("  WS       : %s\n", wsConnected ? "подключён" : "отключён");
    Serial.printf ("  Нагрев   : %d%%\n", heaterPct);
    Serial.printf ("  Насос    : %s\n", pumpOn ? "ВКЛ" : "ВЫКЛ");

    int cnt = tempSensors.getDeviceCount();
    Serial.printf ("  Датчиков : %d\n", cnt);
    for (int i = 0; i < cnt; i++) {
        DeviceAddress addr;
        if (tempSensors.getAddress(addr, i)) {
            float t = tempSensors.getTempCelsius(addr);
            String addrStr = "";
            for (int j = 0; j < 8; j++) {
                if (addr[j] < 16) addrStr += "0";
                addrStr += String(addr[j], HEX);
            }
            Serial.printf("    [%d] %s  →  %.2f°C\n", i, addrStr.c_str(), t);
        }
    }
    Serial.println("────────────────────────────────────");
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

    Serial.println(F("\n╔══════════════════════════════════╗"));
    Serial.println(F("║   OrangeBrew ESP32 Firmware v2.2  ║"));
    Serial.println(F("╚══════════════════════════════════╝"));
    Serial.printf ("  Чип      : %s  rev%d\n", ESP.getChipModel(), ESP.getChipRevision());
    Serial.printf ("  Ядра     : %d\n", ESP.getChipCores());
    Serial.printf ("  Flash    : %d KB\n", ESP.getFlashChipSize() / 1024);
    Serial.printf ("  RAM      : %d KB free\n", ESP.getFreeHeap() / 1024);
    Serial.printf ("  MAC      : %s\n", WiFi.macAddress().c_str());

    pinMode(HEATER_PIN, OUTPUT);
    pinMode(PUMP_PIN,   OUTPUT);
    pinMode(BOOT_PIN,   INPUT_PULLUP);
    digitalWrite(HEATER_PIN, LOW);
    digitalWrite(PUMP_PIN,   LOW);

    tempSensors.begin();
    tempSensors.setWaitForConversion(false);

    int sensorCount = tempSensors.getDeviceCount();
    Serial.printf ("  DS18B20  : %d датчик(ов)\n", sensorCount);
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

    bool configured = wifiSsid.length() > 0 && apiKey.length() > 0;
    Serial.printf ("  NVS SSID : %s\n", wifiSsid.length() ? wifiSsid.c_str() : "(не задан)");
    Serial.printf ("  NVS key  : %s\n", apiKey.length() ? "задан" : "(не задан)");
    Serial.println();

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

    // Serial команды
    if (Serial.available()) {
        String cmd = Serial.readStringUntil('\n');
        cmd.trim();
        if (cmd.equalsIgnoreCase("RESET")) {
            Serial.println("[CMD] Сброс...");
            nvsClearAll(); delay(300); ESP.restart();
        } else if (cmd.equalsIgnoreCase("STATUS")) {
            printHeartbeat();
        } else if (cmd.equalsIgnoreCase("SCAN")) {
            scanWifi();
        } else if (cmd.equalsIgnoreCase("HELP")) {
            Serial.println("Команды: RESET | STATUS | SCAN | HELP");
        }
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

            Serial.println("[Portal] Форма принята, подключаюсь к Wi-Fi...");
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

        // Авто-статус каждую минуту
        if (now - lastHeartbeat >= HEARTBEAT_INTERVAL) {
            lastHeartbeat = now;
            printHeartbeat();
        }
    }
}
