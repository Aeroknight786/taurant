CREATE TYPE "QueueSeatingPreference" AS ENUM ('INDOOR', 'OUTDOOR', 'FIRST_AVAILABLE');

ALTER TABLE "Venue"
ADD COLUMN "opsConfig" JSONB;

ALTER TABLE "QueueEntry"
ADD COLUMN "seatingPreference" "QueueSeatingPreference" NOT NULL DEFAULT 'FIRST_AVAILABLE',
ADD COLUMN "guestNotes" TEXT;

UPDATE "Venue"
SET "opsConfig" = jsonb_build_object(
  'queueDispatchMode', 'AUTO_TABLE',
  'tableSourceMode', 'MANUAL',
  'joinConfirmationMode', 'WHATSAPP',
  'readyNotificationChannels', jsonb_build_array('WHATSAPP'),
  'readyReminderEnabled', false,
  'readyReminderOffsetMin', 1,
  'expiryNotificationEnabled', false,
  'guestWaitFormula', 'LEGACY_TURN_HEURISTIC',
  'contentMode', 'DEFAULT'
)
WHERE "opsConfig" IS NULL;

UPDATE "Venue"
SET "opsConfig" = COALESCE("opsConfig", '{}'::jsonb) || jsonb_build_object(
  'queueDispatchMode', 'MANUAL_NOTIFY',
  'tableSourceMode', 'MANUAL',
  'joinConfirmationMode', 'WEB_ONLY',
  'readyNotificationChannels', jsonb_build_array('WHATSAPP', 'IVR'),
  'readyReminderEnabled', true,
  'readyReminderOffsetMin', 1,
  'expiryNotificationEnabled', false,
  'guestWaitFormula', 'LEGACY_TURN_HEURISTIC',
  'contentMode', 'SUBKO_WAIT_CONTENT'
)
WHERE "slug" = 'the-craftery-koramangala';
