import PidTuner from './pid/PidTuner.js';

console.log('Testing string target');
const tuner = new PidTuner();
tuner.start("65"); // simulate string input
console.log(tuner.update(40));
console.log(tuner.update(65));
console.log(tuner.update(66)); // string "65" + 0.5 = "650.5". 66 >= "650.5" is false
console.log(tuner.update(700)); // 700 >= "650.5" is false in string compare if 700 is cast to string, but 700 is number, compare to "650.5" -> 700 >= 650.5 is True.

console.log('Testing number target');
tuner.start(65);
console.log(tuner.update(40));
console.log(tuner.update(65.6)); // -> goes to COOLING
console.log(tuner.update(65.5)); // -> COOLING
console.log(tuner.update(64.4)); // -> HEATING
console.log(tuner.update(65.6)); // -> COOLING
console.log(tuner.update(64.4)); // -> HEATING
console.log(tuner.update(65.6)); // -> DONE
