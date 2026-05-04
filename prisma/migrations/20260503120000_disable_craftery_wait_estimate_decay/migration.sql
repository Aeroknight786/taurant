UPDATE "Venue"
SET "opsConfig" = COALESCE("opsConfig", '{}'::jsonb)
  || jsonb_build_object(
    'guestWaitFormula', 'SUBKO_FIXED_V1',
    'waitEstimateDecayEnabled', false
  )
WHERE "slug" IN (
  'the-craftery-koramangala',
  'the-craftery-koramangala-lab'
);
