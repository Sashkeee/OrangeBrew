import express from 'express';
import { writeAudit } from '../utils/audit.js';

/**
 * Process router — читает req.processManager, который инжектируется middleware в server.js.
 * Каждый пользователь получает свой ProcessManager через Map<userId, ProcessManager>.
 */
const router = express.Router();

// ─── GET /api/process/status ──────────────────────────────────

/**
 * @openapi
 * /api/process/status:
 *   get:
 *     tags: [Process]
 *     summary: Get current process state
 *     description: Returns the current state of the user's brew process (IDLE, HEATING, HOLDING, PAUSED, COMPLETED).
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Current process state
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ProcessState'
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/status', (req, res) => {
    res.json(req.processManager.getState());
});

// ─── POST /api/process/start ──────────────────────────────────

/**
 * @openapi
 * /api/process/start:
 *   post:
 *     tags: [Process]
 *     summary: Start brew process
 *     description: Starts the brew process with a given recipe. The process follows steps defined in the recipe (mashing, boiling, etc.).
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [recipe]
 *             properties:
 *               recipe:
 *                 type: object
 *                 description: Recipe object with mash/boil steps
 *               sessionId:
 *                 type: integer
 *                 description: Brew session ID to log temperature data
 *                 example: 42
 *               mode:
 *                 type: string
 *                 description: Process mode (e.g. mash, boil, distillation)
 *                 example: mash
 *               deviceId:
 *                 type: string
 *                 description: ESP32 device ID to use (defaults to local_serial)
 *                 example: esp32_abc123
 *               sensorAddress:
 *                 type: string
 *                 description: DS18B20 sensor address for PID temperature input
 *                 example: 28-0516b4a1c3ff
 *     responses:
 *       200:
 *         description: Process started successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok:
 *                   type: boolean
 *                   example: true
 *                 state:
 *                   $ref: '#/components/schemas/ProcessState'
 *       400:
 *         description: Missing recipe or invalid parameters
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post('/start', (req, res) => {
    try {
        const { recipe, sessionId, mode, deviceId, sensorAddress } = req.body;
        if (!recipe) {
            return res.status(400).json({ error: 'Recipe is required' });
        }
        req.processManager.start(recipe, sessionId, mode, deviceId || 'local_serial', sensorAddress);
        writeAudit({ userId: req.user.id, action: 'process.start', detail: `Started ${mode || 'brew'} process` });
        res.json({ ok: true, state: req.processManager.getState() });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// ─── POST /api/process/stop ───────────────────────────────────

/**
 * @openapi
 * /api/process/stop:
 *   post:
 *     tags: [Process]
 *     summary: Stop brew process
 *     description: Stops the currently running brew process and resets state to IDLE.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Process stopped
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok:
 *                   type: boolean
 *                   example: true
 *                 state:
 *                   $ref: '#/components/schemas/ProcessState'
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post('/stop', (req, res) => {
    req.processManager.stop();
    writeAudit({ userId: req.user.id, action: 'process.stop', detail: 'Stopped process' });
    res.json({ ok: true, state: req.processManager.getState() });
});

// ─── POST /api/process/pause ──────────────────────────────────

/**
 * @openapi
 * /api/process/pause:
 *   post:
 *     tags: [Process]
 *     summary: Pause brew process
 *     description: Pauses the currently running brew process. Can be resumed later.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Process paused
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok:
 *                   type: boolean
 *                   example: true
 *                 state:
 *                   $ref: '#/components/schemas/ProcessState'
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post('/pause', (req, res) => {
    req.processManager.pause();
    res.json({ ok: true, state: req.processManager.getState() });
});

// ─── POST /api/process/resume ─────────────────────────────────

/**
 * @openapi
 * /api/process/resume:
 *   post:
 *     tags: [Process]
 *     summary: Resume paused process
 *     description: Resumes a previously paused brew process.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Process resumed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok:
 *                   type: boolean
 *                   example: true
 *                 state:
 *                   $ref: '#/components/schemas/ProcessState'
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post('/resume', (req, res) => {
    req.processManager.resume();
    res.json({ ok: true, state: req.processManager.getState() });
});

// ─── POST /api/process/skip ───────────────────────────────────

/**
 * @openapi
 * /api/process/skip:
 *   post:
 *     tags: [Process]
 *     summary: Skip current step
 *     description: Skips the current mash/boil step and advances to the next one.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Step skipped
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok:
 *                   type: boolean
 *                   example: true
 *                 state:
 *                   $ref: '#/components/schemas/ProcessState'
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post('/skip', (req, res) => {
    req.processManager.skip();
    res.json({ ok: true, state: req.processManager.getState() });
});

// ─── POST /api/process/tune-start ─────────────────────────────

/**
 * @openapi
 * /api/process/tune-start:
 *   post:
 *     tags: [Process]
 *     summary: Start PID autotune
 *     description: Starts the PID autotuning process using the relay method. Determines optimal Kp, Ki, Kd values.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               target:
 *                 type: number
 *                 description: Target temperature for autotuning (default 65)
 *                 example: 65
 *               sensorAddress:
 *                 type: string
 *                 description: DS18B20 sensor address to use for tuning
 *                 example: 28-0516b4a1c3ff
 *     responses:
 *       200:
 *         description: Autotune started
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Autotune started
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Failed to start autotune
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post('/tune-start', (req, res) => {
    try {
        const target = req.body.target || 65;
        const sensorAddress = req.body.sensorAddress || null;
        req.processManager.pidManager.startTuning(target, sensorAddress);
        res.json({ ok: true, message: 'Autotune started' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─── POST /api/process/tune-stop ──────────────────────────────

/**
 * @openapi
 * /api/process/tune-stop:
 *   post:
 *     tags: [Process]
 *     summary: Stop PID autotune
 *     description: Stops the currently running PID autotuning process.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Autotune stopped
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Autotune stopped
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Failed to stop autotune
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post('/tune-stop', (req, res) => {
    try {
        req.processManager.pidManager.stopTuning();
        res.json({ ok: true, message: 'Autotune stopped' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─── GET /api/process/tune-status ─────────────────────────────

/**
 * @openapi
 * /api/process/tune-status:
 *   get:
 *     tags: [Process]
 *     summary: Get autotune status
 *     description: Returns the current status of the PID autotuning process, including computed Kp, Ki, Kd if completed.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Autotune status
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 active:
 *                   type: boolean
 *                   description: Whether autotuning is currently running
 *                 target:
 *                   type: number
 *                   description: Target temperature
 *                 cycles:
 *                   type: integer
 *                   description: Number of relay cycles completed
 *                 result:
 *                   type: object
 *                   nullable: true
 *                   description: Computed PID parameters (null if not yet completed)
 *                   properties:
 *                     Kp:
 *                       type: number
 *                     Ki:
 *                       type: number
 *                     Kd:
 *                       type: number
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Failed to get autotune status
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/tune-status', (req, res) => {
    try {
        res.json(req.processManager.pidManager.getTunerStatus());
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

export default router;
