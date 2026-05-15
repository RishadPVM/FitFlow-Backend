/*
  Warnings:

  - Added the required column `password` to the `Gym` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Gym" ADD COLUMN     "password" TEXT NOT NULL;
