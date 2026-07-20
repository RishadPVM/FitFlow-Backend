const asyncHandler = require('../utils/async-handler');
const ApiResponse = require('../utils/api-response');
const AppError = require("../utils/app-error");
const prisma = require('../config/database');

/**
 * GET /members/:id
 * Returns member, membership, attendance overview, and history details.
 */
const getMemberDetail = asyncHandler(async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!id) {
      throw new AppError(400, null, 'User ID is required');
    }

    // 1. Fetch User details
    const user = await prisma.user.findUnique({
      where: { id },
      include: {
        currentMembershipPlan: true,
        gym: true,
      },
    });

    if (!user) {
      throw new AppError(404, null, 'User not found');
    }

    // 2. Fetch membership plans history
    const membershipHistory = await prisma.userMembershipPlans.findMany({
      where: { userId: id },
      orderBy: { createdAt: 'desc' },
    });

    // 3. Fetch attendance records
    const attendances = await prisma.attendance.findMany({
      where: { userId: id },
      orderBy: { checkInTime: 'desc' },
    });

    // 4. Calculate Attendance Statistics for the current month
    const totalVisits = attendances.length;
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    
    const thisMonthAttendance = attendances.filter(
      (att) => new Date(att.attendanceDate) >= startOfMonth
    ).length;

    // Define period for present/absent days (current month)
    const joinDate = new Date(user.createdAt);
    const startPeriod = joinDate > startOfMonth ? joinDate : startOfMonth;
    startPeriod.setHours(0, 0, 0, 0);

    const endPeriod = new Date();
    endPeriod.setHours(23, 59, 59, 999);

    const msPerDay = 24 * 60 * 60 * 1000;
    const elapsedDays = Math.max(1, Math.ceil((endPeriod - startPeriod) / msPerDay));

    // Calculate present days as unique calendar dates user checked in this month
    const uniquePresentDates = new Set(
      attendances
        .filter((att) => {
          const d = new Date(att.attendanceDate);
          return d >= startPeriod && d <= endPeriod;
        })
        .map((att) => new Date(att.attendanceDate).toDateString())
    );
    const presentDays = uniquePresentDates.size;
    const absentDays = Math.max(0, elapsedDays - presentDays);
    const attendanceRate = elapsedDays > 0 ? Math.round((presentDays / elapsedDays) * 100) : 100;

    // 5. Synthesize Activity Timeline
    const activities = [];

    // - Member Created
    activities.push({
      id: `created-${user.id}`,
      type: 'profile',
      title: 'Member Created',
      description: 'New member registered',
      timestamp: user.createdAt,
    });

    // - Attendances
    attendances.forEach((att) => {
      activities.push({
        id: `att-${att.id}`,
        type: 'attendance',
        title: 'Attendance Marked',
        description: `User checked into gym (${att.method})`,
        timestamp: att.checkInTime,
      });
    });

    // - Memberships
    membershipHistory.forEach((mem, index) => {
      const isFirst = index === membershipHistory.length - 1;
      let title = 'Membership Activated';
      let description = `Started ${mem.planName} plan`;
      if (!isFirst) {
        const prevMem = membershipHistory[index + 1];
        title = 'Membership Updated';
        description = `Membership changed from ${prevMem.planName} to ${mem.planName}`;
      } else {
        title = 'Membership Created';
        description = `Purchased ${mem.planName} plan`;
      }
      activities.push({
        id: `mem-${mem.id}`,
        type: 'membership',
        title,
        description,
        timestamp: mem.createdAt,
      });
    });

    // Sort timeline: newest first
    activities.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    res.status(200).json(
      new ApiResponse(
        200,
        {
          user,
          currentMembership: user.currentMembershipPlan,
          membershipHistory,
          attendance: {
            totalVisits,
            thisMonthAttendance,
            lastVisit: attendances.length > 0 ? attendances[0].checkInTime : null,
            presentDays,
            absentDays,
            attendanceRate,
            records: attendances,
          },
          activities,
        },
        'Member details retrieved successfully'
      )
    );
  } catch (error) {
    return next(error);
  }
});

/**
 * PATCH /members/:id/membership
 * Updates membership plan.
 */
const updateMemberMembership = asyncHandler(async (req, res, next) => {
  try {
    const { id } = req.params;
    const { membershipPlanId, planName, durationInDays, durationInMonths, startDate: reqStartDate, price: reqPrice } = req.body;

    if (!id) {
      throw new AppError(400, null, 'User ID is required');
    }

    const user = await prisma.user.findUnique({
      where: { id },
    });

    if (!user) {
      throw new AppError(404, null, 'User not found');
    }
    if (!user.gymId) {
      throw new AppError(400, null, 'User is not associated with any gym');
    }

    let plan;
    if (membershipPlanId) {
      plan = await prisma.membershipPlan.findUnique({
        where: { id: membershipPlanId }
      });
    }

    if (!plan && planName) {
      // Try to find the plan by name in this gym
      plan = await prisma.membershipPlan.findFirst({
        where: {
          gymId: user.gymId,
          name: { equals: planName, mode: 'insensitive' },
        },
      });
    }

    // Create plan on the fly if not exists
    if (!plan) {
      const finalPlanName = planName || 'Custom Plan';
      const finalDurationMonths = durationInMonths || (durationInDays ? Math.max(1, Math.round(durationInDays / 30)) : 1);
      plan = await prisma.membershipPlan.create({
        data: {
          gymId: user.gymId,
          name: finalPlanName,
          price: reqPrice || 999.00,
          durationInMonths: finalDurationMonths,
          features: ['Access to gym equipment', 'Locker access'],
        },
      });
    }

    const startDate = reqStartDate ? new Date(reqStartDate) : new Date();
    const finalDurationMonths = durationInMonths !== undefined ? Number(durationInMonths) : (plan ? plan.durationInMonths : 0);
    const finalDurationDays = durationInDays !== undefined ? Number(durationInDays) : (plan ? plan.durationInDays : 0);

    const endDate = new Date(startDate);
    if (finalDurationDays > 0) {
      endDate.setDate(endDate.getDate() + finalDurationDays);
    } else {
      endDate.setMonth(endDate.getMonth() + (finalDurationMonths > 0 ? finalDurationMonths : 1));
    }

    const finalPrice = reqPrice !== undefined ? Number(reqPrice) : (plan.discountedPrice ? Number(plan.discountedPrice) : Number(plan.price));

    const result = await prisma.$transaction(async (tx) => {
      // Deactivate current membership
      if (user.currentMembershipPlanId) {
        await tx.userMembershipPlans.update({
          where: { id: user.currentMembershipPlanId },
          data: { isActive: false },
        });
      }

      // Create new user membership entry
      const newMembership = await tx.userMembershipPlans.create({
        data: {
          userId: user.id,
          membershipPlanId: plan.id,
          planName: plan.name,
          price: finalPrice,
          currency: plan.currency,
          durationInMonths: finalDurationMonths,
          durationInDays: finalDurationDays,
          startDate,
          endDate,
          isActive: true,
        },
      });

      // Update User
      return await tx.user.update({
        where: { id: user.id },
        data: {
          currentMembershipPlanId: newMembership.id,
          isActive: true, // Mark user as active since they got a plan
        },
        include: {
          currentMembershipPlan: true,
          gym: true,
        },
      });
    });

    res.status(200).json(
      new ApiResponse(200, result, 'Membership plan updated successfully')
    );
  } catch (error) {
    return next(error);
  }
});

/**
 * GET /members/:id/attendance
 * Returns attendance records.
 */
const getMemberAttendance = asyncHandler(async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!id) {
      throw new AppError(400, null, 'User ID is required');
    }

    const attendances = await prisma.attendance.findMany({
      where: { userId: id },
      orderBy: { checkInTime: 'desc' },
    });

    res.status(200).json(
      new ApiResponse(200, attendances, 'Attendance records retrieved successfully')
    );
  } catch (error) {
    return next(error);
  }
});

/**
 * GET /members/:id/history
 * Returns activity timeline.
 */
const getMemberHistory = asyncHandler(async (req, res, next) => {
  try {
    const { id } = req.params;
    const { type } = req.query;

    if (!id) {
      throw new AppError(400, null, 'User ID is required');
    }

    const user = await prisma.user.findUnique({
      where: { id },
    });
    if (!user) {
      throw new AppError(404, null, 'User not found');
    }

    const membershipHistory = await prisma.userMembershipPlans.findMany({
      where: { userId: id },
      orderBy: { createdAt: 'desc' },
    });

    const attendances = await prisma.attendance.findMany({
      where: { userId: id },
      orderBy: { checkInTime: 'desc' },
    });

    const activities = [];

    // - Member Created
    activities.push({
      id: `created-${user.id}`,
      type: 'profile',
      title: 'Member Created',
      description: 'New member registered',
      timestamp: user.createdAt,
    });

    // - Attendances
    attendances.forEach((att) => {
      activities.push({
        id: `att-${att.id}`,
        type: 'attendance',
        title: 'Attendance Marked',
        description: `User checked into gym (${att.method})`,
        timestamp: att.checkInTime,
      });
    });

    // - Memberships
    membershipHistory.forEach((mem, index) => {
      const isFirst = index === membershipHistory.length - 1;
      let title = 'Membership Activated';
      let description = `Started ${mem.planName} plan`;
      if (!isFirst) {
        const prevMem = membershipHistory[index + 1];
        title = 'Membership Updated';
        description = `Membership changed from ${prevMem.planName} to ${mem.planName}`;
      } else {
        title = 'Membership Created';
        description = `Purchased ${mem.planName} plan`;
      }
      activities.push({
        id: `mem-${mem.id}`,
        type: 'membership',
        title,
        description,
        timestamp: mem.createdAt,
      });
    });

    // Sort by timestamp desc
    activities.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    // Filter by type if specified
    let filteredActivities = activities;
    if (type && type.toLowerCase() !== 'all') {
      filteredActivities = activities.filter(
        (act) => act.type.toLowerCase() === type.toLowerCase()
      );
    }

    res.status(200).json(
      new ApiResponse(200, filteredActivities, 'Activity history retrieved successfully')
    );
  } catch (error) {
    return next(error);
  }
});

module.exports = {
  getMemberDetail,
  updateMemberMembership,
  getMemberAttendance,
  getMemberHistory,
};
