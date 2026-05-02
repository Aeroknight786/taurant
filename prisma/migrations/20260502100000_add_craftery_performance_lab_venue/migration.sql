INSERT INTO "Venue" (
  "id",
  "name",
  "slug",
  "address",
  "city",
  "state",
  "pincode",
  "gstin",
  "licenceType",
  "phone",
  "email",
  "depositPercent",
  "tableReadyWindowMin",
  "maxQueueSize",
  "isQueueOpen",
  "brandConfig",
  "featureConfig",
  "uiConfig",
  "opsConfig",
  "createdAt",
  "updatedAt"
) VALUES (
  'venue_craftery_performance_lab',
  'The Craftery Lab',
  'the-craftery-koramangala-lab',
  'No. 68, 2-374 BBMP PID, 3rd Block, Koramangala',
  'Bengaluru',
  'Karnataka',
  '560034',
  '29AABCS1234R1ZX',
  'RESTAURANT_ONLY'::"GstLicenceType",
  '9900000004',
  'hello+lab@subko.coffee',
  30,
  3,
  200,
  true,
  jsonb_build_object(
    'displayName', 'The Craftery Lab',
    'shortName', 'The Craftery Lab',
    'tagline', 'Waitlist lab - live updates - host desk',
    'themeKey', 'craftery'
  ),
  jsonb_build_object(
    'guestQueue', true,
    'preOrder', false,
    'partyShare', false,
    'seatedOrdering', false,
    'finalPayment', false,
    'staffConsole', true,
    'adminConsole', true,
    'flowLog', false,
    'historyTab', true,
    'refunds', false,
    'offlineSettle', false,
    'bulkClear', false
  ),
  jsonb_build_object(
    'landingMode', 'venue',
    'defaultGuestTray', 'ordered',
    'showContinueEntry', true,
    'showQueuePosition', true,
    'hideFromPublic', true,
    'guestShellMode', 'LIGHT_WAITLIST',
    'supportCopy', 'Join the waitlist, keep your phone nearby, and wait for the host call when your turn comes up.'
  ),
  jsonb_build_object(
    'queueDispatchMode', 'MANUAL_NOTIFY',
    'tableSourceMode', 'DISABLED',
    'joinConfirmationMode', 'WHATSAPP',
    'readyNotificationChannels', jsonb_build_array('WHATSAPP', 'IVR'),
    'readyReminderEnabled', true,
    'readyReminderOffsetMin', 1,
    'expiryNotificationEnabled', false,
    'guestWaitFormula', 'SUBKO_FIXED_V1',
    'contentMode', 'DISABLED',
    'arrivalCompletionMode', 'QUEUE_COMPLETE',
    'postWindowHandlingMode', 'MANUAL_REMOVE',
    'realtimeMode', 'SSE_V1'
  ),
  now(),
  now()
)
ON CONFLICT ("slug") DO UPDATE
SET
  "name" = EXCLUDED."name",
  "address" = EXCLUDED."address",
  "city" = EXCLUDED."city",
  "state" = EXCLUDED."state",
  "pincode" = EXCLUDED."pincode",
  "gstin" = EXCLUDED."gstin",
  "licenceType" = EXCLUDED."licenceType",
  "phone" = EXCLUDED."phone",
  "email" = EXCLUDED."email",
  "depositPercent" = EXCLUDED."depositPercent",
  "tableReadyWindowMin" = EXCLUDED."tableReadyWindowMin",
  "maxQueueSize" = EXCLUDED."maxQueueSize",
  "isQueueOpen" = EXCLUDED."isQueueOpen",
  "brandConfig" = EXCLUDED."brandConfig",
  "featureConfig" = EXCLUDED."featureConfig",
  "uiConfig" = EXCLUDED."uiConfig",
  "opsConfig" = EXCLUDED."opsConfig",
  "updatedAt" = now();

INSERT INTO "Staff" ("id", "venueId", "name", "phone", "role", "isActive", "createdAt", "updatedAt")
SELECT
  staff_rows."id",
  v."id",
  staff_rows."name",
  staff_rows."phone",
  staff_rows."role"::"StaffRole",
  true,
  now(),
  now()
FROM "Venue" v
CROSS JOIN (
  VALUES
    ('staff_craftery_lab_9900000001', 'Aditya Palkar', '9900000001', 'OWNER'),
    ('staff_craftery_lab_9900000002', 'Meenakshi A.', '9900000002', 'MANAGER'),
    ('staff_craftery_lab_7977755670', 'The Craftery Staff', '7977755670', 'STAFF')
) AS staff_rows("id", "name", "phone", "role")
WHERE v."slug" = 'the-craftery-koramangala-lab'
ON CONFLICT ("venueId", "phone") DO UPDATE
SET
  "name" = EXCLUDED."name",
  "role" = EXCLUDED."role",
  "isActive" = true,
  "updatedAt" = now();
