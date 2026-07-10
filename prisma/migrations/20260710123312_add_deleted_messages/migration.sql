-- AlterTable
ALTER TABLE "Participant" ADD COLUMN     "deletedMessageIds" TEXT[] DEFAULT ARRAY[]::TEXT[];
