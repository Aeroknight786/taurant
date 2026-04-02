-- Backfill Craftery to the waitlist-only operating mode.
UPDATE "Venue"
SET
  "uiConfig" = COALESCE("uiConfig", '{}'::jsonb) || jsonb_build_object(
    'supportCopy', 'Join the waitlist, keep your phone nearby, and wait for the host call when your turn comes up.',
    'showQueuePosition', false
  ),
  "opsConfig" = COALESCE("opsConfig", '{}'::jsonb) || jsonb_build_object(
    'queueDispatchMode', 'MANUAL_NOTIFY',
    'tableSourceMode', 'DISABLED',
    'joinConfirmationMode', 'WEB_ONLY',
    'readyNotificationChannels', '["WHATSAPP","IVR"]'::jsonb,
    'readyReminderEnabled', true,
    'readyReminderOffsetMin', 1,
    'expiryNotificationEnabled', false,
    'guestWaitFormula', 'SUBKO_FIXED_V1',
    'contentMode', 'DISABLED',
    'arrivalCompletionMode', 'QUEUE_COMPLETE'
  )
WHERE "slug" = 'the-craftery-koramangala';
