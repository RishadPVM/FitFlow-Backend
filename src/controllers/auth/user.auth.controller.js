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
    include : {
      gym : true,
      currentMembershipPlan: true,
    }
  });

  const user = existingUser || await prisma.user.create({
    data: {
      email,
      name,
      profileImage: picture,
      deviceType: deviceType,
      googleId,
    },
    include : {
      gym : true,
      currentMembershipPlan: true,
    }
  });

  // Create active session
  const session = await prisma.session.create({
    data: {
      userId: user.id,
      role: 'USER',
      deviceName: req.body.deviceName || req.headers['x-device-name'] || (deviceType === 'ANDROID' ? 'Android Device' : 'iOS Device'),
      deviceType: deviceType,
      ipAddress: req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress,
    },
  });

  const accessToken = generateAcessToken(user, session.id);
  const refreshToken = generateRefreshToken(user, session.id);

  return res.status(existingUser ? 200 : 201).json(
    new ApiResponse(
      existingUser ? 200 : 201,
      {
        user,
        accessToken,
        refreshToken,
      },
      existingUser ? "User logged in successfully" : "User registered successfully",
    ),
  );
  } catch (error) {
    return next(error);
  }
});



module.exports = { signWithGoogle };
