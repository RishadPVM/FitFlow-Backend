/*
  Warnings:

  - You are about to drop the column `membershipPlanId` on the `User` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "User" DROP CONSTRAINT "User_membershipPlanId_fkey";

-- AlterTable
ALTER TABLE "User" DROP COLUMN "membershipPlanId";
