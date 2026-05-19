/*
  Warnings:

  - You are about to drop the column `addressLine1` on the `Gym` table. All the data in the column will be lost.
  - You are about to drop the column `addressLine2` on the `Gym` table. All the data in the column will be lost.
  - Added the required column `address` to the `Gym` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Gym" DROP COLUMN "addressLine1",
DROP COLUMN "addressLine2",
ADD COLUMN     "address" TEXT NOT NULL;
