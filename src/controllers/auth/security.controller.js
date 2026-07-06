const prisma = require("../../config/database");
const asyncHandler = require("../../utils/async-handler");
const ApiResponse = require("../../utils/api-response");
const AppError = require("../../utils/app-error");
const bcrypt = require("bcrypt");
const { sendOtpEmail } = require("../../services/email.service");

/**
 * Change Password
 * PATCH /api/v1/auth/security/change-password
 */
const changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const { userId, role } = req.user;

  if (role !== "GYM_OWNER") {
    throw new AppError(403, null, "Only gym owners can change their local password");
  }

  if (!currentPassword || !newPassword) {
    throw new AppError(400, null, "Current password and new password are required");
  }

  // Fetch Gym
  const gym = await prisma.gym.findUnique({
    where: { id: userId },
  });

  if (!gym) {
    throw new AppError(404, null, "Gym admin account not found");
  }

  // Match current password
  const isPasswordValid = await bcrypt.compare(currentPassword, gym.password);
  if (!isPasswordValid) {
    throw new AppError(401, null, "Current password is incorrect");
  }

  // Validate new password policy
  const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&#])[A-Za-z\d@$!%*?&#]{8,}$/;
  if (!passwordRegex.test(newPassword)) {
    throw new AppError(
      400,
      null,
      "Password must be at least 8 characters and include at least one uppercase letter, one lowercase letter, one number, and one special character."
    );
  }

  // Hash new password
  const hashedPassword = await bcrypt.hash(newPassword, 12);

  // Update in DB
  await prisma.gym.update({
    where: { id: userId },
    data: { password: hashedPassword },
  });

  // Log in AuditLog if exists
  await prisma.auditLog.create({
    data: {
      adminId: userId,
      action: "PASSWORD_CHANGED_SECURELY",
      ipAddress: req.ip || req.headers["x-forwarded-for"] || req.socket.remoteAddress,
      deviceInfo: req.headers["user-agent"] || "Unknown Device",
    },
  }).catch(() => {});

  return res.status(200).json(
    new ApiResponse(200, null, "Password updated successfully")
  );
});

/**
 * Request Email Change (Send OTP)
 * POST /api/v1/auth/security/request-email-change
 */
const requestEmailChange = asyncHandler(async (req, res) => {
  const { newEmail } = req.body;
  const { userId, role } = req.user;

  if (!newEmail) {
    throw new AppError(400, null, "New email address is required");
  }

  // Validate format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(newEmail)) {
    throw new AppError(400, null, "Invalid email address format");
  }

  const normalizedEmail = newEmail.toLowerCase().trim();

  // Check if email already registered in Gym or User
  const existingGym = await prisma.gym.findUnique({
    where: { email: normalizedEmail },
  });
  const existingUser = await prisma.user.findUnique({
    where: { email: normalizedEmail },
  });

  if (existingGym || existingUser) {
    throw new AppError(409, null, "Email address is already in use by another account");
  }

  // Generate 6-digit OTP code
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const otpHash = await bcrypt.hash(otp, 10);
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

  // Delete older requests for this email
  await prisma.passwordResetRequest.deleteMany({
    where: { email: normalizedEmail },
  });

  // Save the verification OTP
  await prisma.passwordResetRequest.create({
    data: {
      email: normalizedEmail,
      otpHash,
      expiresAt,
      adminId: role === "GYM_OWNER" ? userId : null,
    },
  });

  // Send Email
  try {
    await sendOtpEmail(normalizedEmail, otp, "email-change");
  } catch (emailError) {
    console.error("Email change send email error:", emailError);
    throw new AppError(500, null, "Failed to send verification email. Please try again later.");
  }

  return res.status(200).json(
    new ApiResponse(200, null, "Verification code sent to " + normalizedEmail)
  );
});

/**
 * Verify Email Change
 * POST /api/v1/auth/security/verify-email-change
 */
const verifyEmailChange = asyncHandler(async (req, res) => {
  const { newEmail, otp } = req.body;
  const { userId, role } = req.user;

  if (!newEmail || !otp) {
    throw new AppError(400, null, "New email and OTP are required");
  }

  const normalizedEmail = newEmail.toLowerCase().trim();

  // Find active request
  const request = await prisma.passwordResetRequest.findFirst({
    where: { email: normalizedEmail },
  });

  if (!request) {
    throw new AppError(400, null, "No verification request found for this email address");
  }

  // Check expiry
  if (new Date() > request.expiresAt) {
    throw new AppError(400, null, "OTP has expired. Please request a new one.");
  }

  // Verify OTP hash
  const isOtpValid = await bcrypt.compare(otp, request.otpHash);
  if (!isOtpValid) {
    throw new AppError(400, null, "Invalid verification code");
  }

  // Check duplicates once more just in case
  const existingGym = await prisma.gym.findUnique({
    where: { email: normalizedEmail },
  });
  const existingUser = await prisma.user.findUnique({
    where: { email: normalizedEmail },
  });

  if (existingGym || existingUser) {
    throw new AppError(409, null, "Email address is already in use");
  }

  // Update email based on role
  if (role === "GYM_OWNER") {
    await prisma.gym.update({
      where: { id: userId },
      data: { email: normalizedEmail },
    });
  } else {
    await prisma.user.update({
      where: { id: userId },
      data: { email: normalizedEmail },
    });
  }

  // Clear verification request
  await prisma.passwordResetRequest.delete({
    where: { id: request.id },
  });

  return res.status(200).json(
    new ApiResponse(200, { email: normalizedEmail }, "Email address updated successfully")
  );
});

/**
 * Get Active Sessions
 * GET /api/v1/auth/security/sessions
 */
const getSessions = asyncHandler(async (req, res) => {
  const { userId, sessionId } = req.user;

  const sessions = await prisma.session.findMany({
    where: { userId: userId },
    orderBy: { lastActive: "desc" },
  });

  const formattedSessions = sessions.map(session => ({
    id: session.id,
    deviceName: session.deviceName,
    deviceType: session.deviceType,
    ipAddress: session.ipAddress,
    lastActive: session.lastActive,
    createdAt: session.createdAt,
    isCurrent: session.id === sessionId,
  }));

  return res.status(200).json(
    new ApiResponse(200, formattedSessions, "Active sessions fetched successfully")
  );
});

/**
 * Logout Specific Session
 * DELETE /api/v1/auth/security/sessions/:sessionId
 */
const logoutSession = asyncHandler(async (req, res) => {
  const { userId } = req.user;
  const { sessionId } = req.params;

  if (!sessionId) {
    throw new AppError(400, null, "Session ID is required");
  }

  const deleted = await prisma.session.deleteMany({
    where: {
      id: sessionId,
      userId: userId,
    },
  });

  if (deleted.count === 0) {
    throw new AppError(404, null, "Session not found or already logged out");
  }

  return res.status(200).json(
    new ApiResponse(200, null, "Device session logged out successfully")
  );
});

/**
 * Logout Other Sessions
 * DELETE /api/v1/auth/security/sessions/logout-other
 */
const logoutOtherSessions = asyncHandler(async (req, res) => {
  const { userId, sessionId } = req.user;

  if (!sessionId) {
    throw new AppError(400, null, "Current session context not found");
  }

  const deleted = await prisma.session.deleteMany({
    where: {
      userId: userId,
      id: { not: sessionId },
    },
  });

  return res.status(200).json(
    new ApiResponse(200, { loggedOutCount: deleted.count }, "All other device sessions logged out successfully")
  );
});

module.exports = {
  changePassword,
  requestEmailChange,
  verifyEmailChange,
  getSessions,
  logoutSession,
  logoutOtherSessions,
};
