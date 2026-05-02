-- Promote the proven Craftery lab performance path to the live Craftery venue.
-- This updates only venue configuration JSON; queue entries, history, notifications,
-- guest access links, staff, tables, and menu/content rows are untouched.
UPDATE "Venue"
SET
  "uiConfig" = COALESCE("uiConfig", '{}'::jsonb) || jsonb_build_object(
    'guestShellMode', 'LIGHT_WAITLIST'
  ),
  "opsConfig" = COALESCE("opsConfig", '{}'::jsonb) || jsonb_build_object(
    'realtimeMode', 'SSE_V1'
  )
WHERE "slug" = 'the-craftery-koramangala';
