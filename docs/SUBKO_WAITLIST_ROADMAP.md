# Subko Waitlist Roadmap

Last updated: 2026-03-24
Status: Phase A implemented in code, awaiting deploy validation

## Purpose

This document is the working roadmap for adapting Flock to Subko's current requirements.

It is the source of truth for:

- Subko-specific product scope
- implementation phases
- locked decisions
- open questions
- change history for this workstream

Use this file for the Subko venue adaptation. Use [FLOCK_IMPLEMENTATION_STATE.md](/Users/adsaha/Desktop/Pricing%20Engine/C/Flock/docs/FLOCK_IMPLEMENTATION_STATE.md) for the broader product snapshot and [FLOCK_ORCHESTRATION_LEDGER.md](/Users/adsaha/Desktop/Pricing%20Engine/C/Flock/docs/FLOCK_ORCHESTRATION_LEDGER.md) for the broader repo coordination history.

## Inputs

This roadmap is based on:

- the current multi-venue Flock codebase in `C/Flock`
- Raj's Craftery / Subko requirements shared on 2026-03-24
- the current validated venue-config refactor already implemented in code

Raj's current direction, in plain terms:

- no pre-orders for now
- digitize the waiting list first
- keep the guest flow simple
- improve notifications
- improve queue management and host-side logic
- capture guest data for service and future engagement

## Product Scope

## Phase 1 Subko Scope

The first Subko release should be a queue-first product, not the full Flock pilot stack.

Included:

- QR-based guest waitlist entry
- guest name capture
- mobile number capture
- pax capture
- seating preference capture
- optional special notes capture
- guest live waitlist position view
- real-time guest updates
- WhatsApp-first table-ready and queue updates
- host-side queue management
- host-side queue prioritization
- table assignment support
- no-show timeout and reassignment
- basic guest data capture for future use

Excluded for Subko Phase 1:

- pre-order
- deposit payments
- shared party sessions
- at-table ordering
- final online payment
- refunds
- offline settlement
- admin menu operations as part of the guest launch path

## Current Codebase Fit

The current system already covers part of Subko's ask well:

- venue QR / browser entry exists
- guest queue join exists
- guest position and ETA view exists
- table-ready notification infrastructure exists
- no-show timeout and reassignment already exist
- staff dashboard and table dashboard already exist
- pax-based table fitting already exists
- venue feature flags now exist and can disable unrelated modules per venue

The current system does not yet fully meet Subko's ask:

- queue entry does not yet store seating preference
- queue entry does not yet store guest special notes
- host prioritization is still basic
- wait estimation is still heuristic, not operationally smart
- notification coverage is still minimal
- the guest flow still contains queue-plus-ordering language in some copy paths
- Craftery is now configured down to queue-only behavior in code and migration, but still needs live deployment validation

## Locked Working Assumptions

- Subko Phase 1 is a queue product, not a payments product.
- We will keep the guest experience and a lean host console.
- We will keep the current admin console enabled for Craftery as an internal fallback surface.
- We will not remove the shared Flock capabilities from the codebase globally; we will disable them for Subko by venue config.
- WhatsApp remains the primary notification channel.
- SMS remains fallback when WhatsApp delivery fails.
- Theme parity for Craftery / Subko must remain visually consistent with the current production look.
- Admin-facing venue-config editing is not part of this phase.
- POSist is scoped as TMS table sync only for Subko. Order posting remains out of scope unless ordering is reintroduced later.

## Target Venue Configuration

For the Subko venue, the intended feature configuration is:

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

The intended UI posture is:

- root venue selector remains shared
- Subko venue landing becomes queue-only
- guest copy should describe waitlist flow, not ordering flow
- staff tools remain accessible through canonical venue-qualified staff routes
- Craftery staff surface keeps Queue, Seated, History, Tables, Seat OTP, and Manager
- Craftery staff surface hides flow-log, refund, offline-settle, and bulk-reset tools

## Desired Guest Flow

1. Guest scans a QR code at entrance or reception.
2. Guest lands on the Subko venue page.
3. Guest enters:
   - name
   - mobile number
   - number of guests
   - seating preference: Indoor / Outdoor / First Available
   - optional note
4. Guest submits and is added to the waitlist.
5. Guest sees:
   - live queue position
   - estimated wait
   - queue status
   - clear disclaimer about the response window once notified
6. When a table is ready:
   - guest receives WhatsApp notification
   - guest page reflects ready state
   - countdown window is visible
7. If the guest does not report within the configured window:
   - entry becomes no-show
   - table is released
   - next suitable party is advanced

## Desired Host Flow

1. Host opens the staff console for the Subko venue.
2. Host sees:
   - current waiting list
   - pax counts
   - seating preferences
   - notes
   - notified parties
   - countdown / expiry state for ready tables
3. Host can:
   - seat a party
   - prioritize / bump a party
   - mark a party as no-show or cancel
   - clear stale entries
   - monitor recent history
4. The system should help hosts:
   - fit the best queue entry to available tables
   - avoid losing time on expired ready calls
   - understand queue mix by section and pax

## Roadmap

## Phase A: Configure Craftery / Subko Down To Queue-Only

Goal:
Turn the Subko venue into a queue-first product using the new venue config system, without deleting the broader Flock capabilities.

Deliverables:

- Subko fixture config set to queue-only feature flags
- Subko guest landing copy updated for waitlist-only language
- guest UI hides all ordering and payment paths for Subko
- staff UI hides irrelevant manager tools for Subko
- queue-only smoke test passes for Subko

Acceptance:

- Subko venue exposes only queue-relevant guest functionality
- attempts to call disabled ordering/payment routes return `VENUE_FEATURE_DISABLED`
- current Craftery theme remains unchanged

## Phase A1: POSist Table Sync Hardening

Goal:
Prepare POSist as the table-management system for Subko without expanding into order posting.

Deliverables:

- configure Craftery venue with `tmsProvider=POSIST` once credentials are available
- map Flock tables to POSist table IDs
- harden the existing TMS poller against Subko's real POSist payload shape
- validate `FREE`, `OCCUPIED`, and `CLEARING` transitions against floor operations
- preserve `RESERVED` tables during inbound POSist sync
- confirm queue auto-advance still triggers when POSist frees a table
- keep manual staff table controls as the fallback while POSist stabilizes

Rollout posture:

- mock/dev validation first
- then observed shadow polling against real credentials
- then production authority for table-state transitions

Acceptance:

- Craftery can poll POSist without corrupting table state
- unmatched external table IDs are surfaced for ops follow-up
- poll failures degrade safely without crashing the worker
- queue auto-advance still works when table status changes originate in POSist

## Phase B: Extend Queue Data Model

Goal:
Capture the exact guest inputs Raj requested.

Deliverables:

- add `seatingPreference` to `QueueEntry`
- add guest-entered queue notes to `QueueEntry`
- validate and persist these fields from the guest form
- expose them in queue APIs and staff queue views

Proposed model additions:

- `seatingPreference` enum:
  - `INDOOR`
  - `OUTDOOR`
  - `FIRST_AVAILABLE`
- `guestNotes` optional string

Acceptance:

- guest can submit all required fields from the QR page
- staff queue view can see those fields clearly
- historical entries retain those details for review

## Phase C: Improve Queue Logic

Goal:
Make queue movement and table allocation feel operationally useful, not just technically functional.

Deliverables:

- preference-aware table matching
- host-side queue prioritization controls
- clear notified / expiring / no-show states
- improved ETA logic
- richer queue stats for pax distribution and section pressure

Planned logic improvements:

- prefer section-compatible tables when preference is explicit
- fall back to first-available logic when preference allows it
- let hosts reorder or prioritize entries with an auditable reason
- track and expose notified-expiring entries prominently
- improve ETA calculation using:
  - current occupied tables
  - recent table turnover
  - active waiting count by pax bucket

Acceptance:

- indoor-preferring parties are not assigned outdoor first unless overridden or fallback rules allow it
- hosts can prioritize an entry without direct DB edits
- queue state makes imminent no-shows obvious

## Phase D: Beef Up Notifications

Goal:
Turn notifications from minimal transactional events into an operational communication layer for the waitlist.

Deliverables:

- refined WhatsApp templates for:
  - queue joined
  - queue progress / reminder
  - table ready
  - final reminder before expiry
  - no-show expiration or rejoin guidance
- optional SMS fallback retained
- notification payload logging improved for auditability
- notification triggers aligned with queue state transitions

Proposed notification behavior:

- send queue-joined confirmation immediately
- send table-ready message immediately on notify
- send reminder partway through the response window
- send expiry message when reassigned, if desired by operations

Acceptance:

- all Subko guest lifecycle notifications are visible in the notification log
- fallback channel behavior remains intact
- copy reflects Subko waitlist operations rather than food-ordering operations

## Phase E: Harden Host Console For Subko

Goal:
Make the operator experience reliable and focused for live floor use.

Deliverables:

- queue rows show:
  - guest name
  - phone
  - pax
  - seating preference
  - notes
  - ETA
  - countdown if notified
- prioritization control
- better section visibility
- fast queue filters
- recent history useful for guest recall and service continuity

Acceptance:

- host can manage the entire waitlist without touching unrelated Flock modules
- staff dashboard polling stays stable under live load
- queue and table flows remain usable on mobile-width staff devices

## Phase F: Subko Validation And Rollout

Goal:
Validate the queue-only product against real Subko operations.

Deliverables:

- local automated coverage for new queue-only behaviors
- Subko-specific Playwright flows
- production smoke checklist for queue-only mode
- operational QA checklist for host desk usage

Acceptance:

- guest queue join and live waiting flow work end to end
- table-ready notifications send correctly
- no-show reassignment works
- host queue actions work without exposing disabled ordering modules

## Data Model Plan

Expected schema work for the next implementation phase:

- add a `QueueSeatingPreference` enum
- add `QueueEntry.seatingPreference`
- add `QueueEntry.guestNotes`
- consider `QueueEntry.priorityRank` or equivalent if manual prioritization needs persistence
- consider `QueueEntry.priorityReason` for auditability
- consider notification reminder timestamps if reminder logic should be idempotent

## Notification Plan

Current notification integration is already centralized and should remain the delivery mechanism.

Current delivery path:

- domain service triggers `Notify.*`
- notification log row is created
- WhatsApp send is attempted through Gupshup
- SMS fallback is attempted through MSG91 if WhatsApp fails

Subko-specific expansion should happen inside that same integration layer, not in a separate notification system.

## POSist TMS Plan

Current repo posture:

- POSist already exists only in the TMS poller path
- order posting still targets UrbanPiper, not POSist
- the existing venue fields are already enough for initial POSist setup:
  - `tmsProvider`
  - `tmsApiKey`
  - `tmsVenueId`
  - `posPlatform`
  - `posOutletId`

Subko implementation direction:

- treat POSist as table-state sync only
- do not introduce POSist order posting in the current roadmap
- reuse the existing TMS poller entrypoint and harden it for the real Subko payload contract
- add monitoring for:
  - last successful poll per venue
  - poll failures
  - unmatched external table IDs
  - state transition counts

## UX / Copy Plan

Guest copy should shift from "queue, pre-order, pay" language to "join the waiting list and stay updated."

Subko guest experience should communicate:

- simple queue signup
- clear live status
- clear table-ready window
- clear no-show expectation

The disclaimer should be explicit:

"Once your table is ready, please report to the host desk within 2 to 3 minutes. If you do not arrive in time, the table may be reassigned to the next guest."

## Test Plan

## Unit

- queue join with seating preference and notes
- queue validation for allowed preferences
- preference-aware table matching
- no-show expiry and reassignment
- prioritization behavior
- reminder scheduling / send logic
- Subko venue config disables non-queue modules

## Integration

- guest join payload includes new fields
- queue read returns new fields
- staff queue endpoints reflect prioritization and notified states correctly
- disabled order/payment routes return stable `403 VENUE_FEATURE_DISABLED`
- notification records are created for each waitlist lifecycle event

## Browser / Playwright

- guest joins Subko waitlist from QR venue page
- guest sees queue position and ETA
- guest receives notified state cleanly in UI
- host seats a guest from the Subko queue console
- host priority change affects queue order
- no-show expiry releases table and advances next party
- no ordering or payment CTA is exposed on the Subko guest flow

## Open Questions

- Does Subko want guests to verify the phone number by OTP before final queue confirmation, or is phone capture enough for Phase 1?
- Should hosts be able to override seating preference manually without additional warning?
- Does Subko want "Indoor / Outdoor / First Available" to be strict matching, or only a preference signal?
- Should no-show expiry send a guest-facing message, or should reassignment be silent?
- Does Subko want a simple CRM export / data download in Phase 1, or only data capture in the product for now?

## Review Checklist

This roadmap is ready for implementation once the following are explicitly confirmed:

- queue-only scope for Subko is approved
- seating preference options are approved
- guest notes should be stored
- host prioritization is in scope
- notification expansion is in scope
- OTP on guest join yes / no decision is made

## Decision Ledger

## 2026-03-24

- Created dedicated Subko roadmap and ledger document.
- Locked working direction to queue-first Subko scope.
- Chosen implementation posture: keep Flock shared codebase, disable non-Subko modules by venue config instead of forking code.
- Chosen notification posture: extend existing WhatsApp-first integration rather than build a new notification subsystem.
- Locked admin posture: keep the current admin console enabled for Craftery as an internal fallback surface.
- Locked POSist posture: table sync only through the TMS poller, no POSist order posting in the current roadmap.

## Change Ledger

## 2026-03-24

- Added this file as the working roadmap for Subko queue-only adaptation.
- Recorded current fit/gap analysis between Raj's requirements and the current Flock implementation.
- Defined phased roadmap from venue configuration through queue logic, notifications, host tooling, and rollout validation.
- Updated Phase A to align Craftery with queue-only feature flags while retaining admin as fallback.
- Added the POSist hardening phase and documented that Subko will treat POSist as TMS table sync only.
- Implemented Phase A in code:
  - Craftery fixture config is queue-only
  - persisted Craftery venue migration updates the live row on deploy
  - Craftery guest UI now hides preorder/share/order/pay surfaces
  - Craftery staff UI now hides flow-log, refund, offline-settle, and bulk-reset tools
  - Craftery-specific regression coverage now asserts hidden modules and theme routing

## Next Action

Review this roadmap with the Subko direction in mind.

Once approved, implementation should start with:

1. Deploy and validate Phase A on the Craftery venue
2. Phase B: add seating preference and guest notes to queue entries
3. Phase C: improve queue logic and notifications
