#include <OneWire.h>
#include <DallasTemperature.h>
#include <ArduinoJson.h>

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
  } 
  else if (strcmp(cmd, "setPump") == 0) {
    bool val = doc["value"];
    isPumpOn = val;
    digitalWrite(PUMP_PIN, isPumpOn ? HIGH : LOW);
  }
  else if (strcmp(cmd, "emergencyStop") == 0) {
    heaterPowerPercent = 0;
    isPumpOn = false;
    digitalWrite(PUMP_PIN, LOW);
    digitalWrite(HEATER_PIN, LOW);
  }
}

void loop() {
  unsigned long now = millis();

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

  // 2. Чтение Serial команд
  if (Serial.available() > 0) {
    String payload = Serial.readStringUntil('\n');
    processCommand(payload);
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

    for (int i = 0; i < deviceCount; i++) {
      DeviceAddress tempDeviceAddress;
      if (sensors.getAddress(tempDeviceAddress, i)) {
        float tempC = sensors.getTempC(tempDeviceAddress);
        
        JsonObject sObj = dataArray.createNestedObject();
        sObj["address"] = getAddressString(tempDeviceAddress);
        sObj["temp"] = tempC;
      }
    }
    
    // Запрашиваем следующую конвертацию для следующего цикла
    sensors.requestTemperatures();
    
    // Отправляем одной строкой в Serial
    serializeJson(doc, Serial);
    Serial.println();
  }
}
