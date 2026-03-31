UPDATE "Venue"
SET "opsConfig" = COALESCE("opsConfig", '{}'::jsonb) || jsonb_build_object(
  'guestWaitFormula', 'SUBKO_FIXED_V1'
)
WHERE "slug" = 'the-craftery-koramangala';
