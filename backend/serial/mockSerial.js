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

import { EventEmitter } from 'events';

export class MockSerial extends EventEmitter {
    constructor() {
        super();

        // Simulated temperatures
        this.temps = {
            boiler: 25.0,
            column: 25.0,
            dephleg: 20.0,
            output: 18.0,
            ambient: 22.0,
        };

        // Control state
        this.heater = 0;       // 0-100%
        this.cooler = 0;       // 0-100%
        this.pump = false;
        this.dephleg = 0;      // 0-100%

        this.isRunning = false;
        this.interval = null;
    }

    /**
     * Start the simulation loop (1 Hz).
     */
    start() {
        if (this.isRunning) return;
        this.isRunning = true;

        this.interval = setInterval(() => {
            this._simulate();
            this._emitReadings();
        }, 1000);

        console.log('[MockSerial] Simulation started');
        this.emit('connected');
    }

    /**
     * Stop the simulation.
     */
    stop() {
        if (this.interval) {
            clearInterval(this.interval);
            this.interval = null;
        }
        this.isRunning = false;
        console.log('[MockSerial] Simulation stopped');
        this.emit('disconnected');
    }

    /**
     * Process a command (same format as real serial protocol).
     */
    handleCommand(cmd) {
        switch (cmd.cmd) {
            case 'setHeater':
                this.heater = Math.min(100, Math.max(0, cmd.value || 0));
                this.emit('ack', { cmd: 'setHeater', ok: true });
                break;
            case 'setCooler':
                this.cooler = Math.min(100, Math.max(0, cmd.value || 0));
                this.emit('ack', { cmd: 'setCooler', ok: true });
                break;
            case 'setPump':
                this.pump = !!cmd.value;
                this.emit('ack', { cmd: 'setPump', ok: true });
                break;
            case 'setDephleg':
                this.dephleg = Math.min(100, Math.max(0, cmd.value || 0));
                this.emit('ack', { cmd: 'setDephleg', ok: true });
                break;
            case 'readSensors':
                this._emitReadings();
                break;
            case 'emergencyStop':
                this.heater = 0;
                this.cooler = 0;
                this.pump = false;
                this.dephleg = 0;
                this.emit('ack', { cmd: 'emergencyStop', ok: true });
                break;
            case 'ping':
                this.emit('pong');
                break;
            default:
                this.emit('error', { msg: `Unknown command: ${cmd.cmd}` });
        }
    }

    /**
     * Enable or disable physics simulation.
     * @param {boolean} enabled 
     */
    setSimulationEnabled(enabled) {
        this.simulationEnabled = enabled;
        console.log(`[MockSerial] Physics simulation ${enabled ? 'ENABLED' : 'DISABLED'}`);
    }

    /**
     * Manually set temperatures (useful when simulation is disabled).
     * @param {object} temps - partial object with boiler, column, dephleg, output, ambient
     */
    setTemperatures(temps) {
        this.temps = { ...this.temps, ...temps };
        this._emitReadings();
    }

    /**
     * Thermal simulation step. Runs every 1 second.
     */
    _simulate() {
        // If simulation is disabled, just emit current values (or do nothing if you only want manual updates)
        if (this.simulationEnabled === false) return;

        const dt = 1; // 1 second time step
        const ambient = this.temps.ambient;

        // ─── Boiler ───
        // Heater adds heat, environment cools
        const heatInput = (this.heater / 100) * 1.2 * dt;  // ~1.2°C/sec at 100%
        const heatLoss = (this.temps.boiler - ambient) * 0.008 * dt;
        this.temps.boiler += heatInput - heatLoss;

        // Cap at realistic max (water boils at 100°C)
        this.temps.boiler = Math.min(this.temps.boiler, 105);

        // ─── Column ───
        // Follows boiler with thermal lag
        const columnTarget = this.temps.boiler - 2;
        this.temps.column += (columnTarget - this.temps.column) * 0.15 * dt;

        // ─── Dephlegmator ───
        // Cools proportionally to dephleg power, heated by column vapor
        const dephlegCooling = (this.dephleg / 100) * 0.8 * dt;
        const dephlegHeating = (this.temps.column - this.temps.dephleg) * 0.1 * dt;
        this.temps.dephleg += dephlegHeating - dephlegCooling;
        this.temps.dephleg = Math.max(this.temps.dephleg, 10); // Can't go below 10°C

        // ─── Output ───
        // Product temp, influenced by column and cooler
        const coolerEffect = (this.cooler / 100) * 0.5 * dt;
        const outputHeating = (this.temps.column - this.temps.output) * 0.08 * dt;
        this.temps.output += outputHeating - coolerEffect;
        this.temps.output = Math.max(this.temps.output, 8); // Min 8°C

        // ─── Noise ───
        for (const key of Object.keys(this.temps)) {
            if (key === 'ambient') continue;
            this.temps[key] += (Math.random() - 0.5) * 0.3;
        }

        // ─── Clamp to 1 decimal ───
        for (const key of Object.keys(this.temps)) {
            this.temps[key] = Math.round(this.temps[key] * 10) / 10;
        }
    }

    /**
     * Emit sensor readings.
     */
    _emitReadings() {
        this.emit('sensors', { ...this.temps });
    }
}
