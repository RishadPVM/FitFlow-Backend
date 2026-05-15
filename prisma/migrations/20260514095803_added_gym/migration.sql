-- CreateEnum
CREATE TYPE "GymStatus" AS ENUM ('PENDING', 'ACTIVE', 'INACTIVE', 'SUSPENDED', 'REJECTED', 'CLOSED');

-- CreateTable
CREATE TABLE "Gym" (
    "id" TEXT NOT NULL,
    "gymCode" TEXT NOT NULL,
    "gymName" TEXT NOT NULL,
    "ownerName" TEXT NOT NULL,
    "gymAbout" TEXT,
    "establishedYear" INTEGER,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "whatsappNumber" TEXT,
    "alternatePhone" TEXT,
    "website" TEXT,
    "addressLine1" TEXT NOT NULL,
    "addressLine2" TEXT,
    "city" TEXT NOT NULL,
    "district" TEXT,
    "state" TEXT NOT NULL,
    "country" TEXT NOT NULL DEFAULT 'India',
    "postalCode" TEXT NOT NULL,
    "latitude" DECIMAL(10,7),
    "longitude" DECIMAL(10,7),
    "workingHours" JSONB,
    "is24Hours" BOOLEAN NOT NULL DEFAULT false,
    "logoUrl" TEXT,
    "coverImageUrl" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Kolkata',
    "maxMembers" INTEGER,
    "currentMembers" INTEGER NOT NULL DEFAULT 0,
    "instagramUrl" TEXT,
    "facebookUrl" TEXT,
    "youtubeUrl" TEXT,
    "status" "GymStatus" NOT NULL DEFAULT 'PENDING',
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "isFeatured" BOOLEAN NOT NULL DEFAULT false,
    "totalTrainers" INTEGER NOT NULL DEFAULT 0,
    "totalBranches" INTEGER NOT NULL DEFAULT 1,
    "gstNumber" TEXT,
    "licenseNumber" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Gym_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Gym_gymCode_key" ON "Gym"("gymCode");

-- CreateIndex
CREATE UNIQUE INDEX "Gym_email_key" ON "Gym"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Gym_phone_key" ON "Gym"("phone");
