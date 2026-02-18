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

const EventEmitter = require('events');

class MockSerial extends EventEmitter {
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
            if (!this.simulationEnabled) return;

            // --- Physics Model ---

            // Boiler heating/cooling
            // 100% power adds ~0.4°C/sec, ambient cooling ~0.02°C/sec
            const heatInput = (this.heaterPower / 100) * 0.4;
            const heatLoss = (this.temps.boiler - 20) * 0.003;
            const noise = (Math.random() - 0.5) * 0.1;

            this.temps.boiler = Math.max(20, Math.min(105, this.temps.boiler + heatInput - heatLoss + noise));

            // Column heating (coupled to boiler with lag)
            const boilerCoupling = (this.temps.boiler - this.temps.column) * 0.05;
            const columnLoss = (this.temps.column - 20) * 0.005;
            // Dephlegmator cooling
            const dephlegCooling = (this.dephlegPower / 100) * 1.5; // Strong cooling effect

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

            // Emit sensor data
            this.emit('data', {
                type: 'sensors',
                ...this.temps,
                timestamp: Date.now()
            });

            // Emit control state updates
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
