const asyncHandler = require("../utils/async-handler");
const ApiResponse = require("../utils/api-response");
const AppError = require("../utils/app-error");
const prisma = require("../config/database");
const storageService = require("../services/storage.service");

const getAllGyms = asyncHandler(async (req, res, next) => {
  try {
    const gyms = await prisma.gym.findMany({
      where: {
        isActive: true,
        status: "ACTIVE",
      },
      orderBy: {
        gymName: "asc",
      },
    });
    res
      .status(200)
      .json(new ApiResponse(200, gyms, "Gyms retrieved successfully"));
  } catch (error) {
    return next(error);
  }
});

const getGym = asyncHandler(async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!id) {
      throw new AppError(400, null, "Gym ID is required");
    }
    const getGym = await prisma.gym.findUnique({ where: { id } });
    if (!getGym) {
      throw new AppError(404, null, "Gym not found");
    }
    res
      .status(200)
      .json(new ApiResponse(200, getGym, "Gym retrieved successfully"));
  } catch (error) {
    return next(error);
  }
});

const updateGym = asyncHandler(async (req, res, next) => {
  try {
    const { id } = req.params;
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
    } = req.body;
    if (!id) {
      throw new AppError(400, null, "Gym ID is required");
    }

    const gym = await prisma.gym.findUnique({
      where: { id },
      select: { logoKey: true, coverImageKey: true }
    });
    if (!gym) {
      throw new AppError(404, null, "Gym not found");
    }

    let logoKey;
    if (logoUrl !== undefined) {
      logoKey = logoUrl ? storageService.extractKeyFromUrl(logoUrl) : null;
      if (gym.logoKey && gym.logoKey !== logoKey) {
        await storageService.deleteFile(gym.logoKey);
      }
    }

    let coverImageKey;
    if (coverImageUrl !== undefined) {
      coverImageKey = coverImageUrl ? storageService.extractKeyFromUrl(coverImageUrl) : null;
      if (gym.coverImageKey && gym.coverImageKey !== coverImageKey) {
        await storageService.deleteFile(gym.coverImageKey);
      }
    }

    const dataToUpdate = {
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
      currency,
      timezone,
      maxMembers,
      instagramUrl,
      facebookUrl,
      youtubeUrl,
      gstNumber,
      licenseNumber,
      password,
    };

    if (logoUrl !== undefined) {
      dataToUpdate.logoUrl = logoUrl;
      dataToUpdate.logoKey = logoKey;
    }
    if (coverImageUrl !== undefined) {
      dataToUpdate.coverImageUrl = coverImageUrl;
      dataToUpdate.coverImageKey = coverImageKey;
    }

    const updatedGym = await prisma.gym.update({
      where: { id },
      data: dataToUpdate,
    });
    res
      .status(200)
      .json(new ApiResponse(200, updatedGym, "Gym updated successfully"));
  } catch (error) {
    return next(error);
  }
});

const deleteGym = asyncHandler(async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!id) {
      throw new AppError(400, null, "Gym ID is required");
    }

    const gym = await prisma.gym.findUnique({
      where: { id },
      select: { logoKey: true, coverImageKey: true }
    });

    if (gym) {
      if (gym.logoKey) await storageService.deleteFile(gym.logoKey);
      if (gym.coverImageKey) await storageService.deleteFile(gym.coverImageKey);
    }

    // Find and delete all message attachments in gym conversations from S3
    const conversations = await prisma.conversation.findMany({
      where: { gymId: id },
      select: {
        messages: {
          select: {
            attachments: {
              select: {
                key: true
              }
            }
          }
        }
      }
    });

    const attachmentKeys = [];
    if (conversations && conversations.length > 0) {
      for (const conv of conversations) {
        if (conv.messages) {
          for (const msg of conv.messages) {
            if (msg.attachments) {
              for (const att of msg.attachments) {
                if (att.key) {
                  attachmentKeys.push(att.key);
                }
              }
            }
          }
        }
      }
    }

    if (attachmentKeys.length > 0) {
      await storageService.deleteFiles(attachmentKeys);
    }

    const deleteGym = await prisma.gym.delete({ where: { id } });
    res
      .status(200)
      .json(new ApiResponse(200, deleteGym, "Gym deleted successfully"));
  } catch (error) {
    return next(error);
  }
});

const getGymMembers = asyncHandler(async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!id) {
      throw new AppError(400, null, "Gym ID is required");
    }
    const getGymMembers = await prisma.user.findMany({
      where: { gymId: id },
      include: {
        currentMembershipPlan: true,
        gym: true,
      },
      orderBy: [{ name: "asc" }],
    });
    res
      .status(200)
      .json(
        new ApiResponse(
          200,
          getGymMembers,
          "Gym members retrieved successfully",
        ),
      );
  } catch (error) {
    return next(error);
  }
});

const getGymFinanceOverview = asyncHandler(async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!id) {
      throw new AppError(400, null, "Gym ID is required");
    }

    // Verify gym exists
    const gymExists = await prisma.gym.findUnique({
      where: { id },
      select: { id: true }
    });
    if (!gymExists) {
      throw new AppError(404, null, "Gym not found");
    }

    // 1. Total Revenue: Sum of all user membership plans price
    const revenueAggregation = await prisma.userMembershipPlans.aggregate({
      where: {
        user: {
          gymId: id
        }
      },
      _sum: {
        price: true
      }
    });
    const totalRevenue = Number(revenueAggregation._sum.price || 0);

    // 2. Active Memberships
    const activeMemberships = await prisma.user.count({
      where: {
        gymId: id,
        isActive: true,
        currentMembershipPlanId: { not: null },
        currentMembershipPlan: {
          isActive: true,
          endDate: { gte: new Date() }
        }
      }
    });

    // 3. Outstanding Payments
    const gymPlans = await prisma.membershipPlan.findMany({
      where: { gymId: id, isActive: true },
      select: { price: true },
    });

    const defaultPlanPrice =
      gymPlans.length > 0
        ? Math.min(...gymPlans.map((p) => Number(p.price)))
        : 1000;

    const pendingUsers = await prisma.user.findMany({
      where: {
        gymId: id,
        OR: [
          { currentMembershipPlanId: null },
          {
            currentMembershipPlan: {
              OR: [{ endDate: { lt: new Date() } }, { isActive: false }],
            },
          },
        ],
      },
      include: {
        currentMembershipPlan: true,
      },
    });

    let outstandingPayments = 0;
    for (const user of pendingUsers) {
      if (user.currentMembershipPlan && user.currentMembershipPlan.price) {
        outstandingPayments += Number(user.currentMembershipPlan.price);
      } else {
        outstandingPayments += defaultPlanPrice;
      }
    }

    // 4. Fetch all transactions (UserMembershipPlans)
    const transactions = await prisma.userMembershipPlans.findMany({
      where: {
        user: {
          gymId: id
        }
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            profileImage: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    const now = new Date();
    const mappedTransactions = transactions.map(txn => {
      let status = 'Paid';
      if (txn.endDate < now) {
        status = 'Overdue';
      } else if (!txn.isActive) {
        status = 'Pending';
      }
      return {
        id: txn.id,
        memberName: txn.user ? txn.user.name : 'Unknown Member',
        userEmail: txn.user ? txn.user.email : '',
        profileImage: txn.user ? txn.user.profileImage : null,
        planName: txn.planName,
        amount: Number(txn.price || 0),
        date: txn.createdAt,
        status: status,
        startDate: txn.startDate,
        endDate: txn.endDate,
        userId: txn.userId
      };
    });

    res.status(200).json(
      new ApiResponse(
        200,
        {
          totalRevenue,
          outstandingPayments,
          activeMemberships,
          transactions: mappedTransactions
        },
        "Gym financial overview retrieved successfully"
      )
    );
  } catch (error) {
    return next(error);
  }
});

const getGymUploadTicket = asyncHandler(async (req, res, next) => {
  try {
    const { id } = req.params;
    const { fileName, fileSize, mimeType } = req.body;

    if (!id) {
      throw new AppError(400, null, 'Gym ID is required');
    }
    if (!fileName || !fileSize || !mimeType) {
      throw new AppError(400, null, 'fileName, fileSize, and mimeType are required');
    }

    // Verify gym exists
    const gym = await prisma.gym.findUnique({ where: { id } });
    if (!gym) {
      throw new AppError(404, null, 'Gym not found');
    }

    const requestBaseUrl = `${req.protocol}://${req.get('host')}`;

    const ticket = await storageService.getPresignedUploadUrl(
      id,
      null,
      fileName,
      fileSize,
      mimeType,
      requestBaseUrl,
      null
    );

    return res.status(200).json(
      new ApiResponse(200, ticket, 'Gym upload ticket generated successfully')
    );
  } catch (error) {
    return next(error);
  }
});

module.exports = {
  getAllGyms,
  getGym,
  updateGym,
  deleteGym,
  getGymMembers,
  getGymFinanceOverview,
  getGymUploadTicket,
};

