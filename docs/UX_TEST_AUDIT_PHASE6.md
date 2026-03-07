# UX Test Audit Phase 6

Date: 2026-03-07

## Environment Tested

- App URL: `https://taurant.onrender.com`
- Health: `GET /api/v1/health` returned `{"status":"degraded","db":"ok","redis":"degraded"}`
- Runtime mode observed: production with intermittent transient failures (429/502) under live polling load

## DevTools MCP Availability

- Available and used for browser-driven testing.
- API calls were used only for OTP and setup actions where OTP/staff seating was required.

## Devices Tested

- Pixel viewport: `412x915` (Android UA)
- iPhone viewport: `390x844` (iPhone Safari UA)

## Flows Tested

- Guest landing and venue entry (`/`, `/v/:slug`)
- Queue join and waiting state
- Invite/share tray and public join (`/v/:slug/session/:joinToken`)
- Pre-order route and reload behavior (`/v/:slug/e/:entryId/preorder`)
- Session restore path on missing local guest token
- Seated tray shell (Menu, Your Bucket, Ordered)
- Shared bucket multi-user sync across two isolated browser contexts
- Send order to table and bucket-clear behavior
- Final payment initiation entry points (Razorpay checkout open, no capture)
- Staff login route and OTP UX (`/staff/login`)
- Staff dashboard route load (`/staff/dashboard`)
- Admin login route and OTP UX (`/admin/login`)
- Admin dashboard route load (`/admin/dashboard`)

## Findings

### Critical

1. Staff dashboard is unusable due to upstream 429 responses  
Classification: Confirmed runtime issue  
Reproduction notes:
- Authenticate staff, then open `/staff/dashboard`.
- `GET /api/v1/tables` returns `429`.
- UI falls into fatal error state (`Something went wrong` + `Too many requests, please try again later`) and cannot reach Queue/Seated/Tables/Seat OTP/Manager tabs.
Likely cause:
- Staff bootstrap path treats required tab data fetch as hard-fail; production rate-limit settings appear too strict for dashboard polling/bootstrap.
Recommended fix:
- Make `/tables` and related dashboard calls soft-fail with per-widget degraded states.
- Re-tune production rate limits for authenticated staff reads.
- Add retry/backoff + partial render fallback instead of route-level fatal crash.

2. Admin dashboard is unusable due to upstream 429 responses  
Classification: Confirmed runtime issue  
Reproduction notes:
- With valid owner/manager auth state, open `/admin/dashboard`.
- `GET /api/v1/menu/admin/current` returns `429`.
- Route fails into the same fatal error shell.
Likely cause:
- Same rate-limit/degraded-state handling problem as staff dashboard.
Recommended fix:
- Soft-fail admin data dependencies and keep dashboard shell usable.
- Adjust authenticated admin read limits and polling strategy.

### High

1. Party-session polling is intermittently returning 502 in seated flows  
Classification: Confirmed runtime issue  
Reproduction notes:
- In seated guest views, monitor polling requests:
  - `GET /api/v1/party-sessions/:id/bucket`
  - `GET /api/v1/party-sessions/:id/participants`
- Intermittent `502` bursts appear in network and console during normal usage.
Likely cause:
- Backend instability around party-session poll endpoints under live concurrent poll traffic; possibly cold-start/degraded dependency contention.
Recommended fix:
- Add server-side resilience on party-session reads.
- Add client-side exponential backoff/jitter and suppress noisy repeated console errors for expected transient failures.

2. Share tray QR can show transient `Loading QR…` under failure windows  
Classification: Confirmed runtime issue  
Reproduction notes:
- Open `Invite others` in seated state during transient backend instability.
- QR area can stall temporarily at `Loading QR…`.
Likely cause:
- QR fetch path impacted by transient upstream instability while share sheet is open.
Recommended fix:
- Keep compact fallback state with explicit retry affordance and stale QR caching for active session link.

### Medium

1. OTP verification can quickly hit 429 during staff-login retries  
Classification: Confirmed runtime issue  
Reproduction notes:
- On `/staff/login`, perform invalid OTP once, then immediate valid verify.
- Verify endpoint can return `429` and block normal completion in UI.
Likely cause:
- OTP verify limiter is aggressive for real operator retry behavior.
Recommended fix:
- Keep brute-force controls but tune thresholds/window and UX copy so one correction attempt does not lock normal flow.

### Low

No low-severity issues recorded in this pass.

## What Is Working Well

- Guest join flow is functional end-to-end through waiting state.
- Pre-order route now renders correctly and survives hard reload.
- Public share/join flow works from invite link to second participant join.
- Session restore path works when local guest token is missing.
- Seated shell renders in both tested mobile viewports with Menu/Bucket/Ordered trays.
- Shared bucket sync works across two isolated participant contexts.
- Sending order to table succeeds and shared bucket clears.
- Ordered tray shows bill details and payment CTAs correctly.
- Final payment initiation opens Razorpay checkout in test mode without forcing capture.

## Next Implementation Priorities

1. Fix staff/admin dashboard hard-failure behavior on 429 by degrading gracefully and rendering partial UI.
2. Re-tune authenticated rate limits for operator-facing endpoints (`/tables`, `/menu/admin/current`, related dashboard data).
3. Stabilize party-session polling endpoints to remove intermittent 502 bursts in seated guest runtime.
4. Harden client polling strategy (backoff/jitter, reduced noisy retries, clearer soft-failure states).
5. Re-run this exact production pass after fixes, prioritizing full staff tab coverage and admin menu CRUD in mobile widths.
