const asyncHandler = require('../utils/async-handler');
const ApiResponse = require('../utils/api-response');
const jwtService = require('../services/jwt.service');


const signWithGoogle = asyncHandler(async (req, res, next) => {
  // Add logic
  res.status(201).json(new ApiResponse(201, {
    seccess : true,
    message: "Google login success",
    token : jwtService.generateToken({ id: 'dummy-id' }),
    
  }, 'User registered successfully'));
});


const signWithApple = asyncHandler(async (req, res, next) => {
  // Add logic
  const token = jwtService.generateToken({ id: 'dummy-id' });
  res.status(200).json(new ApiResponse(200, { token }, 'User logged in successfully'));
});


module.exports = { signWithGoogle, signWithApple };
