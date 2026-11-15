-- CreateEnum
CREATE TYPE "ReminderKind" AS ENUM ('days_7', 'days_3', 'days_1', 'expired', 'manual');

-- CreateTable
CREATE TABLE "membership_reminders" (
    "id" UUID NOT NULL,
    "membershipId" UUID NOT NULL,
    "kind" "ReminderKind" NOT NULL,
    "sentById" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "membership_reminders_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "membership_reminders_membershipId_createdAt_idx" ON "membership_reminders"("membershipId", "createdAt");

-- AddForeignKey
ALTER TABLE "membership_reminders" ADD CONSTRAINT "membership_reminders_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "memberships"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membership_reminders" ADD CONSTRAINT "membership_reminders_sentById_fkey" FOREIGN KEY ("sentById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Each automatic reminder at most once per membership (manual ones may repeat, rate-limited
-- in the API). Inserting the row is the "claim" that makes sending safe across instances.
CREATE UNIQUE INDEX "membership_reminders_auto_once" ON "membership_reminders"("membershipId", "kind") WHERE "kind" <> 'manual';
