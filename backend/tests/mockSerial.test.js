import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MockSerial } from '../serial/mockSerial.js';

describe('MockSerial', () => {
    let serial;

    beforeEach(() => {
        vi.useFakeTimers();
        serial = new MockSerial();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    // ─── Initialization ───────────────────────────────────────

    describe('initialization', () => {
        it('should start with default temperatures', () => {
            expect(serial.temps.boiler).toBe(20.0);
            expect(serial.temps.column).toBe(20.0);
            expect(serial.temps.dephleg).toBe(20.0);
            expect(serial.temps.output).toBe(20.0);
        });

        it('should start with all controls off', () => {
            expect(serial.heaterPower).toBe(0);
            expect(serial.coolerPower).toBe(0);
            expect(serial.dephlegPower).toBe(0);
            expect(serial.pumpOn).toBe(false);
        });

        it('should have simulation enabled by default', () => {
            expect(serial.simulationEnabled).toBe(true);
        });
    });

    // ─── Command Processing ───────────────────────────────────

    describe('write() — command processing', () => {
        it('should set heater power', () => {
            serial.write(JSON.stringify({ cmd: 'setHeater', value: 75 }));
            expect(serial.heaterPower).toBe(75);
        });

        it('should set cooler power', () => {
            serial.write(JSON.stringify({ cmd: 'setCooler', value: 50 }));
            expect(serial.coolerPower).toBe(50);
        });

        it('should set pump on/off', () => {
            serial.write(JSON.stringify({ cmd: 'setPump', value: true }));
            expect(serial.pumpOn).toBe(true);

            serial.write(JSON.stringify({ cmd: 'setPump', value: false }));
            expect(serial.pumpOn).toBe(false);
        });

        it('should set dephlegmator power and mode', () => {
            serial.write(JSON.stringify({ cmd: 'setDephleg', value: 60, mode: 'auto' }));
            expect(serial.dephlegPower).toBe(60);
            expect(serial.dephlegMode).toBe('auto');
        });

        it('should handle dephleg without mode', () => {
            serial.write(JSON.stringify({ cmd: 'setDephleg', value: 40 }));
            expect(serial.dephlegPower).toBe(40);
            expect(serial.dephlegMode).toBe('manual'); // unchanged
        });

        it('should handle emergencyStop', () => {
            serial.write(JSON.stringify({ cmd: 'setHeater', value: 100 }));
            serial.write(JSON.stringify({ cmd: 'setPump', value: true }));
            serial.write(JSON.stringify({ cmd: 'setCooler', value: 80 }));
            serial.write(JSON.stringify({ cmd: 'setDephleg', value: 60 }));

            serial.write(JSON.stringify({ cmd: 'emergencyStop' }));

            expect(serial.heaterPower).toBe(0);
            expect(serial.coolerPower).toBe(0);
            expect(serial.dephlegPower).toBe(0);
            expect(serial.pumpOn).toBe(false);
        });

        it('should not crash on invalid JSON', () => {
            expect(() => serial.write('not json')).not.toThrow();
        });

        it('should not crash on empty string', () => {
            expect(() => serial.write('')).not.toThrow();
        });
    });

    // ─── Temperature Override ─────────────────────────────────

    describe('setTemperatures()', () => {
        it('should override specific temperatures', () => {
            serial.setTemperatures({ boiler: 95.5, column: 80.0 });
            expect(serial.temps.boiler).toBe(95.5);
            expect(serial.temps.column).toBe(80.0);
            expect(serial.temps.dephleg).toBe(20.0); // unchanged
        });

        it('should merge with existing temps', () => {
            serial.setTemperatures({ output: 30 });
            expect(serial.temps.boiler).toBe(20.0);
            expect(serial.temps.output).toBe(30);
        });
    });

    // ─── Simulation Toggle ────────────────────────────────────

    describe('setSimulationEnabled()', () => {
        it('should toggle simulation', () => {
            serial.setSimulationEnabled(false);
            expect(serial.simulationEnabled).toBe(false);

            serial.setSimulationEnabled(true);
            expect(serial.simulationEnabled).toBe(true);
        });
    });

    // ─── Data Emission ────────────────────────────────────────

    describe('data emission', () => {
        it('should emit sensor data every second', () => {
            const dataHandler = vi.fn();
            serial.on('data', dataHandler);

            vi.advanceTimersByTime(1000);
            expect(dataHandler).toHaveBeenCalled();

            const sensorCall = dataHandler.mock.calls.find(c => c[0].type === 'sensors');
            expect(sensorCall).toBeTruthy();
            expect(sensorCall[0]).toHaveProperty('boiler');
            expect(sensorCall[0]).toHaveProperty('column');
            expect(sensorCall[0]).toHaveProperty('dephleg');
            expect(sensorCall[0]).toHaveProperty('output');
            expect(sensorCall[0]).toHaveProperty('timestamp');
        });

        it('should emit control state every second', () => {
            const dataHandler = vi.fn();
            serial.on('data', dataHandler);

            vi.advanceTimersByTime(1000);

            const controlCall = dataHandler.mock.calls.find(c => c[0].type === 'control');
            expect(controlCall).toBeTruthy();
            expect(controlCall[0]).toHaveProperty('heater');
            expect(controlCall[0]).toHaveProperty('cooler');
            expect(controlCall[0]).toHaveProperty('pump');
            expect(controlCall[0]).toHaveProperty('dephleg');
        });

        it('should emit data even when simulation is disabled', () => {
            serial.setSimulationEnabled(false);
            const dataHandler = vi.fn();
            serial.on('data', dataHandler);

            vi.advanceTimersByTime(1000);
            expect(dataHandler).toHaveBeenCalled();
        });
    });

    // ─── Physics Simulation ───────────────────────────────────

    describe('physics simulation', () => {
        it('boiler should heat when heater is on', () => {
            serial.write(JSON.stringify({ cmd: 'setHeater', value: 100 }));
            const initial = serial.temps.boiler;

            vi.advanceTimersByTime(5000);
            expect(serial.temps.boiler).toBeGreaterThan(initial);
        });

        it('boiler temperature should not exceed 105', () => {
            serial.write(JSON.stringify({ cmd: 'setHeater', value: 100 }));
            vi.advanceTimersByTime(600000); // 10 min
            expect(serial.temps.boiler).toBeLessThanOrEqual(105);
        });

        it('temperatures should stay at ~20 with no heater', () => {
            vi.advanceTimersByTime(10000);
            // With no heater, temps should stay near 20
            expect(serial.temps.boiler).toBeGreaterThanOrEqual(19);
            expect(serial.temps.boiler).toBeLessThanOrEqual(21);
        });

        it('should not update physics when simulation is disabled', () => {
            serial.setSimulationEnabled(false);
            serial.setTemperatures({ boiler: 50 });
            serial.write(JSON.stringify({ cmd: 'setHeater', value: 100 }));

            vi.advanceTimersByTime(5000);
            // Temperature should remain at 50 (no physics)
            expect(serial.temps.boiler).toBe(50);
        });
    });

    // ─── start/stop ───────────────────────────────────────────

    describe('start() and stop()', () => {
        it('start() should emit connected event', () => {
            const handler = vi.fn();
            serial.on('connected', handler);
            serial.start();
            expect(handler).toHaveBeenCalledOnce();
        });

        it('stop() should emit disconnected event', () => {
            const handler = vi.fn();
            serial.on('disconnected', handler);
            serial.stop();
            expect(handler).toHaveBeenCalledOnce();
        });
    });
});
