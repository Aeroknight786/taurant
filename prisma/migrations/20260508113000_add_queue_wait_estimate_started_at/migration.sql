ALTER TABLE "QueueEntry"
ADD COLUMN "waitEstimateStartedAt" TIMESTAMP(3);

UPDATE "QueueEntry"
SET "waitEstimateStartedAt" = "joinedAt"
WHERE "status" = 'WAITING'
  AND "waitEstimateStartedAt" IS NULL;

UPDATE "Venue"
SET "opsConfig" = COALESCE("opsConfig", '{}'::jsonb)
  || jsonb_build_object(
    'guestWaitFormula', 'SUBKO_FIXED_V1',
    'waitEstimateDecayEnabled', true,
    'waitEstimateBaseMin', 10,
    'waitEstimateStepMin', 8,
    'waitEstimateMaxMin', 58
  )
WHERE "slug" IN (
  'the-craftery-koramangala',
  'the-craftery-koramangala-lab'
);

WITH ranked_waiting AS (
  SELECT
    qe."id",
    ROW_NUMBER() OVER (
      PARTITION BY qe."venueId"
      ORDER BY qe."position" ASC, qe."joinedAt" ASC
    ) - 1 AS wait_index
  FROM "QueueEntry" qe
  JOIN "Venue" v ON v."id" = qe."venueId"
  WHERE v."slug" IN (
      'the-craftery-koramangala',
      'the-craftery-koramangala-lab'
    )
    AND qe."status" = 'WAITING'
)
UPDATE "QueueEntry" qe
SET
  "estimatedWaitMin" = LEAST(58, 10 + (ranked_waiting.wait_index * 8)),
  "waitEstimateStartedAt" = NOW()
FROM ranked_waiting
WHERE qe."id" = ranked_waiting."id";
