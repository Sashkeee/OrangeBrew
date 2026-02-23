import express from 'express';
import { deviceQueries } from '../db/database.js';

const router = express.Router();

// GET all devices
router.get('/', (req, res) => {
    try {
        const devices = deviceQueries.getAll();
        res.json(devices);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PATCH update device (rename or change role)
router.patch('/:id', (req, res) => {
    try {
        const { id } = req.params;
        const { name, role } = req.body;

        if (name) deviceQueries.rename(id, name);
        if (role) deviceQueries.setRole(id, role);

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE a device
router.delete('/:id', (req, res) => {
    try {
        deviceQueries.delete(req.params.id);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

export default router;
