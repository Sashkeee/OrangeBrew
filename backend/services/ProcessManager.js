import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import telegram from './telegram.js';
import { temperatureQueries, processEventQueries, settingsQueries } from '../db/database.js';
import { setPumpState } from '../routes/control.js';
import logger from '../utils/logger.js';

const log = logger.child({ module: 'ProcessManager' });
export const PROCESS_STATUS = { IDLE: 'IDLE', HEATING: 'HEATING', HOLDING: 'HOLDING', PAUSED: 'PAUSED', COMPLETED: 'COMPLETED' };
const idleState = () => ({ status: 'IDLE', mode: null, recipeName: '', steps: [], currentStepIndex: -1,
    stepPhase: 'heating', remainingTime: 0, startTime: null, elapsedTime: 0, recipeId: null,
    sessionId: null, deviceId: 'local_serial', sensorAddress: null, notifiedEvents: [] });

class ProcessManager extends EventEmitter {
    constructor(pidManager, userId, { store = processEventQueries } = {}) {
        super();
        this.pidManager = pidManager;
        this.userId = userId;
        this.store = store;
        this.context = {};
        this.updateLoop = this.updateLoop.bind(this);
        this.reset();
        this.recovery = Number.isSafeInteger(userId) ? store.getRecoverable(userId) : [];
    }

    reset() {
        if (this.timerInterval) clearInterval(this.timerInterval);
        this.timerInterval = null;
        this.pidManager?.setEnabled?.(false);
        this.pidManager?.setTarget?.(0);
        this.state = idleState();
        this.lastTempLogTime = 0;
        this.emit('update', this.state);
    }

    persist(eventType, nextState, { sessionStatus, safety = false, payload = {} } = {}) {
        try {
            const result = this.store.transition({ userId: this.userId, sessionId: nextState.sessionId,
                eventType, snapshot: nextState, sessionStatus, payload, context: this.context });
            this.state = { ...nextState, aggregateSequence: result.sequence };
            this.emit('domainEvent', result.event);
            return result.event;
        } catch (err) {
            if (!safety) throw err;
            this.state = { ...nextState, persistenceError: true, recoveryRequired: true };
            log.error({ err, userId: this.userId, sessionId: nextState.sessionId, eventType }, 'Safe process action could not be persisted');
            return null;
        }
    }

    notify(event) {
        if (!event) return;
        try {
            Promise.resolve(telegram.notifyProcessEvent(event)).catch(err => log.error({ err, userId: this.userId }, 'Process notification failed'));
        } catch (err) { log.error({ err, userId: this.userId }, 'Process notification failed'); }
    }

    start(recipe, sessionId = null, mode = 'mash', deviceId = 'local_serial', sensorAddress = null, context = {}) {
        if (!['IDLE', 'COMPLETED'].includes(this.state.status)) throw new Error('Process is already running');
        if (this.state.persistenceError || this.recovery.length) throw new Error('Interrupted process needs operator acknowledgement; stop before starting again');
        let steps;
        if (mode === 'mash') steps = recipe.mash_steps || recipe.steps || [];
        else if (mode === 'boil') {
            const temp = parseFloat(settingsQueries.get('boiling_temp', this.userId)) || parseFloat(settingsQueries.get('boiling_temp', null)) || 100;
            steps = [{ name: 'Boiling', temp, duration: Number(recipe.boil_time), hop_additions: recipe.hop_additions || [] }];
        } else throw new Error('Unknown process mode');
        if (!Array.isArray(steps) || steps.length === 0 || steps.length > 100) throw new Error('Recipe needs between 1 and 100 steps');
        steps = structuredClone(steps);
        for (const step of steps) {
            step.temp = Number(step.temp);
            step.duration = Number(step.duration);
            if (!Number.isFinite(step.temp) || !Number.isFinite(step.duration) || step.duration <= 0) throw new Error('Invalid step temperature or duration');
        }
        this.context = { correlationId: context.correlationId || randomUUID() };
        const snapshot = { ...idleState(), status: 'START_REQUESTED', mode, recipeName: recipe.name || '', steps,
            currentStepIndex: 0, remainingTime: steps[0].duration * 60,
            startTime: this.state.status === 'COMPLETED' ? (this.state.startTime || Date.now()) : Date.now(),
            elapsedTime: this.state.status === 'COMPLETED' ? this.state.elapsedTime : 0,
            recipeId: recipe.id || null, deviceId, sensorAddress };
        // Session, ownership, snapshot and start_requested commit BEFORE enabling heat.
        const prepared = this.store.prepareStart({ userId: this.userId, recipe, sessionId, mode, snapshot,
            context: { ...this.context, sensorVerified: context.sensorVerified === true } });
        this.state = { ...prepared.snapshot, aggregateSequence: prepared.sequence };
        this.emit('domainEvent', prepared.event);
        try {
            this.pidManager?.setSensorAddress?.(sensorAddress);
            this.pidManager?.setTarget?.(steps[0].temp);
            this.pidManager?.setMode?.('heating');
            this.pidManager?.setEnabled?.(true);
            setPumpState(true, this.userId);
            // A server transition, not a claim that the hardware acknowledged execution.
            const event = this.persist('process.started', { ...this.state, status: 'HEATING' }, { sessionStatus: 'active' });
            this.startLoop();
            telegram.setCurrentProcessType(mode, this.userId);
            this.notify(event);
            this.emit('update', this.state);
        } catch (err) {
            this.pidManager?.setEnabled?.(false);
            const failed = this.persist('process.start_failed', { ...this.state, status: 'START_FAILED' }, { sessionStatus: 'cancelled', safety: true });
            if (failed) this.state = idleState();
            else this.state = { ...this.state, status: 'PAUSED', persistenceError: true, recoveryRequired: true };
            throw err;
        }
    }

    stop({ safety = false } = {}) {
        const previous = this.state;
        this.reset(); // Direct safety action always precedes the database attempt.
        let failed = false;
        if (previous.sessionId && (previous.status !== 'COMPLETED' || previous.persistenceError)) {
            const event = this.persist(safety ? 'process.safety_stop' : 'process.stopped',
                { ...previous, status: 'STOPPED', remainingTime: 0 }, { sessionStatus: 'cancelled', safety: true });
            failed = !event;
            this.notify(event);
        }
        this.recovery = (this.recovery || []).filter(item => !this.persist('process.stopped',
            { ...item.snapshot, status: 'STOPPED' }, { sessionStatus: 'cancelled', safety: true }));
        // Keep the last session available to retry its stop if persistence is temporarily unavailable.
        this.state = failed ? { ...previous, status: 'PAUSED', persistenceError: true, recoveryRequired: true }
            : { ...idleState(), persistenceError: this.recovery.length > 0 };
        this.emit('update', this.state);
    }

    pause() {
        if (!['HEATING', 'HOLDING'].includes(this.state.status)) return;
        this.pidManager?.setEnabled?.(false);
        const event = this.persist('process.paused', { ...this.state, status: 'PAUSED' }, { sessionStatus: 'paused', safety: true });
        this.notify(event);
        this.emit('update', this.state);
    }

    resume() {
        if (this.state.status !== 'PAUSED') return;
        if (this.state.persistenceError || this.state.recoveryRequired) throw new Error('Persistence needs operator acknowledgement; stop and start a new process');
        this.persist('process.resume_requested', { ...this.state }, { sessionStatus: 'paused' });
        try {
            this.pidManager?.setMode?.(this.state.stepPhase);
            this.pidManager?.setEnabled?.(true);
            const status = this.state.stepPhase === 'heating' ? 'HEATING' : 'HOLDING';
            const event = this.persist('process.resumed', { ...this.state, status }, { sessionStatus: 'active' });
            this.notify(event);
            this.emit('update', this.state);
        } catch (err) {
            this.pidManager?.setEnabled?.(false);
            this.persist('process.paused', { ...this.state, status: 'PAUSED' }, { sessionStatus: 'paused', safety: true });
            throw err;
        }
    }

    skip() {
        if (!['HEATING', 'HOLDING', 'PAUSED'].includes(this.state.status)) return;
        try { this.advanceStep(); } catch (err) { this.failSafely(err); throw err; }
    }

    startLoop() {
        if (this.timerInterval) clearInterval(this.timerInterval);
        this.timerInterval = setInterval(this.updateLoop, 1000);
    }

    failSafely(err) {
        this.pidManager?.setEnabled?.(false);
        this.persist('process.safety_stop', { ...this.state, status: 'PAUSED', recoveryRequired: true }, { sessionStatus: 'paused', safety: true });
        log.error({ err, userId: this.userId, sessionId: this.state.sessionId }, 'Process paused after persistence or transition failure');
        this.emit('update', this.state);
    }

    updateLoop() {
        if (['IDLE', 'COMPLETED'].includes(this.state.status)) return;
        this.state.elapsedTime++;
        if (this.state.status !== 'PAUSED') {
            try { this.tickTimer(); } catch (err) { this.failSafely(err); }
        }
        // UI timer ticks are deliberately not domain events or outbox writes.
        this.emit('update', this.state);
    }

    handleSensorData(deviceId, data) {
        if (this.state.sessionId && this.state.deviceId !== deviceId) return;
        this.pidManager?.update?.(data);
        if (!['HEATING', 'HOLDING'].includes(this.state.status)) return;
        let currentTemp;
        if (this.state.sensorAddress) {
            const selected = data.sensors?.find(sensor => sensor.address === this.state.sensorAddress);
            currentTemp = selected?.temp ?? selected?.value;
        } else currentTemp = typeof data.boiler === 'object' ? data.boiler?.value : data.boiler;
        if (currentTemp === undefined || !Number.isFinite(Number(currentTemp))) return;
        const step = this.state.steps[this.state.currentStepIndex];
        if (!step) return;
        if (this.state.stepPhase === 'heating' && Number(currentTemp) >= step.temp - 1) {
            try {
                const event = this.persist('process.step_reached', { ...this.state, status: 'HOLDING',
                    stepPhase: 'holding', remainingTime: step.duration * 60 }, { payload: { stepName: step.name || '', target: step.temp } });
                this.pidManager?.setMode?.('holding');
                this.notify(event);
                this.emit('update', this.state);
            } catch (err) { this.failSafely(err); return; }
        }
        const now = Date.now();
        if (now - this.lastTempLogTime > 10000) {
            try { temperatureQueries.insert(this.state.sessionId, 'boiler', Number(currentTemp)); this.lastTempLogTime = now; }
            catch (err) { log.error({ err, userId: this.userId }, 'Failed to log temperature to DB'); }
        }
    }

    tickTimer() {
        if (this.state.status !== 'HOLDING') return;
        this.state.remainingTime--;
        const step = this.state.steps[this.state.currentStepIndex];
        if (this.state.mode === 'boil' && step.hop_additions && this.state.remainingTime % 60 === 0) {
            const mins = Math.floor(this.state.remainingTime / 60);
            for (const hop of step.hop_additions) {
                const key = 'hop_' + hop.name + '_' + hop.time;
                if (Number(hop.time) === mins && !this.state.notifiedEvents.includes(key)) {
                    telegram.sendMessage('Время внесения хмеля: ' + hop.name + ', ' + hop.amount + ' г', { userId: this.userId });
                    this.state.notifiedEvents.push(key);
                }
            }
            const key = 'rem_' + mins;
            if ([10, 5].includes(mins) && !this.state.notifiedEvents.includes(key)) {
                telegram.sendMessage('До конца кипячения: ' + mins + ' мин', { userId: this.userId });
                this.state.notifiedEvents.push(key);
            }
        }
        if (this.state.remainingTime <= 0) this.advanceStep();
    }

    advanceStep() {
        const nextIndex = this.state.currentStepIndex + 1;
        if (nextIndex >= this.state.steps.length) { this.complete(); return; }
        const step = this.state.steps[nextIndex];
        const status = this.state.status === 'PAUSED' ? 'PAUSED' : 'HEATING';
        const event = this.persist('process.step_changed', { ...this.state, currentStepIndex: nextIndex, stepPhase: 'heating',
            status, remainingTime: step.duration * 60 }, { payload: { previousStep: this.state.currentStepIndex, stepName: step.name || '', target: step.temp } });
        this.pidManager?.resetIntegral?.();
        this.pidManager?.setTarget?.(step.temp);
        this.pidManager?.setMode?.('heating');
        this.notify(event);
        this.emit('update', this.state);
    }

    complete() {
        this.pidManager?.setEnabled?.(false);
        if (this.timerInterval) clearInterval(this.timerInterval);
        this.timerInterval = null;
        // Mash and boil can share the same session; only boil finalizes that session.
        const event = this.persist('process.completed', { ...this.state, status: 'COMPLETED', remainingTime: 0 },
            { sessionStatus: this.state.mode === 'boil' ? 'completed' : 'active', safety: true });
        this.notify(event);
        this.emit('update', this.state);
    }

    getState() { return { ...this.state, recovery: this.recovery || [] }; }
}
export default ProcessManager;
