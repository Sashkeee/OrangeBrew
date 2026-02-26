import PIDController from './pid/PIDController.js';

console.log("=== STARTING PID TEST ===");
const pid = new PIDController(5.0, 0.1, 1.0, 1.0);
pid.setTarget(65);
pid.setEnabled(true);

console.log("--> HEAT UP");
for (let t = 40; t <= 65; t += 5) {
    const p = pid.computeHeating(t, 5);
    console.log(`Temp: ${t} -> power: ${p}`);
}

console.log("--> SWITCH TO HOLDING");
pid.resetIntegral(); // what happens in PidManager switch
console.log(`Temp: 65 -> power: ${pid.compute(65)}`);

console.log("--> TEMP EXCEEDS TARGET");
console.log(`Temp: 66 -> power: ${pid.compute(66)}`);
console.log(`Temp: 67 -> power: ${pid.compute(67)}`);
console.log(`Temp: 68 -> power: ${pid.compute(68)}`);

console.log("--> TEMP DROPS BELOW TARGET");
console.log(`Temp: 64 -> power: ${pid.compute(64)}`);
console.log(`Temp: 63 -> power: ${pid.compute(63)}`);
console.log(`Temp: 60 -> power: ${pid.compute(60)}`);
