-- AlterTable
ALTER TABLE "User" ADD COLUMN     "currentMembershipPlanId" TEXT;

-- CreateTable
CREATE TABLE "UserMembershipPlans" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "membershipPlanId" TEXT NOT NULL,
    "planName" TEXT NOT NULL,
    "price" DECIMAL(10,2),
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "durationInMonths" INTEGER NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserMembershipPlans_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_currentMembershipPlanId_fkey" FOREIGN KEY ("currentMembershipPlanId") REFERENCES "UserMembershipPlans"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserMembershipPlans" ADD CONSTRAINT "UserMembershipPlans_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserMembershipPlans" ADD CONSTRAINT "UserMembershipPlans_membershipPlanId_fkey" FOREIGN KEY ("membershipPlanId") REFERENCES "MembershipPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
