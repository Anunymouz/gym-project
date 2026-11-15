-- CreateEnum
CREATE TYPE "PackageStatus" AS ENUM ('pending', 'active', 'cancelled');

-- CreateEnum
CREATE TYPE "BookingCanceller" AS ENUM ('member', 'trainer', 'system');

-- DropIndex
DROP INDEX "package_purchases_userId_idx";

-- AlterTable
ALTER TABLE "bookings" ADD COLUMN     "cancelledAt" TIMESTAMPTZ(3),
ADD COLUMN     "cancelledBy" "BookingCanceller",
ADD COLUMN     "holdExpiresAt" TIMESTAMPTZ(3),
ADD COLUMN     "note" TEXT,
ADD COLUMN     "refundDue" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "remindedDayAt" TIMESTAMPTZ(3),
ADD COLUMN     "remindedHourAt" TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "package_purchases" ADD COLUMN     "sessionsCount" INTEGER NOT NULL,
ADD COLUMN     "status" "PackageStatus" NOT NULL DEFAULT 'pending',
ADD COLUMN     "trainerId" UUID NOT NULL;

-- AlterTable
ALTER TABLE "trainer_packages" ADD COLUMN     "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "description" TEXT;

-- AlterTable
ALTER TABLE "trainers" ADD COLUMN     "cancelHours" INTEGER NOT NULL DEFAULT 24,
ADD COLUMN     "listed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "payoutAccountLast4" TEXT,
ADD COLUMN     "payoutAccountName" TEXT,
ADD COLUMN     "payoutBankName" TEXT,
ADD COLUMN     "payoutMethod" TEXT,
ADD COLUMN     "payoutUpdatedAt" TIMESTAMPTZ(3),
ADD COLUMN     "photoKey" TEXT,
ADD COLUMN     "photoThumbKey" TEXT,
ADD COLUMN     "platformFeeBps" INTEGER,
ALTER COLUMN "sessionPricePesewas" SET DEFAULT 0;

-- CreateTable
CREATE TABLE "trainer_invitations" (
    "id" UUID NOT NULL,
    "gymId" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "invitedById" UUID,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "acceptedAt" TIMESTAMPTZ(3),
    "closedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trainer_invitations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "trainer_invitations_email_acceptedAt_closedAt_idx" ON "trainer_invitations"("email", "acceptedAt", "closedAt");

-- CreateIndex
CREATE INDEX "trainer_invitations_gymId_createdAt_idx" ON "trainer_invitations"("gymId", "createdAt");

-- CreateIndex
CREATE INDEX "bookings_status_startsAt_idx" ON "bookings"("status", "startsAt");

-- CreateIndex
CREATE INDEX "package_purchases_userId_status_idx" ON "package_purchases"("userId", "status");

-- CreateIndex
CREATE INDEX "package_purchases_trainerId_status_idx" ON "package_purchases"("trainerId", "status");

-- AddForeignKey
ALTER TABLE "trainer_invitations" ADD CONSTRAINT "trainer_invitations_gymId_fkey" FOREIGN KEY ("gymId") REFERENCES "gyms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trainer_invitations" ADD CONSTRAINT "trainer_invitations_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "package_purchases" ADD CONSTRAINT "package_purchases_trainerId_fkey" FOREIGN KEY ("trainerId") REFERENCES "trainers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- No two live bookings for the same trainer may overlap (unpaid holds included).
-- The API also checks under a row lock; this is the database's guarantee.
CREATE EXTENSION IF NOT EXISTS btree_gist;
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_no_overlap"
  EXCLUDE USING gist ("trainerId" WITH =, tstzrange("startsAt", "endsAt") WITH &&)
  WHERE (status IN ('pending', 'confirmed'));
