const express = require('express');
const router = express.Router();
const { signWithGoogle } = require('../controllers/auth.controller');
// const { authenticate } = require('../middleware/auth.middleware');


router.post('/sign-with-google', signWithGoogle);
// router.post('/sign-with-apple', signWithApple);



module.exports = router;
