const express = require('express');
const router = express.Router();
const controller = require('../controllers/gym.overview.controller');

// Route for getting overview of a gym
router.get('/:gymId', controller.getGymOverview);

module.exports = router;