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
