const asyncHandler = require("../../utils/async-handler");
const ApiResponse = require("../../utils/api-response");
const AppError = require("../../utils/app-error");
const prisma = require("../../config/database");
const { verifyGoogleToken } = require("../../services/google-auth.service");
const {
  generateAcessToken,
  generateRefreshToken,
  verifyAcessToken,
} = require("../../services/jwt.service");
// const logger = require('../config/logger');

const signWithGoogle = asyncHandler(async (req, res, next) => {
  try {
    
  const { idToken, deviceType } = req.body;

  if (!idToken) {
    throw new AppError(400, null, 'Google ID token is required');
  }
  if (!deviceType || (deviceType !== "ANDROID" && deviceType !== "IOS")) {
    throw new AppError(400, null, 'Invalid device type , expected ANDROID or IOS');
  }
  const payload = await verifyGoogleToken(idToken);
  const { sub: googleId, email, name, picture, email_verified } = payload;

  if (!email_verified) {
    throw new AppError(400, null, 'Google email is not verified');
  }

  const existingUser = await prisma.user.findUnique({
    where: { email },
  });

  if (!existingUser) {
    const newUser = await prisma.user.create({
      data: {
        email,
        name,
        profileImage: picture,
        deviceType: deviceType,
        googleId,
      },
    });

    const accessToken = generateAcessToken(newUser);
    const refreshToken = generateRefreshToken(newUser);

    return res.status(201).json(
      new ApiResponse(
        201,
        {
          user: newUser,
          accessToken: accessToken,
          refreshToken: refreshToken,
        },
        "User registered successfully",
      ),
    );
  } else {
    const accessToken = generateAcessToken(existingUser);
    const refreshToken = generateRefreshToken(existingUser);

    return res.status(200).json(
      new ApiResponse(
        200,
        {
          user: existingUser,
          accessToken: accessToken,
          refreshToken: refreshToken,
        },
        "User logged in successfully",
      ),
    );
  }
  } catch (error) {
    return next(error);
  }
});



module.exports = { signWithGoogle };
