-- Add venue content blocks for the Subko/Craftery wait-page content admin.
CREATE TYPE "VenueContentSlot" AS ENUM ('MENU', 'MERCH', 'STORIES', 'EVENTS');

CREATE TABLE "VenueContentBlock" (
    "id" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "slot" "VenueContentSlot" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "imageUrl" TEXT,
    "isEnabled" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VenueContentBlock_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "VenueContentBlock_venueId_slot_key"
ON "VenueContentBlock"("venueId", "slot");

CREATE INDEX "VenueContentBlock_venueId_isEnabled_sortOrder_idx"
ON "VenueContentBlock"("venueId", "isEnabled", "sortOrder");

ALTER TABLE "VenueContentBlock"
ADD CONSTRAINT "VenueContentBlock_venueId_fkey"
FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

UPDATE "Venue"
SET "uiConfig" = COALESCE("uiConfig", '{}'::jsonb) || jsonb_build_object('showQueuePosition', false)
WHERE "slug" = 'the-craftery-koramangala';

INSERT INTO "VenueContentBlock" (
    "id",
    "venueId",
    "slot",
    "title",
    "body",
    "imageUrl",
    "isEnabled",
    "sortOrder",
    "createdAt",
    "updatedAt"
)
SELECT
    seed.id,
    venue.id,
    seed.slot::"VenueContentSlot",
    seed.title,
    seed.body,
    seed.imageUrl,
    seed.isEnabled,
    seed.sortOrder,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "Venue" venue
CROSS JOIN (
    VALUES
        ('the-craftery-koramangala-menu', 'MENU', 'Current highlights', 'A quick look at the categories and dishes currently showing at Craftery.', NULL, true, 1),
        ('the-craftery-koramangala-merch', 'MERCH', 'Craftery', 'Current venue touchpoints from Craftery in Bengaluru.', NULL, true, 2),
        ('the-craftery-koramangala-stories', 'STORIES', 'Waitlist · live updates · host desk', 'The venue profile stays anchored to the house copy and the address on file.', NULL, false, 3),
        ('the-craftery-koramangala-events', 'EVENTS', 'Today', 'Queue updates are live. The host return window is 15 minutes and staff will nudge you when your turn comes up.', NULL, false, 4)
) AS seed(id, slot, title, body, imageUrl, isEnabled, sortOrder)
WHERE venue."slug" = 'the-craftery-koramangala'
ON CONFLICT ("venueId", "slot") DO UPDATE
SET
    "title" = EXCLUDED."title",
    "body" = EXCLUDED."body",
    "imageUrl" = EXCLUDED."imageUrl",
    "isEnabled" = EXCLUDED."isEnabled",
    "sortOrder" = EXCLUDED."sortOrder",
    "updatedAt" = CURRENT_TIMESTAMP;
