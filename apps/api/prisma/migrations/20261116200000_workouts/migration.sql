-- AlterEnum
ALTER TYPE "VideoPurpose" ADD VALUE 'exercise';

-- DropForeignKey
ALTER TABLE "workout_sessions" DROP CONSTRAINT "workout_sessions_workoutId_fkey";

-- AlterTable
ALTER TABLE "exercises" ADD COLUMN     "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "imageKey" TEXT,
ADD COLUMN     "imageThumbKey" TEXT,
ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "secondaryMuscles" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'bgym',
ADD COLUMN     "tips" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "videoUploadId" UUID;

-- AlterTable
ALTER TABLE "workout_exercises" ADD COLUMN     "notes" TEXT;

-- AlterTable
ALTER TABLE "workout_sessions" ADD COLUMN     "durationSec" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "effort" INTEGER,
ADD COLUMN     "exercisesCompleted" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "exercisesTotal" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "workouts" ADD COLUMN     "coverKey" TEXT,
ADD COLUMN     "coverThumbKey" TEXT,
ADD COLUMN     "goal" TEXT NOT NULL DEFAULT 'strength',
ADD COLUMN     "slug" TEXT,
ADD COLUMN     "sortOrder" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateIndex
CREATE UNIQUE INDEX "exercises_videoUploadId_key" ON "exercises"("videoUploadId");

-- CreateIndex
CREATE INDEX "exercises_bodyPart_isActive_idx" ON "exercises"("bodyPart", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "workouts_slug_key" ON "workouts"("slug");

-- CreateIndex
CREATE INDEX "workouts_isPublished_sortOrder_idx" ON "workouts"("isPublished", "sortOrder");

-- AddForeignKey
ALTER TABLE "exercises" ADD CONSTRAINT "exercises_videoUploadId_fkey" FOREIGN KEY ("videoUploadId") REFERENCES "video_uploads"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workout_sessions" ADD CONSTRAINT "workout_sessions_workoutId_fkey" FOREIGN KEY ("workoutId") REFERENCES "workouts"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Sensible numbers only.
ALTER TABLE "workout_exercises" ADD CONSTRAINT "workout_exercises_valid" CHECK (("sets" IS NULL OR "sets" BETWEEN 1 AND 20) AND ("reps" IS NULL OR "reps" BETWEEN 1 AND 200) AND ("durationSec" IS NULL OR "durationSec" BETWEEN 5 AND 3600) AND ("restSec" IS NULL OR "restSec" BETWEEN 0 AND 600));
ALTER TABLE "workout_sessions" ADD CONSTRAINT "workout_sessions_valid" CHECK ("durationSec" >= 0 AND "exercisesCompleted" >= 0 AND "exercisesCompleted" <= "exercisesTotal" AND ("effort" IS NULL OR "effort" BETWEEN 1 AND 5));
