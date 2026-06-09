-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateIndex
CREATE INDEX "Message_timestamp_idx" ON "Message"("timestamp");
