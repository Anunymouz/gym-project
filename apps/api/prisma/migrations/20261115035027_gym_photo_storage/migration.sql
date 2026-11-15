-- gym_photos had no rows yet (photos were never uploadable before this change), so replacing url is safe.
-- AlterTable
ALTER TABLE "gym_photos" DROP COLUMN "url",
ADD COLUMN     "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "createdById" UUID,
ADD COLUMN     "height" INTEGER NOT NULL,
ADD COLUMN     "key" TEXT NOT NULL,
ADD COLUMN     "thumbKey" TEXT NOT NULL,
ADD COLUMN     "width" INTEGER NOT NULL;

