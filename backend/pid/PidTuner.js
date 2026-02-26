/**
 * Relay Auto-Tuner (Ziegler-Nichols Method)
 * Similar to AlexGyver's GyverPID Autotuner
 */

export default class PidTuner {
    constructor() {
        this.reset();
    }

    reset() {
        this.tuning = false;
        this.target = 0;
        this.stepPower = 100; // Output when heating during relay
        // Увеличили гистерезис, чтобы шум датчика не вызывал мгновенные переключения
        this.noiseBand = 1.0;

        this.state = 'IDLE'; // IDLE -> HEATING_INITIAL -> COOLING -> HEATING -> COOLING -> DONE

        this.peaks = [];
        this.valleys = [];
        this.crossings = []; // Timestamps of crossing the target

        this.currentMax = -999;
        this.currentMin = 999;

        this.targetCycles = 3;
        this.currentCycle = 0;
    }

    start(target, stepPower = 100) {
        this.reset();
        this.target = parseFloat(target) || 65.0; // Гарантируем число
        this.stepPower = parseFloat(stepPower) || 100;
        this.tuning = true;
        this.state = 'HEATING_INITIAL';
        this.currentMax = -999;
        this.currentMin = 999;

        console.log(`[PidTuner] Started tuning. Target: ${this.target}, Step: ${this.stepPower}%, NoiseBand: ${this.noiseBand}`);
        return this.stepPower;
    }

    update(currentTempStr) {
        if (!this.tuning) return { tuning: false };
        const currentTemp = parseFloat(currentTempStr);
        if (isNaN(currentTemp)) return { tuning: true, power: this.state === 'COOLING' ? 0 : this.stepPower };

        // Track local extremes
        if (currentTemp > this.currentMax) this.currentMax = currentTemp;
        if (currentTemp < this.currentMin) this.currentMin = currentTemp;

        let power = 0;

        switch (this.state) {
            case 'HEATING_INITIAL':
                power = this.stepPower;
                // Once we cross target + noise
                if (currentTemp >= this.target + this.noiseBand) {
                    this.state = 'COOLING';
                    this.crossings.push(Date.now());
                    this.currentMax = currentTemp; // Reset max tracker for the upcoming peak
                    this.currentMin = currentTemp; // Reset min tracker
                }
                break;

            case 'COOLING':
                power = 0;
                if (currentTemp <= this.target - this.noiseBand) {
                    this.state = 'HEATING';
                    this.crossings.push(Date.now());
                    this.peaks.push(this.currentMax); // Record the peak we just had
                    this.currentMin = currentTemp; // Reset min tracker
                }
                break;

            case 'HEATING':
                power = this.stepPower;
                if (currentTemp >= this.target + this.noiseBand) {
                    this.state = 'COOLING';
                    this.crossings.push(Date.now());
                    this.valleys.push(this.currentMin); // Record the valley we just had
                    this.currentMax = currentTemp;

                    this.currentCycle++;
                    if (this.currentCycle >= this.targetCycles) {
                        return this._finishTuning();
                    }
                }
                break;
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

    _finishTuning() {
        this.tuning = false;
        this.state = 'DONE';

        if (this.peaks.length === 0 || this.valleys.length === 0) {
            return { tuning: false, done: true, error: "Failed to detect peaks/valleys." };
        }

        // 1. Calculate Amplitude (A)
        const avgPeak = this.peaks.reduce((a, b) => a + b, 0) / this.peaks.length;
        const avgValley = this.valleys.reduce((a, b) => a + b, 0) / this.valleys.length;
        const A = (avgPeak - avgValley) / 2;

        // 2. Calculate Period (Tu) in seconds
        // Crossings list is [heat1->cool1, cool1->heat2, heat2->cool2, ...]
        // We look at the time between two consecutive 'COOLING' transitions
        let periods = [];
        for (let i = 2; i < this.crossings.length; i += 2) {
            let periodSeconds = (this.crossings[i] - this.crossings[i - 2]) / 1000;
            periods.push(periodSeconds);
        }

        let Tu = 0;
        if (periods.length > 0) {
            Tu = periods.reduce((a, b) => a + b, 0) / periods.length;
        } else {
            return { tuning: false, done: true, error: "Недостаточно циклов для расчета периода." };
        }

        // Защита от шумовых проскоков "за секунду"
        if (Tu < 3) {
            return { tuning: false, done: true, error: `Колебания слишком быстрые (Tu=${Tu.toFixed(1)}с). Похоже на шум датчика или датчик не погружен в жидкость.` };
        }

        if (A < 0.2) {
            return { tuning: false, done: true, error: `Амплитуда колебаний слишком мала (A=${A.toFixed(2)}).` };
        }

        // 3. Calculate Ultimate Gain (Ku)
        // Relay output amplitude (d) is (stepPower - 0) / 2? Or just stepPower.
        // The ZN Relay method states d = amplitude of the relay output. Since min is 0 and max is stepPower, 
        // the effective amplitude of the square wave is stepPower / 2.
        // Actually, classic formula: Ku = (4 * d) / (pi * a), where d is relay output step (peak-to-peak or center-to-peak).
        // If output goes from 0 to 100, amplitude d = 50. So 4 * 50 / (pi * A).
        const d = this.stepPower / 2;
        const Ku = (4 * d) / (Math.PI * A);

        // 4. Calculate Kp, Ki, Kd using Ziegler-Nichols (No Overshoot or Classic)
        // Использование Less-Overshoot (Tyreus-Luyben или Pessen) обычно лучше для пивоварения
        // Classic: Kp = 0.6 * Ku, Ki = 1.2 * Ku / Tu, Kd = 0.075 * Ku * Tu
        const Kp = 0.6 * Ku;
        const Ki = (1.2 * Ku) / Tu;
        const Kd = 0.075 * Ku * Tu;

        console.log(`[PidTuner] Tuning Complete! A=${A.toFixed(2)} Tu=${Tu.toFixed(1)}s Ku=${Ku.toFixed(2)}`);
        console.log(`[PidTuner] Results: Kp=${Kp.toFixed(2)} Ki=${Ki.toFixed(3)} Kd=${Kd.toFixed(2)}`);

        return {
            tuning: false,
            done: true,
            results: { Kp, Ki, Kd, Ku, Tu, A },
            message: `Успех! Kp=${Kp.toFixed(1)}, Ki=${Ki.toFixed(2)}, Kd=${Kd.toFixed(1)}`
        };
    }
}
