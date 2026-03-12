#include <Arduino.h>
#include <ArduinoJson.h>
#include <OneWire.h>
#include <DallasTemperature.h>
#include <Preferences.h>       // ESP32 NVS — постоянное хранилище

#if defined(ESP32)
  #include <WiFi.h>
  #include <WebSocketsClient.h>
#elif defined(ESP8266)
  #include <ESP8266WiFi.h>
  #include <WebSocketsClient.h>
#endif

// ─── НАСТРОЙКИ ────────────────────────────────────────────
const char* ssid     = "MTS_GPON_14FC";
const char* password = "tXQ7QRXQ";

const char* ws_host = "test.orangebrew.ru";
const int   ws_port = 443;
const char* ws_path = "/ws";

// ─── ПИНЫ ─────────────────────────────────────────────────
#define ONE_WIRE_BUS 13
#define HEATER_PIN   14
#define PUMP_PIN     12

// ─── ОБЪЕКТЫ ──────────────────────────────────────────────
WebSocketsClient webSocket;
OneWire oneWire(ONE_WIRE_BUS);
DallasTemperature sensors(&oneWire);
Preferences prefs;

// ─── СОСТОЯНИЕ ────────────────────────────────────────────
String deviceId  = "";
String storedApiKey = "";   // из NVS; пустая = не спарен
bool   isPaired  = false;   // true после получения {type:"paired"}
String pendingPairingCode = ""; // код введённый через Serial

int  heaterPowerPercent = 0;
bool isPumpOn = false;
unsigned long lastTempRequest = 0;
#define TEMP_UPDATE_INTERVAL 1500

// ─── HELPERS ──────────────────────────────────────────────

String buildDeviceId() {
  #ifdef ESP8266
    return "ESP8266_" + String(ESP.getChipId(), HEX);
  #else
    return "ESP32_" + String((uint32_t)ESP.getEfuseMac(), HEX);
  #endif
}

// Сохранить api_key в NVS
void saveApiKey(const String& key) {
  prefs.begin("orangebrew", false);
  prefs.putString("api_key", key);
  prefs.end();
  storedApiKey = key;
  Serial.println("[NVS] api_key сохранён.");
}

// Загрузить api_key из NVS
String loadApiKey() {
  prefs.begin("orangebrew", true);
  String key = prefs.getString("api_key", "");
  prefs.end();
  return key;
}

// Стереть api_key (для сброса / повторного сопряжения)
void clearApiKey() {
  prefs.begin("orangebrew", false);
  prefs.remove("api_key");
  prefs.end();
  storedApiKey = "";
  Serial.println("[NVS] api_key удалён. Введите новый pairing-код.");
}

// ─── ОТПРАВКА СООБЩЕНИЙ ───────────────────────────────────

// Отправить запрос авторизации (есть api_key)
void sendAuth() {
  StaticJsonDocument<128> doc;
  doc["type"]    = "auth";
  doc["api_key"] = storedApiKey;
  String msg;
  serializeJson(doc, msg);
  webSocket.sendTXT(msg);
  Serial.println("[WS] → auth отправлен");
}

// Отправить запрос сопряжения (нет api_key)
void sendPair(const String& code) {
  StaticJsonDocument<256> doc;
  doc["type"]         = "pair";
  doc["pairing_code"] = code;
  doc["deviceId"]     = deviceId;
  doc["name"]         = "OrangeBrew ESP32";
  String msg;
  serializeJson(doc, msg);
  webSocket.sendTXT(msg);
  Serial.println("[WS] → pair отправлен с кодом: " + code);
}

// ─── ОБРАБОТКА КОМАНД ─────────────────────────────────────

void processCommand(const char* payload) {
  StaticJsonDocument<256> doc;
  if (deserializeJson(doc, payload)) return;

  // Ответ на сопряжение
  if (strcmp(doc["type"] | "", "paired") == 0) {
    const char* newKey = doc["api_key"];
    if (newKey && strlen(newKey) > 0) {
      saveApiKey(String(newKey));
      isPaired = true;
      Serial.println("[WS] Сопряжение успешно! Переподключаюсь...");
      // Закрываем и переподключаемся — сервер это тоже делает с кодом 1000
      webSocket.disconnect();
    }
    return;
  }

  // Ошибка от сервера
  if (strcmp(doc["type"] | "", "error") == 0) {
    Serial.printf("[WS] Ошибка сервера: %s\n", doc["message"] | "unknown");
    return;
  }

  // Команды управления
  const char* cmd = doc["cmd"];
  if (!cmd) return;

  if (strcmp(cmd, "setHeater") == 0) {
    heaterPowerPercent = doc["value"] | 0;
    Serial.printf("[CMD] setHeater → %d%%\n", heaterPowerPercent);
  } else if (strcmp(cmd, "setPump") == 0) {
    isPumpOn = doc["value"] | false;
    digitalWrite(PUMP_PIN, isPumpOn ? HIGH : LOW);
    Serial.printf("[CMD] setPump → %s\n", isPumpOn ? "ON" : "OFF");
  }
}

// ─── WEBSOCKET СОБЫТИЯ ────────────────────────────────────

void webSocketEvent(WStype_t type, uint8_t* payload, size_t length) {
  switch (type) {
    case WStype_DISCONNECTED:
      Serial.println("[WS] Отключён");
      break;

    case WStype_CONNECTED:
      Serial.println("[WS] Подключён к серверу");
      if (storedApiKey.length() > 0) {
        sendAuth();
      } else if (pendingPairingCode.length() > 0) {
        sendPair(pendingPairingCode);
        pendingPairingCode = "";
      } else {
        Serial.println("[WS] Нет api_key. Введите pairing-код в Serial Monitor:");
      }
      break;

    case WStype_TEXT:
      Serial.printf("[WS] ← %s\n", payload);
      processCommand((char*)payload);
      break;

    case WStype_ERROR:
      Serial.println("[WS] Ошибка соединения");
      break;
  }
}

// ─── SETUP ────────────────────────────────────────────────

void setup() {
  Serial.begin(115200);
  delay(500);

  Serial.println("\n╔════════════════════════════╗");
  Serial.println("║   OrangeBrew ESP32 v2.0    ║");
  Serial.println("╚════════════════════════════╝");

  pinMode(HEATER_PIN, OUTPUT);
  pinMode(PUMP_PIN, OUTPUT);
  digitalWrite(HEATER_PIN, LOW);
  digitalWrite(PUMP_PIN, LOW);

  sensors.begin();
  sensors.setWaitForConversion(false);

  deviceId = buildDeviceId();
  Serial.println("[Device] ID: " + deviceId);

  // Загружаем api_key из NVS
  storedApiKey = loadApiKey();
  if (storedApiKey.length() > 0) {
    Serial.println("[NVS] api_key найден. Будет отправлен auth.");
  } else {
    Serial.println("[NVS] api_key не найден. Нужно сопряжение.");
    Serial.println("[NVS] Создайте код на сайте и введите его в Serial Monitor.");
  }

  // Подключение к WiFi
  WiFi.begin(ssid, password);
  Serial.print("[WiFi] Подключаюсь");
  int retry = 0;
  while (WiFi.status() != WL_CONNECTED && retry < 30) {
    delay(500);
    Serial.print(".");
    retry++;
  }
  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\n[WiFi] Подключён: " + WiFi.localIP().toString());
  } else {
    Serial.println("\n[WiFi] Не удалось подключиться.");
  }

  // WebSocket
  Serial.printf("[WS] → %s:%d%s\n", ws_host, ws_port, ws_path);
  if (ws_port == 443) {
    webSocket.beginSSL(ws_host, ws_port, ws_path);
  } else {
    webSocket.begin(ws_host, ws_port, ws_path);
  }
  webSocket.onEvent(webSocketEvent);
  webSocket.setReconnectInterval(5000);
}

// ─── LOOP ─────────────────────────────────────────────────

void loop() {
  webSocket.loop();

  // Чтение команд из Serial Monitor
  // "PAIR:ABCDEF" → начать сопряжение с кодом ABCDEF
  // "RESET"       → удалить api_key (повторное сопряжение)
  if (Serial.available()) {
    String input = Serial.readStringUntil('\n');
    input.trim();
    input.toUpperCase();

    if (input.startsWith("PAIR:")) {
      String code = input.substring(5);
      code.trim();
      if (code.length() == 6) {
        Serial.println("[Serial] Запускаю сопряжение с кодом: " + code);
        if (webSocket.isConnected()) {
          sendPair(code);
        } else {
          pendingPairingCode = code; // отправим при следующем подключении
        }
      } else {
        Serial.println("[Serial] Неверный код. Формат: PAIR:ABCDEF (6 символов)");
      }
    } else if (input == "RESET") {
      clearApiKey();
      webSocket.disconnect();
    } else if (input == "STATUS") {
      Serial.printf("[Status] deviceId=%s api_key=%s wifi=%s\n",
        deviceId.c_str(),
        storedApiKey.length() > 0 ? "есть" : "нет",
        WiFi.status() == WL_CONNECTED ? "OK" : "нет");
    }
  }

  unsigned long now = millis();

  // Медленный ШИМ для ТЭНа (окно 2 сек)
  static unsigned long windowStartTime = 0;
  if (now - windowStartTime > 2000) windowStartTime = now;
  long onTime = (2000L * heaterPowerPercent) / 100;
  digitalWrite(HEATER_PIN, (now - windowStartTime < onTime) ? HIGH : LOW);

  // Отправка температур раз в 1.5 сек
  if (now - lastTempRequest >= TEMP_UPDATE_INTERVAL) {
    lastTempRequest = now;
    sensors.requestTemperatures();

    int deviceCount = sensors.getDeviceCount();
    StaticJsonDocument<512> doc;
    doc["type"] = "sensors_raw";
    JsonArray arr = doc.createNestedArray("sensors");

    for (int i = 0; i < deviceCount; i++) {
      DeviceAddress addr;
      if (sensors.getAddress(addr, i)) {
        float t = sensors.getTempC(addr);
        if (t != DEVICE_DISCONNECTED_C && t != 85.0f) {
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
    }

    String msg;
    serializeJson(doc, msg);
    webSocket.sendTXT(msg);
  }
}
