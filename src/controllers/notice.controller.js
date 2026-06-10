const asyncHandler = require('../utils/async-handler');
const ApiResponse = require('../utils/api-response');
const AppError = require("../utils/app-error");
const prisma = require('../config/database');

/**
 * POST /api/v1/notices
 * Creates a notice.
 */
const createNotice = asyncHandler(async (req, res, next) => {
  try {
    const { title, message, startDate, endDate, gymId } = req.body;

    if (!title || !message || !startDate || !endDate) {
      throw new AppError(400, null, 'Title, message, startDate, and endDate are required');
    }

    // Optional gymId validation
    if (gymId) {
      const gym = await prisma.gym.findUnique({ where: { id: gymId } });
      if (!gym) {
        throw new AppError(404, null, 'Gym not found');
      }
    }

    const notice = await prisma.notice.create({
      data: {
        title,
        message,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        gymId: gymId || null,
      },
    });

    res.status(201).json(new ApiResponse(201, notice, 'Notice created successfully'));
  } catch (error) {
    return next(error);
  }
});

/**
 * GET /api/v1/notices
 * Fetches active notices (for user dashboard).
 * Queries notices where (gymId = gymId OR gymId = null) and startDate <= now <= endDate.
 */
const getNotices = asyncHandler(async (req, res, next) => {
  try {
    const { gymId } = req.query;
    const now = new Date();

    const whereClause = {
      startDate: { lte: now },
      endDate: { gte: now },
    };

    if (gymId) {
      whereClause.OR = [
        { gymId: null },
        { gymId: gymId }
      ];
    } else {
      whereClause.gymId = null;
    }

    const notices = await prisma.notice.findMany({
      where: whereClause,
      orderBy: { createdAt: 'desc' },
    });

    res.status(200).json(new ApiResponse(200, notices, 'Notices retrieved successfully'));
  } catch (error) {
    return next(error);
  }
});

/**
 * GET /api/v1/notices/gym/:gymId
 * Fetches all notices created by a specific gym (active, future, past) for gym owner management.
 */
const getGymNotices = asyncHandler(async (req, res, next) => {
  try {
    const { gymId } = req.params;
    if (!gymId) {
      throw new AppError(400, null, 'Gym ID is required');
    }

    const notices = await prisma.notice.findMany({
      where: { gymId },
      orderBy: { createdAt: 'desc' },
    });

    res.status(200).json(new ApiResponse(200, notices, 'Gym notices retrieved successfully'));
  } catch (error) {
    return next(error);
  }
});

/**
 * DELETE /api/v1/notices/:id
 * Deletes a notice by ID.
 */
const deleteNotice = asyncHandler(async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!id) {
      throw new AppError(400, null, 'Notice ID is required');
    }

    const existingNotice = await prisma.notice.findUnique({ where: { id } });
    if (!existingNotice) {
      throw new AppError(404, null, 'Notice not found');
    }

    await prisma.notice.delete({ where: { id } });

    res.status(200).json(new ApiResponse(200, null, 'Notice deleted successfully'));
  } catch (error) {
    return next(error);
  }
});

module.exports = {
  createNotice,
  getNotices,
  getGymNotices,
  deleteNotice,
};
