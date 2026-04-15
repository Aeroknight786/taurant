-- Restore guest-visible queue position for Craftery to match the approved pilot messaging.
UPDATE "Venue"
SET "uiConfig" = COALESCE("uiConfig", '{}'::jsonb) || jsonb_build_object(
  'showQueuePosition', true
)
WHERE "slug" = 'the-craftery-koramangala';
