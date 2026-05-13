-- CreateEnum
CREATE TYPE "BloodGroup" AS ENUM ('aPositive', 'aNegative', 'bPositive', 'bNegative', 'abPositive', 'abNegative', 'oPositive', 'oNegative');

-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('male', 'female', 'other');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "bloodGroup" "BloodGroup",
ADD COLUMN     "currentWeight" DOUBLE PRECISION,
ADD COLUMN     "dateOfBirth" TIMESTAMP(3),
ADD COLUMN     "gender" "Gender",
ADD COLUMN     "height" DOUBLE PRECISION,
ADD COLUMN     "isGymMember" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "targetWeight" DOUBLE PRECISION;
