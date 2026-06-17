const prisma = require("../../config/database");
const asyncHandler = require("../../utils/async-handler");
const ApiResponse = require("../../utils/api-response");
const AppError = require('../../utils/app-error');
const bcrypt = require("bcrypt");
const { generateAcessToken, generateRefreshToken } = require("../../services/jwt.service");
const jwt = require("jsonwebtoken");
const env = require("../../config/env");
const { sendOtpEmail } = require("../../services/email.service");



const generateGymCode = async () => {
  let gymCode;
  let exists = true;

  while (exists) {
    gymCode =
      "GYM-" +
      Math.random()
        .toString(36)
        .substring(2, 8)
        .toUpperCase();

    const existingGym = await prisma.gym.findUnique({
      where: { gymCode },
      select: { id: true },
    });

    exists = !!existingGym;
  }

  return gymCode;
};

/**
 * Create Gym
 */
const createGym = asyncHandler(async (req, res) => {
  const {
    gymName,
    ownerName,
    gymAbout,
    establishedYear,

    email,
    phone,
    whatsappNumber,
    alternatePhone,
    website,

    address,
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

    currency,
    timezone,
    maxMembers,

    instagramUrl,
    facebookUrl,
    youtubeUrl,

    gstNumber,
    licenseNumber,

    password,
    emailVerificationToken,
  } = req.body;

  // =====================================================
  // EMAIL VERIFICATION TOKEN VALIDATION
  // =====================================================
  if (!emailVerificationToken) {
    throw new AppError(400, null, "Email verification is required. Please verify your email first.");
  }

  let decoded;
  try {
    decoded = jwt.verify(emailVerificationToken, env.jwtAcessSecret);
  } catch (err) {
    throw new AppError(400, null, "Email verification token is invalid or expired. Please verify your email again.");
  }

  if (decoded.purpose !== "email-verification" || decoded.email.toLowerCase().trim() !== email.toLowerCase().trim()) {
    throw new AppError(400, null, "Email verification token does not match the registration email.");
  }

  // =====================================================
  // REQUIRED FIELD VALIDATION
  // =====================================================
  const requiredFields = {
    gymName,
    ownerName,
    email,
    phone,
    address,
    city,
    state,
    postalCode,
    password,
  };
    

  for (const [field, value] of Object.entries(requiredFields)) {
    if (
      value === undefined ||
      value === null ||
      String(value).trim() === ""
    ) {

      throw new AppError(400, null, `${field} is required`);
    }
  }

  // =====================================================
  // EMAIL FORMAT VALIDATION
  // =====================================================
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    throw new AppError(400, null, 'Invalid email address');
  }

  // =====================================================
  // ESTABLISHED YEAR VALIDATION
  // =====================================================
  if (establishedYear) {
    const currentYear = new Date().getFullYear();

    if (
      Number(establishedYear) < 1900 ||
      Number(establishedYear) > currentYear
    ) {
      throw new AppError(400, null, 'Invalid established year');
    }
  }

  // =====================================================
  // MAX MEMBERS VALIDATION
  // =====================================================
  if (
    maxMembers !== undefined &&
    maxMembers !== null &&
    Number(maxMembers) < 1
  ) {
    throw new AppError(400, null, 'maxMembers must be greater than 0');
  }

  // =====================================================
  // DUPLICATE CHECKS
  // =====================================================
  const existingGym = await prisma.gym.findFirst({
    where: {
      OR: [
        { email: email.toLowerCase().trim() },
        { phone: phone.trim() },
      ],
    },
    select: {
      id: true,
      email: true,
      phone: true,
    },
  });

  if (existingGym) {
    if (existingGym.email === email.toLowerCase().trim()) {
      throw new AppError(409, null, 'Email already registered');
    }

    if (existingGym.phone === phone.trim()) {
      throw new AppError(409, null, 'Phone number already registered');
    }
  }

  // =====================================================
  // GENERATE UNIQUE GYM CODE
  // =====================================================
  const gymCode = await generateGymCode();
  const hashedPassword = await bcrypt.hash(password, 12);

  // =====================================================
  // CREATE GYM
  // =====================================================
  const gym = await prisma.gym.create({
    data: {
      gymCode,

      gymName: gymName.trim(),
      ownerName: ownerName.trim(),
      gymAbout: gymAbout?.trim() || null,
      establishedYear:
        establishedYear !== undefined && establishedYear !== null
          ? Number(establishedYear)
          : null,

      email: email.toLowerCase().trim(),
      phone: phone.trim(),
      whatsappNumber: whatsappNumber?.trim() || null,
      alternatePhone: alternatePhone?.trim() || null,
      website: website?.trim() || null,

      address: address.trim(),
      city: city.trim(),
      district: district?.trim() || null,
      state: state.trim(),
      country: country?.trim() || "India",
      postalCode: postalCode.trim(),

      latitude: latitude ?? null,
      longitude: longitude ?? null,

      workingHours: workingHours || null,
      is24Hours: Boolean(is24Hours),

      logoUrl: logoUrl || null,
      coverImageUrl: coverImageUrl || null,

      currency: currency || "INR",
      timezone: timezone || "Asia/Kolkata",
      maxMembers:
        maxMembers !== undefined && maxMembers !== null
          ? Number(maxMembers)
          : null,

      instagramUrl: instagramUrl || null,
      facebookUrl: facebookUrl || null,
      youtubeUrl: youtubeUrl || null,

      gstNumber: gstNumber?.trim() || null,
      licenseNumber: licenseNumber?.trim() || null,

      // Default statuses
      status: "PENDING",
      isActive: false,
      isVerified: false,
      isFeatured: false,

      password: hashedPassword,
    },
  });

  // =====================================================
  // RESPONSE
  // =====================================================
  return res.status(201).json(
    new ApiResponse(
      201,
      gym,
      "Gym registration submitted successfully. Your account is pending approval."
    )
  );
});


const loginGym = asyncHandler(async (req, res, next) => {
  const { emailOrPhone, password } = req.body;

  try {

  // Validate input
  if (!emailOrPhone || !password) {
    throw new AppError(400, null, 'Email or phone number and password are required');
  }

  // Find gym by email OR phone
  const gym = await prisma.gym.findFirst({
    where: {
      OR: [
        {
          email: emailOrPhone.toLowerCase().trim(),
        },
        {
          phone: emailOrPhone.trim(),
        },
      ],
      deletedAt: null, 
    },
  });

  // Gym not found
  if (!gym) {
    throw new AppError(404, null, 'Gym not found');
  }

  // Verify password
  const isPasswordValid = await bcrypt.compare(password, gym.password);

  if (!isPasswordValid) {
    throw new AppError(401, null, 'Invalid password');
  }

  // Generate tokens
  const accessToken = generateAcessToken({ id: gym.id, role: 'GYM_OWNER' });
  const refreshToken = generateRefreshToken({ id: gym.id, role: 'GYM_OWNER' });

  // Remove password before sending response
  const { password: _, ...gymWithoutPassword } = gym;

  // Success response
  return res.status(200).json(
    new ApiResponse(
      200,
      {
        gym: gymWithoutPassword,
        accessToken,
        refreshToken,
      },
      "Gym logged in successfully"
    )
  );
  } catch (error) {
    return next(error);
  }
});


/**
 * Send Signup OTP Code
 * POST /api/v1/auth/signup-otp
 */
const signupOtp = asyncHandler(async (req, res) => {
  const { email } = req.body;

  if (!email) {
    throw new AppError(400, null, "Email address is required");
  }

  // Email format validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    throw new AppError(400, null, "Invalid email address format");
  }

  const normalizedEmail = email.toLowerCase().trim();

  // Check if gym already exists
  const existingGym = await prisma.gym.findFirst({
    where: { 
      email: normalizedEmail,
      deletedAt: null,
    },
  });

  if (existingGym) {
    throw new AppError(409, null, "Email already registered");
  }

  // Check resend count in the last 24 hours
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const existingRequest = await prisma.passwordResetRequest.findFirst({
    where: {
      email: normalizedEmail,
      createdAt: { gte: oneDayAgo },
    },
  });

  if (existingRequest && existingRequest.resendCount >= 3) {
    throw new AppError(429, null, "Max OTP resends reached for today. Please try again tomorrow.");
  }

  // Generate 6-digit OTP code (cryptographically secure)
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const otpHash = await bcrypt.hash(otp, 10);
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

  // Delete previous reset/signup requests for this email
  await prisma.passwordResetRequest.deleteMany({
    where: { email: normalizedEmail },
  });

  await prisma.passwordResetRequest.create({
    data: {
      email: normalizedEmail,
      otpHash,
      expiresAt,
      resendCount: existingRequest ? existingRequest.resendCount + 1 : 0,
    },
  });

  // Send Email
  try {
    await sendOtpEmail(normalizedEmail, otp, 'signup');
  } catch (emailError) {
    console.error("Failed to send OTP email:", emailError);
    throw new AppError(500, null, "Failed to send OTP email. Please try again later.");
  }

  return res.status(200).json(
    new ApiResponse(200, null, "Verification code sent successfully")
  );
});

/**
 * Verify Signup OTP Code
 * POST /api/v1/auth/verify-signup-otp
 */
const verifySignupOtp = asyncHandler(async (req, res) => {
  const { email, otp } = req.body;

  if (!email || !otp) {
    throw new AppError(400, null, "Email and OTP are required");
  }

  const normalizedEmail = email.toLowerCase().trim();

  // Find active request
  const request = await prisma.passwordResetRequest.findFirst({
    where: { email: normalizedEmail },
  });

  if (!request) {
    throw new AppError(400, null, "No signup verification request found or OTP was already verified");
  }

  // Check attempt limits (Max 5)
  if (request.attempts >= 5) {
    throw new AppError(429, null, "Too many failed attempts. Please request a new OTP.");
  }

  // Check expiry (5 minutes)
  if (new Date() > request.expiresAt) {
    throw new AppError(400, null, "OTP has expired. Please request a new one.");
  }

  // Verify OTP
  const isOtpValid = await bcrypt.compare(otp, request.otpHash);

  if (!isOtpValid) {
    // Increment attempts
    await prisma.passwordResetRequest.update({
      where: { id: request.id },
      data: { attempts: request.attempts + 1 },
    });

    const attemptsRemaining = 5 - (request.attempts + 1);
    throw new AppError(400, null, `Invalid OTP code. ${attemptsRemaining} attempts remaining.`);
  }

  // Generate temporary email verification token (Expires in 15 minutes)
  const token = jwt.sign(
    { 
      email: normalizedEmail, 
      purpose: "email-verification" 
    },
    env.jwtAcessSecret,
    { expiresIn: "15m" }
  );

  // Invalidate OTP (Delete from database to prevent replay attacks)
  await prisma.passwordResetRequest.delete({
    where: { id: request.id },
  });

  return res.status(200).json(
    new ApiResponse(200, { token }, "Email verified successfully")
  );
});

module.exports = {
  createGym,
  loginGym,
  signupOtp,
  verifySignupOtp,
};