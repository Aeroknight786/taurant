-- Add data-driven venue experience configuration buckets.
ALTER TABLE "Venue"
ADD COLUMN "brandConfig" JSONB,
ADD COLUMN "featureConfig" JSONB,
ADD COLUMN "uiConfig" JSONB;

UPDATE "Venue"
SET "brandConfig" = COALESCE("brandConfig", '{}'::jsonb) || jsonb_build_object(
  'themeKey',
  CASE
    WHEN "slug" = 'the-craftery-koramangala' THEN 'craftery'
    ELSE 'default'
  END
)
WHERE "brandConfig" IS NULL OR NOT ("brandConfig" ? 'themeKey');
