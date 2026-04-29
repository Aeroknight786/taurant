UPDATE "Venue"
SET "opsConfig" = COALESCE("opsConfig", '{}'::jsonb) || jsonb_build_object(
  'postWindowHandlingMode', 'MANUAL_REMOVE'
)
WHERE "slug" = 'the-craftery-koramangala';
