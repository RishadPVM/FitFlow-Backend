const express = require("express");
const router = express.Router();
const { authenticate } = require("../middleware/auth.middleware");
const {
  changePassword,
  requestEmailChange,
  verifyEmailChange,
  getSessions,
  logoutSession,
  logoutOtherSessions,
} = require("../controllers/auth/security.controller");

// Apply authenticate middleware to all security routes
router.use(authenticate);

// Password Change
router.patch("/change-password", changePassword);

// Email Change verification and execution
router.post("/request-email-change", requestEmailChange);
router.post("/verify-email-change", verifyEmailChange);

// Active Session/Device Management
router.get("/sessions", getSessions);
router.delete("/sessions/logout-other", logoutOtherSessions);
router.delete("/sessions/:sessionId", logoutSession);

module.exports = router;
