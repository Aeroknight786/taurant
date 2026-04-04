-- CreateEnum
CREATE TYPE "GuestAccessLinkChannel" AS ENUM ('WHATSAPP');

-- CreateEnum
CREATE TYPE "GuestAccessLinkMessageKind" AS ENUM ('JOIN', 'NOTIFY');

-- CreateTable
CREATE TABLE "GuestAccessLink" (
    "id" TEXT NOT NULL,
    "queueEntryId" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "channel" "GuestAccessLinkChannel" NOT NULL DEFAULT 'WHATSAPP',
    "messageKind" "GuestAccessLinkMessageKind" NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL,
    "lastUsedAt" TIMESTAMP(3),
    "invalidatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GuestAccessLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GuestAccessLink_tokenHash_key" ON "GuestAccessLink"("tokenHash");

-- CreateIndex
CREATE INDEX "GuestAccessLink_queueEntryId_createdAt_idx" ON "GuestAccessLink"("queueEntryId", "createdAt");

-- CreateIndex
CREATE INDEX "GuestAccessLink_venueId_invalidatedAt_idx" ON "GuestAccessLink"("venueId", "invalidatedAt");

-- CreateIndex
CREATE INDEX "GuestAccessLink_venueId_channel_messageKind_createdAt_idx" ON "GuestAccessLink"("venueId", "channel", "messageKind", "createdAt");

-- AddForeignKey
ALTER TABLE "GuestAccessLink" ADD CONSTRAINT "GuestAccessLink_queueEntryId_fkey" FOREIGN KEY ("queueEntryId") REFERENCES "QueueEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuestAccessLink" ADD CONSTRAINT "GuestAccessLink_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE ON UPDATE CASCADE;
