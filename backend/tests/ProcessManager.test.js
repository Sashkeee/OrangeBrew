import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import ProcessManager, { PROCESS_STATUS } from '../services/ProcessManager.js';
import telegram from '../services/telegram.js';

// Mock telegram
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
        vi.useFakeTimers();

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
        const state = processManager.getState();
        expect(state.status).toBe(PROCESS_STATUS.IDLE);
        expect(state.currentStepIndex).toBe(-1);
    });

    it('should start a process with recipe', () => {
        const recipe = {
            name: 'Test Recipe',
            id: 1,
            mash_steps: [
                { name: 'Mash In', temp: 65, duration: 60 }
            ]
        };

        processManager.start(recipe);
        const state = processManager.getState();

        expect(state.status).toBe(PROCESS_STATUS.HEATING);
        expect(state.steps).toHaveLength(1);
        expect(state.currentStepIndex).toBe(0);
        expect(state.stepPhase).toBe('heating');

        expect(mockPidManager.setTarget).toHaveBeenCalledWith(65);
        expect(mockPidManager.setEnabled).toHaveBeenCalledWith(true);
        expect(telegram.setCurrentProcessType).toHaveBeenCalledWith('mash');
    });

    it('should transition to HOLDING when temperature reached', () => {
        const recipe = {
            name: 'Test Recipe',
            mash_steps: [{ name: 'Mash In', temp: 65, duration: 60 }]
        };
        processManager.start(recipe);

        // Simulate temperature update below target
        processManager.handleSensorData({ boiler: { value: 60 } });
        expect(processManager.getState().status).toBe(PROCESS_STATUS.HEATING);

        // Simulate reaching target
        processManager.handleSensorData({ boiler: { value: 65.5 } });

        const state = processManager.getState();
        expect(state.status).toBe(PROCESS_STATUS.HOLDING);
        expect(state.stepPhase).toBe('holding');
        expect(state.remainingTime).toBe(60 * 60);

        expect(telegram.notifyMashStep).toHaveBeenCalledWith('reached', expect.anything());
    });

    it('should countdown timer in HOLDING state', () => {
        const recipe = {
            name: 'Test Recipe',
            mash_steps: [{ name: 'Step 1', temp: 65, duration: 1 }] // 1 min duration
        };
        processManager.start(recipe);

        // Force transition to holding
        processManager.handleSensorData({ boiler: { value: 66 } });
        expect(processManager.getState().status).toBe(PROCESS_STATUS.HOLDING);

        // Advance time by 30 seconds
        vi.advanceTimersByTime(30000);
        expect(processManager.getState().remainingTime).toBe(30);

        // Advance to completion
        vi.advanceTimersByTime(31000);

        // Should have completed step and moved to complete (since only 1 step)
        expect(processManager.getState().status).toBe(PROCESS_STATUS.COMPLETED);
        expect(telegram.notifyComplete).toHaveBeenCalled();
    });

    it('should advance to next step automatically', () => {
        const recipe = {
            name: 'Multi Step',
            mash_steps: [
                { name: 'Step 1', temp: 50, duration: 0.1 }, // 6 seconds
                { name: 'Step 2', temp: 65, duration: 60 }
            ]
        };
        processManager.start(recipe);

        // Reach step 1 target
        processManager.handleSensorData({ boiler: { value: 50 } });

        // Wait for duration (6s)
        vi.advanceTimersByTime(7000);

        const state = processManager.getState();
        expect(state.currentStepIndex).toBe(1);
        expect(state.status).toBe(PROCESS_STATUS.HEATING);
        expect(state.stepPhase).toBe('heating');

        // Verify PID updated for step 2
        expect(mockPidManager.setTarget).toHaveBeenCalledWith(65);
    });

    it('should pause and resume correctly', () => {
        const recipe = { mash_steps: [{ temp: 65, duration: 60 }] };
        processManager.start(recipe);

        processManager.pause();
        expect(processManager.getState().status).toBe(PROCESS_STATUS.PAUSED);
        expect(mockPidManager.setEnabled).toHaveBeenCalledWith(false);

        // Timers should not tick when paused
        // (Implementation detail: if loop runs, it checks paused state)
        vi.advanceTimersByTime(5000);
        // Elapsed time might increment if loop runs, but remaining time shouldn't change
        // Wait, loop checks paused state to skip logic.

        processManager.resume();
        expect(processManager.getState().status).toBe(PROCESS_STATUS.HEATING);
        expect(mockPidManager.setEnabled).toHaveBeenCalledWith(true);
    });

    it('should handle sensor data format variations', () => {
        const recipe = { mash_steps: [{ temp: 65, duration: 60 }] };
        processManager.start(recipe);

        // { boiler: 65 }
        processManager.handleSensorData({ boiler: 65 });
        expect(processManager.getState().status).toBe(PROCESS_STATUS.HOLDING);
    });
});
