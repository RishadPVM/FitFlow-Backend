const express = require('express');
const router = express.Router();
const noticeController = require('../controllers/notice.controller');

router.route('/')
  .post(noticeController.createNotice)
  .get(noticeController.getNotices);

router.route('/gym/:gymId')
  .get(noticeController.getGymNotices);

router.route('/:id')
  .delete(noticeController.deleteNotice);

module.exports = router;
