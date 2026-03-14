/**
 * MockSerial — simulates ESP32 behavior for development without hardware.
 *
 * Provides realistic sensor readings with a thermal model:
 * - Boiler heats proportional to heater power, loses heat to environment
 * - Column follows boiler with delay
 * - Dephlegmator cools based on coolant power
 * - Output follows dephlegmator/column
 * - Random noise ±0.1°C
 *
 * Multi-device support (Plan 8):
 * - Each virtual device has its own independent state
 * - createDevice(deviceId, userId) registers a new virtual device
 * - Backward-compatible: default device 'mock-default' works as before
 */

import EventEmitter from 'events';

// ─── Single-device state factory ──────────────────────────

function createDeviceState() {
    return {
        heaterPower:  0,
        pumpOn:       false,
        coolerPower:  0,
        dephlegPower: 0,
        dephlegMode:  'manual',
        simulationEnabled: true,
        temps: {
            boiler:  20.0,
            column:  20.0,
            dephleg: 20.0,
            output:  20.0,
        },
    };
}

// ─── Physics step (shared across all devices) ─────────────

function physicsStep(state) {
    if (!state.simulationEnabled) return;

    const { temps } = state;

    // Boiler
    const heatInput = (state.heaterPower / 100) * 0.4;
    const heatLoss  = (temps.boiler - 20) * 0.003;
    const noise     = (Math.random() - 0.5) * 0.1;
    temps.boiler = Math.max(20, Math.min(105, temps.boiler + heatInput - heatLoss + noise));

    // Column
    const boilerCoupling  = (temps.boiler - temps.column) * 0.05;
    const columnLoss      = (temps.column - 20) * 0.005;
    const dephlegCooling  = (state.dephlegPower / 100) * 1.5;
    temps.column = Math.max(20, temps.column + boilerCoupling - columnLoss - dephlegCooling);

    // Dephlegmator
    const columnCoupling      = (temps.column - temps.dephleg) * 0.1;
    const dephlegDirectCooling = (state.dephlegPower / 100) * 2.0;
    temps.dephleg = Math.max(15, temps.dephleg + columnCoupling - dephlegDirectCooling + (Math.random() - 0.5) * 0.05);

    // Output
    const outputCoupling = (temps.dephleg - temps.output) * 0.05;
    const productCooling = (state.coolerPower / 100) * 1.0;
    temps.output = Math.max(10, temps.output + outputCoupling - productCooling);

    // Round to 1 decimal
    for (const key of Object.keys(temps)) {
        temps[key] = Math.round(temps[key] * 10) / 10;
    }
}

// ─── MockSerial class ─────────────────────────────────────

export class MockSerial extends EventEmitter {
    constructor() {
        super();

        // Default single-device state (backward-compatible)
        this._state = createDeviceState();

        // Multi-device map: deviceId → state
        this._devices = new Map();

        this.simulationEnabled = true; // global flag

        this._simulate();
    }

    // ── Backward-compatible single-device API ───────────────

    get heaterPower()  { return this._state.heaterPower;  }
    get pumpOn()       { return this._state.pumpOn;       }
    get coolerPower()  { return this._state.coolerPower;  }
    get dephlegPower() { return this._state.dephlegPower; }
    get dephlegMode()  { return this._state.dephlegMode;  }
    get temps()        { return this._state.temps;        }

    set heaterPower(v)  { this._state.heaterPower  = v; }
    set pumpOn(v)       { this._state.pumpOn       = v; }
    set coolerPower(v)  { this._state.coolerPower  = v; }
    set dephlegPower(v) { this._state.dephlegPower = v; }
    set dephlegMode(v)  { this._state.dephlegMode  = v; }

    /** @deprecated Legacy — simulation starts in constructor. */
    start() {
        console.log('[MockSerial] Simulation started');
        this.emit('connected');
    }

    /** @deprecated Legacy. */
    stop() {
        console.log('[MockSerial] Simulation stopped');
        this.emit('disconnected');
    }

    /**
     * Process a command for the default device (backward-compatible).
     * @param {string} commandStr — JSON string
     */
    write(commandStr) {
        this._applyCommand(this._state, commandStr);
    }

    /**
     * Manually set temperatures on the default device.
     * @param {object} temps
     */
    setTemperatures(temps) {
        this._state.temps = { ...this._state.temps, ...temps };
    }

    /**
     * Enable/disable physics simulation on the default device.
     * @param {boolean} enabled
     */
    setSimulationEnabled(enabled) {
        this._state.simulationEnabled = enabled;
        this.simulationEnabled = enabled;
        console.log(`[MockSerial] Physics simulation ${enabled ? 'ENABLED' : 'DISABLED'}`);
    }

    // ── Multi-device API ────────────────────────────────────

    /**
     * Create (or reset) a virtual device.
     * @param {string} deviceId — unique device id
     * @param {number} userId   — owner (stored for reference)
     * @returns {object} The device state object
     */
    createDevice(deviceId, userId = null) {
        const state = createDeviceState();
        state._userId = userId;
        this._devices.set(deviceId, state);
        console.log(`[MockSerial] Virtual device created: ${deviceId} (user=${userId})`);
        return state;
    }

    /**
     * Remove a virtual device.
     * @param {string} deviceId
     */
    removeDevice(deviceId) {
        this._devices.delete(deviceId);
    }

    /**
     * Send a command to a specific virtual device.
     * @param {string} deviceId
     * @param {string} commandStr — JSON command string
     */
    writeToDevice(deviceId, commandStr) {
        const state = this._devices.get(deviceId);
        if (!state) {
            console.warn(`[MockSerial] Unknown device: ${deviceId}`);
            return;
        }
        this._applyCommand(state, commandStr);
    }

    /**
     * Get current sensor/control data for a specific device.
     * @param {string} deviceId
     * @returns {{ sensors: object, control: object } | null}
     */
    getDeviceData(deviceId) {
        const state = this._devices.get(deviceId);
        if (!state) return null;
        return {
            sensors: { ...state.temps, timestamp: Date.now() },
            control: {
                heater: Math.round(state.heaterPower),
                cooler: state.coolerPower,
                pump:   state.pumpOn,
                dephleg: state.dephlegPower,
                dephlegMode: state.dephlegMode,
            },
        };
    }

    /**
     * Set temperatures on a specific virtual device.
     * @param {string} deviceId
     * @param {object} temps
     */
    setDeviceTemperatures(deviceId, temps) {
        const state = this._devices.get(deviceId);
        if (!state) return;
        state.temps = { ...state.temps, ...temps };
    }

    /**
     * Simulate a safety alert on a device.
     * Emits 'device:alert' event with { deviceId, type }.
     * @param {string} deviceId
     * @param {'ethanol'|'leak'|'overpressure'|'level'} type
     */
    simulateAlert(deviceId, type) {
        this.emit('device:alert', { deviceId, type });
        console.log(`[MockSerial] Simulated alert on device ${deviceId}: ${type}`);
    }

    /** List all registered virtual device ids. */
    getDeviceIds() {
        return [...this._devices.keys()];
    }

    // ── Private helpers ─────────────────────────────────────

    _applyCommand(state, commandStr) {
        try {
            const cmd = JSON.parse(commandStr);
            console.log('[MockSerial] Received:', cmd);

            if (cmd.cmd === 'setHeater')  state.heaterPower  = parseFloat(cmd.value);
            if (cmd.cmd === 'setCooler')  state.coolerPower  = parseFloat(cmd.value);
            if (cmd.cmd === 'setPump')    state.pumpOn       = !!cmd.value;
            if (cmd.cmd === 'setDephleg') {
                state.dephlegPower = parseFloat(cmd.value);
                if (cmd.mode) state.dephlegMode = cmd.mode;
            }
            if (cmd.cmd === 'emergencyStop') {
                state.heaterPower  = 0;
                state.pumpOn       = false;
                state.coolerPower  = 0;
                state.dephlegPower = 0;
            }
        } catch (e) {
            console.error('[MockSerial] Parse error:', e);
        }
    }

    _simulate() {
        setInterval(() => {
            // Default device
            physicsStep(this._state);
            this.emit('data', {
                type: 'sensors',
                ...this._state.temps,
                timestamp: Date.now(),
            });
            this.emit('data', {
                type: 'control',
                heater:      Math.round(this._state.heaterPower),
                cooler:      this._state.coolerPower,
                pump:        this._state.pumpOn,
                dephleg:     this._state.dephlegPower,
                dephlegMode: this._state.dephlegMode,
                timestamp:   Date.now(),
            });

            // All virtual devices
            for (const [deviceId, state] of this._devices) {
                physicsStep(state);
                this.emit('device:data', {
                    deviceId,
                    userId: state._userId,
                    sensors: { ...state.temps, timestamp: Date.now() },
                    control: {
                        heater:      Math.round(state.heaterPower),
                        cooler:      state.coolerPower,
                        pump:        state.pumpOn,
                        dephleg:     state.dephlegPower,
                        dephlegMode: state.dephlegMode,
                    },
                });
            }
        }, 1000);
    }
}
