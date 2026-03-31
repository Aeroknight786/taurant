# Subko Waitlist Roadmap

Last updated: 2026-03-31
Status: Implementation in progress; manual-dispatch foundation and host-priority/reminder wave landed locally

## Purpose

This document is the working roadmap for adapting Flock to Subko's pilot requirements.

It is the source of truth for:

- Subko-specific product scope
- phased implementation plan
- architectural decisions
- locked assumptions
- open questions
- decision and change history for this workstream

Use this file for the Subko venue adaptation. Use [FLOCK_IMPLEMENTATION_STATE.md](/Users/adsaha/Desktop/Pricing%20Engine/C/Flock/docs/FLOCK_IMPLEMENTATION_STATE.md) for the broader product snapshot and [FLOCK_ORCHESTRATION_LEDGER.md](/Users/adsaha/Desktop/Pricing%20Engine/C/Flock/docs/FLOCK_ORCHESTRATION_LEDGER.md) for the broader repo coordination history.

## Inputs

This roadmap is based on:

- the current multi-venue Flock codebase in `C/Flock`
- the current live Craftery venue configuration and queue-only feature posture
- Raj / Nagraj waitlist requirements shared during March 2026
- the exported pilot note:
  - [`Product Flow — Flock x The Craftery by Subko 332c085c7b99819fb565ff090a9cb9e8.md`](/Users/adsaha/Downloads/4db32bc4-a05f-4099-a9dd-eb3836301880_ExportBlock-00e3f7d0-58ef-4460-807c-a1b66472f095/ExportBlock-00e3f7d0-58ef-4460-807c-a1b66472f095-Part-1/Private%20&%20Shared/Product%20Flow%20%E2%80%94%20Flock%20x%20The%20Craftery%20by%20Subko%20332c085c7b99819fb565ff090a9cb9e8.md)
- direct clarification after review:
  - do not remove TMS / POSist work already built
  - archive or keep it dormant for Subko
  - table progression for Subko should be driven by staff actions in the staff module
  - WhatsApp and IVR are major required integrations for the pilot experience

## Executive Direction

Subko should run as a manual-dispatch digital waitlist, not as a table-state-driven automation venue.

That means:

- keep Flock as a shared multi-venue platform
- keep TMS / POSist code, schema, and workers intact
- do not delete or unwind any existing table-sync architecture
- add a Subko-specific operating mode where queue progression is driven by host action, not by table state or TMS
- treat WhatsApp and IVR as first-class operational integrations for table-ready communication

In short:

- shared platform stays broad
- Subko runtime stays narrow

## Architectural Principles

### 1. Preserve shared platform capabilities

TMS, POSist, table automation, ordering, payments, and other Flock modules remain part of the codebase and remain available for other venues.

Subko should not force us to remove those systems.

### 2. Disable or archive by venue, not by deletion

If a capability is not wanted by Subko, it should become dormant through venue-scoped config and operating mode, not through code removal.

### 3. Separate product modules from operational mode

Feature flags alone are not enough. Subko needs a different queue progression model.

We should distinguish:

- product modules:
  - guest queue
  - ordering
  - payments
  - staff console
  - admin console
- operational mode:
  - how the queue advances
  - whether TMS can affect queue progression
  - whether notifications are sent on join, ready, reminder, expiry

### 4. Keep manual host control primary for the pilot

For Subko, the host decides when to nudge the next guest. The system should assist, not auto-dispatch.

### 5. Keep notification orchestration centralized

WhatsApp, SMS fallback, and the new IVR layer should all remain under one operational notification system with logging, retries, and auditability.

## Current Platform Snapshot

The current codebase already gives us a strong base:

- multi-venue support exists
- Craftery is already venue-scoped
- Craftery is already configured as queue-only at the feature level
- guest queue join exists
- guest status page exists
- staff console exists
- seat-by-OTP exists
- queue history exists
- WhatsApp + SMS notification plumbing exists
- TMS / POSist poller exists

The main mismatch is not code volume. It is operating model.

Today, core queue movement still assumes table-state-driven progression. For Subko, progression should be host-triggered from the staff console.

## Subko Target Operating Model

### Guest journey

1. Guest scans QR at the venue entrance or host desk.
2. Guest lands on the Craftery venue page.
3. Guest enters:
   - name
   - phone
   - pax
   - seating preference
   - optional special notes
4. Guest joins the waitlist.
5. Guest sees:
   - live queue position
   - ETA
   - seating OTP
   - waitlist disclaimer
   - Subko content while waiting
6. Host decides when the next party should be called.
7. Host taps `Notify`.
8. Guest receives WhatsApp and IVR.
9. Guest returns to the desk and shows OTP.
10. Host seats the guest through the staff console.
11. Visit eventually moves to history / complete.

### Host journey

1. Host logs into the venue-qualified staff console.
2. Host sees waiting, notified, seated, expired, cancelled, and recent history states.
3. Host can:
   - notify a guest
   - seat via OTP
   - cancel
   - mark no-show or let timeout expire
   - reorder or prioritize when needed
   - open or close the queue
   - tune ready window
4. Host does not need POSist or TMS for the pilot.

### TMS / POSist posture

For Subko:

- TMS and POSist remain preserved in the platform
- they do not drive queue progression for this venue
- they are effectively archived or dormant for Craftery

For the broader platform:

- TMS and POSist remain supported and can still power other venues

## Target Venue Configuration

### Feature configuration for `the-craftery-koramangala`

- `guestQueue: true`
- `staffConsole: true`
- `adminConsole: true`
- `historyTab: true`
- `bulkClear: false`
- `flowLog: false`
- `preOrder: false`
- `partyShare: false`
- `seatedOrdering: false`
- `finalPayment: false`
- `refunds: false`
- `offlineSettle: false`

### Proposed new Subko operational configuration

The existing `brandConfig`, `featureConfig`, and `uiConfig` are not enough to express the pilot cleanly.

Add a new venue-scoped `opsConfig` layer, or equivalent strongly typed config, for operational behavior.

Proposed `opsConfig` fields:

- `queueDispatchMode`
  - `AUTO_TABLE`
  - `MANUAL_NOTIFY`
- `tableSourceMode`
  - `MANUAL`
  - `TMS`
  - `HYBRID`
- `joinConfirmationMode`
  - `WEB_ONLY`
  - `WHATSAPP`
  - `WHATSAPP_SMS`
- `readyNotificationChannels`
  - array of `WHATSAPP`, `SMS`, `IVR`
- `readyReminderEnabled`
  - boolean
- `readyReminderOffsetMin`
  - integer
- `expiryNotificationEnabled`
  - boolean
- `guestWaitFormula`
  - `SUBKO_FIXED_V1`
- `contentMode`
  - `SUBKO_WAIT_CONTENT`

For Craftery / Subko, the intended values are:

- `queueDispatchMode: MANUAL_NOTIFY`
- `tableSourceMode: MANUAL`
- `joinConfirmationMode: WEB_ONLY`
- `readyNotificationChannels: [WHATSAPP, IVR]`
- `readyReminderEnabled: true`
- `readyReminderOffsetMin: 1`
- `expiryNotificationEnabled: optional, to confirm`
- `guestWaitFormula: SUBKO_FIXED_V1`
- `contentMode: SUBKO_WAIT_CONTENT`

## Roadmap

## Phase 0: Lock The Subko Operating Mode

Goal:
Make Subko a first-class manual-dispatch waitlist mode without disturbing the shared platform.

Deliverables:

- finalize this roadmap as the approved architectural direction
- add a typed venue operational config layer for queue dispatch and notification behavior
- preserve all existing TMS / POSist code paths
- explicitly mark Craftery as a manual-dispatch venue
- stop treating POSist as part of the current Subko pilot path

Acceptance:

- Subko has a defined operating mode separate from generic Flock defaults
- no shared TMS / POSist code is removed
- Subko runtime behavior can diverge without forking the repo

## Phase 1: Manual Queue Dispatch Backend

Goal:
Decouple Craftery queue progression from table-state automation.

Deliverables:

- add explicit queue progression mode handling in backend services
- when Craftery is in `MANUAL_NOTIFY` mode:
  - table or TMS events do not auto-notify the next guest
  - queue progression happens only from host actions
- add a dedicated `notifyGuest` service path
- create or reuse state transitions for:
  - `WAITING`
  - `NOTIFIED`
  - `SEATED`
  - `NO_SHOW`
  - `CANCELLED`
  - `COMPLETED`
- set `notifiedAt` and ready-window expiry timestamps from explicit notify action
- preserve seat-by-OTP flow after notify
- keep existing table-state and TMS automation untouched for other venues

Acceptance:

- Craftery no longer depends on `tryAdvanceQueue()` or TMS to call the next guest
- host can move a party from waiting to notified manually
- host can still seat via OTP cleanly
- no regressions for non-Subko venues that still use automated table progression

## Phase 2: Queue Data Model And Intake

Goal:
Capture the exact guest intake required for the pilot.

Deliverables:

- add `QueueSeatingPreference` enum:
  - `INDOOR`
  - `OUTDOOR`
  - `FIRST_AVAILABLE`
- add `QueueEntry.seatingPreference`
- add `QueueEntry.guestNotes`
- update join validation
- update guest form
- expose these values in queue APIs
- render them clearly in host views and history

Acceptance:

- guest can submit the full pilot intake form
- host can see seating preference and notes at a glance
- historical queue records retain those values

## Phase 3: Guest Wait Experience

Goal:
Turn the queue page into the actual pilot guest experience, not just a technical status screen.

Deliverables:

- replace the current heuristic ETA with the agreed Subko wait model:
  - `min(8 + 3×(n−1), 30)`
  - live countdown
  - floor at 3 minutes
  - immediate 3-minute drops when someone ahead is seated or cancelled
- keep join confirmation in the web app only
- show:
  - queue position
  - ETA
  - OTP
  - response-window disclaimer
- add wait-page content blocks or tabs for:
  - menu
  - merchandise
  - stories
  - events
- make this content venue-configurable

Acceptance:

- guest sees the exact pilot wait experience without ordering or payment noise
- countdown behavior matches the Subko pilot formula
- wait time presentation avoids broken-looking zero states

## Phase 4: Host Console Rework For Manual Dispatch

Goal:
Make the Craftery staff console the true operational surface for the pilot.

Deliverables:

- add `Notify` action to queue rows
- emphasize queue states:
  - waiting
  - notified
  - expiring
  - seated
  - no-show
- keep `Seat OTP`, `History`, and `Manager`
- keep `Seated` only if needed for clean visit closure
- reduce or hide table-state-heavy controls for Craftery from normal host flow
- add prioritization or reorder support with auditability
- expose ready-window countdowns and reminder status for notified guests
- expose seating preference and notes directly in queue rows

Acceptance:

- host can run the entire Subko waitlist from the staff console
- host action, not hidden automation, drives the next guest call
- irrelevant Flock modules stay out of the operator path

## Phase 5: Notification Orchestration

Goal:
Build the real operational notification system required for the pilot.

Deliverables:

- keep the existing notification layer as the shared core
- rework Subko notification behavior to match pilot scope:
  - no WhatsApp on join
  - WhatsApp on table-ready notify
  - IVR on table-ready notify
  - reminder during ready window
  - optional expiry/no-show message
- update WhatsApp copy for the agreed host-desk return flow
- add a dedicated IVR provider adapter
- persist notification attempts and outcomes for all channels
- enforce idempotency so a double-click does not send duplicate calls or messages
- add clear operator feedback in the staff console after notify attempts

Acceptance:

- host tapping `Notify` triggers the configured outbound channels exactly once
- WhatsApp and IVR outcomes are auditable
- failures degrade clearly and do not leave the queue in an ambiguous state

## Phase 6: Host Analytics And Guest Data Usefulness

Goal:
Make the captured waitlist data operationally useful for Subko.

Deliverables:

- surface pax mix and queue distribution
- surface section preference distribution
- keep history readable for guest recall
- support export or internal reporting for pilot review
- track:
  - join time
  - notify time
  - seat time
  - completion time
  - final status

Acceptance:

- Subko can evaluate the pilot with actual guest and queue behavior data
- the host team can use history for service continuity

## Phase 7: Pilot Rollout And Validation

Goal:
Get the manual-dispatch Craftery pilot operationally ready and verifiable.

Deliverables:

- automated test coverage for the new Subko mode
- manual host-flow QA on staging / production
- notification provider validation
- on-site launch checklist
- day-1 support checklist

Acceptance:

- guest join, wait, notify, seat, no-show, and complete flows all work end to end
- host staff can operate without touching unrelated product areas
- notification delivery is good enough for live pilot use

## Phase 8: Deferred Shared-Platform Work

Goal:
Make explicit what is preserved but not active for Subko.

Deferred for the Subko pilot, but retained in the platform:

- TMS-driven auto-advance
- POSist table sync activation
- ordering and payment modules
- deposit collection
- party sessions
- final online payment
- refund tooling

Acceptance:

- these capabilities remain intact in code and available to other venues
- Subko does not depend on them for pilot launch

## Data Model Plan

Expected schema and contract work:

- add `QueueSeatingPreference`
- add `QueueEntry.seatingPreference`
- add `QueueEntry.guestNotes`
- add an operational venue config layer such as `opsConfig`
- consider `QueueEntry.priorityRank`
- consider `QueueEntry.priorityReason`
- consider reminder-tracking fields if reminder sending must be idempotent without re-query heuristics
- consider `QueueEntry.lastNotifiedChannelState` only if notification audit cannot stay fully in `Notification`

## Notification Architecture Plan

Current shared delivery path should remain the foundation:

- domain service triggers `Notify.*`
- notification log row is created
- send is attempted
- fallback or retry logic runs
- final status is persisted

Subko-specific additions:

- explicit `TABLE_READY_IVR`
- explicit reminder path
- explicit expiry path if product confirms it
- provider abstraction for IVR
- clear separation between:
  - join confirmation policy
  - ready notification policy
  - reminder policy

Recommended operational behavior for Subko:

- join:
  - web confirmation only
- ready:
  - WhatsApp + IVR
- reminder:
  - WhatsApp and optional IVR or SMS fallback, depending on provider costs and user behavior
- expiry:
  - optional guest-facing message

## TMS / POSist Posture For Subko

This is now explicitly revised.

### What stays true

- TMS and POSist work already built in Flock should remain in the repo
- venue schema fields stay intact
- workers and adapters stay intact

### What changes for Subko

- Craftery should not use POSist in the current pilot
- Craftery should not use TMS table-state changes to advance the queue
- the shared TMS / POSist architecture becomes dormant for this venue

### Future posture

If Subko later wants POSist reintroduced:

- we reactivate it through venue config and rollout planning
- we do not need to rebuild the platform from scratch

## Test Plan

## Unit

- Subko operating-mode resolution
- manual notify state transition
- no auto-advance for manual-dispatch venues
- seating preference validation
- guest notes validation
- ETA formula and countdown math
- reminder scheduling logic
- IVR send orchestration
- venue-config dormant TMS / POSist behavior for Craftery

## Integration

- guest join payload includes seating preference and notes
- Craftery join does not send join-time WhatsApp
- host `Notify` endpoint changes queue state correctly
- notify action creates notification records for WhatsApp and IVR
- seat-by-OTP works after manual notify
- expiry moves notified guest to no-show correctly
- non-Subko venues still retain current automated table progression behavior

## Browser / Playwright

- guest joins from Craftery QR page
- guest sees live ETA, OTP, disclaimer, and content
- host sees seating preference and notes in queue row
- host taps `Notify`
- guest page moves to ready state
- host seats guest by OTP
- no-show window behaves correctly
- no ordering or payment CTAs appear for Craftery

## Operational QA

- WhatsApp template approval and live delivery check
- IVR provider live delivery check
- host desk training pass
- mobile-width staff-console usability pass
- day-1 pilot rehearsal

## Open Questions

- Which IVR provider should be used for the pilot?
- Does Subko want a guest-facing expiry message when a table is reassigned?
- Should a notified guest be seatable without selecting a specific table label, or should table selection remain part of the host flow?
- Does Subko want hosts to manually choose the next guest every time, or should the system still recommend the best next candidate?
- Should content blocks be simple external links first, or richer embedded content in the first release?
- Is guest phone OTP verification needed at join, or is captured phone number enough for Phase 1?

## Review Checklist

This roadmap is ready for implementation once the following are explicitly confirmed:

- Subko pilot should use manual staff dispatch, not table-state automation
- TMS / POSist should remain dormant, not active, for Craftery
- seating preference and notes are approved as required intake fields
- WhatsApp + IVR is approved as the primary ready-notification stack
- join-time message policy is confirmed as web-only
- the host console should be the operational source of truth for progression

## Decision Ledger

## 2026-03-24

- Created dedicated Subko roadmap and ledger document.
- Locked working direction to queue-first Subko scope.
- Chosen implementation posture: keep Flock shared codebase, disable non-Subko modules by venue config instead of forking code.
- Chosen notification posture: extend existing WhatsApp-first integration rather than build a new notification subsystem.
- Locked admin posture: keep the current admin console enabled for Craftery as an internal fallback surface.

## 2026-03-31

- Revised the roadmap after reviewing the exported pilot scope note and current architecture.
- Locked new architectural direction: Subko should run in a manual-dispatch waitlist mode.
- Locked preservation posture: TMS / POSist stays in the shared platform and is not removed.
- Locked Subko posture for TMS / POSist: dormant for Craftery in the pilot, not active.
- Locked notification posture for the pilot: WhatsApp and IVR are first-class integrations for table-ready communication.
- Replaced the earlier Subko assumption that POSist table sync belongs in the current pilot roadmap.

## Change Ledger

## 2026-03-24

- Added this file as the working roadmap for Subko queue-only adaptation.
- Recorded current fit/gap analysis between Raj's requirements and the current Flock implementation.
- Defined phased roadmap from venue configuration through queue logic, notifications, host tooling, and rollout validation.
- Updated Phase A to align Craftery with queue-only feature flags while retaining admin as fallback.
- Implemented the initial Craftery queue-only feature posture in code.

## 2026-03-31

- Rewrote this roadmap to reflect the clarified Subko pilot architecture.
- Added the explicit manual-dispatch operating model for Craftery.
- Added the recommendation for a dedicated venue operational config layer.
- Reframed TMS / POSist from active roadmap work to preserved but dormant platform capability for Subko.
- Added a dedicated notification-orchestration phase covering WhatsApp and IVR.
- Split the roadmap into architecture-first phases: operating mode, manual dispatch backend, queue model, guest wait experience, host console, notifications, analytics, rollout, and deferred platform capabilities.
- Implemented the first manual-dispatch wave in code: queue notify action, seating preference and guest notes intake, queue-only Craftery wait content, IVR notification scaffolding, and fixed Subko wait-formula activation for Craftery.
- Implemented the next host-operations wave in code: ready-window reminder sweep, manual queue reprioritization with audited flow events, and Craftery staff controls for prioritizing waiting guests without jumping ahead of already-notified parties.

## Next Action

Continue implementation with the next Subko pilot slice:

1. wire timed reminder scheduling through production-safe worker cadence and operator visibility
2. add richer host prioritization controls and reason capture if the team wants audit detail beyond the current flow event
3. complete real IVR provider integration and delivery logging
4. run production validation after the new migrations are applied
