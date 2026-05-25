const express = require('express');
const router = express.Router();
const controller = require('../controllers/membership-plan.controller');


router.post('/create-plan', controller.createMembershipPlan);
router.get('/gym/:gymcode', controller.getMembershipPlansByGymId);

router.route('/:id')
// .get(controller.getMembershipPlansByGymId)
.get(controller.getMembershipPlanById)
.put(controller.updateMembershipPlan)
.delete(controller.deleteMembershipPlan);

module.exports = router;