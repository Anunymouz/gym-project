-- posts, post_media and reports had no rows yet (posting was not possible before this change).
-- DropForeignKey
ALTER TABLE "reports" DROP CONSTRAINT "reports_reporterUserId_fkey";

-- AlterTable
ALTER TABLE "post_media" DROP COLUMN "url",
ADD COLUMN     "height" INTEGER NOT NULL,
ADD COLUMN     "key" TEXT NOT NULL,
ADD COLUMN     "thumbKey" TEXT NOT NULL,
ADD COLUMN     "width" INTEGER NOT NULL;

-- AlterTable
ALTER TABLE "reports" ADD COLUMN     "details" TEXT,
ADD COLUMN     "resolvedAt" TIMESTAMPTZ(3),
ADD COLUMN     "resolvedById" UUID;

-- CreateIndex
CREATE UNIQUE INDEX "reports_reporterUserId_targetType_targetId_key" ON "reports"("reporterUserId", "targetType", "targetId");

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_reporterUserId_fkey" FOREIGN KEY ("reporterUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

