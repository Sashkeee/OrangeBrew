/**
 * MockSerial — simulates ESP32 behavior for development without hardware.
 * 
 * Provides realistic sensor readings with a thermal model:
 * - Boiler heats proportional to heater power, loses heat to environment
 * - Column follows boiler with delay
 * - Dephlegmator cools based on coolant power
 * - Output follows dephlegmator/column
 * - Random noise ±0.3°C
 */

import EventEmitter from 'events';

export class MockSerial extends EventEmitter {
    constructor() {
        super();
        this.heaterPower = 0; // 0-100%
        this.pumpOn = false;
        this.coolerPower = 0;
        this.dephlegPower = 0; // 0-100%
        this.dephlegMode = 'manual';

        // Temperatures
        this.temps = {
            boiler: 20.0,
            column: 20.0,
            dephleg: 20.0,
            output: 20.0
        };

        this.simulationEnabled = true;

        this._simulate(); // Start simulation loop immediately
    }

    /**
     * This method is no longer used. The simulation starts in the constructor.
     */
    start() {
        console.log('[MockSerial] Simulation started');
        this.emit('connected');
    }

    /**
     * This method is no longer used. The simulation runs continuously.
     */
    stop() {
        console.log('[MockSerial] Simulation stopped');
        this.emit('disconnected');
    }

    /**
     * Call this periodically to simulate physics
     */
    _simulate() {
        setInterval(() => {
            // --- Physics Model (only when simulation enabled) ---
            if (this.simulationEnabled) {
                // Boiler heating/cooling
                const heatInput = (this.heaterPower / 100) * 0.4;
                const heatLoss = (this.temps.boiler - 20) * 0.003;
                const noise = (Math.random() - 0.5) * 0.1;

                this.temps.boiler = Math.max(20, Math.min(105, this.temps.boiler + heatInput - heatLoss + noise));

                // Column heating (coupled to boiler with lag)
                const boilerCoupling = (this.temps.boiler - this.temps.column) * 0.05;
                const columnLoss = (this.temps.column - 20) * 0.005;
                const dephlegCooling = (this.dephlegPower / 100) * 1.5;

                this.temps.column = Math.max(20, this.temps.column + boilerCoupling - columnLoss - dephlegCooling);

                // Dephlegmator sensor behavior
                const columnCoupling = (this.temps.column - this.temps.dephleg) * 0.1;
                const dephlegDirectCooling = (this.dephlegPower / 100) * 2.0;
                this.temps.dephleg = Math.max(15, this.temps.dephleg + columnCoupling - dephlegDirectCooling + (Math.random() - 0.5) * 0.05);

                // Output sensor
                const outputCoupling = (this.temps.dephleg - this.temps.output) * 0.05;
                const productCooling = (this.coolerPower / 100) * 1.0;
                this.temps.output = Math.max(10, this.temps.output + outputCoupling - productCooling);

                // Round all temperatures to 1 decimal place
                for (const key in this.temps) {
                    this.temps[key] = Math.round(this.temps[key] * 10) / 10;
                }
            }

            // Always emit data (even in manual mode, so frontend sees updates)
            this.emit('data', {
                type: 'sensors',
                ...this.temps,
                timestamp: Date.now()
            });

            this.emit('data', {
                type: 'control',
                heater: Math.round(this.heaterPower),
                cooler: this.coolerPower,
                pump: this.pumpOn,
                dephleg: this.dephlegPower,
                dephlegMode: this.dephlegMode,
                timestamp: Date.now()
            });

        }, 1000);
    }

    /**
     * Process a command (same format as real serial protocol).
     */
    write(commandStr) {
        try {
            const cmd = JSON.parse(commandStr);
            console.log('[MockSerial] Received:', cmd);

            if (cmd.cmd === 'setHeater') this.heaterPower = parseFloat(cmd.value);
            if (cmd.cmd === 'setCooler') this.coolerPower = parseFloat(cmd.value);
            if (cmd.cmd === 'setPump') this.pumpOn = !!cmd.value;
            if (cmd.cmd === 'setDephleg') {
                this.dephlegPower = parseFloat(cmd.value);
                if (cmd.mode) this.dephlegMode = cmd.mode;
            }

            if (cmd.cmd === 'emergencyStop') {
                this.heaterPower = 0;
                this.pumpOn = false;
                this.coolerPower = 0;
                this.dephlegPower = 0;
            }

        } catch (e) {
            console.error('[MockSerial] Parse error:', e);
        }
    }

    /**
     * Manually set temperatures (useful when simulation is disabled).
     * @param {object} temps - partial object with boiler, column, dephleg, output
     */
    setTemperatures(temps) {
        this.temps = { ...this.temps, ...temps };
    }

    /**
     * Enable or disable physics simulation.
     * @param {boolean} enabled
     */
    setSimulationEnabled(enabled) {
        this.simulationEnabled = enabled;
        console.log(`[MockSerial] Physics simulation ${enabled ? 'ENABLED' : 'DISABLED'}`);
    }
}
