-- AlterTable
ALTER TABLE "Attachment" ADD COLUMN     "key" TEXT;

-- AlterTable
ALTER TABLE "Gym" ADD COLUMN     "coverImageKey" TEXT,
ADD COLUMN     "logoKey" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "profileImageKey" TEXT;
