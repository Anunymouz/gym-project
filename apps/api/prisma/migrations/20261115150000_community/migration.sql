-- CreateEnum
CREATE TYPE "PostAuthorKind" AS ENUM ('gym', 'member');

-- CreateEnum
CREATE TYPE "VideoPurpose" AS ENUM ('post', 'story');

-- CreateEnum
CREATE TYPE "VideoStatus" AS ENUM ('awaiting_upload', 'processing', 'ready', 'failed');

-- AlterTable
ALTER TABLE "post_media" ADD COLUMN     "videoUploadId" UUID,
ALTER COLUMN "key" DROP NOT NULL,
ALTER COLUMN "thumbKey" DROP NOT NULL;

-- AlterTable
ALTER TABLE "posts" ADD COLUMN     "authorKind" "PostAuthorKind" NOT NULL DEFAULT 'gym',
ADD COLUMN     "commentCount" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "communityAcceptedAt" TIMESTAMPTZ(3);

-- CreateTable
CREATE TABLE "post_comments" (
    "id" UUID NOT NULL,
    "postId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "status" "ContentStatus" NOT NULL DEFAULT 'published',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "post_comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "video_uploads" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "purpose" "VideoPurpose" NOT NULL,
    "provider" TEXT NOT NULL,
    "providerId" TEXT,
    "posterKey" TEXT,
    "status" "VideoStatus" NOT NULL DEFAULT 'awaiting_upload',
    "durationSec" DOUBLE PRECISION,
    "width" INTEGER,
    "height" INTEGER,
    "error" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readyAt" TIMESTAMPTZ(3),
    "usedAt" TIMESTAMPTZ(3),

    CONSTRAINT "video_uploads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stories" (
    "id" UUID NOT NULL,
    "gymId" UUID NOT NULL,
    "authorUserId" UUID NOT NULL,
    "authorKind" "PostAuthorKind" NOT NULL,
    "type" "MediaType" NOT NULL,
    "key" TEXT,
    "thumbKey" TEXT,
    "videoUploadId" UUID,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "caption" TEXT,
    "status" "ContentStatus" NOT NULL DEFAULT 'published',
    "likeCount" INTEGER NOT NULL DEFAULT 0,
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "stories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "story_views" (
    "storyId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "viewedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "story_views_pkey" PRIMARY KEY ("storyId","userId")
);

-- CreateTable
CREATE TABLE "story_likes" (
    "storyId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "story_likes_pkey" PRIMARY KEY ("storyId","userId")
);

-- CreateTable
CREATE TABLE "user_blocks" (
    "blockerId" UUID NOT NULL,
    "blockedId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_blocks_pkey" PRIMARY KEY ("blockerId","blockedId")
);

-- CreateIndex
CREATE INDEX "post_comments_postId_status_createdAt_idx" ON "post_comments"("postId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "video_uploads_userId_createdAt_idx" ON "video_uploads"("userId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "video_uploads_status_createdAt_idx" ON "video_uploads"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "stories_videoUploadId_key" ON "stories"("videoUploadId");

-- CreateIndex
CREATE INDEX "stories_gymId_status_expiresAt_idx" ON "stories"("gymId", "status", "expiresAt");

-- CreateIndex
CREATE INDEX "stories_authorUserId_expiresAt_idx" ON "stories"("authorUserId", "expiresAt");

-- CreateIndex
CREATE INDEX "user_blocks_blockedId_idx" ON "user_blocks"("blockedId");

-- CreateIndex
CREATE UNIQUE INDEX "post_media_videoUploadId_key" ON "post_media"("videoUploadId");

-- CreateIndex
CREATE INDEX "posts_authorUserId_createdAt_idx" ON "posts"("authorUserId", "createdAt" DESC);

-- AddForeignKey
ALTER TABLE "post_media" ADD CONSTRAINT "post_media_videoUploadId_fkey" FOREIGN KEY ("videoUploadId") REFERENCES "video_uploads"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_comments" ADD CONSTRAINT "post_comments_postId_fkey" FOREIGN KEY ("postId") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_comments" ADD CONSTRAINT "post_comments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "video_uploads" ADD CONSTRAINT "video_uploads_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stories" ADD CONSTRAINT "stories_gymId_fkey" FOREIGN KEY ("gymId") REFERENCES "gyms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stories" ADD CONSTRAINT "stories_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stories" ADD CONSTRAINT "stories_videoUploadId_fkey" FOREIGN KEY ("videoUploadId") REFERENCES "video_uploads"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "story_views" ADD CONSTRAINT "story_views_storyId_fkey" FOREIGN KEY ("storyId") REFERENCES "stories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "story_views" ADD CONSTRAINT "story_views_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "story_likes" ADD CONSTRAINT "story_likes_storyId_fkey" FOREIGN KEY ("storyId") REFERENCES "stories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "story_likes" ADD CONSTRAINT "story_likes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_blocks" ADD CONSTRAINT "user_blocks_blockerId_fkey" FOREIGN KEY ("blockerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_blocks" ADD CONSTRAINT "user_blocks_blockedId_fkey" FOREIGN KEY ("blockedId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

