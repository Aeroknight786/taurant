ALTER TABLE "QueueEntry"
ADD COLUMN "waitEstimateFloorMin" INTEGER,
ADD COLUMN "waitEstimateStepMin" INTEGER,
ADD COLUMN "waitEstimateMaxMin" INTEGER;

UPDATE "QueueEntry" qe
SET
  "waitEstimateFloorMin" = COALESCE((v."opsConfig"->>'waitEstimateBaseMin')::integer, 3),
  "waitEstimateStepMin" = COALESCE((v."opsConfig"->>'waitEstimateStepMin')::integer, 5),
  "waitEstimateMaxMin" = GREATEST(
    COALESCE((v."opsConfig"->>'waitEstimateBaseMin')::integer, 3),
    COALESCE((v."opsConfig"->>'waitEstimateMaxMin')::integer, 30)
  )
FROM "Venue" v
WHERE qe."venueId" = v."id"
  AND qe."estimatedWaitMin" IS NOT NULL;
