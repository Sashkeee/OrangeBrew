/**
 * Relay Auto-Tuner (Ziegler-Nichols Method)
 * 
 * Правильная реализация релейного автотюнинга:
 * 1. HEATING_INITIAL: нагрев до целевой температуры
 * 2. RELAY_OSCILLATION: релейные колебания с детекцией реальных пиков/впадин
 * 3. COMPUTING: расчёт Ku, Tu и коэффициентов ПИД
 * 
 * Ключевые защиты от ложных срабатываний:
 * - Экспоненциальное сглаживание температуры (EMA)
 * - Определение пиков/впадин по СМЕНЕ НАПРАВЛЕНИЯ температуры
 * - Минимальное время в каждом состоянии реле (минимум 10 сек)
 * - Подтверждение смены направления несколькими последовательными чтениями
 */

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

        // EMA filter for temperature smoothing
        this._emaAlpha = 0.25;     // Smoothing factor (0.0-1.0, lower = more smoothing)
        this._filteredTemp = null;  // Current filtered temperature

        // Relay state tracking
        this._relayIsOn = false;     // Current relay state (true = heating)
        this._relayLastSwitch = 0;   // Timestamp of last relay switch
        this._minRelayDwell = 15000; // Min 15 seconds in each relay state before switching

        // Direction tracking for peak/valley detection
        this._prevFilteredTemp = null;
        this._directionCounter = 0; // positive = rising for N samples, negative = falling for N samples
        this._confirmSamples = 4;   // Number of consistent direction samples to confirm a peak/valley

        // Tracking local extremes for peak/valley values
        this._localMax = -999;  // Tracks max since last valley
        this._localMin = 999;   // Tracks min since last peak

        // Detected peaks and valleys
        this.peaks = [];   // [{value, time}, ...]
        this.valleys = []; // [{value, time}, ...]

        this.targetCycles = 3; // Number of complete oscillation cycles needed
        this.currentCycle = 0;

        // Timing
        this._startTime = 0;
        this._updateCount = 0;
    }

    start(target, stepPower = 100) {
        this.reset();
        this.target = parseFloat(target) || 65.0;
        this.stepPower = parseFloat(stepPower) || 100;
        this.tuning = true;
        this.state = 'HEATING_INITIAL';
        this._startTime = Date.now();
        this._relayIsOn = true; // Start heating
        this._relayLastSwitch = Date.now();

        console.log(`[PidTuner] Started. Target: ${this.target}°C, StepPower: ${this.stepPower}%`);
        console.log(`[PidTuner] Phase 1: Heating to target temperature...`);
        return this.stepPower;
    }

    /**
     * Update the tuner with a new temperature reading.
     * Called every time a sensor update arrives (~1-2 seconds interval).
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

        // Apply EMA filter
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
                // Wait until filtered temp reaches target
                if (filtered >= this.target) {
                    console.log(`[PidTuner] Target ${this.target}°C reached (filtered: ${filtered.toFixed(1)}°C). Switching to relay oscillation.`);
                    this.state = 'RELAY_OSCILLATION';

                    // Initialize relay: we just reached target, so switch heater OFF
                    this._relayIsOn = false;
                    this._relayLastSwitch = Date.now();

                    // Reset tracking for oscillation detection
                    this._localMax = filtered;
                    this._localMin = filtered;
                    this._directionCounter = 0;
                    this._prevFilteredTemp = filtered;

                    power = 0;
                }
                break;

            case 'RELAY_OSCILLATION':
                power = this._runRelayOscillation(filtered);
                break;
        }

        return this._status(power);
    }

    /**
     * Core relay oscillation logic with robust peak/valley detection.
     */
    _runRelayOscillation(filtered) {
        const now = Date.now();
        const timeSinceLastSwitch = now - this._relayLastSwitch;

        // --- 1. RELAY LOGIC ---
        // Simple relay: above target → OFF, below target → ON
        // But enforce minimum dwell time to prevent rapid switching
        if (this._relayIsOn && filtered > this.target && timeSinceLastSwitch >= this._minRelayDwell) {
            // Switch relay OFF
            this._relayIsOn = false;
            this._relayLastSwitch = now;
            console.log(`[PidTuner] Relay OFF at ${filtered.toFixed(1)}°C (above target ${this.target}°C)`);
        } else if (!this._relayIsOn && filtered < this.target && timeSinceLastSwitch >= this._minRelayDwell) {
            // Switch relay ON
            this._relayIsOn = true;
            this._relayLastSwitch = now;
            console.log(`[PidTuner] Relay ON at ${filtered.toFixed(1)}°C (below target ${this.target}°C)`);
        }

        // --- 2. TRACK LOCAL EXTREMES ---
        if (filtered > this._localMax) this._localMax = filtered;
        if (filtered < this._localMin) this._localMin = filtered;

        // --- 3. DETECT DIRECTION CHANGE (PEAKS AND VALLEYS) ---
        const delta = filtered - this._prevFilteredTemp;
        const threshold = 0.02; // Minimum change to count as a direction

        if (delta > threshold) {
            // Temperature is rising
            if (this._directionCounter < 0) {
                // Was falling, now rising → possible VALLEY
                this._directionCounter = 1;
            } else {
                this._directionCounter++;
            }
        } else if (delta < -threshold) {
            // Temperature is falling
            if (this._directionCounter > 0) {
                // Was rising, now falling → possible PEAK
                this._directionCounter = -1;
            } else {
                this._directionCounter--;
            }
        }
        // If within ±threshold, don't change direction counter (deadband)

        // Confirm PEAK: was rising, then fell for confirmSamples readings
        if (this._directionCounter <= -this._confirmSamples) {
            if (this._localMax > this.target) {
                // Valid peak detected!
                const peakValue = this._localMax;
                const peakTime = now;

                // Only record if we have at least one valley (to form a complete half-cycle)
                // OR if this is the very first peak (after initial overshoot)
                if (this.peaks.length === 0 ||
                    (this.valleys.length > 0 && this.valleys.length >= this.peaks.length)) {
                    this.peaks.push({ value: peakValue, time: peakTime });
                    console.log(`[PidTuner] PEAK #${this.peaks.length} detected: ${peakValue.toFixed(1)}°C`);

                    this._checkCompletion();
                }
            }
            // Reset local max tracker after detecting a peak (start looking for valley)
            this._localMin = filtered;
            this._directionCounter = -1; // Keep direction as falling, but reset counter
        }

        // Confirm VALLEY: was falling, then rose for confirmSamples readings
        if (this._directionCounter >= this._confirmSamples) {
            if (this._localMin < this.target) {
                // Valid valley detected!
                const valleyValue = this._localMin;
                const valleyTime = now;

                // Only record if we have at least one peak before this valley
                if (this.peaks.length > this.valleys.length) {
                    this.valleys.push({ value: valleyValue, time: valleyTime });
                    console.log(`[PidTuner] VALLEY #${this.valleys.length} detected: ${valleyValue.toFixed(1)}°C`);

                    this._checkCompletion();
                }
            }
            // Reset local min tracker after detecting a valley (start looking for peak)
            this._localMax = filtered;
            this._directionCounter = 1; // Keep direction as rising, but reset counter
        }

        this._prevFilteredTemp = filtered;

        return this._relayIsOn ? this.stepPower : 0;
    }

    /**
     * Check if we have enough data to compute PID parameters.
     */
    _checkCompletion() {
        // We need at least targetCycles pairs of (peak, valley)
        const completeCycles = Math.min(this.peaks.length, this.valleys.length);

        // A full cycle requires at least 2 peaks (period = time between consecutive peaks)
        if (this.peaks.length >= this.targetCycles + 1 && this.valleys.length >= this.targetCycles) {
            // We have enough data!
            this.currentCycle = completeCycles;
            console.log(`[PidTuner] Enough oscillation data collected (${this.peaks.length} peaks, ${this.valleys.length} valleys). Computing...`);
            // Don't compute immediately - let the current update finish
            this.state = 'COMPUTING';
        } else {
            this.currentCycle = Math.max(0, this.peaks.length - 1);
        }
    }

    /**
     * Compute PID parameters from collected oscillation data.
     */
    _computeResults() {
        this.tuning = false;
        this.state = 'DONE';

        if (this.peaks.length < 2 || this.valleys.length < 1) {
            return { tuning: false, done: true, error: "Недостаточно данных колебаний для расчёта." };
        }

        // 1. Calculate Amplitude (A) = average (peak - valley) / 2
        const numPairs = Math.min(this.peaks.length, this.valleys.length);
        let amplitudeSum = 0;
        for (let i = 0; i < numPairs; i++) {
            amplitudeSum += (this.peaks[i].value - this.valleys[i].value);
        }
        const A = amplitudeSum / (2 * numPairs); // average half-amplitude

        // 2. Calculate Period Tu (average time between consecutive peaks)
        const periods = [];
        for (let i = 1; i < this.peaks.length; i++) {
            const periodSec = (this.peaks[i].time - this.peaks[i - 1].time) / 1000;
            periods.push(periodSec);
        }

        if (periods.length === 0) {
            return { tuning: false, done: true, error: "Недостаточно пиков для расчёта периода." };
        }

        const Tu = periods.reduce((a, b) => a + b, 0) / periods.length;

        // Validation
        if (Tu < 5) {
            return {
                tuning: false, done: true,
                error: `Период колебаний слишком мал (Tu=${Tu.toFixed(1)}с). Возможно, датчик не погружён в жидкость или слишком сильный шум.`
            };
        }

        if (A < 0.1) {
            return {
                tuning: false, done: true,
                error: `Амплитуда колебаний слишком мала (A=${A.toFixed(2)}°C). Попробуйте увеличить мощность ступени.`
            };
        }

        // 3. Calculate Ultimate Gain (Ku)
        // For relay output going from 0 to stepPower, the relay amplitude d = stepPower / 2
        // Ku = (4 * d) / (π * A)
        const d = this.stepPower / 2;
        const Ku = (4 * d) / (Math.PI * A);

        // 4. Ziegler-Nichols Classic PID formulas:
        // Kp = 0.6 * Ku
        // Ti = 0.5 * Tu   → Ki = Kp / Ti = 1.2 * Ku / Tu
        // Td = 0.125 * Tu → Kd = Kp * Td = 0.075 * Ku * Tu
        const Kp = 0.6 * Ku;
        const Ki = (1.2 * Ku) / Tu;
        const Kd = 0.075 * Ku * Tu;

        const elapsed = ((Date.now() - this._startTime) / 60000).toFixed(1);

        console.log(`[PidTuner] ====== TUNING COMPLETE ======`);
        console.log(`[PidTuner] Duration: ${elapsed} min`);
        console.log(`[PidTuner] Peaks: ${this.peaks.map(p => p.value.toFixed(1)).join(', ')}°C`);
        console.log(`[PidTuner] Valleys: ${this.valleys.map(v => v.value.toFixed(1)).join(', ')}°C`);
        console.log(`[PidTuner] Amplitude A = ${A.toFixed(2)}°C`);
        console.log(`[PidTuner] Period Tu = ${Tu.toFixed(1)}s`);
        console.log(`[PidTuner] Ultimate Gain Ku = ${Ku.toFixed(2)}`);
        console.log(`[PidTuner] → Kp=${Kp.toFixed(2)}, Ki=${Ki.toFixed(3)}, Kd=${Kd.toFixed(2)}`);

        return {
            tuning: false,
            done: true,
            results: { Kp, Ki, Kd, Ku, Tu, A },
            message: `Калибровка завершена за ${elapsed} мин! Kp=${Kp.toFixed(1)}, Ki=${Ki.toFixed(2)}, Kd=${Kd.toFixed(1)}`
        };
    }

    /**
     * Build status response object.
     */
    _status(power) {
        // If we just entered COMPUTING state, perform the computation
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
