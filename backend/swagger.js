import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';

const options = {
    definition: {
        openapi: '3.0.3',
        info: {
            title: 'OrangeBrew API',
            version: '0.1.0',
            description: 'IoT brewing & distillation automation platform. ESP32/ESP8266 sensors → Node.js backend → React frontend.',
        },
        servers: [
            { url: '/', description: 'Current host' },
        ],
        components: {
            securitySchemes: {
                bearerAuth: {
                    type: 'http',
                    scheme: 'bearer',
                    bearerFormat: 'JWT',
                    description: 'JWT token from POST /auth/login',
                },
            },
            schemas: {
                Error: {
                    type: 'object',
                    properties: {
                        error: { type: 'string' },
                    },
                },
                User: {
                    type: 'object',
                    properties: {
                        id:                      { type: 'integer' },
                        username:                { type: 'string' },
                        email:                   { type: 'string', format: 'email' },
                        role:                    { type: 'string', enum: ['user', 'admin'] },
                        subscription_tier:       { type: 'string', enum: ['free', 'trial', 'pro'] },
                        subscription_status:     { type: 'string', enum: ['active', 'expired', 'cancelled'] },
                        subscription_expires_at: { type: 'string', format: 'date-time', nullable: true },
                    },
                },
                AuthResponse: {
                    type: 'object',
                    properties: {
                        message: { type: 'string' },
                        token:   { type: 'string' },
                        user:    { $ref: '#/components/schemas/User' },
                    },
                },
                ProcessState: {
                    type: 'object',
                    properties: {
                        status:          { type: 'string', enum: ['IDLE', 'HEATING', 'HOLDING', 'PAUSED', 'COMPLETED'], description: 'Current process state' },
                        currentStep:     { type: 'integer', nullable: true, description: 'Index of the current recipe step' },
                        totalSteps:      { type: 'integer', nullable: true, description: 'Total number of steps in the recipe' },
                        targetTemp:      { type: 'number', nullable: true, description: 'Target temperature for current step (°C)' },
                        currentTemp:     { type: 'number', nullable: true, description: 'Current sensor temperature (°C)' },
                        holdTimeLeft:    { type: 'number', nullable: true, description: 'Remaining hold time in seconds' },
                        mode:            { type: 'string', nullable: true, description: 'Process mode (mash, boil, distillation)' },
                        deviceId:        { type: 'string', nullable: true, description: 'ESP32 device ID in use' },
                        sensorAddress:   { type: 'string', nullable: true, description: 'DS18B20 sensor address in use' },
                        heaterOn:        { type: 'boolean', description: 'Whether the heater relay is on' },
                        pidOutput:       { type: 'number', nullable: true, description: 'Current PID output (0-100%)' },
                    },
                },
                Device: {
                    type: 'object',
                    properties: {
                        id:         { type: 'string', description: 'Unique device identifier (from ESP32)' },
                        user_id:    { type: 'integer' },
                        name:       { type: 'string', description: 'User-assigned display name', nullable: true },
                        role:       { type: 'string', description: 'Device role', nullable: true },
                        api_key:    { type: 'string', description: 'Per-device authentication key' },
                        status:     { type: 'string', enum: ['online', 'offline'] },
                        created_at: { type: 'string', format: 'date-time' },
                        last_seen:  { type: 'string', format: 'date-time', nullable: true },
                    },
                },
                Session: {
                    type: 'object',
                    properties: {
                        id:          { type: 'integer' },
                        recipe_id:   { type: 'integer', nullable: true },
                        device_id:   { type: 'string', nullable: true },
                        type:        { type: 'string', enum: ['brewing', 'mash', 'boil', 'fermentation', 'distillation', 'rectification'] },
                        status:      { type: 'string', enum: ['active', 'paused', 'completed', 'cancelled'] },
                        started_at:  { type: 'string', format: 'date-time' },
                        finished_at: { type: 'string', format: 'date-time', nullable: true },
                        notes:       { type: 'string' },
                        user_id:     { type: 'integer' },
                    },
                },
                TemperatureEntry: {
                    type: 'object',
                    properties: {
                        id:         { type: 'integer' },
                        session_id: { type: 'integer' },
                        sensor:     { type: 'string', description: 'Sensor role (e.g. boiler, column)' },
                        value:      { type: 'number', format: 'float', description: 'Temperature in °C' },
                        timestamp:  { type: 'string', format: 'date-time' },
                    },
                },
                FractionEntry: {
                    type: 'object',
                    properties: {
                        id:          { type: 'integer' },
                        session_id:  { type: 'integer' },
                        phase:       { type: 'string', enum: ['heads', 'hearts', 'tails'] },
                        volume:      { type: 'number', format: 'float', description: 'Volume in ml' },
                        abv:         { type: 'number', format: 'float', nullable: true },
                        temp_boiler: { type: 'number', format: 'float', nullable: true },
                        temp_column: { type: 'number', format: 'float', nullable: true },
                        notes:       { type: 'string' },
                        timestamp:   { type: 'string', format: 'date-time' },
                    },
                },
                FermentationEntry: {
                    type: 'object',
                    properties: {
                        id:          { type: 'integer' },
                        session_id:  { type: 'integer' },
                        stage:       { type: 'string', description: 'Fermentation stage (e.g. primary)' },
                        temperature: { type: 'number', format: 'float', nullable: true },
                        gravity:     { type: 'number', format: 'float', nullable: true, description: 'Specific gravity (SG)' },
                        abv:         { type: 'number', format: 'float', nullable: true },
                        notes:       { type: 'string' },
                        timestamp:   { type: 'string', format: 'date-time' },
                    },
                },
                SensorConfig: {
                    type: 'object',
                    properties: {
                        address: { type: 'string', description: 'OneWire sensor address', example: '28-3c01f096b4aa' },
                        name:    { type: 'string', description: 'User-assigned sensor name', example: 'Boiler top' },
                        color:   { type: 'string', nullable: true, description: 'HEX colour for UI charting', example: '#ff6600' },
                        offset:  { type: 'number', description: 'Calibration offset in °C', example: -0.5 },
                        enabled: { type: 'boolean', description: 'Whether the sensor is active', example: true },
                    },
                },
            },
        },
        security: [{ bearerAuth: [] }],
        tags: [
            { name: 'Auth',      description: 'Authentication — login, register, current user' },
            { name: 'Process',   description: 'Brew process control — start, stop, pause, resume, skip' },
            { name: 'Sensors',   description: 'Temperature sensors — readings, discovery, config' },
            { name: 'Recipes',   description: 'Recipe CRUD, import/export, scaling' },
            { name: 'Social',    description: 'Recipe social features — likes, comments, public recipes' },
            { name: 'Sessions',  description: 'Brew sessions — temperature logs, fractions, fermentation' },
            { name: 'Devices',   description: 'ESP32 device management and pairing' },
            { name: 'Control',   description: 'Heater, pump, cooler, dephlegmator control' },
            { name: 'Settings',  description: 'PID, Kalman, Telegram settings' },
            { name: 'BeerXML',   description: 'BeerXML import/export' },
            { name: 'Users',     description: 'User management (admin)' },
            { name: 'Telegram',  description: 'Telegram notifications' },
            { name: 'Debug',     description: 'Debug endpoints (mock, PID)' },
            { name: 'Health',    description: 'Health check' },
        ],
    },
    apis: ['./routes/*.js', './server.js'],
};

const swaggerSpec = swaggerJsdoc(options);

export { swaggerUi, swaggerSpec };
