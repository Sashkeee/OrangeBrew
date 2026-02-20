import { SerialPort, ReadlineParser } from 'serialport';
import EventEmitter from 'events';

export class RealSerial extends EventEmitter {
    constructor(portName, baudRate = 115200) {
        super();
        this.portName = portName;
        this.baudRate = baudRate;

        console.log(`[RealSerial] Connecting to ${portName} at ${baudRate} baud...`);

        this.port = new SerialPort({
            path: portName,
            baudRate: baudRate,
            autoOpen: false, // Open manually to catch errors cleanly
        });

        this.parser = this.port.pipe(new ReadlineParser({ delimiter: '\n' }));

        this._initEvents();
    }

    _initEvents() {
        this.port.on('open', () => {
            console.log(`[RealSerial] Successfully connected to ${this.portName}`);
            this.emit('connected');
        });

        this.port.on('close', () => {
            console.log(`[RealSerial] Disconnected from ${this.portName}`);
            this.emit('disconnected');
        });

        this.port.on('error', (err) => {
            console.error(`[RealSerial] Error:`, err.message);
            this.emit('error', err);
        });

        this.parser.on('data', (line) => {
            const dataStr = line.trim();
            if (!dataStr) return;

            try {
                const parsed = JSON.parse(dataStr);

                // If it's the raw HIL format, we map it into the format the backend expects.
                // For now, let's just use the first sensor as 'boiler' for testing purposes.
                // In future, this will be mapped via SQLite settings (Address <-> Role).
                if (parsed.type === 'sensors_raw' && parsed.sensors && parsed.sensors.length > 0) {
                    // Temporary mapping for the HIL stand: grab the first sensor
                    const temp = parsed.sensors[0].temp;

                    this.emit('data', {
                        type: 'sensors',
                        boiler: temp,
                        column: 20.0,
                        dephleg: 20.0,
                        output: 20.0,
                        timestamp: Date.now()
                    });
                } else if (parsed.type) {
                    this.emit('data', parsed);
                }

            } catch (e) {
                // Ignore non-JSON debug logs perfectly
                console.log(`[ESP32 Log] ${dataStr}`);
            }
        });
    }

    start() {
        this.port.open((err) => {
            if (err) {
                console.error(`[RealSerial] Error opening port:`, err.message);
                // Optionally retry here
            }
        });
    }

    stop() {
        if (this.port.isOpen) {
            this.port.close();
        }
    }

    write(commandStr) {
        if (this.port.isOpen) {
            // Ensure command ends with newline
            const payload = commandStr.endsWith('\n') ? commandStr : commandStr + '\n';
            this.port.write(payload, (err) => {
                if (err) {
                    console.error('[RealSerial] Write error:', err.message);
                }
            });
        }
    }
}
