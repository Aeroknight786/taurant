-- Configure Craftery / Subko as a queue-first venue for Phase 1.
UPDATE "Venue"
SET
  "brandConfig" = COALESCE("brandConfig", '{}'::jsonb) || jsonb_build_object(
    'displayName', 'The Craftery by Subko',
    'shortName', 'Craftery',
    'tagline', 'Waitlist · live updates · host desk',
    'themeKey', 'craftery'
  ),
  "featureConfig" = COALESCE("featureConfig", '{}'::jsonb) || jsonb_build_object(
    'guestQueue', true,
    'staffConsole', true,
    'adminConsole', true,
    'historyTab', true,
    'preOrder', false,
    'partyShare', false,
    'seatedOrdering', false,
    'finalPayment', false,
    'flowLog', false,
    'refunds', false,
    'offlineSettle', false,
    'bulkClear', false
  ),
  "uiConfig" = COALESCE("uiConfig", '{}'::jsonb) || jsonb_build_object(
    'landingMode', 'venue',
    'defaultGuestTray', 'ordered',
    'showContinueEntry', true,
    'supportCopy', 'Join the waitlist, track your live position, and head back to the host desk once your table is ready.'
  )
WHERE "slug" = 'the-craftery-koramangala';
