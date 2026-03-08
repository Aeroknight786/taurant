-- AlterTable
ALTER TABLE "Venue"
ADD COLUMN "flowSequence" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "orderSequence" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "QueueEntry"
ADD COLUMN "flowRef" TEXT;

-- AlterTable
ALTER TABLE "Order"
ADD COLUMN "orderRef" TEXT;

WITH ranked_queue AS (
  SELECT
    id,
    "venueId",
    "joinedAt",
    ROW_NUMBER() OVER (PARTITION BY "venueId" ORDER BY "joinedAt" ASC, id ASC) AS seq
  FROM "QueueEntry"
)
UPDATE "QueueEntry" AS queue_entry
SET "flowRef" = CONCAT(
  'FLW-',
  TO_CHAR((ranked_queue."joinedAt" AT TIME ZONE 'UTC'), 'YYYYMMDD'),
  '-',
  LPAD(ranked_queue.seq::TEXT, 4, '0')
)
FROM ranked_queue
WHERE queue_entry.id = ranked_queue.id;

WITH ranked_orders AS (
  SELECT
    id,
    "venueId",
    "createdAt",
    ROW_NUMBER() OVER (PARTITION BY "venueId" ORDER BY "createdAt" ASC, id ASC) AS seq
  FROM "Order"
)
UPDATE "Order" AS orders
SET "orderRef" = CONCAT(
  'ORD-',
  TO_CHAR((ranked_orders."createdAt" AT TIME ZONE 'UTC'), 'YYYYMMDD'),
  '-',
  LPAD(ranked_orders.seq::TEXT, 4, '0')
)
FROM ranked_orders
WHERE orders.id = ranked_orders.id;

WITH flow_counts AS (
  SELECT "venueId", COALESCE(MAX(seq), 0) AS max_seq
  FROM (
    SELECT
      "venueId",
      ROW_NUMBER() OVER (PARTITION BY "venueId" ORDER BY "joinedAt" ASC, id ASC) AS seq
    FROM "QueueEntry"
  ) ranked_queue
  GROUP BY "venueId"
),
order_counts AS (
  SELECT "venueId", COALESCE(MAX(seq), 0) AS max_seq
  FROM (
    SELECT
      "venueId",
      ROW_NUMBER() OVER (PARTITION BY "venueId" ORDER BY "createdAt" ASC, id ASC) AS seq
    FROM "Order"
  ) ranked_orders
  GROUP BY "venueId"
)
UPDATE "Venue" AS venue
SET
  "flowSequence" = COALESCE(flow_counts.max_seq, 0),
  "orderSequence" = COALESCE(order_counts.max_seq, 0)
FROM flow_counts
FULL JOIN order_counts ON order_counts."venueId" = flow_counts."venueId"
WHERE venue.id = COALESCE(flow_counts."venueId", order_counts."venueId");

ALTER TABLE "QueueEntry"
ALTER COLUMN "flowRef" SET NOT NULL;

ALTER TABLE "Order"
ALTER COLUMN "orderRef" SET NOT NULL;

CREATE UNIQUE INDEX "QueueEntry_flowRef_key" ON "QueueEntry"("flowRef");
CREATE INDEX "QueueEntry_venueId_flowRef_idx" ON "QueueEntry"("venueId", "flowRef");

CREATE UNIQUE INDEX "Order_orderRef_key" ON "Order"("orderRef");
CREATE INDEX "Order_venueId_orderRef_idx" ON "Order"("venueId", "orderRef");
