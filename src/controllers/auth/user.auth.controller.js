const asyncHandler = require("../../utils/async-handler");
const ApiResponse = require("../../utils/api-response");
const prisma = require("../../config/database");
const { verifyGoogleToken } = require("../../services/google-auth.service");
const {
  generateAcessToken,
  generateRefreshToken,
  verifyAcessToken,
} = require("../../services/jwt.service");
// const logger = require('../config/logger');

const signWithGoogle = asyncHandler(async (req, res, next) => {
  const { idToken, deviceType } = req.body;

  if (!idToken) {
    return res
      .status(400)
      .json(new ApiResponse(400, {}, "Google ID token is required"));
  }
  if (!deviceType || (deviceType !== "ANDROID" && deviceType !== "IOS")) {
    return res
      .status(400)
      .json(
        new ApiResponse(
          400,
          {},
          "Invalid device type , expected ANDROID or IOS",
        ),
      );
  }
  const payload = await verifyGoogleToken(idToken);
  const { sub: googleId, email, name, picture, email_verified } = payload;

  if (!email_verified) {
    return res
      .status(400)
      .json(new ApiResponse(400, {}, "Google email is not verified"));
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
});

const gymOwnerSignup = asyncHandler(async (req, res) => {
  const {
    // User fields
    ownerName,
    email,
    phone,
    password,

    // Gym fields
    gymName,
    gymAbout,
    establishedYear,

    whatsappNumber,
    alternatePhone,
    website,

    addressLine1,
    addressLine2,
    city,
    district,
    state,
    country,
    postalCode,
    latitude,
    longitude,

    workingHours,
    is24Hours,

    logoUrl,
    coverImageUrl,

    instagramUrl,
    facebookUrl,
    youtubeUrl,

    currency,
    timezone,
    maxMembers,

    gstNumber,
    licenseNumber,
  } = req.body;


  const requiredFields = {
    ownerName,
    email,
    phone,
    password,
    gymName,
    addressLine1,
    city,
    state,
    postalCode,
  };

  for (const [fieldName, value] of Object.entries(requiredFields)) {
    if (value === undefined || value === null || String(value).trim() === "") {
      throw new ApiError(400, `${fieldName} is required`);
    }
  }

  // Password validation
  if (password.length < 8) {
    throw new ApiError(400, "Password must be at least 8 characters long");
  }

  // Established year validation
  if (establishedYear) {
    const currentYear = new Date().getFullYear();
    if (establishedYear < 1900 || establishedYear > currentYear) {
      throw new ApiError(400, "Invalid established year");
    }
  }

  // =====================================================
  // DUPLICATE CHECKS
  // =====================================================

  // Existing user by email
  const existingUserByEmail = await prisma.user.findUnique({
    where: { email: email.toLowerCase().trim() },
  });

  if (existingUserByEmail) {
    throw new ApiError(409, "Email already registered");
  }

  // Existing user by phone
  const existingUserByPhone = await prisma.user.findUnique({
    where: { phone: phone.trim() },
  });

  if (existingUserByPhone) {
    throw new ApiError(409, "Phone number already registered");
  }

  // Existing gym by email
  const existingGymByEmail = await prisma.gym.findUnique({
    where: { email: email.toLowerCase().trim() },
  });

  if (existingGymByEmail) {
    throw new ApiError(409, "Gym with this email already exists");
  }

  // Existing gym by phone
  const existingGymByPhone = await prisma.gym.findUnique({
    where: { phone: phone.trim() },
  });

  if (existingGymByPhone) {
    throw new ApiError(409, "Gym with this phone number already exists");
  }

  // =====================================================
  // PASSWORD HASHING
  // =====================================================
  const hashedPassword = await bcrypt.hash(password, 12);

  // =====================================================
  // GENERATE UNIQUE GYM CODE
  // =====================================================
  const gymCode =
    "GYM-" + Math.random().toString(36).substring(2, 8).toUpperCase();

  // =====================================================
  // DATABASE TRANSACTION
  // =====================================================
  const result = await prisma.$transaction(async (tx) => {
    // 1. Create user
    const user = await tx.user.create({
      data: {
        name: ownerName.trim(),
        email: email.toLowerCase().trim(),
        phone: phone.trim(),
        password: hashedPassword,
        role: "GYM_OWNER",
        isActive: true,
        isVerified: false,
      },
    });

    // 2. Create gym
    const gym = await tx.gym.create({
      data: {
        gymCode,
        gymName: gymName.trim(),
        ownerName: ownerName.trim(),
        gymAbout: gymAbout?.trim(),
        establishedYear,

        email: email.toLowerCase().trim(),
        phone: phone.trim(),
        whatsappNumber,
        alternatePhone,
        website,

        addressLine1,
        addressLine2,
        city,
        district,
        state,
        country: country || "India",
        postalCode,
        latitude,
        longitude,

        workingHours,
        is24Hours: is24Hours || false,

        logoUrl,
        coverImageUrl,

        currency: currency || "INR",
        timezone: timezone || "Asia/Kolkata",
        maxMembers: maxMembers ? parseInt(maxMembers) : null,

        instagramUrl,
        facebookUrl,
        youtubeUrl,

        gstNumber,
        licenseNumber,

        status: "PENDING",
        isActive: false,
        isVerified: false,
      },
    });

    // 3. Optional relation update if your schema contains gymId
    // await tx.user.update({
    //   where: { id: user.id },
    //   data: { gymId: gym.id },
    // });

    return { user, gym };
  });

  // =====================================================
  // TOKEN GENERATION
  // =====================================================
  const accessToken = generateAcessToken(result.user);
  const refreshToken = generateRefreshToken(result.user);

  // Remove password from response
  const { password: _, ...safeUser } = result.user;

  // =====================================================
  // RESPONSE
  // =====================================================
  return res.status(201).json(
    new ApiResponse(
      201,
      {
        user: safeUser,
        gym: result.gym,
        accessToken,
        refreshToken,
      },
      "Gym registration submitted successfully. Your account is pending approval.",
    ),
  );
});

// const signWithApple = asyncHandler(async (req, res, next) => {
//   // Add logic
//   const token = jwtService.generateToken({ id: 'dummy-id' });
//   res.status(200).json(new ApiResponse(200, { token }, 'User logged in successfully'));
// });

module.exports = { signWithGoogle };
