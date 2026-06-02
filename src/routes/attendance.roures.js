const express = require('express');
const router = express.Router();
const controller = require('../controllers/attendance.controller');
const { authenticate } = require('../middleware/auth.middleware');

// Secure all endpoints with admin authenticate middleware
router.post('/start-session', authenticate, controller.startSession);
router.get('/active-session', authenticate, controller.getActiveSession);
router.post('/refresh-qr', authenticate, controller.refreshQr);
router.post('/stop-session', authenticate, controller.stopSession);
router.post('/manual-entry', authenticate, controller.manualEntry);
router.get('/present-today', authenticate, controller.getPresentToday);

module.exports = router;