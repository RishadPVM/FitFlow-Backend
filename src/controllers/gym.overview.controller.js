const asyncHandler = require("../utils/async-handler");
const ApiResponse = require("../utils/api-response");
const AppError = require("../utils/app-error");
const prisma = require("../config/database");

/**
 * Get Gym Dashboard Overview Data
 * GET /api/v1/gym/overview/:gymId
 */
const getGymOverview = asyncHandler(async (req, res, next) => {
  try {
    const { gymId } = req.params;

    if (!gymId) {
      throw new AppError(400, null, "Gym ID is required");
    }

    // Verify gym exists
    const gym = await prisma.gym.findUnique({
      where: { id: gymId },
      select: { id: true }
    });

    if (!gym) {
      throw new AppError(404, null, "Gym not found");
    }

    // 1. Total Users registered in the gym
    const totalUsers = await prisma.user.count({
      where: { gymId }
    });

    // 2. Active Users in the gym
    const activeUsers = await prisma.user.count({
      where: { gymId, isActive: true }
    });

    // 3. Simulated Currently live/working out in gym (grounded by active users)
    const workingUsers = activeUsers > 0 
      ? Math.min(activeUsers, Math.floor(activeUsers * 0.08) + 3)
      : 0;

    // 4. Pending amount & count calculation
    // Retrieve gym's membership plans to establish a fallback default plan price
    const gymPlans = await prisma.membershipPlan.findMany({
      where: { gymId, isActive: true },
      select: { price: true }
    });

    const defaultPlanPrice = gymPlans.length > 0
      ? Math.min(...gymPlans.map(p => Number(p.price)))
      : 1000; // fallback standard price

    // Retrieve users with no active/valid membership
    const pendingUsers = await prisma.user.findMany({
      where: {
        gymId,
        OR: [
          { currentMembershipPlanId: null },
          {
            currentMembershipPlan: {
              OR: [
                { endDate: { lt: new Date() } },
                { isActive: false }
              ]
            }
          }
        ]
      },
      include: {
        currentMembershipPlan: true
      }
    });

    let pendingAmount = 0;
    const pendingUsersCount = pendingUsers.length;

    for (const user of pendingUsers) {
      if (user.currentMembershipPlan && user.currentMembershipPlan.price) {
        pendingAmount += Number(user.currentMembershipPlan.price);
      } else {
        pendingAmount += defaultPlanPrice;
      }
    }

    // 5. User Growth: registered users per day in the last 7 days
    const daysOfWeek = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const userGrowth = [];
    const today = new Date();

    for (let i = 6; i >= 0; i--) {
      const date = new Date();
      date.setDate(today.getDate() - i);
      const dayLabel = daysOfWeek[date.getDay()];

      const startOfDay = new Date(date.setHours(0, 0, 0, 0));
      const endOfDay = new Date(date.setHours(23, 59, 59, 999));

      const count = await prisma.user.count({
        where: {
          gymId,
          createdAt: {
            gte: startOfDay,
            lte: endOfDay
          }
        }
      });

      userGrowth.push({ label: dayLabel, value: Number(count) });
    }

    // 6. Live Activity: deterministic events for the top 5 most recently active users
    const recentUsers = await prisma.user.findMany({
      where: { gymId, isActive: true },
      orderBy: { updatedAt: "desc" },
      take: 5
    });

    const actionPool = [
      { action: "Started workout", isEntry: true },
      { action: "Checked in via QR", isEntry: true },
      { action: "Logged into app", isEntry: true },
      { action: "Completed daily goal", isEntry: false },
      { action: "Left the gym", isEntry: false }
    ];

    const liveActivity = recentUsers.map((user, index) => {
      const actionObj = actionPool[index % actionPool.length];
      const diffMs = new Date() - new Date(user.updatedAt);
      const diffMins = Math.max(0, Math.floor(diffMs / 60000));
      
      let timeStr = "Just now";
      if (diffMins > 0 && diffMins < 60) {
        timeStr = `${diffMins} min ago`;
      } else if (diffMins >= 60 && diffMins < 1440) {
        const hours = Math.floor(diffMins / 60);
        timeStr = `${hours} hour${hours > 1 ? "s" : ""} ago`;
      } else if (diffMins >= 1440) {
        const days = Math.floor(diffMins / 1440);
        timeStr = `${days} day${days > 1 ? "s" : ""} ago`;
      }

      return {
        userName: user.name,
        action: actionObj.action,
        time: timeStr,
        isEntry: actionObj.isEntry
      };
    });

    // Send successful response
    res.status(200).json(
      new ApiResponse(
        200,
        {
          totalUsers,
          activeUsers,
          workingUsers,
          pendingAmount,
          pendingUsersCount,
          userGrowth,
          liveActivity
        },
        "Gym overview data retrieved successfully"
      )
    );
  } catch (error) {
    return next(error);
  }
});

module.exports = {
  getGymOverview
};
