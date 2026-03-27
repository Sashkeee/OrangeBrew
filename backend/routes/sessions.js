import { Router } from 'express';
import { sessionQueries, recipeQueries, temperatureQueries, fractionQueries, fermentationQueries } from '../db/database.js';
import telegram from '../services/telegram.js';
import logger from '../utils/logger.js';
import { writeAudit } from '../utils/audit.js';

const log = logger.child({ module: 'Sessions' });
const router = Router();

/**
 * @openapi
 * /api/sessions:
 *   get:
 *     tags: [Sessions]
 *     summary: List brew sessions for current user
 *     description: Returns all sessions owned by the authenticated user. Optionally filter by session type.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [brewing, mash, boil, fermentation, distillation, rectification]
 *         description: Filter sessions by type
 *     responses:
 *       200:
 *         description: Array of sessions
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Session'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/', (req, res) => {
    try {
        const sessions = sessionQueries.getAll(req.user.id, req.query.type || null);
        res.json(sessions);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * @openapi
 * /api/sessions/{id}:
 *   get:
 *     tags: [Sessions]
 *     summary: Get a single session by ID
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Session ID
 *     responses:
 *       200:
 *         description: Session object
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Session'
 *       404:
 *         description: Session not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/:id', (req, res) => {
    try {
        const session = sessionQueries.getById(req.params.id, req.user.id);
        if (!session) return res.status(404).json({ error: 'Session not found' });
        res.json(session);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * @openapi
 * /api/sessions:
 *   post:
 *     tags: [Sessions]
 *     summary: Create a new brew session
 *     description: Creates a session and sends a Telegram notification.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [type]
 *             properties:
 *               recipe_id:
 *                 type: integer
 *                 description: Recipe to associate with this session
 *               type:
 *                 type: string
 *                 enum: [brewing, mash, boil, fermentation, distillation, rectification]
 *               status:
 *                 type: string
 *                 enum: [active, paused, completed, cancelled]
 *                 default: active
 *               notes:
 *                 type: string
 *                 default: ''
 *     responses:
 *       201:
 *         description: Created session
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Session'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post('/', async (req, res) => {
    try {
        log.info({ type: req.body.type }, 'Creating new session');
        const session = sessionQueries.create(req.body, req.user.id);

        let recipeName = '—';
        if (req.body.recipe_id) {
            const recipe = recipeQueries.getById(req.body.recipe_id, req.user.id);
            if (recipe) recipeName = recipe.name;
        }

        writeAudit({ userId: req.user.id, action: 'session.create', detail: `Started ${req.body.type || 'brew'} session, recipe: ${recipeName}` });
        log.info({ type: req.body.type, recipeName }, 'Notifying Telegram');
        telegram.setCurrentProcessType(req.body.type || 'brew');
        await telegram.notifyPhaseChange(
            req.body.type || 'brew',
            'Начало процесса',
            `Рецепт: *${recipeName}*`
        );

        res.status(201).json(session);
    } catch (err) {
        log.error({ err }, 'Error creating session');
        res.status(500).json({ error: err.message });
    }
});

/**
 * @openapi
 * /api/sessions/{id}:
 *   put:
 *     tags: [Sessions]
 *     summary: Update a session
 *     description: Partially update session fields (notes, status, etc.).
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Session ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [active, paused, completed, cancelled]
 *               notes:
 *                 type: string
 *     responses:
 *       200:
 *         description: Updated session
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Session'
 *       404:
 *         description: Session not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.put('/:id', (req, res) => {
    try {
        const session = sessionQueries.update(req.params.id, req.body, req.user.id);
        if (!session) return res.status(404).json({ error: 'Session not found' });
        res.json(session);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * @openapi
 * /api/sessions/{id}/complete:
 *   post:
 *     tags: [Sessions]
 *     summary: Mark session as completed
 *     description: Sets status to "completed", records finished_at timestamp, and sends a Telegram notification.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Session ID
 *     responses:
 *       200:
 *         description: Completed session
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Session'
 *       404:
 *         description: Session not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post('/:id/complete', (req, res) => {
    try {
        const session = sessionQueries.complete(req.params.id, req.user.id);
        if (!session) return res.status(404).json({ error: 'Session not found' });
        writeAudit({ userId: req.user.id, action: 'session.complete', detail: `Completed ${session.type || 'brew'} session #${req.params.id}` });
        telegram.notifyComplete(session.type || 'brew', { notes: session.notes });
        res.json(session);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * @openapi
 * /api/sessions/{id}:
 *   delete:
 *     tags: [Sessions]
 *     summary: Delete a session
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Session ID
 *     responses:
 *       200:
 *         description: Deletion confirmed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok:
 *                   type: boolean
 *                   example: true
 *       404:
 *         description: Session not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.delete('/:id', (req, res) => {
    try {
        const result = sessionQueries.delete(req.params.id, req.user.id);
        if (!result.changes) return res.status(404).json({ error: 'Session not found' });
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─── Temperature Log ──────────────────────────────────────

/**
 * @openapi
 * /api/sessions/{id}/temperatures:
 *   get:
 *     tags: [Sessions]
 *     summary: Get temperature log for a session
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Session ID
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 500
 *         description: Maximum number of entries to return
 *     responses:
 *       200:
 *         description: Array of temperature readings
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/TemperatureEntry'
 *       404:
 *         description: Session not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/:id/temperatures', (req, res) => {
    try {
        const session = sessionQueries.getById(req.params.id, req.user.id);
        if (!session) return res.status(404).json({ error: 'Session not found' });
        const limit = parseInt(req.query.limit) || 500;
        const temps = temperatureQueries.getBySession(req.params.id, limit);
        res.json(temps);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * @openapi
 * /api/sessions/{id}/temperatures:
 *   post:
 *     tags: [Sessions]
 *     summary: Add a temperature reading to a session
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Session ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [sensor, value]
 *             properties:
 *               sensor:
 *                 type: string
 *                 description: Sensor role name (e.g. "boiler", "column")
 *                 example: boiler
 *               value:
 *                 type: number
 *                 format: float
 *                 description: Temperature in Celsius
 *                 example: 65.3
 *     responses:
 *       201:
 *         description: Temperature entry recorded
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok:
 *                   type: boolean
 *                   example: true
 *       404:
 *         description: Session not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post('/:id/temperatures', (req, res) => {
    try {
        const session = sessionQueries.getById(req.params.id, req.user.id);
        if (!session) return res.status(404).json({ error: 'Session not found' });
        const { sensor, value } = req.body;
        temperatureQueries.insert(req.params.id, sensor, value);
        res.status(201).json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─── Fraction Log ─────────────────────────────────────────

/**
 * @openapi
 * /api/sessions/{id}/fractions:
 *   get:
 *     tags: [Sessions]
 *     summary: Get distillation fractions for a session
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Session ID
 *     responses:
 *       200:
 *         description: Array of fraction entries
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/FractionEntry'
 *       404:
 *         description: Session not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/:id/fractions', (req, res) => {
    try {
        const session = sessionQueries.getById(req.params.id, req.user.id);
        if (!session) return res.status(404).json({ error: 'Session not found' });
        const fractions = fractionQueries.getBySession(req.params.id);
        res.json(fractions);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * @openapi
 * /api/sessions/{id}/fractions:
 *   post:
 *     tags: [Sessions]
 *     summary: Add a distillation fraction entry
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Session ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [phase, volume]
 *             properties:
 *               phase:
 *                 type: string
 *                 enum: [heads, hearts, tails]
 *                 description: Distillation fraction phase
 *               volume:
 *                 type: number
 *                 format: float
 *                 description: Fraction volume in ml
 *                 example: 150
 *               abv:
 *                 type: number
 *                 format: float
 *                 description: Alcohol by volume (%)
 *                 example: 78.5
 *               temp_boiler:
 *                 type: number
 *                 format: float
 *                 nullable: true
 *                 description: Boiler temperature (°C)
 *               temp_column:
 *                 type: number
 *                 format: float
 *                 nullable: true
 *                 description: Column temperature (°C)
 *               notes:
 *                 type: string
 *                 default: ''
 *     responses:
 *       201:
 *         description: Fraction entry recorded
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok:
 *                   type: boolean
 *                   example: true
 *       404:
 *         description: Session not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post('/:id/fractions', (req, res) => {
    try {
        const session = sessionQueries.getById(req.params.id, req.user.id);
        if (!session) return res.status(404).json({ error: 'Session not found' });
        fractionQueries.insert({ session_id: req.params.id, ...req.body });
        res.status(201).json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─── Fermentation Entries ─────────────────────────────────

/**
 * @openapi
 * /api/sessions/{id}/fermentation:
 *   get:
 *     tags: [Sessions]
 *     summary: Get fermentation entries for a session
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Session ID
 *     responses:
 *       200:
 *         description: Array of fermentation entries
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/FermentationEntry'
 *       404:
 *         description: Session not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/:id/fermentation', (req, res) => {
    try {
        const session = sessionQueries.getById(req.params.id, req.user.id);
        if (!session) return res.status(404).json({ error: 'Session not found' });
        const entries = fermentationQueries.getBySession(req.params.id);
        res.json(entries);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * @openapi
 * /api/sessions/{id}/fermentation:
 *   post:
 *     tags: [Sessions]
 *     summary: Add a fermentation diary entry
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Session ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               stage:
 *                 type: string
 *                 default: primary
 *                 description: Fermentation stage
 *               temperature:
 *                 type: number
 *                 format: float
 *                 nullable: true
 *                 description: Temperature (°C)
 *               gravity:
 *                 type: number
 *                 format: float
 *                 nullable: true
 *                 description: Specific gravity (SG)
 *                 example: 1.045
 *               abv:
 *                 type: number
 *                 format: float
 *                 nullable: true
 *                 description: Alcohol by volume (%)
 *               notes:
 *                 type: string
 *                 default: ''
 *     responses:
 *       201:
 *         description: Fermentation entry recorded
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok:
 *                   type: boolean
 *                   example: true
 *       404:
 *         description: Session not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post('/:id/fermentation', (req, res) => {
    try {
        const session = sessionQueries.getById(req.params.id, req.user.id);
        if (!session) return res.status(404).json({ error: 'Session not found' });
        fermentationQueries.insert({ session_id: req.params.id, ...req.body });
        res.status(201).json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

export default router;
