/**
 * test_fast_PWM — OrangeBrew ESP32-S3 Super Mini
 *
 * Тестовая прошивка для отладки плавного управления нагрузкой через LEDC PWM.
 * Цель: убрать видимое моргание лампочки при частичной мощности.
 *
 * ⚠️  ВАЖНО: механическое реле НЕ поддерживает высокочастотный PWM!
 *     Для этого теста нужен один из вариантов:
 *       a) MOSFET (например IRF540N, IRLZ44N) для DC нагрузки
 *       b) SSR random-firing (например Fotek SSR-40DA) для AC нагрузки
 *       c) Встроенный LED (GPIO 21) — работает без внешней схемы
 *
 * Распиновка (совпадает с основной прошивкой):
 *   GPIO 4  — OneWire DS18B20 (не используется в этом тесте)
 *   GPIO 5  — PWM выход нагревателя (→ MOSFET gate или SSR input)
 *   GPIO 21 — Встроенный LED (синий) — дублирует сигнал для визуализации
 *
 * Управление через Serial (115200 бод):
 *   0..100  — установить мощность в процентах (например: "75")
 *   s       — тест sweep: плавный разгон 0→100→0%
 *   f <Hz>  — сменить частоту PWM (например: "f 500")
 *   ?       — вывести текущие параметры
 *
 * Board: ESP32S3 Dev Module, USB CDC On Boot: Enabled
 */

// ── Пины ────────────────────────────────────────────────────
#define HEATER_PIN   5    // PWM на нагреватель (MOSFET/SSR)
#define LED_PIN      21   // Встроенный синий LED

// ── LEDC параметры ──────────────────────────────────────────
#define PWM_CHANNEL_HEATER  0
#define PWM_CHANNEL_LED     1
#define PWM_RESOLUTION      10    // 10 бит = 0..1023 (плавнее чем 8-бит)

uint32_t pwmFreq = 1000;          // Гц — хорошо выше порога заметного мерцания (~45 Гц)
int currentPower = 0;             // 0..100 %

// ── Прототипы ───────────────────────────────────────────────
void setPower(int percent);
void sweepTest();
void printStatus();
void reattachPWM(uint32_t freq);

// ────────────────────────────────────────────────────────────

void setup() {
    Serial.begin(115200);
    delay(300);

    Serial.println("\n========================================");
    Serial.println("  test_fast_PWM — OrangeBrew ESP32-S3");
    Serial.println("========================================");

    reattachPWM(pwmFreq);
    setPower(0);

    Serial.println("Ready. Commands: 0-100 | s | f <Hz> | ?");
    Serial.println();
}

void loop() {
    if (Serial.available()) {
        String input = Serial.readStringUntil('\n');
        input.trim();

        if (input.length() == 0) return;

        if (input == "s") {
            sweepTest();
        } else if (input == "?") {
            printStatus();
        } else if (input.startsWith("f ")) {
            uint32_t newFreq = input.substring(2).toInt();
            if (newFreq >= 10 && newFreq <= 100000) {
                reattachPWM(newFreq);
                Serial.printf("Freq changed to %u Hz\n", pwmFreq);
                setPower(currentPower); // restore power at new freq
            } else {
                Serial.println("Invalid freq. Range: 10..100000 Hz");
            }
        } else {
            int pct = input.toInt();
            if (pct >= 0 && pct <= 100) {
                setPower(pct);
                Serial.printf("Power: %d%%\n", pct);
            } else {
                Serial.println("Unknown command. Try: 0-100 | s | f <Hz> | ?");
            }
        }
    }
}

// ── Установить мощность 0..100% ─────────────────────────────
void setPower(int percent) {
    currentPower = constrain(percent, 0, 100);
    uint32_t maxDuty = (1 << PWM_RESOLUTION) - 1;
    uint32_t duty = map(currentPower, 0, 100, 0, maxDuty);
    ledcWrite(PWM_CHANNEL_HEATER, duty);
    ledcWrite(PWM_CHANNEL_LED, duty);
}

// ── Плавный sweep 0→100→0% ──────────────────────────────────
void sweepTest() {
    Serial.printf("Sweep test @ %u Hz, resolution=%d bit\n", pwmFreq, PWM_RESOLUTION);
    Serial.println("  0% → 100%:");
    for (int p = 0; p <= 100; p += 2) {
        setPower(p);
        Serial.printf("  %3d%%\r", p);
        delay(80);
    }
    Serial.println("\n  100% → 0%:");
    for (int p = 100; p >= 0; p -= 2) {
        setPower(p);
        Serial.printf("  %3d%%\r", p);
        delay(80);
    }
    Serial.println("\nSweep done.");
    setPower(0);
    currentPower = 0;
}

// ── Переинициализировать LEDC с новой частотой ───────────────
void reattachPWM(uint32_t freq) {
    ledcDetachPin(HEATER_PIN);
    ledcDetachPin(LED_PIN);
    ledcSetup(PWM_CHANNEL_HEATER, freq, PWM_RESOLUTION);
    ledcSetup(PWM_CHANNEL_LED,    freq, PWM_RESOLUTION);
    ledcAttachPin(HEATER_PIN, PWM_CHANNEL_HEATER);
    ledcAttachPin(LED_PIN,    PWM_CHANNEL_LED);
    pwmFreq = freq;
}

// ── Вывести текущие параметры ───────────────────────────────
void printStatus() {
    Serial.println("─────────────────────────────");
    Serial.printf("  Freq       : %u Hz\n", pwmFreq);
    Serial.printf("  Resolution : %d bit (0..%d)\n", PWM_RESOLUTION, (1 << PWM_RESOLUTION) - 1);
    Serial.printf("  Power      : %d%%\n", currentPower);
    Serial.printf("  Heater pin : GPIO %d\n", HEATER_PIN);
    Serial.printf("  LED pin    : GPIO %d\n", LED_PIN);
    Serial.println("─────────────────────────────");
}
