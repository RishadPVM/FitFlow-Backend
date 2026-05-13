const asyncHandler = require('../utils/async-handler');
const ApiResponse = require('../utils/api-response');
const prisma = require('../config/database');
const { verifyGoogleToken } = require('../services/google-auth.service');
const { generateAcessToken, generateRefreshToken, verifyAcessToken} = require('../services/jwt.service');
// const logger = require('../config/logger');


const signWithGoogle = asyncHandler(async (req, res, next) => {
  const { idToken , deviceType } = req.body;
  
  if (!idToken) {
   return res.status(400).json(new ApiResponse(400, {}, "Google ID token is required"));
       
  }
    if (!deviceType || (deviceType !== "ANDROID" && deviceType !== "IOS")) {
       return res.status(400).json(new ApiResponse(400, {},"Invalid device type , expected ANDROID or IOS"));
    }
   const payload = await verifyGoogleToken(idToken);
    const {
      sub: googleId,
      email,
      name,
      picture,
      email_verified,
    } = payload;

    if (!email_verified) {
      return res.status(400).json(new ApiResponse(400, {},
        "Google email is not verified"
      ));
    }

  const existingUser = await prisma.user.findUnique({
    where: { email },
  });

  if (!existingUser) {
    const newUser = await prisma.user.create({
      data: {
        email,
        name,
        profileImage : picture,
        deviceType : deviceType,
        googleId,
      },
    });


    const accessToken = generateAcessToken(newUser);
    const refreshToken = generateRefreshToken(newUser);

    return res.status(201).json(new ApiResponse(201, {
      user : newUser,
      accessToken: accessToken,
      refreshToken: refreshToken,
    }, 'User registered successfully'));
  }else{

    const accessToken = generateAcessToken(existingUser);
    const refreshToken = generateRefreshToken(existingUser);
    
    return res.status(200).json(new ApiResponse(200, {
      user : existingUser,
      accessToken: accessToken,
      refreshToken: refreshToken,
    }, 'User logged in successfully'));

  }
  
  

});


// const signWithApple = asyncHandler(async (req, res, next) => {
//   // Add logic
//   const token = jwtService.generateToken({ id: 'dummy-id' });
//   res.status(200).json(new ApiResponse(200, { token }, 'User logged in successfully'));
// });


module.exports = { signWithGoogle };
