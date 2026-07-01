const express = require('express');
const router = express.Router();
const controller = require('../controllers/chat.controller');
const { authenticate } = require('../middleware/auth.middleware');

// Protect all chat routes with JWT validation
router.use(authenticate);

router.route('/')
  .get(controller.getConversations)
  .post(controller.createConversation);

router.route('/:id/messages')
  .get(controller.getMessages);

router.route('/upload-ticket')
  .post(controller.getUploadTicket);

module.exports = router;
