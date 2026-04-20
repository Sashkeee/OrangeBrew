import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Тесты для PidManager — оркестратор PID-регулятора.
 *
 * Проверяет:
 *  - переключение режимов heating↔holding с сбросом интеграла;
 *  - фильтрацию по sensorAddress (PID читает только с заданного адреса);
 *  - поведение при tuning / disabled;
 *  - per-user маршрутизацию команд нагревателя.
 *
 * Мокаем:
 *  - routes/control.js — чтобы не трогать реальный WS/железо;
 *  - db/database.js    — чтобы не инициализировать БД.
 */

// ── Моки модулей (должны идти до import PidManager) ──────────
const setHeaterStateMock = vi.fn();
const setPumpStateMock = vi.fn();
const settingsGetMock = vi.fn(() => null);
const settingsGetAllMock = vi.fn(() => ({}));
const settingsSetMock = vi.fn();

vi.mock('../routes/control.js', () => ({
    setHeaterState: setHeaterStateMock,
    setPumpState: setPumpStateMock,
}));

vi.mock('../db/database.js', () => ({
    settingsQueries: {
        get: settingsGetMock,
        getAll: settingsGetAllMock,
        set: settingsSetMock,
    },
}));

const { default: PidManager } = await import('../pid/PidManager.js');

describe('PidManager', () => {
    let pm;

    beforeEach(() => {
        setHeaterStateMock.mockClear();
        settingsGetMock.mockClear();
        settingsGetAllMock.mockClear();
        settingsSetMock.mockClear();
        // Без serial — PidManager поддерживает это (setSerial опционален)
        pm = new PidManager(null, 1);
    });

    // ── Инициализация ────────────────────────────────────────

    describe('конструктор', () => {
        it('загружает tunings из settings (с fallback на дефолты)', () => {
            expect(pm.pid.kp).toBeGreaterThan(0);
            expect(pm.pid.ki).toBeGreaterThanOrEqual(0);
            expect(pm.pid.kd).toBeGreaterThanOrEqual(0);
        });

        it('начинает в режиме heating, выключен', () => {
            expect(pm.mode).toBe('heating');
            expect(pm.enabled).toBe(false);
        });

        it('сохраняет userId для маршрутизации команд', () => {
            expect(pm.userId).toBe(1);
        });

        it('Kalman-фильтр включён по умолчанию', () => {
            expect(pm.kalmanEnabled).toBe(true);
            expect(pm.kalman).toBeDefined();
        });
    });

    // ── setMode: переход heating → holding ───────────────────

    describe('setMode()', () => {
        it('setMode(holding) из heating сбрасывает интеграл PID', () => {
            // "Накрутим" интеграл вручную
            pm.pid.integral = 42;
            pm.setMode('holding');
            expect(pm.mode).toBe('holding');
            expect(pm.pid.integral).toBe(0);
        });

        it('setMode(heating) из holding НЕ сбрасывает интеграл', () => {
            pm.setMode('holding'); // сначала в holding
            pm.pid.integral = 42;
            pm.setMode('heating');
            expect(pm.mode).toBe('heating');
            expect(pm.pid.integral).toBe(42);
        });

        it('повторный setMode(holding) не сбрасывает интеграл', () => {
            pm.setMode('holding');
            pm.pid.integral = 42;
            pm.setMode('holding'); // уже holding — integral не трогаем
            expect(pm.pid.integral).toBe(42);
        });
    });

    // ── setEnabled ────────────────────────────────────────────

    describe('setEnabled()', () => {
        it('setEnabled(true) включает PID и сбрасывает интеграл', () => {
            pm.pid.integral = 50;
            pm.setEnabled(true);
            expect(pm.enabled).toBe(true);
            expect(pm.pid.integral).toBe(0);
        });

        it('setEnabled(false) вызывает setHeaterState(0, userId)', () => {
            pm.setEnabled(true);
            setHeaterStateMock.mockClear();
            pm.setEnabled(false);
            expect(setHeaterStateMock).toHaveBeenCalledWith(0, 1);
        });

        it('setEnabled(true) блокируется во время tuning', () => {
            pm.tuner.tuning = true;
            pm.setEnabled(true);
            expect(pm.enabled).toBe(false);
            pm.tuner.tuning = false; // cleanup
        });
    });

    // ── setTarget / setSensorAddress ─────────────────────────

    describe('setTarget() и setSensorAddress()', () => {
        it('setTarget устанавливает целевую температуру PID', () => {
            pm.setTarget(65.5);
            expect(pm.pid.target).toBe(65.5);
        });

        it('setTarget парсит строку', () => {
            pm.setTarget('42.3');
            expect(pm.pid.target).toBeCloseTo(42.3);
        });

        it('setSensorAddress сохраняет адрес', () => {
            pm.setSensorAddress('28-aaaa');
            expect(pm.sensorAddress).toBe('28-aaaa');
        });

        it('setSensorAddress(null) сбрасывает в auto режим', () => {
            pm.setSensorAddress('28-aaaa');
            pm.setSensorAddress(null);
            expect(pm.sensorAddress).toBe(null);
        });
    });

    // ── update(): фильтрация по sensorAddress ────────────────

    describe('update() с sensorAddress', () => {
        beforeEach(() => {
            pm.setTarget(65);
            pm.setEnabled(true);
            pm.setMode('holding');
            setHeaterStateMock.mockClear();
        });

        it('при заданном sensorAddress НЕ читает data.boiler', () => {
            pm.setSensorAddress('28-aaaa');
            // boiler=10 (очень холодно → высокий output), но нужного адреса нет
            pm.update({ boiler: 10, sensors: [{ address: '28-other', temp: 10 }] });
            // Ни одного вызова setHeaterState — пакет пропущен
            expect(setHeaterStateMock).not.toHaveBeenCalled();
        });

        it('читает значение из sensors[] по совпадению address', () => {
            pm.setSensorAddress('28-aaaa');
            pm.update({ boiler: 99, sensors: [{ address: '28-aaaa', temp: 50 }] });
            // Был вызов — PID отработал. Output зависит от коэффициентов.
            expect(setHeaterStateMock).toHaveBeenCalled();
            const [power, userId] = setHeaterStateMock.mock.calls[0];
            expect(userId).toBe(1);
            expect(power).toBeGreaterThanOrEqual(0);
            expect(power).toBeLessThanOrEqual(100);
        });

        it('без sensorAddress fallback на data.boiler', () => {
            pm.setSensorAddress(null);
            pm.update({ boiler: 50 });
            expect(setHeaterStateMock).toHaveBeenCalled();
        });
    });

    // ── update(): disabled path ──────────────────────────────

    describe('update() когда PID выключен', () => {
        it('не вызывает setHeaterState если enabled=false и не в tuning', () => {
            pm.setEnabled(false);
            setHeaterStateMock.mockClear();
            pm.update({ boiler: 50 });
            expect(setHeaterStateMock).not.toHaveBeenCalled();
        });
    });

    // ── update(): игнорирует невалидные данные ───────────────

    describe('update() санитизация входа', () => {
        beforeEach(() => {
            pm.setEnabled(true);
            pm.setTarget(65);
            setHeaterStateMock.mockClear();
        });

        it('игнорирует пакет без boiler и без sensors', () => {
            pm.update({ some: 'junk' });
            expect(setHeaterStateMock).not.toHaveBeenCalled();
        });

        it('игнорирует пакет с NaN-значением', () => {
            pm.update({ boiler: 'not-a-number' });
            expect(setHeaterStateMock).not.toHaveBeenCalled();
        });
    });

    // ── Kalman filter toggle ─────────────────────────────────

    describe('updateKalman()', () => {
        it('updateKalman({ enabled: false }) отключает фильтр', () => {
            pm.updateKalman({ enabled: false });
            expect(pm.kalmanEnabled).toBe(false);
        });

        it('updateKalman({ q, r }) создаёт новый фильтр', () => {
            const oldFilter = pm.kalman;
            pm.updateKalman({ q: 0.5, r: 0.2 });
            expect(pm.kalman).not.toBe(oldFilter);
        });
    });

    // ── Tunings setter ───────────────────────────────────────

    describe('setTunings()', () => {
        it('setTunings обновляет kp/ki/kd PID-контроллера', () => {
            pm.setTunings(2.0, 0.3, 1.5);
            expect(pm.pid.kp).toBe(2.0);
            expect(pm.pid.ki).toBe(0.3);
            expect(pm.pid.kd).toBe(1.5);
        });
    });

    // ── getStatus / getKalmanStatus ──────────────────────────

    describe('getStatus()', () => {
        it('возвращает текущие параметры', () => {
            pm.setTarget(70);
            pm.setMode('holding');
            const s = pm.getStatus();
            expect(s.mode).toBe('holding');
            expect(s.target).toBe(70);
            expect(s.kp).toBeGreaterThan(0);
        });

        it('getKalmanStatus включает параметры Kalman', () => {
            const s = pm.getKalmanStatus();
            expect(s).toHaveProperty('enabled');
            expect(s).toHaveProperty('q');
            expect(s).toHaveProperty('r');
        });
    });

    // ── updateRampSettings ───────────────────────────────────

    describe('updateRampSettings()', () => {
        it('обновляет rampDistance и minPower на лету', () => {
            pm.updateRampSettings({ rampDistance: 2.5, minPower: 10 });
            expect(pm.rampDistance).toBe(2.5);
            expect(pm.minPower).toBe(10);
        });

        it('частичное обновление сохраняет старые значения', () => {
            pm.updateRampSettings({ rampDistance: 1.0, minPower: 20 });
            pm.updateRampSettings({ minPower: 30 });
            expect(pm.rampDistance).toBe(1.0);
            expect(pm.minPower).toBe(30);
        });
    });
});
