const express = require("express");
const router = express.Router();
const { signWithGoogle } = require("../controllers/auth/user.auth.controller");
const { createGym } = require("../controllers/auth/gym.auth.controller");
// const { authenticate } = require('../middleware/auth.middleware');

router.post("/sign-with-google", signWithGoogle);
router.post("/create-gym", createGym);
// router.post('/sign-with-apple', signWithApple);

module.exports = router;
