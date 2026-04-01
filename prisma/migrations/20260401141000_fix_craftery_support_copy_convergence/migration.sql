-- Converge persisted Craftery/Subko venue copy with the current queue-only guest experience.
UPDATE "Venue"
SET "uiConfig" = COALESCE("uiConfig", '{}'::jsonb) || jsonb_build_object(
  'supportCopy', 'Join the waitlist, keep your phone nearby, and head back to the host desk once your table is ready.',
  'showQueuePosition', false
)
WHERE "slug" = 'the-craftery-koramangala';
