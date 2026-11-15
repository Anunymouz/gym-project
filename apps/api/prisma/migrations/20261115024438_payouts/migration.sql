-- DropIndex
DROP INDEX "email_otps_email_createdAt_idx";

-- AlterTable
ALTER TABLE "email_otps" ADD COLUMN     "purpose" TEXT NOT NULL DEFAULT 'sign_in';

-- AlterTable
ALTER TABLE "gyms" ADD COLUMN     "payoutAccountLast4" TEXT,
ADD COLUMN     "payoutAccountName" TEXT,
ADD COLUMN     "payoutBankName" TEXT,
ADD COLUMN     "payoutMethod" TEXT,
ADD COLUMN     "payoutUpdatedAt" TIMESTAMPTZ(3);

-- CreateIndex
CREATE INDEX "email_otps_email_purpose_createdAt_idx" ON "email_otps"("email", "purpose", "createdAt");

