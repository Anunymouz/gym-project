-- CreateTable
CREATE TABLE "gym_invitations" (
    "id" UUID NOT NULL,
    "gymId" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "role" "GymStaffRole" NOT NULL,
    "invitedById" UUID,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "acceptedAt" TIMESTAMPTZ(3),
    "closedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gym_invitations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "gym_invitations_email_acceptedAt_closedAt_idx" ON "gym_invitations"("email", "acceptedAt", "closedAt");

-- CreateIndex
CREATE INDEX "gym_invitations_gymId_createdAt_idx" ON "gym_invitations"("gymId", "createdAt");

-- AddForeignKey
ALTER TABLE "gym_invitations" ADD CONSTRAINT "gym_invitations_gymId_fkey" FOREIGN KEY ("gymId") REFERENCES "gyms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gym_invitations" ADD CONSTRAINT "gym_invitations_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

