/**
 * Relay Auto-Tuner (Ziegler-Nichols Method)
 * 
 * Реализация релейного автотюнинга:
 * 1. HEATING_INITIAL: нагрев до целевой температуры
 * 2. RELAY_OSCILLATION: релейные колебания с детекцией реальных пиков/впадин
 * 3. COMPUTING: расчёт Ku, Tu и коэффициентов ПИД
 * 
 * Защиты:
 * - Аварийный порог температуры (по СЫРОЙ температуре, не по фильтрованной)
 * - EMA сглаживание для детекции пиков/впадин
 * - Минимальное время в каждом состоянии реле
 * - Подтверждение смены направления несколькими чтениями
 */

import { SAFETY, SIGNAL, PID_TUNING } from '../config/constants.js';
import logger from '../utils/logger.js';

const log = logger.child({ module: 'PidTuner' });

export default class PidTuner {
    constructor() {
        this.reset();
    }

    reset() {
        this.tuning = false;
        this.target = 0;
        this.stepPower = 100;

        // State machine
        this.state = 'IDLE'; // IDLE → HEATING_INITIAL → RELAY_OSCILLATION → DONE

        // Safety
        this._maxSafeTemp = SAFETY.MAX_TEMP_C; // °C — аварийный порог (по сырой температуре!)

        // EMA filter for temperature smoothing (only for peak/valley detection)
        this._emaAlpha = SIGNAL.EMA_ALPHA;      // Higher alpha = faster response (good for fast systems)
        this._filteredTemp = null;

        // Relay state tracking with hysteresis (NOT dwell time!)
        // Relay ON when: raw < target - hysteresis
        // Relay OFF when: raw > target + hysteresis
        // This prevents chattering near target without blocking the relay for seconds
        this._relayIsOn = false;
        this._hysteresis = SAFETY.HYSTERESIS_C; // °C — deadband half-width around target

        // Direction tracking for peak/valley detection
        this._prevFilteredTemp = null;
        this._directionCounter = 0;
        this._confirmSamples = SIGNAL.CONFIRM_SAMPLES;   // Confirm direction change with N samples

        // Tracking local extremes
        this._localMax = -999;
        this._localMin = 999;

        // Detected peaks and valleys
        this.peaks = [];   // [{value, time}, ...]
        this.valleys = []; // [{value, time}, ...]

        this.targetCycles = PID_TUNING.TARGET_CYCLES;
        this.currentCycle = 0;

        // Timing
        this._startTime = 0;
        this._updateCount = 0;
    }

    start(target, stepPower = 100) {
        this.reset();
        this.target = parseFloat(target) || 65.0;
        this.stepPower = parseFloat(stepPower) || 100;
        // Safety limit: at least 5°C above target but max 98°C
        this._maxSafeTemp = Math.min(98, Math.max(this.target + 15, 85));
        this.tuning = true;
        this.state = 'HEATING_INITIAL';
        this._startTime = Date.now();
        this._relayIsOn = true;

        log.info({ target: this.target, stepPower: this.stepPower, safetyLimit: this._maxSafeTemp }, 'Started');
        log.info('Phase 1: Heating to target temperature');
        return this.stepPower;
    }

    /**
     * Update the tuner with a new temperature reading.
     * @param {number|string} rawTemp - current temperature reading
     * @returns {object} - { tuning, done, power, state, cycle, maxCycles, [results], [error] }
     */
    update(rawTemp) {
        if (!this.tuning) return { tuning: false };

        const temp = parseFloat(rawTemp);
        if (isNaN(temp)) {
            return this._status(this._relayIsOn ? this.stepPower : 0);
        }

        this._updateCount++;

        // ╔══════════════════════════════════════════════════╗
        // ║  SAFETY CHECK — uses RAW temp, not filtered!    ║
        // ║  Immediately stops tuning if temp is dangerous  ║
        // ╚══════════════════════════════════════════════════╝
        if (temp >= this._maxSafeTemp) {
            log.error({ temp: temp.toFixed(1), limit: this._maxSafeTemp }, 'SAFETY STOP! Aborting');
            this.tuning = false;
            this.state = 'DONE';
            return {
                tuning: false,
                done: true,
                power: 0,
                error: `Аварийная остановка! Температура ${temp.toFixed(1)}°C превысила безопасный лимит ${this._maxSafeTemp}°C.`
            };
        }

        // Apply EMA filter (for oscillation detection only)
        if (this._filteredTemp === null) {
            this._filteredTemp = temp;
            this._prevFilteredTemp = temp;
        } else {
            this._filteredTemp = this._emaAlpha * temp + (1 - this._emaAlpha) * this._filteredTemp;
        }

        const filtered = this._filteredTemp;
        let power = 0;

        switch (this.state) {
            case 'HEATING_INITIAL':
                power = this.stepPower;
                // Use RAW temp for initial heating (faster reaction)
                if (temp >= this.target) {
                    log.info({ target: this.target, raw: temp.toFixed(1), filtered: filtered.toFixed(1) }, 'Target reached, switching to relay oscillation');
                    this.state = 'RELAY_OSCILLATION';
                    // Switch heater OFF immediately
                    this._relayIsOn = false;
                    // Reset tracking
                    this._localMax = temp;
                    this._localMin = temp;
                    this._filteredTemp = temp;
                    this._prevFilteredTemp = temp;
                    this._directionCounter = 0;
                    power = 0;
                }
                break;

            case 'RELAY_OSCILLATION':
                power = this._runRelayOscillation(temp, filtered);
                break;
        }

        return this._status(power);
    }

    /**
     * Core relay oscillation logic.
     * @param {number} raw - raw temperature (for relay switching)
     * @param {number} filtered - filtered temperature (for peak/valley detection)
     */
    _runRelayOscillation(raw, filtered) {
        const now = Date.now();
        const upperBound = this.target + this._hysteresis; // e.g. 66.5°C
        const lowerBound = this.target - this._hysteresis; // e.g. 63.5°C

        // --- 1. RELAY LOGIC (hysteresis deadband) ---
        // Relay turns OFF only when temp clearly exceeds target + hysteresis
        // Relay turns ON only when temp clearly drops below target - hysteresis
        // In the deadband zone (target ± hysteresis), relay state does NOT change
        if (this._relayIsOn && raw >= upperBound) {
            this._relayIsOn = false;
            log.debug({ raw: raw.toFixed(1), bound: upperBound }, 'Relay OFF');
        } else if (!this._relayIsOn && raw <= lowerBound) {
            this._relayIsOn = true;
            log.debug({ raw: raw.toFixed(1), bound: lowerBound }, 'Relay ON');
        }

        // --- 2. TRACK LOCAL EXTREMES (use RAW for accurate extremes) ---
        if (raw > this._localMax) this._localMax = raw;
        if (raw < this._localMin) this._localMin = raw;

        // --- 3. DETECT DIRECTION CHANGE (PEAKS AND VALLEYS) ---
        const delta = filtered - this._prevFilteredTemp;
        const threshold = 0.05; // Minimum change to register direction

        if (delta > threshold) {
            // Rising
            if (this._directionCounter < 0) {
                this._directionCounter = 1; // Direction reversed
            } else {
                this._directionCounter++;
            }
        } else if (delta < -threshold) {
            // Falling
            if (this._directionCounter > 0) {
                this._directionCounter = -1; // Direction reversed
            } else {
                this._directionCounter--;
            }
        }

        // Confirm PEAK: was rising, then fell for _confirmSamples readings
        if (this._directionCounter <= -this._confirmSamples) {
            // Record peak if valid sequence (first peak or after a valley)
            if (this.peaks.length === 0 ||
                (this.valleys.length > 0 && this.valleys.length >= this.peaks.length)) {
                this.peaks.push({ value: this._localMax, time: now });
                log.info({ n: this.peaks.length, value: this._localMax.toFixed(1) }, 'PEAK detected');
                this._checkCompletion();
            }
            this._localMin = raw; // Reset min tracker
            this._directionCounter = -1;
        }

        // Confirm VALLEY: was falling, then rose for _confirmSamples readings
        if (this._directionCounter >= this._confirmSamples) {
            if (this.peaks.length > this.valleys.length) {
                this.valleys.push({ value: this._localMin, time: now });
                log.info({ n: this.valleys.length, value: this._localMin.toFixed(1) }, 'VALLEY detected');
                this._checkCompletion();
            }
            this._localMax = raw; // Reset max tracker
            this._directionCounter = 1;
        }

        this._prevFilteredTemp = filtered;

        return this._relayIsOn ? this.stepPower : 0;
    }

    /**
     * Check if we have enough oscillation data.
     */
    _checkCompletion() {
        // Need targetCycles+1 peaks and targetCycles valleys for targetCycles period measurements
        if (this.peaks.length >= this.targetCycles + 1 && this.valleys.length >= this.targetCycles) {
            this.currentCycle = Math.min(this.peaks.length, this.valleys.length);
            log.info({ peaks: this.peaks.length, valleys: this.valleys.length }, 'Enough data, computing');
            this.state = 'COMPUTING';
        } else {
            this.currentCycle = Math.max(0, this.peaks.length - 1);
        }
    }

    /**
     * Compute PID parameters from oscillation data.
     */
    _computeResults() {
        this.tuning = false;
        this.state = 'DONE';

        if (this.peaks.length < 2 || this.valleys.length < 1) {
            return { tuning: false, done: true, error: "Недостаточно данных колебаний." };
        }

        // 1. Amplitude A = average (peak - valley) / 2
        const numPairs = Math.min(this.peaks.length, this.valleys.length);
        let amplitudeSum = 0;
        for (let i = 0; i < numPairs; i++) {
            amplitudeSum += (this.peaks[i].value - this.valleys[i].value);
        }
        const A = amplitudeSum / (2 * numPairs);

        // 2. Period Tu = average time between consecutive peaks (seconds)
        const periods = [];
        for (let i = 1; i < this.peaks.length; i++) {
            periods.push((this.peaks[i].time - this.peaks[i - 1].time) / 1000);
        }

        if (periods.length === 0) {
            return { tuning: false, done: true, error: "Недостаточно пиков для расчёта периода." };
        }

        const Tu = periods.reduce((a, b) => a + b, 0) / periods.length;

        // Validation
        if (Tu < PID_TUNING.MIN_PERIOD_S) {
            return { tuning: false, done: true, error: `Период слишком мал (Tu=${Tu.toFixed(1)}с). Возможен шум.` };
        }
        if (A < PID_TUNING.MIN_AMPLITUDE_C) {
            return { tuning: false, done: true, error: `Амплитуда слишком мала (A=${A.toFixed(2)}°C).` };
        }

        // 3. Ku = (4 * d) / (π * A), where d = stepPower / 2
        const d = this.stepPower / 2;
        const Ku = (4 * d) / (Math.PI * A);

        // 4. Ziegler-Nichols Classic PID:
        // Kp = 0.6 * Ku
        // Ti = 0.5 * Tu   → Ki = Kp / Ti = 1.2 * Ku / Tu
        // Td = 0.125 * Tu → Kd = Kp * Td = 0.075 * Ku * Tu
        const Kp = 0.6 * Ku;
        const Ki = (1.2 * Ku) / Tu;
        const Kd = 0.075 * Ku * Tu;

        const elapsed = ((Date.now() - this._startTime) / 60000).toFixed(1);

        log.info({
            elapsed,
            peaks: this.peaks.map(p => p.value.toFixed(1)),
            valleys: this.valleys.map(v => v.value.toFixed(1)),
            A: A.toFixed(2), Tu: Tu.toFixed(1), Ku: Ku.toFixed(2),
            Kp: Kp.toFixed(2), Ki: Ki.toFixed(3), Kd: Kd.toFixed(2),
        }, 'TUNING COMPLETE');

        return {
            tuning: false,
            done: true,
            results: { Kp, Ki, Kd, Ku, Tu, A },
            message: `Калибровка за ${elapsed} мин! Kp=${Kp.toFixed(1)}, Ki=${Ki.toFixed(2)}, Kd=${Kd.toFixed(1)}`
        };
    }

    /**
     * Build status response.
     */
    _status(power) {
        if (this.state === 'COMPUTING') {
            const result = this._computeResults();
            return { ...result, power: 0 };
        }

        return {
            tuning: true,
            done: false,
            power: power,
            state: this.state,
            cycle: this.currentCycle,
            maxCycles: this.targetCycles
        };
    }
}
