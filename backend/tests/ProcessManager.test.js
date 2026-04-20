import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import ProcessManager, { PROCESS_STATUS } from '../services/ProcessManager.js';
import telegram from '../services/telegram.js';

/**
 * Тесты для ProcessManager.
 * Этот модуль управляет логикой пауз, переходов между шагами затирания
 * и уведомлениями в Telegram.
 */

// Имитируем (mock) модуль telegram, чтобы тесты не отправляли реальные сообщения
vi.mock('../services/telegram.js', () => ({
    default: {
        sendMessage: vi.fn(),
        notify: vi.fn(),
        notifyPhaseChange: vi.fn(),
        notifyMashStep: vi.fn(),
        notifyComplete: vi.fn(),
        setCurrentProcessType: vi.fn(),
        updateSensorData: vi.fn(),
        updateControlState: vi.fn()
    }
}));

// Мокаем БД — ProcessManager вызывает sessionQueries.create и temperatureQueries.insert
vi.mock('../db/database.js', () => ({
    temperatureQueries: {
        insert: vi.fn(),
    },
    sessionQueries: {
        create: vi.fn(() => ({ id: 1 })),
        getById: vi.fn(() => ({ id: 1, status: 'active' })),
        complete: vi.fn(),
        cancel: vi.fn(),
    },
    settingsQueries: {
        get: vi.fn(() => null),  // boiling_temp defaults to 100
    },
}));

// Мокаем setPumpState — routes/control.js подтягивает БД и WS
vi.mock('../routes/control.js', () => ({
    setPumpState: vi.fn(),
    setHeaterState: vi.fn(),
}));

describe('ProcessManager', () => {
    let processManager;
    let mockPidManager;

    beforeEach(() => {
        // Используем виртуальное время Vitest, чтобы не ждать реальные минуты
        vi.useFakeTimers();

        // Имитируем PID-менеджер
        mockPidManager = {
            setTarget: vi.fn(),
            setEnabled: vi.fn(),
            setMode: vi.fn(),
            resetIntegral: vi.fn(),
            setSensorAddress: vi.fn(),
            update: vi.fn(),
            target: 0,
            enabled: false
        };

        processManager = new ProcessManager(mockPidManager);
    });

    afterEach(() => {
        vi.restoreAllMocks();
        processManager.stop();
    });

    it('should start in IDLE state', () => {
        // Проверяем, что при создании статус "Ожидание" (IDLE)
        const state = processManager.getState();
        expect(state.status).toBe(PROCESS_STATUS.IDLE);
        expect(state.currentStepIndex).toBe(-1);
    });

    it('should start a process with recipe', () => {
        // Проверяем запуск процесса по рецепту
        const recipe = {
            name: 'Test Recipe',
            id: 1,
            mash_steps: [
                { name: 'Mash In', temp: 65, duration: 60 }
            ]
        };

        processManager.start(recipe);
        const state = processManager.getState();

        // Должен включиться режим нагрева (HEATING) для первого шага
        expect(state.status).toBe(PROCESS_STATUS.HEATING);
        expect(state.currentStepIndex).toBe(0);
        expect(state.stepPhase).toBe('heating');

        // Проверяем, что PID-регулятору передана цель 65 градусов
        expect(mockPidManager.setTarget).toHaveBeenCalledWith(65);
        expect(mockPidManager.setEnabled).toHaveBeenCalledWith(true);
    });

    it('should transition to HOLDING when temperature reached', () => {
        // Проверяем переход от нагрева к паузе (выдержке) при достижении температуры
        const recipe = {
            name: 'Test Recipe',
            mash_steps: [{ name: 'Mash In', temp: 65, duration: 60 }]
        };
        processManager.start(recipe);

        // 1. Отправляем температуру ниже целевой -> статус все еще HEATING
        processManager.handleSensorData('local_serial', { boiler: 60 });
        expect(processManager.getState().status).toBe(PROCESS_STATUS.HEATING);

        // 2. Отправляем 65 градусов -> статус должен смениться на HOLDING (выдержка)
        processManager.handleSensorData('local_serial', { boiler: 65 });

        const state = processManager.getState();
        expect(state.status).toBe(PROCESS_STATUS.HOLDING);
        expect(state.stepPhase).toBe('holding');

        // Должно отправиться уведомление в Telegram о достижении температуры
        expect(telegram.notifyMashStep).toHaveBeenCalledWith('reached', expect.anything());
    });

    it('should countdown timer in HOLDING state', () => {
        // Проверяем работу таймера во время температурной паузы
        const recipe = {
            name: 'Test Recipe',
            mash_steps: [{ name: 'Step 1', temp: 65, duration: 1 }] // Длительность 1 минута
        };
        processManager.start(recipe);

        // Переводим в фазу выдержки
        processManager.handleSensorData('local_serial', { boiler: 66 });

        // Перематываем виртуальное время на 30 секунд вперед
        vi.advanceTimersByTime(30000);
        expect(processManager.getState().remainingTime).toBe(30);

        // Перематываем еще на 31 секунду -> шаг должен завершиться
        vi.advanceTimersByTime(31000);

        // Так как шаг был один, весь процесс должен завершиться (COMPLETED)
        expect(processManager.getState().status).toBe(PROCESS_STATUS.COMPLETED);
        expect(telegram.notifyComplete).toHaveBeenCalled();
    });

    it('should advance to next step automatically', () => {
        // Проверяем автоматический переход между шагами
        const recipe = {
            name: 'Multi Step',
            mash_steps: [
                { name: 'Step 1', temp: 50, duration: 0.1 }, // 6 секунд
                { name: 'Step 2', temp: 65, duration: 60 }
            ]
        };
        processManager.start(recipe);

        // Завершаем первый шаг (достигли 50 градусов)
        processManager.handleSensorData('local_serial', { boiler: 50 });
        // Прошло 7 секунд (на 1 больше длительности шага)
        vi.advanceTimersByTime(7000);

        const state = processManager.getState();
        // Должен включиться второй шаг (индекс 1)
        expect(state.currentStepIndex).toBe(1);
        expect(state.status).toBe(PROCESS_STATUS.HEATING); // Снова греем до новой температуры

        // PID должен получить новую цель - 65 градусов
        expect(mockPidManager.setTarget).toHaveBeenCalledWith(65);
    });

    it('should pause and resume correctly', () => {
        // Проверка кнопки "Пауза"
        const recipe = { mash_steps: [{ temp: 65, duration: 60 }] };
        processManager.start(recipe);

        processManager.pause();
        expect(processManager.getState().status).toBe(PROCESS_STATUS.PAUSED);
        // ТЭН должен выключиться при паузе
        expect(mockPidManager.setEnabled).toHaveBeenCalledWith(false);

        processManager.resume();
        expect(processManager.getState().status).toBe(PROCESS_STATUS.HEATING);
        // ТЭН должен снова включиться
        expect(mockPidManager.setEnabled).toHaveBeenCalledWith(true);
    });

    // ═════════════════════════════════════════════════════════
    // Новые тесты — границы машины состояний
    // ═════════════════════════════════════════════════════════

    describe('skip() — пропуск шагов', () => {
        it('skip() переводит процесс на следующий шаг', () => {
            const recipe = {
                mash_steps: [
                    { name: 'Step 1', temp: 50, duration: 60 },
                    { name: 'Step 2', temp: 65, duration: 60 },
                ],
            };
            processManager.start(recipe);
            expect(processManager.getState().currentStepIndex).toBe(0);

            processManager.skip();

            const state = processManager.getState();
            expect(state.currentStepIndex).toBe(1);
            expect(state.status).toBe(PROCESS_STATUS.HEATING);
            expect(state.stepPhase).toBe('heating');
            expect(mockPidManager.setTarget).toHaveBeenLastCalledWith(65);
        });

        it('skip() на последнем шаге завершает процесс', () => {
            const recipe = { mash_steps: [{ name: 'Only', temp: 65, duration: 60 }] };
            processManager.start(recipe);
            processManager.skip();
            expect(processManager.getState().status).toBe(PROCESS_STATUS.COMPLETED);
            expect(telegram.notifyComplete).toHaveBeenCalled();
        });

        it('skip() в IDLE — no-op', () => {
            processManager.skip();
            expect(processManager.getState().status).toBe(PROCESS_STATUS.IDLE);
        });
    });

    describe('pause/resume — сохранение фазы', () => {
        it('resume восстанавливает фазу HOLDING', () => {
            const recipe = { mash_steps: [{ temp: 65, duration: 60 }] };
            processManager.start(recipe);
            // Переводим в HOLDING
            processManager.handleSensorData('local_serial', { boiler: 66 });
            expect(processManager.getState().status).toBe(PROCESS_STATUS.HOLDING);

            processManager.pause();
            expect(processManager.getState().status).toBe(PROCESS_STATUS.PAUSED);
            // stepPhase не меняется при паузе
            expect(processManager.getState().stepPhase).toBe('holding');

            processManager.resume();
            // Должен вернуться в HOLDING, не HEATING
            expect(processManager.getState().status).toBe(PROCESS_STATUS.HOLDING);
            // И PID должен быть переключён в holding режим
            expect(mockPidManager.setMode).toHaveBeenCalledWith('holding');
        });

        it('resume из IDLE — no-op (не включает PID)', () => {
            mockPidManager.setEnabled.mockClear();
            processManager.resume();
            expect(processManager.getState().status).toBe(PROCESS_STATUS.IDLE);
            expect(mockPidManager.setEnabled).not.toHaveBeenCalledWith(true);
        });

        it('pause в IDLE — no-op', () => {
            processManager.pause();
            expect(processManager.getState().status).toBe(PROCESS_STATUS.IDLE);
        });

        it('updateLoop не уменьшает remainingTime в PAUSED', () => {
            const recipe = { mash_steps: [{ temp: 65, duration: 5 }] };
            processManager.start(recipe);
            processManager.handleSensorData('local_serial', { boiler: 66 });
            const remainingBefore = processManager.getState().remainingTime;

            processManager.pause();
            vi.advanceTimersByTime(10000); // 10 секунд

            expect(processManager.getState().remainingTime).toBe(remainingBefore);
        });
    });

    describe('валидация рецепта', () => {
        it('start() без mash_steps кидает ошибку', () => {
            expect(() => processManager.start({ mash_steps: [] })).toThrow('No mash steps');
        });

        it('start() в mode=boil без boil_time кидает ошибку', () => {
            expect(() => processManager.start({ name: 'x' }, null, 'boil')).toThrow('No boil time');
        });

        it('start() с неизвестным mode кидает ошибку', () => {
            expect(() => processManager.start({ mash_steps: [{ temp: 65, duration: 1 }] }, null, 'ferment'))
                .toThrow('Unknown mode');
        });

        it('повторный start() пока процесс идёт кидает ошибку', () => {
            const recipe = { mash_steps: [{ temp: 65, duration: 60 }] };
            processManager.start(recipe);
            expect(() => processManager.start(recipe)).toThrow('already running');
        });

        it('start() после COMPLETED разрешён', () => {
            const recipe = { mash_steps: [{ temp: 65, duration: 0.01 }] }; // 0.6s
            processManager.start(recipe);
            processManager.handleSensorData('local_serial', { boiler: 66 });
            vi.advanceTimersByTime(1000);
            expect(processManager.getState().status).toBe(PROCESS_STATUS.COMPLETED);

            // Повторный start после завершения — должно работать
            expect(() => processManager.start(recipe)).not.toThrow();
            expect(processManager.getState().status).toBe(PROCESS_STATUS.HEATING);
        });
    });

    describe('boil mode', () => {
        it('start(boil) использует boil_time и default 100°C', () => {
            const recipe = { name: 'Pilsner', boil_time: 60, hop_additions: [] };
            processManager.start(recipe, null, 'boil');

            const state = processManager.getState();
            expect(state.mode).toBe('boil');
            expect(state.steps).toHaveLength(1);
            expect(state.steps[0].temp).toBe(100);
            expect(state.steps[0].duration).toBe(60);
            expect(mockPidManager.setTarget).toHaveBeenCalledWith(100);
        });
    });

    describe('фильтрация по deviceId', () => {
        it('handleSensorData с чужим deviceId игнорируется', () => {
            const recipe = { mash_steps: [{ temp: 65, duration: 60 }] };
            processManager.start(recipe, null, 'mash', 'device-A');

            // От чужого устройства — не должно перевести в HOLDING даже если temp достигнут
            processManager.handleSensorData('device-B', { boiler: 70 });
            expect(processManager.getState().status).toBe(PROCESS_STATUS.HEATING);

            // От своего — переводит
            processManager.handleSensorData('device-A', { boiler: 70 });
            expect(processManager.getState().status).toBe(PROCESS_STATUS.HOLDING);
        });
    });

    describe('фильтрация по sensorAddress', () => {
        it('когда sensorAddress задан — используется только он, не data.boiler', () => {
            const recipe = { mash_steps: [{ temp: 65, duration: 60 }] };
            processManager.start(recipe, null, 'mash', 'local_serial', '28-aaaa');

            // data.boiler=70 (достиг), но нужного адреса нет — статус не меняется
            processManager.handleSensorData('local_serial', {
                boiler: 70,
                sensors: [{ address: '28-bbbb', temp: 70 }],
            });
            expect(processManager.getState().status).toBe(PROCESS_STATUS.HEATING);

            // Теперь приходит нужный адрес с достигнутой температурой
            processManager.handleSensorData('local_serial', {
                boiler: 20, // boiler низкая — не важно
                sensors: [{ address: '28-aaaa', temp: 70 }],
            });
            expect(processManager.getState().status).toBe(PROCESS_STATUS.HOLDING);
        });
    });

    describe('stop() — полный сброс', () => {
        it('stop() из любого состояния возвращает в IDLE и выключает PID', () => {
            const recipe = { mash_steps: [{ temp: 65, duration: 60 }] };
            processManager.start(recipe);
            processManager.handleSensorData('local_serial', { boiler: 66 });
            expect(processManager.getState().status).toBe(PROCESS_STATUS.HOLDING);

            processManager.stop();

            expect(processManager.getState().status).toBe(PROCESS_STATUS.IDLE);
            expect(processManager.getState().currentStepIndex).toBe(-1);
            expect(mockPidManager.setEnabled).toHaveBeenLastCalledWith(false);
        });
    });

    describe('heating→holding переход (1°C раньше цели)', () => {
        it('переключается в HOLDING при target - 1', () => {
            const recipe = { mash_steps: [{ temp: 65, duration: 60 }] };
            processManager.start(recipe);

            processManager.handleSensorData('local_serial', { boiler: 63 }); // ещё далеко
            expect(processManager.getState().status).toBe(PROCESS_STATUS.HEATING);

            processManager.handleSensorData('local_serial', { boiler: 64 }); // ровно target-1
            expect(processManager.getState().status).toBe(PROCESS_STATUS.HOLDING);
            expect(mockPidManager.setMode).toHaveBeenCalledWith('holding');
        });
    });

    describe('userId-осведомлённость конструктора', () => {
        it('сохраняет userId в инстансе', () => {
            const pm = new ProcessManager(mockPidManager, 42);
            expect(pm.userId).toBe(42);
            pm.stop();
        });
    });
});
