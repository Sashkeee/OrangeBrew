import { describe, it, expect, beforeEach } from 'vitest';
import PIDController from '../pid/PIDController.js';

/**
 * Тесты для модуля PIDController.
 * ПИД-регулятор (Пропорционально-Интегрально-Дифференцирующий) — это алгоритм, 
 * который управляет мощностью нагрева для точного поддержания целевой температуры.
 */
describe('PIDController', () => {
    let pid;

    // Перед каждым тестом создаем новый экземпляр контроллера с типичными коэффициентами
    beforeEach(() => {
        pid = new PIDController(1.0, 0.1, 0.5, 1.0);
    });

    // ─── Инициализация (Initialization) ───────────────────────────────────────

    describe('initialization', () => {
        it('should initialize with given tunings', () => {
            // Проверяем, что переданные коэффициенты правильно установились
            expect(pid.kp).toBe(1.0);
            expect(pid.ki).toBe(0.1);
            expect(pid.kd).toBe(0.5);
            expect(pid.dt).toBe(1.0);
        });

        it('should initialize with default state', () => {
            // Проверяем начальное состояние: цель 0, контроллер выключен
            expect(pid.target).toBe(0);
            expect(pid.lastInput).toBe(0);
            expect(pid.integral).toBe(0);
            expect(pid.enabled).toBe(false);
        });

        it('should have default output limits [0, 100]', () => {
            // Мощность должна быть в процентах: от 0 до 100
            expect(pid.outputLimitMin).toBe(0);
            expect(pid.outputLimitMax).toBe(100);
        });

        it('should use default tunings when none supplied', () => {
            // Проверяем работу конструктора без аргументов
            const defaultPid = new PIDController();
            expect(defaultPid.kp).toBe(1.0);
            expect(defaultPid.ki).toBe(0.0);
            expect(defaultPid.kd).toBe(0.0);
            expect(defaultPid.dt).toBe(1.0);
        });
    });

    // ─── Настройки (Setters) ──────────────────────────────────────────────

    describe('setters', () => {
        it('setTarget() should update target', () => {
            // Проверка смены целевой температуры
            pid.setTarget(65);
            expect(pid.target).toBe(65);
        });

        it('setTunings() should update Kp, Ki, Kd', () => {
            // Проверка динамического изменения коэффициентов (например, при настройке пользователем)
            pid.setTunings(2.0, 0.5, 3.0);
            expect(pid.kp).toBe(2.0);
            expect(pid.ki).toBe(0.5);
            expect(pid.kd).toBe(3.0);
        });

        it('setEnabled(true) should enable and reset integral', () => {
            // При включении интегральная сумма должна сбрасываться, чтобы избежать рывка мощности
            pid.integral = 50;
            pid.setEnabled(true);
            expect(pid.enabled).toBe(true);
            expect(pid.integral).toBe(0);
        });

        it('setEnabled(false) should disable', () => {
            pid.setEnabled(true);
            pid.setEnabled(false);
            expect(pid.enabled).toBe(false);
        });
    });

    // ─── Расчет мощности (compute) ────────────────────────────────────────────

    describe('compute()', () => {
        it('should return 0 when disabled', () => {
            // Выключенный контроллер всегда выдает 0 мощность
            pid.setTarget(70);
            expect(pid.compute(20)).toBe(0);
        });

        it('should return positive output when below target (P-only)', () => {
            // П-компонента: мощность пропорциональна ошибке (разнице температур)
            // Kp=2.0, Ошибка = 70 - 60 = 10. Мощность = 2.0 * 10 = 20
            const pPid = new PIDController(2.0, 0, 0, 1.0);
            pPid.setEnabled(true);
            pPid.setTarget(70);
            const output = pPid.compute(60);
            expect(output).toBe(20);
        });

        it('should return 0 when at target (P-only)', () => {
            // Если температура достигнута, П-компонента зануляется
            const pPid = new PIDController(2.0, 0, 0, 1.0);
            pPid.setEnabled(true);
            pPid.setTarget(50);
            const output = pPid.compute(50);
            expect(output).toBe(0);
        });

        it('should accumulate integral over multiple calls', () => {
            // И-компонента: накапливает ошибку со временем для борьбы со статической погрешностью
            const iPid = new PIDController(0, 1.0, 0, 1.0);
            iPid.setEnabled(true);
            iPid.setTarget(50);

            iPid.compute(40); // ошибка=10, интеграл=10
            iPid.compute(40); // ошибка=10, интеграл=20
            const out = iPid.compute(40); // ошибка=10, интеграл=30
            expect(out).toBe(30);
        });

        it('should clamp output to [0, 100]', () => {
            // Проверка, что мощность не может быть больше 100%
            pid.setEnabled(true);
            pid.setTarget(200);
            const output = pid.compute(0); // Огромная ошибка
            expect(output).toBe(100);
        });

        it('should clamp negative output to 0', () => {
            // Проверка, что ТЭН не может охлаждать (мощность не может быть отрицательной)
            pid.setEnabled(true);
            pid.setTarget(0);
            const output = pid.compute(100); // Отрицательная ошибка
            expect(output).toBe(0);
        });
    });

    // ─── Защита от накрутки (Anti-windup) ─────────────────────────────────────

    describe('anti-windup', () => {
        it('should limit integral to outputLimitMax', () => {
            // Интеграл не должен бесконечно расти, если цель недостижима
            pid.setEnabled(true);
            pid.setTarget(200);
            for (let i = 0; i < 1000; i++) pid.compute(0);
            expect(pid.integral).toBeLessThanOrEqual(100);
        });
    });
});
