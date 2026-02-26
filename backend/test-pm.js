import ProcessManager from './services/ProcessManager.js';
import PidManager from './pid/PidManager.js';
import PIDController from './pid/PIDController.js';

// Setup Mock settings query
import { settingsQueries } from './db/database.js';
settingsQueries.getAll = () => ({ pid: { kp: 5.0, ki: 0.1, kd: 1.0 } });
settingsQueries.get = () => null;

import * as sessionQueries from './db/database.js';
// Override to skip DB writes
for (const key of Object.keys(sessionQueries)) {
    if (sessionQueries[key] && typeof sessionQueries[key] === 'object') {
        sessionQueries[key].create = () => ({ id: 1, type: 'mash', status: 'active' });
        sessionQueries[key].update = () => { };
        sessionQueries[key].cancel = () => { };
        sessionQueries[key].complete = () => { };
    }
}

// Override control function 
import * as control from './routes/control.js';
control.setHeaterState = (val) => {
    // console.log(`HEATER STATE SET TO: ${val}%`);
};
control.getControlState = () => ({});
control.setPumpState = () => { };

// Telegram override
import telegram from './services/telegram.js';
telegram.setCurrentProcessType = () => { };
telegram.notifyPhaseChange = () => { };
telegram.notifyMashStep = () => { };

console.log("=== STARTING FULL PROCESS MANAGER TEST ===");
const pidManager = new PidManager(null);
const processManager = new ProcessManager(pidManager);

const recipe = {
    id: 1,
    name: "Test Recipe",
    mash_steps: [
        { name: "First Pause", temp: 65, duration: 10 }
    ]
};

processManager.start(recipe, 'mash', 'mock_device', 'abc');

console.log("--> HEAT UP");
for (let t = 40; t <= 68; t += 1) {
    const data = {
        boiler: t,
        sensors: [{ address: 'abc', temp: t }]
    };
    processManager.handleSensorData('mock_device', data);
    pidManager.update(data);
}

// Let timer tick a bit
for (let i = 0; i < 5; i++) {
    processManager.updateLoop();
}

console.log("--> DROP TEMP");
for (let t = 68; t >= 64; t -= 1) {
    const data = {
        boiler: t,
        sensors: [{ address: 'abc', temp: t }]
    };
    processManager.handleSensorData('mock_device', data);
    pidManager.update(data);
}
