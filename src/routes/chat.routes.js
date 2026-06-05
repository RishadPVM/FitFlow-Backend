const express = require('express');
const router = express.Router();
const controller = require('../controllers/chat.controller');
const { authenticate } = require('../middleware/auth.middleware');
const fs = require('fs');
const path = require('path');

// Public route for local upload fallback (mirrors S3 PUT)
router.put('/upload-local/*', (req, res, next) => {
  const wildcardPath = req.params[0];
  if (!wildcardPath) {
    return res.status(400).json({ success: false, message: 'Invalid path' });
  }

  const uploadDir = path.join(__dirname, '../../uploads');
  const filePath = path.join(uploadDir, wildcardPath);

  // Security check to avoid directory traversal
  if (!filePath.startsWith(uploadDir)) {
    return res.status(400).json({ success: false, message: 'Invalid path traversal' });
  }

  // Ensure directories exist
  fs.mkdirSync(path.dirname(filePath), { recursive: true });

  const writeStream = fs.createWriteStream(filePath);
  req.pipe(writeStream);

  writeStream.on('finish', () => {
    res.status(200).json({ success: true, message: 'File uploaded successfully' });
  });

  writeStream.on('error', (err) => {
    next(err);
  });
});

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
