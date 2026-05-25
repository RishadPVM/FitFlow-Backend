const express = require('express');
const router = express.Router();
const controller = require('../controllers/user.controller');
// const { authenticate } = require('../middleware/auth.middleware');

// Protect all routes
// router.use(authenticate);

router.route('/')
  .get(controller.getUsers);

router.route('/:id')
  .get(controller.getUser)
  .put(controller.updateUser)
  .delete(controller.deleteUser);

router.route('/join-gym-and-plan/:userId')
  .post(controller.joinGymAndPlan);

router.route('/remove-gym-and-plan/:userId')
  .delete(controller.removeGymAndPlan);

module.exports = router;
