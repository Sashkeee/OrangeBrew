import PidTuner from './pid/PidTuner.js';

let fakeTime = 1000000;
const originalDateNow = Date.now;
Date.now = () => fakeTime;

console.log('=== TEST: Fast system with debug ===');
const tuner = new PidTuner();
tuner.start(65, 100);

let temp = 25;
let result = { power: 100 };

for (let i = 0; i < 600; i++) {
    fakeTime += 1500;

    if (result && result.power > 0) temp += 0.8;
    else temp -= 0.4;

    const noise = (Math.random() - 0.5) * 0.6;
    const reading = temp + noise;
    result = tuner.update(reading);

    // Log key moments
    if (i % 10 === 0 && tuner.state === 'RELAY_OSCILLATION') {
        console.log(`  i=${i} | real=${temp.toFixed(1)} filt=${tuner._filteredTemp?.toFixed(1)} dir=${tuner._directionCounter} localMax=${tuner._localMax?.toFixed(1)} localMin=${tuner._localMin?.toFixed(1)} peaks=${tuner.peaks.length} valleys=${tuner.valleys.length} relay=${tuner._relayIsOn ? 'ON ' : 'OFF'}`);
    }

    if (result.done) {
        console.log(`\n  DONE after ${i} updates (${(i * 1.5 / 60).toFixed(1)} min)`);
        if (result.error) console.log(`  ERROR: ${result.error}`);
        else console.log(`  Kp=${result.results.Kp.toFixed(2)}, Ki=${result.results.Ki.toFixed(3)}, Kd=${result.results.Kd.toFixed(2)}, Tu=${result.results.Tu.toFixed(1)}s`);
        break;
    }
}

if (tuner.state !== 'DONE') {
    console.log(`  TIMEOUT. Peaks=${tuner.peaks.length}, Valleys=${tuner.valleys.length}`);
}

Date.now = originalDateNow;
