INSERT INTO "Staff" ("id", "venueId", "name", "phone", "role", "isActive", "createdAt", "updatedAt")
SELECT
  'staff_craftery_7977755670',
  v."id",
  'The Craftery Staff',
  '7977755670',
  'STAFF'::"StaffRole",
  true,
  now(),
  now()
FROM "Venue" v
WHERE v."slug" = 'the-craftery-koramangala'
ON CONFLICT ("venueId", "phone") DO UPDATE
SET
  "name" = EXCLUDED."name",
  "role" = EXCLUDED."role",
  "isActive" = true,
  "updatedAt" = now();
