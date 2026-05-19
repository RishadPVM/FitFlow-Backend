const asyncHandler = require('../utils/async-handler');
const ApiResponse = require('../utils/api-response');
const AppError = require('../utils/app-error');
const prisma = require('../config/database');

/**
 * Create Membership Plan
 */
const createMembershipPlan = asyncHandler(async (req, res) => {
  const {
    gymId,
    name,
    description,
    price,
    discountedPrice,
    currency = 'INR',
    durationInMonths,
    features = [],
    isActive = true,
    isPopular = false,
    sortOrder = 0,
  } = req.body;

  // Validation
  if (!gymId || !name || price == null || durationInMonths == null) {
    throw new AppError(
      400,
      null,
      'Gym ID, name, price and duration are required'
    );
  }

  if (!Array.isArray(features)) {
    throw new AppError(400, null, 'Features must be an array');
  }

  if (Number(price) <= 0) {
    throw new AppError(400, null, 'Price must be greater than 0');
  }

  if (Number(durationInMonths) <= 0) {
    throw new AppError(
      400,
      null,
      'Duration in months must be greater than 0'
    );
  }

  if (
    discountedPrice != null &&
    Number(discountedPrice) > Number(price)
  ) {
    throw new AppError(
      400,
      null,
      'Discounted price cannot be greater than price'
    );
  }

  // Check gym exists
  const gym = await prisma.gym.findUnique({
    where: { id: gymId },
    select: { id: true },
  });

  if (!gym) {
    throw new AppError(404, null, 'Gym not found');
  }

  // Check duplicate plan name
  const existingPlan = await prisma.membershipPlan.findFirst({
    where: {
      gymId,
      name: name.trim(),
    },
    select: { id: true },
  });

  if (existingPlan) {
    throw new AppError(
      409,
      null,
      'Membership plan with this name already exists'
    );
  }

  const membershipPlan = await prisma.membershipPlan.create({
    data: {
      gymId,
      name: name.trim(),
      description,
      price: price.toString(),
      discountedPrice:
        discountedPrice != null
          ? discountedPrice.toString()
          : null,
      currency,
      durationInMonths: Number(durationInMonths),
      features,
      isActive,
      isPopular,
      sortOrder,
    },
  });

  return res.status(201).json(
    new ApiResponse(
      201,
      membershipPlan,
      'Membership plan created successfully'
    )
  );
});



/**
 * Update Membership Plan
 */
const updateMembershipPlan = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!id) {
    throw new AppError(400, null, 'Membership plan ID is required');
  }

  const existingPlan = await prisma.membershipPlan.findUnique({
    where: { id },
  });

  if (!existingPlan) {
    throw new AppError(404, null, 'Membership plan not found');
  }

  const {
    gymId,
    name,
    description,
    price,
    discountedPrice,
    currency,
    durationInMonths,
    features,
    isActive,
    isPopular,
    sortOrder,
  } = req.body;

  if (features !== undefined && !Array.isArray(features)) {
    throw new AppError(400, null, 'Features must be an array');
  }

  if (price !== undefined && Number(price) <= 0) {
    throw new AppError(400, null, 'Price must be greater than 0');
  }

  if (
    durationInMonths !== undefined &&
    Number(durationInMonths) <= 0
  ) {
    throw new AppError(
      400,
      null,
      'Duration in months must be greater than 0'
    );
  }

  const finalPrice =
    price !== undefined ? Number(price) : Number(existingPlan.price);

  const finalDiscountedPrice =
    discountedPrice !== undefined
      ? discountedPrice
      : existingPlan.discountedPrice;

  if (
    finalDiscountedPrice != null &&
    Number(finalDiscountedPrice) > finalPrice
  ) {
    throw new AppError(
      400,
      null,
      'Discounted price cannot be greater than price'
    );
  }

  // Check duplicate if name changed
  if (
    name &&
    (name.trim() !== existingPlan.name ||
      gymId !== existingPlan.gymId)
  ) {
    const duplicatePlan = await prisma.membershipPlan.findFirst({
      where: {
        gymId: gymId || existingPlan.gymId,
        name: name.trim(),
        NOT: {
          id,
        },
      },
      select: { id: true },
    });

    if (duplicatePlan) {
      throw new AppError(
        409,
        null,
        'Membership plan with this name already exists'
      );
    }
  }

  const updateData = {};

  if (gymId !== undefined) updateData.gymId = gymId;
  if (name !== undefined) updateData.name = name.trim();
  if (description !== undefined)
    updateData.description = description;
  if (price !== undefined)
    updateData.price = price.toString();
  if (discountedPrice !== undefined)
    updateData.discountedPrice =
      discountedPrice != null
        ? discountedPrice.toString()
        : null;
  if (currency !== undefined)
    updateData.currency = currency;
  if (durationInMonths !== undefined)
    updateData.durationInMonths =
      Number(durationInMonths);
  if (features !== undefined)
    updateData.features = features;
  if (isActive !== undefined)
    updateData.isActive = isActive;
  if (isPopular !== undefined)
    updateData.isPopular = isPopular;
  if (sortOrder !== undefined)
    updateData.sortOrder = sortOrder;

  const updatedPlan = await prisma.membershipPlan.update({
    where: { id },
    data: updateData,
  });

  return res.status(200).json(
    new ApiResponse(
      200,
      updatedPlan,
      'Membership plan updated successfully'
    )
  );
});



/**
 * Delete Membership Plan
 */
const deleteMembershipPlan = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!id) {
    throw new AppError(400, null, 'Membership plan ID is required');
  }

  const existingPlan = await prisma.membershipPlan.findUnique({
    where: { id },
    select: { id: true },
  });

  if (!existingPlan) {
    throw new AppError(404, null, 'Membership plan not found');
  }

  await prisma.membershipPlan.delete({
    where: { id },
  });

  return res.status(200).json(
    new ApiResponse(
      200,
      null,
      'Membership plan deleted successfully'
    )
  );
});



/**
 * Get All Membership Plans By Gym
 */
const getMembershipPlansByGym = asyncHandler(async (req, res) => {
  const { gymId } = req.params;

  if (!gymId) {
    throw new AppError(400, null, 'Gym ID is required');
  }

  const membershipPlans =
    await prisma.membershipPlan.findMany({
      where: { gymId },
      orderBy: [
        { sortOrder: 'asc' },
        { createdAt: 'desc' },
      ],
    });

  return res.status(200).json(
    new ApiResponse(
      200,
      membershipPlans,
      'Membership plans retrieved successfully'
    )
  );
});



/**
 * Get Single Membership Plan
 */
const getMembershipPlan = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!id) {
    throw new AppError(400, null, 'Membership plan ID is required');
  }

  const membershipPlan =
    await prisma.membershipPlan.findUnique({
      where: { id },
    });

  if (!membershipPlan) {
    throw new AppError(404, null, 'Membership plan not found');
  }

  return res.status(200).json(
    new ApiResponse(
      200,
      membershipPlan,
      'Membership plan retrieved successfully'
    )
  );
});

module.exports = {
  createMembershipPlan,
  updateMembershipPlan,
  deleteMembershipPlan,
  getMembershipPlansByGym,
  getMembershipPlan,
};