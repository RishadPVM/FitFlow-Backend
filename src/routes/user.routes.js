const express = require('express');
const router = express.Router();
const controller = require('../controllers/user.controller');
const memberController = require('../controllers/member.controller');
// const { authenticate } = require('../middleware/auth.middleware');

// Protect all routes
// router.use(authenticate);

// Member Detail routes
router.route('/members/:id')
  .get(memberController.getMemberDetail);

router.route('/members/:id/membership')
  .patch(memberController.updateMemberMembership);

router.route('/members/:id/attendance')
  .get(memberController.getMemberAttendance);

router.route('/members/:id/history')
  .get(memberController.getMemberHistory);

router.route('/')
  .get(controller.getUsers);

router.route('/:id')
  .get(controller.getUser)
  .put(controller.updateUser)
  .delete(controller.deleteUser);

router.route('/:id/upload-ticket')
  .post(controller.getProfileUploadTicket);

router.route('/:id/payments')
  .get(controller.getUserPayments);

router.route('/join-gym-and-plan/:userId')
  .post(controller.joinGymAndPlan);

router.route('/remove-gym-and-plan/:userId')
  .delete(controller.removeGymAndPlan);

module.exports = router;
