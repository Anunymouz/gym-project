-- AlterTable
ALTER TABLE "gyms" ADD COLUMN     "reviewNote" TEXT,
ADD COLUMN     "reviewedAt" TIMESTAMPTZ(3),
ADD COLUMN     "reviewedById" UUID,
ADD COLUMN     "submittedAt" TIMESTAMPTZ(3);

