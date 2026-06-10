const asyncHandler = require('../utils/async-handler');
const ApiResponse = require('../utils/api-response');
const AppError = require("../utils/app-error");
const prisma = require('../config/database');
const storageService = require('../services/storage.service');


const getUsers = asyncHandler(async (req, res, next) => {
  try{
    const getAllUsers = await prisma.user.findMany();
    res.status(200).json(new ApiResponse(200, getAllUsers, 'Users retrieved successfully'));
  } catch (error) {
    return next(error);
  }
});


const getUser = asyncHandler(async (req, res, next) => {
  try {
     const { id } = req.params;
  if (!id) {
    throw new AppError(400, null, 'User ID is required');
  }
  const getUser = await prisma.user.findUnique({ where: { id } });
  if (!getUser) {
    throw new AppError(404, null, 'User not found');
  }
  res.status(200).json(new ApiResponse(200, getUser, 'User retrieved successfully'));
  } catch (error) {
    return next(error);
  }
});


const updateUser = asyncHandler(async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, email, phone, role, isActive, membershipPlanId, gymId, profilePic, dateOfBirth, gender } = req.body;
    if (!id) {
      throw new AppError(400, null, 'User ID is required');
    }

    // Check if user exists
    const user = await prisma.user.findUnique({
      where: { id },
      include: { currentMembershipPlan: true }
    });
    if (!user) {
      throw new AppError(404, null, 'User not found');
    }

    const data = {};
    if (name !== undefined) data.name = name;
    if (email !== undefined) data.email = email;
    if (phone !== undefined) data.phone = (phone === '' || phone === null) ? null : phone;
    if (role !== undefined) data.role = role;
    if (isActive !== undefined) data.isActive = isActive;
    if (profilePic !== undefined) data.profileImage = profilePic;
    if (dateOfBirth !== undefined) {
      data.dateOfBirth = dateOfBirth ? new Date(dateOfBirth) : null;
    }
    if (gender !== undefined) {
      if (gender === null) {
        data.gender = null;
      } else {
        const lowerGender = gender.toString().toLowerCase();
        if (['male', 'female', 'other'].includes(lowerGender)) {
          data.gender = lowerGender;
        } else {
          throw new AppError(400, null, 'Invalid gender value. Must be male, female, or other.');
        }
      }
    }

    let updatedUser;

    if (membershipPlanId && gymId && (!user.currentMembershipPlan || user.currentMembershipPlan.membershipPlanId !== membershipPlanId)) {
      // Admin is assigning/updating the user's membership plan
      // 1. Fetch the gym membership plan from the database to get details
      const plan = await prisma.membershipPlan.findUnique({
        where: { id: membershipPlanId }
      });
      if (!plan) {
        throw new AppError(404, null, 'Membership plan not found');
      }

      const startDate = new Date();
      const endDate = new Date();
      endDate.setMonth(endDate.getMonth() + plan.durationInMonths);

      updatedUser = await prisma.$transaction(async (tx) => {
        // Deactivate old current membership plan if it exists
        if (user.currentMembershipPlanId) {
          await tx.userMembershipPlans.update({
            where: { id: user.currentMembershipPlanId },
            data: { isActive: false }
          });
        }

        // Create new membership plan history
        const newMembership = await tx.userMembershipPlans.create({
          data: {
            userId: id,
            membershipPlanId: plan.id,
            planName: plan.name,
            price: plan.discountedPrice ? plan.discountedPrice : plan.price,
            currency: plan.currency,
            durationInMonths: plan.durationInMonths,
            startDate,
            endDate,
            isActive: true,
          }
        });

        data.gymId = gymId;
        data.currentMembershipPlanId = newMembership.id;

        // If the user wasn't a member before, increment the gym member count
        if (!user.gymId) {
          await tx.gym.update({
            where: { id: gymId },
            data: { currentMembers: { increment: 1 } }
          });
        }

        // Hook group sync
        await syncGymGroupMembership(tx, id, user.gymId, gymId);

        return await tx.user.update({
          where: { id },
          data,
          include: {
            gym: true,
            currentMembershipPlan: true
          }
        });
      });
    } else {
      // Just normal fields or isActive
      updatedUser = await prisma.user.update({
        where: { id },
        data,
        include: {
          gym: true,
          currentMembershipPlan: true
        }
      });
    }

    res.status(200).json(new ApiResponse(200, updatedUser, 'User updated successfully'));
  } catch (error) {
    return next(error);
  }
});


const deleteUser = asyncHandler(async (req, res, next) => {
  try {
     const { id } = req.params;
  if (!id) {
    throw new AppError(400, null, 'User ID is required');
  }
  const deleteUser = await prisma.user.delete({ where: { id } });
  res.status(200).json(new ApiResponse(200, deleteUser, 'User deleted successfully'));
  } catch (error) {
    return next(error);
  }
});
const syncGymGroupMembership = async (tx, userId, oldGymId, newGymId) => {
  if (oldGymId === newGymId) return;

  if (oldGymId) {
    const oldGroup = await tx.conversation.findFirst({
      where: { gymId: oldGymId, type: 'GROUP', isDefaultGroup: true }
    });
    if (oldGroup) {
      await tx.participant.deleteMany({
        where: { conversationId: oldGroup.id, userId }
      });
    }
  }

  if (newGymId) {
    let newGroup = await tx.conversation.findFirst({
      where: { gymId: newGymId, type: 'GROUP', isDefaultGroup: true }
    });
    if (!newGroup) {
      const gym = await tx.gym.findUnique({ where: { id: newGymId } });
      newGroup = await tx.conversation.create({
        data: {
          gymId: newGymId,
          type: 'GROUP',
          isDefaultGroup: true,
          title: gym ? `${gym.gymName} Group` : 'LEO Fitness Group',
          participants: {
            create: [
              { gymId: newGymId }
            ]
          }
        }
      });
    }
    await tx.participant.upsert({
      where: {
        conversationId_userId: {
          conversationId: newGroup.id,
          userId
        }
      },
      update: {},
      create: {
        conversationId: newGroup.id,
        userId
      }
    });
  }
};



const joinGymAndPlan = asyncHandler(async (req, res, next) => {
  try {
    const { userId } = req.params;
    const { membershipPlanId, gymId } = req.body;

    // VALIDATION
    if (!userId) {
      throw new AppError(400, null, "User ID is required");
    }

    if (!membershipPlanId || !gymId) {
      throw new AppError(
        400,
        null,
        "Membership Plan ID and Gym ID are required"
      );
    }

    // CHECK USER
    const isUserExist = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        currentMembershipPlan: true,
      },
    });

    if (!isUserExist) {
      throw new AppError(404, null, "User not found");
    }

    // CHECK GYM + MEMBERSHIP PLAN
    const isGymExist = await prisma.gym.findFirst({
      where: {
        id: gymId,
        membershipPlans: {
          some: {
            id: membershipPlanId,
          },
        },
      },
      include: {
        membershipPlans: {
          where: {
            id: membershipPlanId,
          },
        },
      },
    });

    if (!isGymExist) {
      throw new AppError(
        404,
        null,
        "Gym not found or membership plan not exist in that gym"
      );
    }

    // MEMBERSHIP PLAN
    const selectedPlan = isGymExist.membershipPlans[0];

    if (!selectedPlan) {
      throw new AppError(404, null, "Membership plan not found");
    }

    // OPTIONAL:
    // CHECK ACTIVE MEMBERSHIP
    if (isUserExist.currentMembershipPlanId) {
      throw new AppError(
        400,
        null,
        "User already has an active membership"
      );
    }

    // DATE CALCULATION
    const startDate = new Date();

    const endDate = new Date();
    endDate.setMonth(
      endDate.getMonth() + selectedPlan.durationInMonths
    );

    // TRANSACTION
    const result = await prisma.$transaction(async (tx) => {
      // CREATE USER MEMBERSHIP HISTORY
      const createdMembership =
        await tx.userMembershipPlans.create({
          data: {
            userId: userId,
            membershipPlanId: selectedPlan.id,

            planName: selectedPlan.name,
            price: selectedPlan.discountedPrice
              ? selectedPlan.discountedPrice
              : selectedPlan.price,

            currency: selectedPlan.currency,
            durationInMonths:
              selectedPlan.durationInMonths,

            startDate,
            endDate,

            isActive: true,
          },
        });

      // Hook group sync
      await syncGymGroupMembership(tx, userId, null, gymId);

      // UPDATE USER
      const updatedUser = await tx.user.update({
        where: {
          id: userId,
        },
        data: {
          gymId: gymId,
          currentMembershipPlanId:
            createdMembership.id,
        },
        include: {
          gym: true,
          currentMembershipPlan: true,
        },
      });

      // UPDATE GYM MEMBER COUNT
      await tx.gym.update({
        where: {
          id: gymId,
        },
        data: {
          currentMembers: {
            increment: 1,
          },
        },
      });

      return updatedUser;
    });

    return res.status(200).json(
      new ApiResponse(
        200,
        result,
        "Gym joined successfully"
      )
    );
  } catch (error) {
    console.log(error);
    return next(error);
  }
});


const removeGymAndPlan = asyncHandler(async (req, res, next) => {
  try {
    const { userId } = req.params;

    if (!userId) {
      throw new AppError(400, null, "User ID is required");
    }

    const isUserExist = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!isUserExist) {
      throw new AppError(404, null, "User not found");
    }

    if (!isUserExist.gymId) {
      throw new AppError(400, null, "User not joined any gym");
    }

    const gymId = isUserExist.gymId;
    const currentMembershipPlanId =
      isUserExist.currentMembershipPlanId;

    const result = await prisma.$transaction(
      async (tx) => {

        // DELETE MEMBERSHIP
        if (currentMembershipPlanId) {
          await tx.userMembershipPlans.delete({
            where: {
              id: currentMembershipPlanId,
            },
          });
        }

        // Hook group sync
        await syncGymGroupMembership(tx, userId, gymId, null);

        // REMOVE USER FROM GYM
        const updatedUser = await tx.user.update({
          where: {
            id: userId,
          },
          data: {
            currentMembershipPlanId: null,
            gymId: null,
          },
        });

        // DECREASE MEMBER COUNT
        await tx.gym.update({
          where: {
            id: gymId,
          },
          data: {
            currentMembers: {
              decrement: 1,
            },
          },
        });

        return updatedUser;
      }
    );

    return res.status(200).json(
      new ApiResponse(
        200,
        result,
        "Gym removed successfully"
      )
    );
  } catch (error) {
    console.log(error);
    return next(error);
  }
});

const getUserPayments = asyncHandler(async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!id) {
      throw new AppError(400, null, 'User ID is required');
    }

    // Check if user exists
    const userExists = await prisma.user.findUnique({
      where: { id }
    });
    if (!userExists) {
      throw new AppError(404, null, 'User not found');
    }

    const payments = await prisma.userMembershipPlans.findMany({
      where: { userId: id },
      orderBy: { createdAt: 'desc' },
    });

    res.status(200).json(new ApiResponse(200, payments, 'User payments retrieved successfully'));
  } catch (error) {
    return next(error);
  }
});

const getProfileUploadTicket = asyncHandler(async (req, res, next) => {
  try {
    const { id } = req.params;
    const { fileName, fileSize, mimeType } = req.body;

    if (!id) {
      throw new AppError(400, null, 'User ID is required');
    }
    if (!fileName || !fileSize || !mimeType) {
      throw new AppError(400, null, 'fileName, fileSize, and mimeType are required');
    }

    // Verify user exists
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw new AppError(404, null, 'User not found');
    }

    const requestBaseUrl = `${req.protocol}://${req.get('host')}`;

    const ticket = await storageService.getPresignedUploadUrl(
      null,
      null,
      fileName,
      fileSize,
      mimeType,
      requestBaseUrl,
      id
    );

    return res.status(200).json(
      new ApiResponse(200, ticket, 'Profile upload ticket generated successfully')
    );
  } catch (error) {
    return next(error);
  }
});

const getWeightLogs = asyncHandler(async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!id) {
      throw new AppError(400, null, 'User ID is required');
    }

    const logs = await prisma.weightLog.findMany({
      where: { userId: id },
      orderBy: { loggedAt: 'desc' }
    });

    res.status(200).json(new ApiResponse(200, logs, 'Weight logs retrieved successfully'));
  } catch (error) {
    return next(error);
  }
});

const logWeight = asyncHandler(async (req, res, next) => {
  try {
    const { id } = req.params;
    const { weight } = req.body;

    if (!id) {
      throw new AppError(400, null, 'User ID is required');
    }
    if (weight === undefined || weight === null || isNaN(Number(weight))) {
      throw new AppError(400, null, 'Valid weight is required');
    }

    const numericWeight = Number(weight);

    // Transaction to create log and update User's currentWeight
    const result = await prisma.$transaction(async (tx) => {
      // 1. Create WeightLog
      const log = await tx.weightLog.create({
        data: {
          userId: id,
          weight: numericWeight
        }
      });

      // 2. Update User's currentWeight
      const updatedUser = await tx.user.update({
        where: { id },
        data: { currentWeight: numericWeight },
        include: {
          gym: true,
          currentMembershipPlan: true
        }
      });

      return { log, updatedUser };
    });

    res.status(201).json(new ApiResponse(201, result, 'Weight logged successfully'));
  } catch (error) {
    return next(error);
  }
});

const getTargetLogs = asyncHandler(async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!id) {
      throw new AppError(400, null, 'User ID is required');
    }

    const logs = await prisma.targetLog.findMany({
      where: { userId: id },
      orderBy: { loggedAt: 'desc' }
    });

    res.status(200).json(new ApiResponse(200, logs, 'Target logs retrieved successfully'));
  } catch (error) {
    return next(error);
  }
});

const logTarget = asyncHandler(async (req, res, next) => {
  try {
    const { id } = req.params;
    const { target } = req.body;

    if (!id) {
      throw new AppError(400, null, 'User ID is required');
    }
    if (target === undefined || target === null || isNaN(Number(target))) {
      throw new AppError(400, null, 'Valid target weight is required');
    }

    const numericTarget = Number(target);

    // Transaction to create log and update User's targetWeight
    const result = await prisma.$transaction(async (tx) => {
      // 1. Create TargetLog
      const log = await tx.targetLog.create({
        data: {
          userId: id,
          target: numericTarget
        }
      });

      // 2. Update User's targetWeight
      const updatedUser = await tx.user.update({
        where: { id },
        data: { targetWeight: numericTarget },
        include: {
          gym: true,
          currentMembershipPlan: true
        }
      });

      return { log, updatedUser };
    });

    res.status(201).json(new ApiResponse(201, result, 'Target logged successfully'));
  } catch (error) {
    return next(error);
  }
});

module.exports = {
  getUsers,
  getUser,
  updateUser,
  deleteUser,
  joinGymAndPlan,
  removeGymAndPlan,
  getUserPayments,
  getProfileUploadTicket,
  getWeightLogs,
  logWeight,
  getTargetLogs,
  logTarget
};
