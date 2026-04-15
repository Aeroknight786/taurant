ALTER TABLE "QueueEntry"
ADD COLUMN "whatsappConsentGiven" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "whatsappConsentAt" TIMESTAMP(3),
ADD COLUMN "whatsappConsentTextVersion" TEXT;
