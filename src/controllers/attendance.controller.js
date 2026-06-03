const asyncHandler = require("../utils/async-handler");
const ApiResponse = require("../utils/api-response");
const AppError = require("../utils/app-error");
const prisma = require("../config/database");
const crypto = require("crypto");

/**
 * Start Session
 * POST /attendance/start-session
 */
const startSession = asyncHandler(async (req, res, next) => {
  const gymId = req.user.userId;

  // Verify gym exists
  const gym = await prisma.gym.findUnique({
    where: { id: gymId }
  });
  if (!gym) {
    throw new AppError("Gym not found", 404);
  }

  // Check if active session already exists
  let activeSession = await prisma.attendanceSession.findFirst({
    where: {
      gymId: gym.id,
      isActive: true
    }
  });

  if (activeSession) {
    return res.status(200).json(
      new ApiResponse(200, {
        id: activeSession.id,
        sessionCode: activeSession.sessionCode,
        isActive: true
      }, "Active session already exists")
    );
  }

  // Generate session code (e.g. GYM_ABC_1692001234)
  const timestamp = Math.floor(Date.now() / 1000);
  const cleanGymCode = gym.gymCode.replace("-", "_");
  const sessionCode = `GYM_${cleanGymCode}_${timestamp}`;

  // Create new active session
  activeSession = await prisma.attendanceSession.create({
    data: {
      gymId: gym.id,
      sessionCode,
      isActive: true,
      createdBy: gym.id
    }
  });

  return res.status(201).json(
    new ApiResponse(201, {
      id: activeSession.id,
      sessionCode: activeSession.sessionCode,
      isActive: true
    }, "Attendance session started")
  );
});

/**
 * Get Active Session
 * GET /attendance/active-session
 */
const getActiveSession = asyncHandler(async (req, res, next) => {
  const gymId = req.user.userId;

  const activeSession = await prisma.attendanceSession.findFirst({
    where: {
      gymId,
      isActive: true
    }
  });

  return res.status(200).json(
    new ApiResponse(200, {
      session: activeSession ? {
        id: activeSession.id,
        sessionCode: activeSession.sessionCode,
        isActive: true,
        qrToken: activeSession.qrToken
      } : null
    }, "Active session retrieved successfully")
  );
});

/**
 * Refresh QR
 * POST /attendance/refresh-qr
 */
const refreshQr = asyncHandler(async (req, res, next) => {
  const gymId = req.user.userId;

  const activeSession = await prisma.attendanceSession.findFirst({
    where: {
      gymId,
      isActive: true
    }
  });

  if (!activeSession) {
    throw new AppError("No active attendance session found", 404);
  }

  // Generate qrToken structured payload
  const token = crypto.randomUUID();
  const qrTokenData = {
    sessionId: activeSession.id,
    gymId: gymId,
    token: token,
    timestamp: new Date().toISOString()
  };
  const qrToken = JSON.stringify(qrTokenData);

  await prisma.attendanceSession.update({
    where: { id: activeSession.id },
    data: {
      qrToken,
      lastQrRefreshAt: new Date()
    }
  });

  return res.status(200).json(
    new ApiResponse(200, {
      qrToken,
      expiresIn: 30
    }, "QR token refreshed successfully")
  );
});

/**
 * Stop Session
 * POST /attendance/stop-session
 */
const stopSession = asyncHandler(async (req, res, next) => {
  const gymId = req.user.userId;

  const activeSession = await prisma.attendanceSession.findFirst({
    where: {
      gymId,
      isActive: true
    }
  });

  if (!activeSession) {
    throw new AppError("No active session found", 404);
  }

  await prisma.attendanceSession.update({
    where: { id: activeSession.id },
    data: {
      isActive: false,
      endedAt: new Date()
    }
  });

  return res.status(200).json(
    new ApiResponse(200, null, "Session stopped")
  );
});

/**
 * Manual Attendance Entry
 * POST /attendance/manual-entry
 */
const manualEntry = asyncHandler(async (req, res, next) => {
  const gymId = req.user.userId;
  const { userId } = req.body;

  if (!userId) {
    throw new AppError("userId is required", 400);
  }

  const activeSession = await prisma.attendanceSession.findFirst({
    where: {
      gymId,
      isActive: true
    }
  });

  if (!activeSession) {
    throw new AppError("No active attendance session found", 400);
  }

  // Verify user exists and belongs to same gym
  const user = await prisma.user.findUnique({
    where: { id: userId }
  });

  if (!user) {
    throw new AppError("User not found", 404);
  }

  if (user.gymId !== gymId) {
    throw new AppError("User does not belong to this gym", 400);
  }

  // Normalize check-in date to start of today (midnight UTC)
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  const existingAttendance = await prisma.attendance.findUnique({
    where: {
      userId_attendanceDate: {
        userId,
        attendanceDate: today
      }
    }
  });

  if (existingAttendance) {
    throw new AppError("Attendance already marked for today", 400);
  }

  const attendance = await prisma.attendance.create({
    data: {
      userId,
      gymId,
      attendanceSessionId: activeSession.id,
      attendanceDate: today,
      method: "MANUAL",
      checkInTime: new Date()
    }
  });

  return res.status(201).json(
    new ApiResponse(201, attendance, "Attendance marked successfully")
  );
});

/**
 * Get Present Today
 * GET /attendance/present-today
 */
const getPresentToday = asyncHandler(async (req, res, next) => {
  const gymId = req.user.userId;

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  const attendances = await prisma.attendance.findMany({
    where: {
      gymId,
      attendanceDate: today
    },
    select: {
      userId: true
    }
  });

  const presentUserIds = attendances.map((a) => a.userId);

  return res.status(200).json(
    new ApiResponse(200, {
      presentUserIds
    }, "Present users retrieved successfully")
  );
});

/**
 * User check-in via QR code scan
 * POST /attendance/check-in
 */
const checkIn = asyncHandler(async (req, res, next) => {
  const userId = req.user.userId;
  const { qrToken } = req.body;

  if (!qrToken) {
    throw new AppError("QR token is required", 400);
  }

  let qrData;
  try {
    qrData = JSON.parse(qrToken);
  } catch (err) {
    throw new AppError("Invalid QR Code format", 400);
  }

  const { sessionId, gymId, token, timestamp } = qrData;
  if (!sessionId || !gymId || !token || !timestamp) {
    throw new AppError("Invalid QR Code payload", 400);
  }

  // Find active session
  const session = await prisma.attendanceSession.findFirst({
    where: {
      id: sessionId,
      gymId,
      isActive: true
    }
  });

  if (!session) {
    throw new AppError("Active attendance session not found", 400);
  }

  // Verify that the scanned token is fresh (within 45 seconds of generation time)
  const tokenTime = new Date(timestamp);
  const now = new Date();
  const diffInSeconds = Math.abs((now - tokenTime) / 1000);
  if (diffInSeconds > 45) {
    throw new AppError("QR code has expired. Please scan a fresh QR code.", 400);
  }

  // Get user detail
  const user = await prisma.user.findUnique({
    where: { id: userId }
  });

  if (!user) {
    throw new AppError("User not found", 404);
  }

  // Ensure user is matching the gym ID
  if (user.gymId !== gymId) {
    throw new AppError("You do not belong to this gym", 403);
  }

  // Normalize attendanceDate to start of today (midnight UTC)
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  // Check if attendance already marked today
  const existingAttendance = await prisma.attendance.findUnique({
    where: {
      userId_attendanceDate: {
        userId,
        attendanceDate: today
      }
    }
  });

  if (existingAttendance) {
    throw new AppError("You have already checked in for today", 400);
  }

  // Create check-in entry
  const attendance = await prisma.attendance.create({
    data: {
      userId,
      gymId,
      attendanceSessionId: session.id,
      attendanceDate: today,
      method: "QR",
      checkInTime: new Date()
    }
  });

  return res.status(201).json(
    new ApiResponse(201, attendance, "Attendance marked successfully")
  );
});

module.exports = {
  startSession,
  getActiveSession,
  refreshQr,
  stopSession,
  manualEntry,
  getPresentToday,
  checkIn
};