const prisma = require("../../config/database");
const asyncHandler = require("../../utils/async-handler");
const ApiResponse = require("../../utils/api-response");
const AppError = require("../../utils/app-error");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const env = require("../../config/env");
const { sendOtpEmail } = require("../../services/email.service");
const logger = require("../../config/logger");

// Helper to get client IP and User Agent
const getClientInfo = (req) => {
  const ipAddress = req.headers['x-forwarded-for'] || req.socket.remoteAddress || req.ip;
  const deviceInfo = req.headers['user-agent'] || 'Unknown Device';
  return { ipAddress, deviceInfo };
};

/**
 * Request Password Reset (Forgot Password)
 * POST /api/v1/auth/forgot-password
 */
const forgotPassword = asyncHandler(async (req, res) => {
  const { email } = req.body;

  if (!email) {
    throw new AppError(400, null, "Email address is required");
  }
   logger.info("Email : ", email);
  // Email format validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    throw new AppError(400, null, "Invalid email address format");
  }

  const normalizedEmail = email.toLowerCase().trim();

  // Find Gym Admin
  const admin = await prisma.gym.findFirst({
    where: { 
      email: normalizedEmail,
      deletedAt: null,
    },
  });

  // To prevent user enumeration, return success even if user doesn't exist
  if (!admin) {
    logger.info("Admin not found");
    return res.status(200).json(
      new ApiResponse(200, null, "OTP sent successfully")
    );
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

  // Upsert password reset request
  await prisma.passwordResetRequest.deleteMany({
    where: { email: normalizedEmail },
  });

  await prisma.passwordResetRequest.create({
    data: {
      adminId: admin.id,
      email: normalizedEmail,
      otpHash,
      expiresAt,
      resendCount: existingRequest ? existingRequest.resendCount + 1 : 0,
    },
  });

  // Send Email
  try {
   
    await sendOtpEmail(normalizedEmail, otp);
  } catch (emailError) {
    throw new AppError(500, null, "Failed to send OTP email. Please try again later.");
  }

  // Log audit activity
  const { ipAddress, deviceInfo } = getClientInfo(req);
  await prisma.auditLog.create({
    data: {
      adminId: admin.id,
      action: "PASSWORD_RESET_REQUESTED",
      ipAddress,
      deviceInfo,
    },
  });

  return res.status(200).json(
    new ApiResponse(200, null, "OTP sent successfully")
  );
});

/**
 * Verify OTP Code
 * POST /api/v1/auth/verify-otp
 */
const verifyOtp = asyncHandler(async (req, res) => {
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
    throw new AppError(400, null, "No password reset request found or OTP was already verified");
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

  // Generate temporary reset token (Expires in 10 minutes)
  const resetToken = jwt.sign(
    { 
      id: request.adminId, 
      email: request.email, 
      purpose: "password-reset" 
    },
    env.jwtAcessSecret,
    { expiresIn: "10m" }
  );

  // Invalidate OTP (Delete from database to prevent replay attacks)
  await prisma.passwordResetRequest.delete({
    where: { id: request.id },
  });

  return res.status(200).json(
    new ApiResponse(200, { resetToken }, "OTP verified successfully")
  );
});

/**
 * Create New Password (Reset Password)
 * POST /api/v1/auth/reset-password
 */
const resetPassword = asyncHandler(async (req, res) => {
  const { password } = req.body;
  const authHeader = req.headers.authorization;

  if (!password) {
    throw new AppError(400, null, "New password is required");
  }

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    throw new AppError(401, null, "Reset token is required");
  }

  const token = authHeader.split(" ")[1];
  let decoded;

  try {
    decoded = jwt.verify(token, env.jwtAcessSecret);
  } catch (error) {
    throw new AppError(401, null, "Invalid or expired reset token");
  }

  if (decoded.purpose !== "password-reset") {
    throw new AppError(401, null, "Invalid reset token purpose");
  }

  // Validate Password Policy
  // - Minimum 8 characters
  // - One uppercase letter
  // - One lowercase letter
  // - One number
  // - One special character
  const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&#])[A-Za-z\d@$!%*?&#]{8,}$/;
  if (!passwordRegex.test(password)) {
    throw new AppError(
      400, 
      null, 
      "Password must be at least 8 characters and include at least one uppercase letter, one lowercase letter, one number, and one special character."
    );
  }

  // Hash password
  const hashedPassword = await bcrypt.hash(password, 12);

  // Update password in DB
  await prisma.gym.update({
    where: { id: decoded.id },
    data: { password: hashedPassword },
  });

  // Log audit activity
  const { ipAddress, deviceInfo } = getClientInfo(req);
  await prisma.auditLog.create({
    data: {
      adminId: decoded.id,
      action: "PASSWORD_RESET_SUCCESSFUL",
      ipAddress,
      deviceInfo,
    },
  });

  return res.status(200).json(
    new ApiResponse(200, null, "Password updated successfully")
  );
});

module.exports = {
  forgotPassword,
  verifyOtp,
  resetPassword,
};
