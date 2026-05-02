# Craftery Performance Lab

## Purpose

`the-craftery-koramangala-lab` is a hidden production venue clone for testing faster guest/staff queue updates without changing the live Craftery pilot venue.

The lab keeps the same waitlist-only operating shape, but uses:

- hidden public selector behavior: `uiConfig.hideFromPublic = true`
- lightweight guest reads: `uiConfig.guestShellMode = LIGHT_WAITLIST`
- SSE-triggered refresh: `opsConfig.realtimeMode = SSE_V1`

## Lab URLs

- Guest landing: `/v/the-craftery-koramangala-lab`
- Staff dashboard: `/v/the-craftery-koramangala-lab/staff/dashboard`
- Staff OTP phones seeded for lab:
  - `9900000001` owner
  - `9900000002` manager
  - `7977755670` staff

## New Read Paths

- `GET /api/v1/venues/:slug/lite`
  - returns venue config and shell fields only
  - skips menu categories and content blocks

- `GET /api/v1/queue/live-snapshot`
  - staff-auth compact queue payload
  - skips order trees for waitlist board refresh

- `GET /api/v1/queue/:entryId/status`
  - guest-auth compact status payload
  - skips order trees and does not select OTP

- `GET /api/v1/realtime/guest/:entryId`
  - SSE stream for one guest entry
  - authenticated with `Authorization: Bearer <guestToken>`

- `GET /api/v1/realtime/staff/queue`
  - SSE stream for the authenticated staff venue queue
  - authenticated with `Authorization: Bearer <staffToken>`

## Target Behavior

- Initial lab guest page uses one lite venue read and one compact status read.
- Live guest updates are event-triggered, with a 30-second fallback poll.
- Staff queue updates are event-triggered, with a 30-second fallback poll.
- Existing Craftery and Barrel Room keep the current polling behavior unless their config is changed.

## Performance Targets

- Fresh guest status load: under 1.5s on normal mobile 4G after Render warm start.
- Guest update after staff notify/seat/remove: under 1s from mutation acceptance to visible UI change.
- Staff queue update after join/notify/reorder/remove: under 1s from mutation acceptance to visible UI change.
- Steady-state traffic per active live guest/staff view: no more than one fallback read per 30 seconds when no queue event occurs.

## Iteration Loop

1. Run unit and integration tests.
2. Apply the lab migration in the production DB.
3. Open the lab guest and staff flows directly.
4. Capture browser Network timings for:
   - venue lite
   - queue status
   - queue live snapshot
   - SSE connection
5. Run the full lab flow:
   - join
   - notify
   - response window lapse
   - mark arrived
   - remove no-show
   - history refresh
6. If targets are missed, inspect:
   - Render cold start or DB connect latency
   - duplicate browser reads
   - large response bodies
   - missing SSE publish after a mutation
