import PidTuner from './pid/PidTuner.js';

// ============================================================
// ТЕСТ 1: Имитация реального теплового процесса (минуты)
// ============================================================
console.log('=== TEST 1: Simulated real thermal process ===');

const tuner = new PidTuner();
tuner.start(65, 100);

// Override Date.now to simulate real time progression
let fakeTime = Date.now();
const originalDateNow = Date.now;
Date.now = () => fakeTime;

// Simulation parameters
let temp = 25.0;  // Starting temperature
const dt = 1.5;   // Sensor update interval in seconds
const noise = 0.3; // Sensor noise amplitude (DS18B20 typical)

// Thermal model parameters
const heatingRate = 0.15;  // °C per update when heater ON at 100%
const coolingRate = 0.03;  // °C per update natural cooling rate
const thermalLag = 0.7;    // Thermal inertia factor (0-1, higher = more lag)

let lastResult = null;
let updateCount = 0;
const maxUpdates = 2000; // Safety limit (~50 minutes at 1.5s intervals)

function addNoise(t) {
    return t + (Math.random() - 0.5) * 2 * noise;
}

while (updateCount < maxUpdates) {
    fakeTime += dt * 1000; // Advance time
    updateCount++;

    // Simple thermal model
    if (lastResult && lastResult.power > 0) {
        temp += heatingRate * (lastResult.power / 100) * thermalLag;
    }
    // Natural cooling (towards ambient ~20°C)
    temp -= coolingRate * (temp - 20) / 50;

    const sensorReading = addNoise(temp);
    lastResult = tuner.update(sensorReading);

    // Log every 30 updates (~45 seconds)
    if (updateCount % 30 === 0) {
        console.log(`  t=${(updateCount * dt / 60).toFixed(1)}min | real=${temp.toFixed(1)}°C sensor=${sensorReading.toFixed(1)}°C | state=${lastResult.state || 'DONE'} power=${lastResult.power}% cycle=${lastResult.cycle || '-'}/${lastResult.maxCycles || '-'}`);
    }

    if (lastResult.done) {
        console.log('\n--- TUNING COMPLETED ---');
        if (lastResult.error) {
            console.log(`ERROR: ${lastResult.error}`);
        } else {
            console.log(`Results: Kp=${lastResult.results.Kp.toFixed(2)}, Ki=${lastResult.results.Ki.toFixed(3)}, Kd=${lastResult.results.Kd.toFixed(2)}`);
            console.log(`Ku=${lastResult.results.Ku.toFixed(2)}, Tu=${lastResult.results.Tu.toFixed(1)}s, A=${lastResult.results.A.toFixed(2)}°C`);
        }
        console.log(`Total updates: ${updateCount}, Elapsed simulation: ${(updateCount * dt / 60).toFixed(1)} min`);
        break;
    }
}

if (updateCount >= maxUpdates) {
    console.log('!!! Timed out - tuning did not complete within simulation limit !!!');
    console.log(`  Peaks: ${tuner.peaks.length}, Valleys: ${tuner.valleys.length}`);
}

// ============================================================
// ТЕСТ 2: Проверка защиты от шумовых данных
// ============================================================
console.log('\n=== TEST 2: Noise-only data (should NOT fast-forward) ===');

const tuner2 = new PidTuner();
fakeTime = originalDateNow();
Date.now = () => fakeTime;

tuner2.start(65, 100);

// Simulate: reach target, then oscillate only with noise (no real thermal oscillation)
let temp2 = 25.0;
for (let i = 0; i < 300; i++) { // 300 * 1.5s = 7.5 minutes
    fakeTime += 1500;
    if (temp2 < 65) {
        temp2 += 0.2; // Heat up
    } else {
        temp2 = 65 + (Math.random() - 0.5) * 1.0; // Just noise around target
    }
    const result = tuner2.update(temp2);

    if (result.done) {
        console.log(`  DONE after ${i} updates (${(i * 1.5 / 60).toFixed(1)} min)`);
        if (result.error) {
            console.log(`  ERROR (expected): ${result.error}`);
        } else {
            console.log(`  UNEXPECTED SUCCESS with noise-only data!`);
        }
        break;
    }
}

const peakCount2 = tuner2.peaks.length;
const valleyCount2 = tuner2.valleys.length;
console.log(`  After 7.5min: Peaks=${peakCount2}, Valleys=${valleyCount2}, State=${tuner2.state}`);
if (peakCount2 < 2 && tuner2.state === 'RELAY_OSCILLATION') {
    console.log('  ✓ PASS: Noise did NOT cause fast-forwarding.');
} else if (tuner2.state === 'RELAY_OSCILLATION') {
    console.log('  ✓ PASS: Still oscillating (not enough cycles from noise alone).');
} else if (tuner2.state === 'HEATING_INITIAL') {
    console.log('  ✓ PASS: Still in initial heating phase.');
}

// Restore
Date.now = originalDateNow;

console.log('\n=== ALL TESTS DONE ===');
