-- AlterTable
ALTER TABLE "device_tokens" ADD COLUMN     "lastSeenAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateTable
CREATE TABLE "push_tickets" (
    "id" UUID NOT NULL,
    "ticketId" TEXT NOT NULL,
    "deviceTokenId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "push_tickets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_settings" (
    "userId" UUID NOT NULL,
    "topic" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "notification_settings_pkey" PRIMARY KEY ("userId","topic","channel")
);

-- CreateIndex
CREATE UNIQUE INDEX "push_tickets_ticketId_key" ON "push_tickets"("ticketId");

-- CreateIndex
CREATE INDEX "push_tickets_createdAt_idx" ON "push_tickets"("createdAt");

-- AddForeignKey
ALTER TABLE "push_tickets" ADD CONSTRAINT "push_tickets_deviceTokenId_fkey" FOREIGN KEY ("deviceTokenId") REFERENCES "device_tokens"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_settings" ADD CONSTRAINT "notification_settings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;


