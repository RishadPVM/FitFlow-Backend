const express = require('express');
const router = express.Router();
const controller = require('../controllers/gym.controller');
// const { authenticate } = require('../middleware/auth.middleware');

// Protect all routes
// router.use(authenticate);

router.route('/')
  .get(controller.getAllGyms);

router.route('/:id')
  .get(controller.getGym)
  .put(controller.updateGym)
  .delete(controller.deleteGym);

module.exports = router;
