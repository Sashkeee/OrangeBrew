#include <Arduino.h>
#include <ArduinoJson.h>
#include <OneWire.h>
#include <DallasTemperature.h>

// --- WIFI & WEBSOCKETS (Авто-выбор библиотек) ---
#if defined(ESP32)
  #include <WiFi.h>
  #include <WebSocketsClient.h> // Библиотека: "WebSockets" by Markus Sattler
#elif defined(ESP8266)
  #include <ESP8266WiFi.h>
  #include <WebSocketsClient.h>
#endif

// --- НАСТРОЙКИ (ЗАМЕНИТЕ НА ВАШИ) ---
const char* ssid = "MTS_GPON_14FC";     // Имя Wi-Fi
const char* password = "tXQ7QRXQ"; // Пароль Wi-Fi

// Адрес вашего сервера (без http://)
const char* ws_host = "orangebrew.ru"; 
const int ws_port = 443; // Используем HTTPS/WSS порт
const char* ws_path = "/ws";

// Ключ из docker-compose.prod.yml (HARDWARE_API_KEY)
const char* hardwareApiKey = "default_hardware_key_123";

// --- ПИНЫ ---
#define ONE_WIRE_BUS 13 // D7 на NodeMCU/Wemos
#define HEATER_PIN 14   // D5 на NodeMCU/Wemos
#define PUMP_PIN 12     // D6 на NodeMCU/Wemos

// --- ГЛОБАЛЬНЫЕ ОБЪЕКТЫ ---
WebSocketsClient webSocket;
OneWire oneWire(ONE_WIRE_BUS);
DallasTemperature sensors(&oneWire);

String deviceId = "";
int heaterPowerPercent = 0;
bool isPumpOn = false;
unsigned long lastTempRequest = 0;
#define TEMP_UPDATE_INTERVAL 1500

void webSocketEvent(WStype_t type, uint8_t * payload, size_t length) {
  switch(type) {
    case WStype_DISCONNECTED:
      Serial.println("[WS] Disconnected!");
      break;
    case WStype_CONNECTED:
      Serial.println("[WS] Connected to server!");
      // При подключении отправляем пакет авторизации
      sendAuth();
      break;
    case WStype_TEXT:
      Serial.printf("[WS] Received: %s\n", payload);
      processCommand((char*)payload);
      break;
  }
}

void sendAuth() {
  StaticJsonDocument<256> doc;
  doc["type"] = "auth";
  doc["apiKey"] = hardwareApiKey;
  doc["deviceId"] = deviceId;
  doc["name"] = "Kitchen ESP8266";
  doc["role"] = "brewing";
  
  String msg;
  serializeJson(doc, msg);
  webSocket.sendTXT(msg);
}

void setup() {
  Serial.begin(115200);
  
  pinMode(HEATER_PIN, OUTPUT);
  pinMode(PUMP_PIN, OUTPUT);
  digitalWrite(HEATER_PIN, LOW);
  digitalWrite(PUMP_PIN, LOW);

  sensors.begin();
  sensors.setWaitForConversion(false);

  // Генерируем ID
  #ifdef ESP8266
    deviceId = "ESP8266_" + String(ESP.getChipId(), HEX);
  #else
    deviceId = "ESP32_" + String((uint32_t)ESP.getEfuseMac(), HEX);
  #endif

  // --- ПОДКЛЮЧЕНИЕ К WIFI ---
  WiFi.begin(ssid, password);
  Serial.print("[WiFi] Connecting");
  int retry = 0;
  while (WiFi.status() != WL_CONNECTED && retry < 20) {
    delay(500);
    Serial.print(".");
    retry++;
  }
  
  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\n[WiFi] Connected! IP: " + WiFi.localIP().toString());
  } else {
    Serial.println("\n[WiFi] Failed to connect. Check SSID/Password.");
  }

  // Настройка WebSocket
  Serial.printf("[WS] Connecting to %s:%d%s...\n", ws_host, ws_port, ws_path);
  
  // КРИТИЧНО: Для ESP8266/ESP32 библиотека WebSockets (Markus Sattler) 
  // требует либо отпечаток (fingerprint), либо (в новых версиях) работает автоматом.
  // Пустая строка "" в beginSSL иногда срабатывает как "Insecure".
  if (ws_port == 443) {
    webSocket.beginSSL(ws_host, ws_port, ws_path); // Используем сертификат по умолчанию (NULL)
  } else {
    webSocket.begin(ws_host, ws_port, ws_path);
  }
  
  webSocket.onEvent(webSocketEvent);
  webSocket.setReconnectInterval(5000);
}

void processCommand(char* payload) {
  StaticJsonDocument<256> doc;
  if (deserializeJson(doc, payload)) return;

  const char* cmd = doc["cmd"];
  if (strcmp(cmd, "setHeater") == 0) {
    heaterPowerPercent = doc["value"];
  } else if (strcmp(cmd, "setPump") == 0) {
    isPumpOn = doc["value"];
    digitalWrite(PUMP_PIN, isPumpOn ? HIGH : LOW);
  }
}

void loop() {
  webSocket.loop();
  unsigned long now = millis();

  // Медленный ШИМ для ТЭНа (окно 2 сек)
  static unsigned long windowStartTime = 0;
  if (now - windowStartTime > 2000) windowStartTime = now;
  long onTime = (2000 * heaterPowerPercent) / 100;
  digitalWrite(HEATER_PIN, (now - windowStartTime < onTime) ? HIGH : LOW);

  // Отправка температуры
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
            if (t != DEVICE_DISCONNECTED_C && t != 85.0) {
                JsonObject s = arr.createNestedObject();
                String addrStr = "";
                for(int j=0; j<8; j++) { if(addr[j]<16) addrStr+="0"; addrStr+=String(addr[j],HEX); }
                s["address"] = addrStr;
                s["temp"] = t;
            }
        }
    }

    String msg;
    serializeJson(doc, msg);
    webSocket.sendTXT(msg);
    Serial.println(msg); // Дублируем в Serial для отладки
  }
}
