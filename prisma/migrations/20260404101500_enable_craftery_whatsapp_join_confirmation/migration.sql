UPDATE "Venue"
SET "opsConfig" = COALESCE("opsConfig", '{}'::jsonb) || jsonb_build_object(
  'joinConfirmationMode', 'WHATSAPP'
)
WHERE "slug" = 'the-craftery-koramangala';
