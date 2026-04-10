import { EventEmitter } from 'events';
import telegram from './telegram.js';
import { temperatureQueries, sessionQueries } from '../db/database.js';
import { setPumpState } from '../routes/control.js';
import logger from '../utils/logger.js';

const log = logger.child({ module: 'ProcessManager' });

// Status constants
export const PROCESS_STATUS = {
    IDLE: 'IDLE',
    HEATING: 'HEATING',
    HOLDING: 'HOLDING',
    PAUSED: 'PAUSED',
    COMPLETED: 'COMPLETED'
};

class ProcessManager extends EventEmitter {
    constructor(pidManager, userId) {
        super();
        this.pidManager = pidManager;
        this.userId = userId;  // owner — используется в server.js для per-user broadcast
        this.reset();

        // Bind methods
        this.updateLoop = this.updateLoop.bind(this);
    }

    reset() {
        if (this.timerInterval) clearInterval(this.timerInterval);
        this.timerInterval = null;

        this.state = {
            status: PROCESS_STATUS.IDLE,
            mode: null, // null when idle, 'mash' or 'boil' when running
            recipeName: '',
            steps: [],
            currentStepIndex: -1,
            stepPhase: 'heating', // 'heating' or 'holding'
            remainingTime: 0,
            startTime: null,
            elapsedTime: 0,
            recipeId: null,
            sessionId: null,
            deviceId: 'local_serial', // Default to serial for backward compatibility
            notifiedEvents: []
        };

        // Reset PID
        if (this.pidManager && this.pidManager.setEnabled) {
            this.pidManager.setTarget(0);
            this.pidManager.setEnabled(false);
        }

        this.lastTempLogTime = 0;
        log.info('Reset to IDLE');
        this.emit('update', this.state);
    }

    start(recipe, sessionId = null, mode = 'mash', deviceId = 'local_serial', sensorAddress = null) {
        if (this.state.status !== PROCESS_STATUS.IDLE && this.state.status !== PROCESS_STATUS.COMPLETED) {
            throw new Error('Process is already running');
        }

        let savedElapsed = 0;
        let savedStartTime = Date.now();
        if (this.state.status === PROCESS_STATUS.COMPLETED) {
            savedElapsed = this.state.elapsedTime;
            savedStartTime = this.state.startTime || Date.now();
            this.reset();
        }

        let steps = [];
        if (mode === 'mash') {
            steps = recipe.mash_steps || recipe.steps || [];
            if (steps.length === 0) throw new Error('No mash steps in recipe');
        } else if (mode === 'boil') {
            if (!recipe.boil_time) throw new Error('No boil time in recipe');
            // Boiling is treated as a single step
            steps = [{
                name: 'Boiling',
                temp: 100, // Boiling point
                duration: parseInt(recipe.boil_time),
                hop_additions: recipe.hop_additions || []
            }];
        } else {
            throw new Error(`Unknown mode: ${mode}`);
        }

        let finalSessionId = sessionId;
        let needsNewSession = false;

        if (!finalSessionId || finalSessionId === 'new') {
            needsNewSession = true;
        } else {
            try {
                const existing = sessionQueries.getById(finalSessionId);
                if (!existing) needsNewSession = true;
            } catch (err) {
                needsNewSession = true;
            }
        }

        if (needsNewSession) {
            try {
                const newSession = sessionQueries.create({
                    recipe_id: recipe.id || null,
                    type: mode,
                    status: 'active',
                    notes: 'Auto-created by ProcessManager'
                });
                finalSessionId = newSession.id;
            } catch (err) {
                log.warn({ err }, 'Failed to create session with recipe_id (likely FK missing). Retrying without recipe_id...');
                try {
                    const fallbackSession = sessionQueries.create({
                        recipe_id: null,
                        type: mode,
                        status: 'active',
                        notes: 'Auto-created fallback'
                    });
                    finalSessionId = fallbackSession.id;
                } catch (e2) {
                    log.error({ err: e2 }, 'Fatal: Could not create session in DB');
                    finalSessionId = Date.now().toString(); // Fallback, though it might fail FK constraint later
                }
            }
        }

        this.state = {
            status: PROCESS_STATUS.HEATING,
            mode: mode,
            recipeName: recipe.name,
            steps: steps,
            currentStepIndex: 0, // Always start at 0
            stepPhase: 'heating',
            remainingTime: steps[0].duration * 60,
            startTime: savedStartTime,
            elapsedTime: savedElapsed,
            recipeId: recipe.id,
            sessionId: finalSessionId,
            deviceId: deviceId, // Assigned device
            sensorAddress: sensorAddress, // Specific sensor address to track
            notifiedEvents: []
        };

        log.info({
            mode,
            recipe: recipe.name,
            deviceId,
            sensorAddress: sensorAddress || 'auto',
            sessionId: finalSessionId,
            steps: steps.map((s, i) => `${i}: ${s.name} ${s.temp}°C/${s.duration}min`),
        }, `START ${mode.toUpperCase()}`);

        // Initialize hardware
        const initialTemp = this.state.steps[0].temp;
        log.info({ target: initialTemp, mode: 'heating' }, 'Enabling PID');
        if (this.pidManager && this.pidManager.setEnabled) {
            if (this.pidManager.setSensorAddress) this.pidManager.setSensorAddress(sensorAddress);
            this.pidManager.setTarget(initialTemp);
            this.pidManager.setMode('heating'); // Start in heating mode (full power with ramp-down)
            this.pidManager.setEnabled(true);
        }
        // Turn on pump automatically when process starts
        log.info('Turning pump ON');
        setPumpState(true, this.userId);

        // Start loop
        this.startLoop();

        // Notify
        telegram.setCurrentProcessType(mode);
        const startMsg = mode === 'mash' ? 'Начало затирания' : 'Начало кипячения';
        telegram.notifyPhaseChange(mode, startMsg, `Рецепт: ${recipe.name}`);
        this.emit('update', this.state);
    }

    stop() {
        const oldSessionId = this.state.sessionId;

        this.reset(); // This disables PID (turns off heater)
        telegram.sendMessage('🛑 Процесс остановлен вручную');
        // NOTE: Pump state is NOT changed — user controls pump manually

        if (oldSessionId) {
            try {
                sessionQueries.cancel(oldSessionId);
            } catch (err) {
                log.error({ err }, 'Failed to cancel session in DB');
            }
        }
    }

    pause() {
        if (this.state.status === PROCESS_STATUS.IDLE || this.state.status === PROCESS_STATUS.COMPLETED) return;

        this.state.status = PROCESS_STATUS.PAUSED;
        // Turn off heater (PID disabled → setHeaterState(0))
        if (this.pidManager && this.pidManager.setEnabled) this.pidManager.setEnabled(false);
        // NOTE: Pump state is NOT changed — user controls pump manually
        this.emit('update', this.state);
        telegram.sendMessage('⏸ Процесс поставлен на паузу');
    }

    resume() {
        if (this.state.status !== PROCESS_STATUS.PAUSED) return;

        this.state.status = this.state.stepPhase === 'heating' ? PROCESS_STATUS.HEATING : PROCESS_STATUS.HOLDING;
        if (this.pidManager && this.pidManager.setEnabled) {
            // Restore PID mode based on current phase
            this.pidManager.setMode(this.state.stepPhase); // 'heating' or 'holding'
            this.pidManager.setEnabled(true);
        }
        // NOTE: Pump state is NOT changed — user controls pump manually
        this.emit('update', this.state);
        telegram.sendMessage('▶️ Процесс возобновлен');
    }

    skip() {
        if (this.state.status === PROCESS_STATUS.IDLE) return;
        this.advanceStep();
    }

    startLoop() {
        if (this.timerInterval) clearInterval(this.timerInterval);
        this.timerInterval = setInterval(this.updateLoop, 1000);
    }

    updateLoop() {
        if (this.state.status === PROCESS_STATUS.IDLE) return;

        // General brew timer ticks unconditionally (except IDLE)
        this.state.elapsedTime++;

        // Stop remainingTime tick and updates if paused
        if (this.state.status === PROCESS_STATUS.PAUSED) {
            this.emit('update', this.state);
            return;
        }

        this.tickTimer();

        this.emit('update', this.state);
    }

    handleSensorData(deviceId, data) {
        // Always forward to PID — it has its own sensor address logic and handles
        // both normal PID control and autotune regardless of process status.
        if (this.pidManager) {
            this.pidManager.update(data);
        }

        // Process state machine only runs when actively heating/holding
        if (this.state.status !== PROCESS_STATUS.HEATING && this.state.status !== PROCESS_STATUS.HOLDING) return;
        if (this.state.status === PROCESS_STATUS.PAUSED) return;

        // Only process data from the assigned device
        if (this.state.deviceId && deviceId !== this.state.deviceId) {
            // Don't spam logs - only log once per minute
            if (!this._lastDeviceMismatchLog || Date.now() - this._lastDeviceMismatchLog > 60000) {
                log.warn({ expected: this.state.deviceId, got: deviceId }, 'Device mismatch, ignoring sensor data');
                this._lastDeviceMismatchLog = Date.now();
            }
            return;
        }

        // Extract boiler temp using ONLY the selected sensor if sensorAddress is set.
        // NEVER fallback to data.boiler when sensorAddress is set — boiler mapping
        // can randomly point to a different sensor (e.g. the room-temp one at 20°C).
        let currentTemp;
        const hasSensorsArray = data.sensors && Array.isArray(data.sensors);

        if (this.state.sensorAddress) {
            // Specific sensor required — find it by address
            if (hasSensorsArray) {
                const targetSensor = data.sensors.find(s => s.address === this.state.sensorAddress);
                if (targetSensor) {
                    currentTemp = targetSensor.temp ?? targetSensor.value;
                }
            }
            // If sensor not found in this packet — skip entirely (mock or wrong device)
            if (currentTemp === undefined) {
                return;
            }
        } else {
            // No specific sensor — use mapped boiler value (legacy / auto mode)
            currentTemp = data.boiler;
            if (typeof currentTemp === 'object' && currentTemp !== null) currentTemp = currentTemp.value;
        }

        if (currentTemp === undefined) {
            log.warn({ dataKeys: Object.keys(data) }, 'No boiler temperature in sensor data');
            return;
        }

        const currentStep = this.state.steps[this.state.currentStepIndex];
        if (!currentStep) return;

        // Logic: if heating and temp reached -> switch to holding
        const targetTemp = parseFloat(this.state.mode === 'boil' ? 99 : currentStep.temp);
        const currentTempFloat = parseFloat(currentTemp);

        const targetReached = !isNaN(currentTempFloat) && !isNaN(targetTemp) && (currentTempFloat >= targetTemp);

        if (this.state.stepPhase === 'heating' && targetReached) {
            log.info({ target: currentStep.temp, current: currentTempFloat, holdMin: currentStep.duration }, 'Target reached → HOLDING');
            this.state.stepPhase = 'holding';
            this.state.status = PROCESS_STATUS.HOLDING;
            this.state.remainingTime = currentStep.duration * 60;

            // CRITICAL: Switch PID to holding mode (resets integral to prevent overshoot)
            if (this.pidManager && this.pidManager.setMode) {
                this.pidManager.setMode('holding');
            }

            if (this.state.mode === 'mash') {
                telegram.notifyMashStep('reached', currentStep);
            } else {
                telegram.notifyPhaseChange('boil', 'Кипячение достигнуто', 'Начинаем обратный отсчет');
            }
            this.emit('update', this.state);
        }

        // Log temperature every 10 seconds (10000ms)
        const now = Date.now();
        if (now - this.lastTempLogTime > 10000 && this.state.sessionId) {
            try {
                temperatureQueries.insert(this.state.sessionId, 'boiler', currentTemp);
                this.lastTempLogTime = now;
            } catch (err) {
                log.error({ err }, 'Failed to log temperature to DB');
            }
        }

        // Note: pidManager.update(data) is called at the top of this method
        // unconditionally so that PID/autotune runs even when no process is active.
    }

    // Called every second by loop
    tickTimer() {
        if (this.state.status !== PROCESS_STATUS.HOLDING) return;

        this.state.remainingTime--;

        const currentStep = this.state.steps[this.state.currentStepIndex];

        // Check for Boil Hop Additions
        if (this.state.mode === 'boil' && currentStep.hop_additions) {
            const timeLeftMins = Math.floor(this.state.remainingTime / 60);
            const timeLeftSecs = this.state.remainingTime % 60;

            // Check specifically at exact minute mark
            if (timeLeftSecs === 0) {
                // Hops
                currentStep.hop_additions.forEach(hop => {
                    if (hop.time === timeLeftMins) {
                        const key = `hop_${hop.name}_${hop.time}`;
                        if (!this.state.notifiedEvents.includes(key)) {
                            telegram.sendMessage(`📥 *ВОМЯ ВНЕСЕНИЯ ХМЕЛЯ!*\nХмель: ${hop.name}\nКол-во: ${hop.amount}г\nВремя: ${hop.time} мин`);
                            this.state.notifiedEvents.push(key);
                        }
                    }
                });

                // Reminders (10, 5 mins)
                if ([10, 5].includes(timeLeftMins)) {
                    const key = `rem_${timeLeftMins}`;
                    if (!this.state.notifiedEvents.includes(key)) {
                        telegram.sendMessage(`⏳ До конца кипячения: ${timeLeftMins} мин`);
                        this.state.notifiedEvents.push(key);
                    }
                }
            }
        }

        // Check if step completed
        if (this.state.remainingTime <= 0) {
            if (this.state.mode === 'mash') {
                telegram.notifyMashStep('completed', currentStep);
            }
            this.advanceStep();
        }
    }

    advanceStep() {
        const nextIndex = this.state.currentStepIndex + 1;
        if (nextIndex >= this.state.steps.length) {
            log.info('All steps complete → finishing');
            this.complete();
        } else {
            this.state.currentStepIndex = nextIndex;
            this.state.stepPhase = 'heating';
            this.state.status = PROCESS_STATUS.HEATING;
            const nextStep = this.state.steps[nextIndex];

            log.info({ step: nextIndex + 1, name: nextStep.name, temp: nextStep.temp, duration: nextStep.duration }, 'Advancing to next step');

            // Set new target and switch PID to heating mode
            if (this.pidManager && this.pidManager.setEnabled) {
                this.pidManager.resetIntegral(); // Clear old integral from previous step
                this.pidManager.setTarget(nextStep.temp);
                this.pidManager.setMode('heating'); // Back to heating mode (full power)
            }

            this.state.remainingTime = nextStep.duration * 60; // Pre-set for display

            if (this.state.mode === 'mash') {
                telegram.notifyPhaseChange('mash', `Шаг ${nextIndex + 1}: ${nextStep.name}`, `${nextStep.temp}°C / ${nextStep.duration} мин`);
            }
            this.emit('update', this.state);
        }
    }

    complete() {
        const prevMode = this.state.mode;
        this.state.status = PROCESS_STATUS.COMPLETED;
        this.state.remainingTime = 0;
        // Turn off heater (PID disabled → setHeaterState(0))
        if (this.pidManager && this.pidManager.setEnabled) {
            this.pidManager.setEnabled(false);
        }
        // NOTE: Pump state is NOT changed — user controls pump manually

        if (this.timerInterval) clearInterval(this.timerInterval);
        this.timerInterval = null;

        if (this.state.mode === 'boil' && this.state.sessionId) {
            try {
                sessionQueries.complete(this.state.sessionId);
            } catch (err) {
                log.error({ err }, 'Failed to complete session in DB');
            }
        }

        const nextAction = prevMode === 'mash' ? 'Можно переходить к кипячению' : 'Варка завершена! Охлаждайте сусло.';
        telegram.notifyComplete(prevMode, { notes: nextAction });
        this.emit('update', this.state);
    }

    getState() {
        return this.state;
    }
}

export default ProcessManager;
