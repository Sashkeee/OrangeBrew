#include <OneWire.h>
#include <DallasTemperature.h>
#include <ArduinoJson.h>

// --- OTA И WIFI ---
#include <WiFi.h>
#include <ESPmDNS.h>
#include <WiFiUdp.h>
#include <ArduinoOTA.h>

const char* ssid = "YOUR_WIFI_SSID";     // ЗАМЕНИТЕ на ваше имя Wi-Fi
const char* password = "YOUR_WIFI_PASS"; // ЗАМЕНИТЕ на ваш пароль Wi-Fi


// --- ПИНЫ (Сможете изменить позже) ---
#define ONE_WIRE_BUS 13// Пин GPIO13 (D7) для датчиков DS18B20
#define HEATER_PIN 14  // Пин GPIO14 (D5) для ТЭНа (Лампочка 1)
#define PUMP_PIN 12    // Пин GPIO12 (D6) для Насоса (Лампочка 2)

// --- НАСТРОЙКИ PWM (SLOW PWM для ТЭНа) ---
// SSR-25 DA имеет Zero-Cross, поэтому обычный частый ШИМ работать не будет.
// Мы используем медленный ШИМ окном в 2 секунды (2000 мс).
#define PWM_WINDOW_MS 2000 
unsigned long windowStartTime;
int heaterPowerPercent = 0; // 0 - 100%
bool isPumpOn = false;

// --- ЗАЩИТА И БЕЗОПАСНОСТЬ ---
#define WATCHDOG_TIMEOUT_MS 15000 // 15 секунд без связи = отключить всё
#define MAX_SAFE_TEMP_C 102.0     // Перегрев (датчик на голом ТЭНе или ошибка)
unsigned long lastCommandTime = 0;

// Thermal Runaway (Защита от сгоревшего ТЭНа / выпавшего датчика)
#define THERMAL_RUNAWAY_TIMEOUT_MS 180000 // 3 минуты
#define THERMAL_RUNAWAY_MIN_RISE_C 0.5    // Минимальный рост темп-ры за 3 мин
unsigned long runawayStartTime = 0;
float runawayStartTemp = -100.0;
bool runawayTracking = false;

// --- СЕРИАЛ БУФЕР (Non-blocking) ---
String serialBuffer = "";

// --- ДАТЧИКИ ТЕМПЕРАТУРЫ ---
OneWire oneWire(ONE_WIRE_BUS);
DallasTemperature sensors(&oneWire);
int deviceCount = 0;

// Периодичность отправки данных
unsigned long lastTempRequest = 0;
#define TEMP_UPDATE_INTERVAL 1000 // раз в секунду

void setup() {
  Serial.begin(115200);
  
  pinMode(HEATER_PIN, OUTPUT);
  pinMode(PUMP_PIN, OUTPUT);
  
  // При старте всё выключаем ради безопасности (Safety First!)
  digitalWrite(HEATER_PIN, LOW);
  digitalWrite(PUMP_PIN, LOW);

  sensors.begin();
  deviceCount = sensors.getDeviceCount();
  
  // Устанавливаем асинхронное чтение температур
  // Это нужно, чтобы опрос датчиков не "вешал" микроконтроллер на 750мс
  sensors.setWaitForConversion(false);
  sensors.requestTemperatures();
  
  windowStartTime = millis();
  lastCommandTime = millis(); // Инициализация вочдога

  // --- ПОДКЛЮЧЕНИЕ К WIFI ДЛЯ OTA ---
  WiFi.mode(WIFI_STA);
  WiFi.begin(ssid, password);
  // Ждем подключения без блокировки (чтобы Serial всё равно работал, если WiFi нет)
  Serial.println("{\"status\":\"wifi_connecting\"}");
  
  // --- НАСТРОЙКА OTA (Обновление по воздуху) ---
  ArduinoOTA.setHostname("OrangeBrew-ESP32");
  // Раскомментируйте строку ниже, чтобы поставить пароль на прошивку:
  // ArduinoOTA.setPassword("brewAdmin123");

  ArduinoOTA.onStart([]() {
    String type;
    if (ArduinoOTA.getCommand() == U_FLASH) {
      type = "sketch";
    } else { // U_SPIFFS
      type = "filesystem";
    }
    // Если требуется остановить процессы
    digitalWrite(HEATER_PIN, LOW);
    digitalWrite(PUMP_PIN, LOW);
    Serial.println("{\"status\":\"ota_start\", \"msg\":\"Начато обновление прошивки...\"}");
  });
  
  ArduinoOTA.onEnd([]() {
    Serial.println("\n{\"status\":\"ota_end\", \"msg\":\"Успешно! Перезагрузка...\"}");
  });
  
  ArduinoOTA.onProgress([](unsigned int progress, unsigned int total) {
    // Можно раскомментировать для отладки, но мешает JSON-общению
    // Serial.printf("Progress: %u%%\r", (progress / (total / 100)));
  });
  
  ArduinoOTA.onError([](ota_error_t error) {
    Serial.printf("{\"error\":\"OTA_ERROR_%u\"}\n", error);
  });
  
  ArduinoOTA.begin();

  // Стартовое приветствие
  Serial.println("{\"status\":\"ready\", \"deviceCount\":" + String(deviceCount) + "}");
}

// Конвертация сырого адреса DS18B20 в красивую HEX строку
String getAddressString(DeviceAddress deviceAddress) {
  String addr = "";
  for (uint8_t i = 0; i < 8; i++) {
    if (deviceAddress[i] < 16) addr += "0";
    addr += String(deviceAddress[i], HEX);
  }
  return addr;
}

// Обработчик команд с Node.js (Компьютера)
void processCommand(String payload) {
  // Разбираем JSON {"cmd":"setHeater", "value":40}
  StaticJsonDocument<256> doc;
  DeserializationError error = deserializeJson(doc, payload);

  if (error) {
    Serial.print("{\"error\":\"JSON parse failed: ");
    Serial.print(error.c_str());
    Serial.println("\"}");
    return;
  }

  const char* cmd = doc["cmd"];
  
  if (strcmp(cmd, "setHeater") == 0) {
    int val = doc["value"];
    if (val >= 0 && val <= 100) {
      heaterPowerPercent = val;
    }
    lastCommandTime = millis();
  } 
  else if (strcmp(cmd, "setPump") == 0) {
    bool val = doc["value"];
    isPumpOn = val;
    digitalWrite(PUMP_PIN, isPumpOn ? HIGH : LOW);
    lastCommandTime = millis();
  }
  else if (strcmp(cmd, "emergencyStop") == 0) {
    heaterPowerPercent = 0;
    isPumpOn = false;
    digitalWrite(PUMP_PIN, LOW);
    digitalWrite(HEATER_PIN, LOW);
    lastCommandTime = millis();
  }
}

void loop() {
  unsigned long now = millis();

  // Обслуживаем OTA-соединение
  ArduinoOTA.handle();

  // --- БЛОК БЕЗОПАСНОСТИ 1: Watchdog потери связи ---
  if (now - lastCommandTime > WATCHDOG_TIMEOUT_MS) {
    if (heaterPowerPercent > 0 || isPumpOn) {
      heaterPowerPercent = 0;
      isPumpOn = false;
      digitalWrite(HEATER_PIN, LOW);
      digitalWrite(PUMP_PIN, LOW);
      Serial.println("{\"error\":\"WATCHDOG_TIMEOUT\", \"msg\":\"Связь с ПК потеряна >15с. Аварийное отключение ТЭНа и Насоса!\"}");
    }
  }

  // 1. Медленный ШИМ (Software PWM) для ТЭНа
  if (now - windowStartTime > PWM_WINDOW_MS) {
    windowStartTime += PWM_WINDOW_MS;
  }
  
  // Вычисляем сколько времени реле должно быть включено в текущем окне (от 0 до 2000 мс)
  unsigned long onTime = (PWM_WINDOW_MS * heaterPowerPercent) / 100;
  
  if (heaterPowerPercent == 0) {
    digitalWrite(HEATER_PIN, LOW);
  } else if (heaterPowerPercent == 100) {
    digitalWrite(HEATER_PIN, HIGH);
  } else {
    // Внутри окна: включаем первые `onTime` миллисекунд, остальное - выключаем
    if ((now - windowStartTime) < onTime) {
      digitalWrite(HEATER_PIN, HIGH);
    } else {
      digitalWrite(HEATER_PIN, LOW);
    }
  }

  // 2. Чтение Serial команд (Non-blocking)
  while (Serial.available() > 0) {
    char inChar = Serial.read();
    if (inChar == '\n') {
      processCommand(serialBuffer);
      serialBuffer = "";
    } else if (inChar != '\r') {
      serialBuffer += inChar;
    }
  }

  // 3. Отправка температуры раз в TEMP_UPDATE_INTERVAL
  if (now - lastTempRequest >= TEMP_UPDATE_INTERVAL) {
    lastTempRequest += TEMP_UPDATE_INTERVAL;

    // Формируем JSON ответ со списком всех датчиков
    StaticJsonDocument<512> doc;
    doc["type"] = "sensors_raw";
    JsonArray dataArray = doc.createNestedArray("sensors");

    // Снова запрашиваем количество на всякий случай, если датчики отпадут/появятся
    deviceCount = sensors.getDeviceCount();

    float maxValidTemp = -100.0;
    int validSensors = 0;

    for (int i = 0; i < deviceCount; i++) {
      DeviceAddress tempDeviceAddress;
      if (sensors.getAddress(tempDeviceAddress, i)) {
        float tempC = sensors.getTempC(tempDeviceAddress);
        
        // --- БЛОК БЕЗОПАСНОСТИ 2: Защита "Сухого старта" / обрыва ---
        // Игнорируем сырые показания -127.0 (обрыв) и ровно 85.00 (ошибка старта)
        if (tempC != DEVICE_DISCONNECTED_C && tempC != 85.00) {
           validSensors++;
           if (tempC > maxValidTemp) {
             maxValidTemp = tempC;
           }
        }

        JsonObject sObj = dataArray.createNestedObject();
        sObj["address"] = getAddressString(tempDeviceAddress);
        sObj["temp"] = tempC;
      }
    }

    // Если нет валидных датчиков (все отвалились), отключаем ТЭН
    if (validSensors == 0 && heaterPowerPercent > 0) {
       heaterPowerPercent = 0;
       digitalWrite(HEATER_PIN, LOW);
       Serial.println("{\"error\":\"SENSOR_FAILURE\", \"msg\":\"Нет работающих датчиков. ТЭН отключен!\"}");
    }

    // --- БЛОК БЕЗОПАСНОСТИ 3: Жесткий лимит перегрева (голый ТЭН/сбой) ---
    if (maxValidTemp > MAX_SAFE_TEMP_C && heaterPowerPercent > 0) {
       heaterPowerPercent = 0;
       digitalWrite(HEATER_PIN, LOW);
       Serial.println("{\"error\":\"OVERHEAT\", \"msg\":\"КРИТИЧЕСКАЯ ТЕМПЕРАТУРА > 102C. ТЭН ОТКЛЮЧЕН!\"}");
    }

    // --- БЛОК БЕЗОПАСНОСТИ 4: ТЭН включен, но температура не растет (Thermal Runaway) ---
    // Проверяем только если греем мощно (>=50%) и вода не кипит (< 95C)
    if (heaterPowerPercent >= 50 && maxValidTemp > -100.0 && maxValidTemp < 95.0) {
       if (!runawayTracking) {
          runawayTracking = true;
          runawayStartTime = now;
          runawayStartTemp = maxValidTemp;
       } else {
          // Если температура выросла на нужную дельту, сбрасываем таймер
          if (maxValidTemp >= runawayStartTemp + THERMAL_RUNAWAY_MIN_RISE_C) {
             runawayStartTime = now;
             runawayStartTemp = maxValidTemp;
          } 
          // Если прошло 3 минуты, а температура так и не выросла - авария!
          else if (now - runawayStartTime > THERMAL_RUNAWAY_TIMEOUT_MS) {
             heaterPowerPercent = 0;
             digitalWrite(HEATER_PIN, LOW);
             Serial.println("{\"error\":\"THERMAL_RUNAWAY\", \"msg\":\"ТЭН работает, но температура не растет! Аварийное отключение!\"}");
             runawayTracking = false; // Чтобы не спамить (если ТЭН снова включат, трекинг начнется заново)
          }
       }
    } else {
       // Если ТЭН выключен, работает слабо (пауза) или мы кипятим (temp > 95) — отключаем трекинг
       runawayTracking = false;
    }
    
    // Запрашиваем следующую конвертацию для следующего цикла
    sensors.requestTemperatures();
    
    // Отправляем одной строкой в Serial
    serializeJson(doc, Serial);
    Serial.println();
  }
}
