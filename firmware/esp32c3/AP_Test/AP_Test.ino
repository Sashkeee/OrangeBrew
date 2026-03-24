#include <WiFi.h>

// Задаем имя для нашей открытой точки доступа
const char* ssid = "ESP32_C3_Free_WiFi"; 

// Функция-обработчик событий Wi-Fi
void WiFiEvent(WiFiEvent_t event, WiFiEventInfo_t info) {
  switch (event) {
    case ARDUINO_EVENT_WIFI_AP_STACONNECTED:
      Serial.println("\n[INFO] Новый клиент подключился!");
      // При желании можно вывести MAC-адрес подключившегося устройства
      Serial.printf("MAC-адрес клиента: %02X:%02X:%02X:%02X:%02X:%02X\n",
                    info.wifi_ap_staconnected.mac[0],
                    info.wifi_ap_staconnected.mac[1],
                    info.wifi_ap_staconnected.mac[2],
                    info.wifi_ap_staconnected.mac[3],
                    info.wifi_ap_staconnected.mac[4],
                    info.wifi_ap_staconnected.mac[5]);
      break;
      
    case ARDUINO_EVENT_WIFI_AP_STADISCONNECTED:
      Serial.println("\n[INFO] Клиент отключился.");
      break;
      
    default:
      break;
  }
}

void setup() {
  // Инициализируем последовательный порт (не забудьте выставить 115200 в мониторе порта)
  Serial.begin(115200);
  delay(1000); // Небольшая задержка, чтобы порт успел открыться
  
  Serial.println("\nЗапуск точки доступа...");

  // Привязываем функцию обработки событий к системным событиям Wi-Fi
  WiFi.onEvent(WiFiEvent);

  // Поднимаем точку доступа. Так как пароль не указан, она будет открытой.
  WiFi.softAP(ssid);

  // Получаем и выводим IP-адрес самой ESP32 (обычно это 192.168.4.1)
  IPAddress IP = WiFi.softAPIP();
  Serial.print("Точка доступа успешно создана! Имя: ");
  Serial.println(ssid);
  Serial.print("IP-адрес: ");
  Serial.println(IP);
}

void loop() {
  // В главном цикле ничего делать не нужно, 
  // события обрабатываются асинхронно на фоне.
}
