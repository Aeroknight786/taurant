---
name: flock-orchestrator
description: Project-level orchestration skill for the Flock restaurant pilot. Use to refresh current project state, track decisions, document completed work, and update the live Flock orchestration ledger after substantive progress across backend, frontend, deployment, integrations, and pilot-readiness workstreams.
---

# Flock Orchestrator

Use this as the project-level coordinator for the Flock pilot.

This skill does not replace specialized implementation work. It keeps the project state accurate and prevents drift between:

- current code
- current deployment reality
- live database state
- pilot-readiness decisions

## Important Limitation

Skills are static instructions. They do not literally self-update.

To achieve persistent project memory, this skill must always read and update the live ledger:

- `docs/FLOCK_ORCHESTRATION_LEDGER.md`

For detailed implementation truth, also read:

- `docs/FLOCK_IMPLEMENTATION_STATE.md`

## What This Skill Owns

- maintain current project state
- keep locked decisions explicit
- record what has been implemented and tested
- track blockers to restaurant pilot
- keep next steps concrete and prioritized
- append to the ledger after substantive work

## Required Startup Refresh

Before substantive Flock work:

1. Read `docs/FLOCK_ORCHESTRATION_LEDGER.md`
2. Read `docs/FLOCK_IMPLEMENTATION_STATE.md`
3. Read only the code files relevant to the user's request
4. Identify the workstream:
- backend logic
- frontend UX
- database / Supabase
- integrations (Razorpay, WhatsApp, SMS, POS)
- deployment / pilot ops
- documentation / coordination

## Required Shutdown Update

After substantive Flock work:

1. Update `docs/FLOCK_ORCHESTRATION_LEDGER.md`
2. If implementation truth changed, update `docs/FLOCK_IMPLEMENTATION_STATE.md`
3. Append, do not erase historical change-log context

Each ledger update should include:

- what changed
- evidence or validation performed
- decisions locked in or revised
- new risks
- next concrete steps

## Truth Hierarchy

Use sources in this order:

1. current code in `C/Flock`
2. `docs/FLOCK_ORCHESTRATION_LEDGER.md`
3. `docs/FLOCK_IMPLEMENTATION_STATE.md`
4. any legacy reference material

Frontend design exception:

- use `C/taurant/flock v2.html` as the visual truth for design reuse

## Workstream Routing Rules

### Backend

Use when work touches:

- queue
- seating
- table state
- payments
- webhook handling
- auth
- Redis fallback

Always preserve the core lifecycle:

- join
- pre-order
- deposit
- seat
- final pay
- complete

### Frontend

Use when work touches:

- guest routes
- staff routes
- UI state mapping
- route-to-API contracts

Preserve:

- `flock v2` visual language
- guest/staff separation
- lean seated experience

### Database / Supabase

Use when work touches:

- schema
- seed data
- RLS
- live environment verification

Always record:

- schema changes
- migration changes
- any production-safety implications

### Integrations

Use when work touches:

- Razorpay
- Gupshup
- MSG91
- POS handoff

Always distinguish:

- mocked
- configured but unvalidated
- validated live

### Deployment / Pilot Ops

Use when work touches:

- stable URL
- hosting target
- QR flow
- restaurant rollout steps
- dry-run / assisted pilot prep

Always keep "pilot-ready" vs "locally working" separate.

## Non-Negotiable Guardrails

- Do not treat local success as deployment success.
- Do not treat mocked integrations as production-ready.
- Do not overwrite the ledger; append to the change log.
- Do not let documentation drift from the code after substantive changes.
- Do not reintroduce `taurant` business logic.

## Default Orchestration Loop

1. Refresh from ledger + implementation state
2. Scope the workstream
3. Read only the needed code/docs
4. Execute the task
5. Validate
6. Update ledger and implementation state

