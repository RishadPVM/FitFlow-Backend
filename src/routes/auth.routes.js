const express = require("express");
const router = express.Router();
const { signWithGoogle } = require("../controllers/auth/user.auth.controller");
const { createGym, loginGym, signupOtp, verifySignupOtp } = require("../controllers/auth/gym.auth.controller");
const { forgotPassword, verifyOtp, resetPassword } = require("../controllers/auth/forgot-password.controller");
const { authRateLimiter } = require("../middleware/rate-limit.middleware");
// const { authenticate } = require('../middleware/auth.middleware');

router.post("/sign-with-google", signWithGoogle);
router.post("/create-gym", createGym);
router.post("/login-gym", loginGym);
router.post("/forgot-password", authRateLimiter, forgotPassword);
router.post("/verify-otp", authRateLimiter, verifyOtp);
router.post("/reset-password", resetPassword);
router.post("/signup-otp", authRateLimiter, signupOtp);
router.post("/verify-signup-otp", authRateLimiter, verifySignupOtp);
// router.post('/sign-with-apple', signWithApple);

module.exports = router;
