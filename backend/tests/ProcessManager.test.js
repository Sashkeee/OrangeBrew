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
});
