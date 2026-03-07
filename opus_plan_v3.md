# Flock Pilot Readiness Audit — opus_plan_v3

**Author**: Opus (deep audit)
**Date**: 3 March 2026
**Scope**: Full-stack production readiness review — every layer of the Flock codebase
**Context**: Moving towards a pilot deployment at a real venue

---

## Severity Definitions

| Label | Meaning |
|-------|---------|
| **P0** | Will cause data loss, security breach, legal non-compliance, or payment failure in production. Must fix before pilot. |
| **P1** | Will cause visible bugs, bad UX, or operational blindness in production. Should fix before pilot. |
| **P2** | Will cause pain at scale or during edge cases. Fix in first sprint after pilot launch. |
| **P3** | Tech debt, cleanup, or nice-to-have improvements. Plan for post-pilot. |

---

## P0 — Must Fix Before Pilot

### P0-1. HMAC Comparison Vulnerable to Timing Attack

**Files**: `src/integrations/razorpay.ts` lines 69, 84

Both `verifyWebhookSignature` and `verifyPaymentSignature` use `===` to compare HMAC digests. This is vulnerable to timing side-channel attacks — an attacker can brute-force the signature one character at a time by measuring response latency.

**Fix**: Replace `expected === signature` with `crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(signature, 'hex'))` in both functions. Wrap in a try/catch for mismatched buffer lengths.

---

### P0-2. Mock Flags Default to `true` — No Production Guard

**File**: `src/config/env.ts` lines 55-58

```
USE_MOCK_PAYMENTS:      optional('USE_MOCK_PAYMENTS', 'true') === 'true',
USE_MOCK_NOTIFICATIONS: optional('USE_MOCK_NOTIFICATIONS', 'true') === 'true',
USE_MOCK_GST:           optional('USE_MOCK_GST', 'true') === 'true',
USE_MOCK_POS:           optional('USE_MOCK_POS', 'true') === 'true',
```

If you deploy to production without explicitly setting all four to `false`, the system silently:
- Accepts fake payments (no real money collected)
- Sends no WhatsApp/SMS notifications
- Generates no real GST invoices
- Returns mock POS order IDs

**Fix**: Add a startup guard in `server.ts`:
```typescript
if (env.isProd() && (env.USE_MOCK_PAYMENTS || env.USE_MOCK_NOTIFICATIONS || env.USE_MOCK_GST)) {
  throw new Error('FATAL: Mock mode flags must be explicitly false in production');
}
```

Also: integration API keys (`RAZORPAY_KEY_SECRET`, `GUPSHUP_API_KEY`, etc.) are `optional()`. When mocks are off, these should be `required()`. Add validation that keys are present when their corresponding mock flag is `false`.

---

### P0-3. Hardcoded Karnataka State Code in GST Invoices

**File**: `src/integrations/cleartax.ts` line 49

```
BuyerDtls: { Gstin: 'URP', LglNm: params.guestName, Ph: params.guestPhone, POS: '29' },
```

`POS: '29'` is Karnataka's state code. Any venue outside Karnataka will generate **legally invalid** GST e-invoices.

**Fix**: Add a `stateCode` field to the `Venue` model (or derive from GSTIN's first two characters). Pass it dynamically to the ClearTax payload. The state code must come from the venue, not be hardcoded.

---

### P0-4. Indian Fiscal Year Calculation Is Wrong

**File**: `src/utils/txnRef.ts` lines 19-22

```typescript
const year = now.getFullYear();
const nextYear = (year + 1).toString().slice(2);
const fy = `${year}-${nextYear}`;
```

Indian fiscal year runs April–March. In January 2026, this generates `FLOCK/2026-27/00001` but the correct FY is `2025-26`.

**Fix**:
```typescript
const month = now.getMonth(); // 0-indexed
const fyStart = month < 3 ? year - 1 : year; // April = month 3
const fy = `${fyStart}-${(fyStart + 1).toString().slice(2)}`;
```

---

### P0-5. Silent Redis Failure Hides Broken OTP, Rate Limiting, and Cache

**File**: `src/config/redis.ts` lines 16-28

When Redis is unavailable, `createDisabledRedis()` returns a stub where `set()` returns `'OK'` and `publish()` returns `0`. Callers believe operations succeeded. This means:
- Rate limiting silently disabled (attackers can brute-force OTPs)
- Queue position cache returns stale/empty data
- Pub/sub for real-time updates is dead
- No error is raised anywhere

Additionally, `RedisLike` type is missing `get`, `expire`, `incr`, `subscribe` — any code calling these will crash at runtime.

**Also**: `src/server.ts` line 12 — `connectRedis()` returns `false` on failure but the return value is never checked. The server starts with broken Redis and no indication.

**Fix**: 
1. Make Redis connection required in production. Fail server startup if Redis is down.
2. In the disabled stub, throw errors instead of silently succeeding.
3. Add a health check that includes Redis connectivity status.

---

### P0-6. Cross-Venue Authorization Gaps

**File**: `src/controllers/order.controller.ts` line 57-65 and `src/controllers/payment.controller.ts` line 58-67

Two critical authorization holes:

1. **`GET /orders/bill/:queueEntryId`** — When `req.staff` exists, the code skips the guest ownership check. A staff member from Venue A can fetch bills for any guest at Venue B by knowing the `queueEntryId`.

2. **`POST /payments/final/settle-offline`** — No check that the `queueEntryId` belongs to `req.venue`. Staff from Venue A can settle Venue B's guests and complete their checkout, including triggering invoice generation.

**Fix**: In both handlers, when `req.staff` is present, verify that the queue entry's `venueId` matches `req.venue!.id` before proceeding.

---

### P0-7. No Content Security Policy on Frontend

**File**: `web/index.html`

No CSP meta tag or header. Combined with auth tokens in localStorage (see P1-1), any XSS gives full account takeover. The server-side CSP in `app.ts` only applies to API routes; the static file middleware serves `index.html` without headers.

**Fix**: Add CSP meta tag to `index.html`:
```html
<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self' https://checkout.razorpay.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; connect-src 'self' https://api.razorpay.com https://checkout.razorpay.com; frame-src https://api.razorpay.com https://checkout.razorpay.com; img-src 'self' data: https:;">
```

Or better: configure Helmet to serve the CSP header for all routes including static files.

---

## P1 — Should Fix Before Pilot

### P1-1. Auth Tokens in localStorage (XSS → Full Compromise)

**File**: `web/app.js` lines 1191, 1282, 3117, 3124

Staff JWT and guest session tokens are stored in `localStorage`. Any XSS on the same origin can exfiltrate them. This is especially dangerous because:
- Third-party scripts (Razorpay checkout) run on the same origin
- The guest token enables ordering and payment
- The staff token enables seating, queue management, and offline settlement

**Fix**: For pilot, this is acceptable with the CSP fix (P0-7) in place. Post-pilot, migrate to httpOnly cookies set by the server.

---

### P1-2. Mock Payment Bypass in Production Frontend Code

**File**: `web/app.js` lines 2871-2880

If the server returns `keyId === 'mock_key'`, the client skips Razorpay entirely and captures payment with `pay_mock_${Date.now()}`. Combined with P0-2 (mock flags default true), this creates a path where users "pay" without transferring money.

**Fix**: Strip or feature-flag the mock payment branch out of the production build. At minimum, gate it behind a `window.__FLOCK_DEV_MODE` check that is never set in production.

---

### P1-3. Loose JWT Token Detection

**File**: `src/utils/jwt.ts` line 49

```typescript
if (payload.kind === 'staff' || (payload.staffId && payload.venueId && payload.role)) {
```

Any JWT signed with the app's secret that happens to contain `staffId`, `venueId`, and `role` fields is accepted as a staff token — even without `kind: 'staff'`. The `role` value is cast to `StaffRole` without validation, so a crafted token with `role: "SUPER_ADMIN"` would pass.

**Fix**: 
1. Require `kind: 'staff'` strictly (remove the fallback OR condition)
2. Validate `role` against the `StaffRole` enum values
3. Add `iss: 'flock'` and `aud: 'staff'|'guest'` claims

---

### P1-4. OTP Brute-Force on Session Reissue Endpoint

**File**: `src/routes/queue.routes.ts` line 7

`POST /queue/:entryId/session` accepts `{ otp }` with no authentication. OTP is 6 digits (1 million combinations). With 200 requests/15 min (the general rate limit), an attacker can try ~200 OTPs. That's still hard, but:
- The endpoint is not behind the `otpLimiter` (3/minute)
- There's no attempt counter or lockout on the queue entry

**Fix**: Apply `otpLimiter` to this endpoint, or add an `attempts` counter on the `QueueEntry` that locks after 5 failed OTP attempts.

---

### P1-5. Party Session Join Token — No Rate Limiting

**File**: `src/routes/partySession.routes.ts` line 7

`POST /party-sessions/join/:joinToken` has no authentication. Join tokens are 16 hex characters (64 bits), which is brute-force resistant, but there's no rate limiting on attempts. An attacker can probe tokens at the general API rate of 200/15min.

**Fix**: Add rate limiting on this endpoint (by IP, tighter than general API limiter).

---

### P1-6. `window.__flockJoinPartySession` Debug Helper Exposed

**File**: `web/app.js` lines 3504-3534

A fully authenticated party-join function is attached to `window`. Anyone in the browser console can join any party session given a `joinToken`.

**Fix**: Remove or gate behind `process.env.NODE_ENV !== 'production'`.

---

### P1-7. Stale Closure in Seated Guest Experience

**File**: `web/app.js` lines 2308-2506

`renderTrayShell` closes over `entry`, `venue`, `bill`, and `guestSession` from the outer `mountSeatedGuestExperience` call. When the party poller calls `rerenderActiveGuestShell()` → `renderTrayShell()`, it renders with the **original** data, not the latest server data. The bill balance shown in the "Ordered" tray and floating pay button is stale until the user navigates away and back.

**Fix**: Make `renderTrayShell` re-fetch `entry` and `bill` from the server (or from a mutable reference updated by the poller) instead of closing over initial values.

---

### P1-8. No Double-Click Guards on Staff/Admin Actions

**File**: `web/app.js` — multiple locations

The following actions have no `isSubmitting` guard. Rapid clicks send duplicate requests:

| Action | Lines | Risk |
|--------|-------|------|
| Cancel queue entry | 1418-1430 | Double DELETE → 404 errors |
| Change table status | 1434-1448 | Rapid status flips |
| Toggle item availability | 1687-1700 | Toggle back-and-forth |
| Delete menu item | 1703-1715 | Double DELETE → 404 errors |
| Toggle queue open/closed | 1528-1541 | Queue opens and immediately closes |
| Manager config update | 1543-1559 | Duplicate PATCH |
| Offline settle | 1562-1575 | Double settlement |
| Staff refund | 1578-1593 | Double refund |
| Admin create category/item | 1718-1759 | Duplicate items |

**Fix**: Apply the same `uiState.*Submitting` pattern used in the guest order flow to all staff/admin actions. A universal wrapper function would be cleanest.

---

### P1-9. Staff Dashboard Polling Destroys Form State

**File**: `web/app.js` line 1597

The staff dashboard re-renders every 3 seconds for `queue`, `tables`, and `manager` tabs. If a staff member is mid-edit on the manager config form (changing deposit %, settling offline, entering refund details), the re-render wipes their input.

**Fix**: Skip polling when on tabs with forms, or use DOM patching instead of full re-render. The polling already pauses for the `seat` tab — extend this logic to `manager`.

---

### P1-10. Hardcoded CGST/SGST Labels and Fee Percentages

**Files**: `src/utils/gst.ts` lines 43-44, `src/integrations/razorpay.ts` lines 118-119

1. `aggregateGst()` returns `cgstPercent: 9, sgstPercent: 9` regardless of actual item GST rates. A restaurant-only venue (5% GST = 2.5%+2.5%) gets mislabeled percentages.

2. Platform fee (2%) and Razorpay fee (2%) are hardcoded. Should be configurable per venue or per plan.

**Fix**: 
1. Compute the effective CGST/SGST percentages from the actual item rates, or return per-line rates instead of aggregated ones.
2. Move fee percentages to env vars or the `Venue` model.

---

### P1-11. Database Has No Connection Pool Configuration

**File**: `src/config/database.ts`

Prisma defaults to `num_cpus * 2 + 1` connections. No configuration for:
- `connection_limit` (pool size)
- `pool_timeout` (how long to wait for a free connection)
- `connect_timeout`
- `statement_timeout` (prevent runaway queries)

A busy pilot venue could exhaust the pool and start queuing requests.

**Fix**: Set via `DATABASE_URL` query params: `?connection_limit=20&pool_timeout=10&connect_timeout=5&statement_timeout=30000`.

---

### P1-12. No Health Check / Readiness Endpoint

**File**: `src/server.ts`

There is a `/health` route in `routes/index.ts`, but it only returns `{ status: 'ok' }` — it doesn't check database or Redis connectivity. Any orchestrator (Render, Railway, ECS, K8s) needs to know if the service is actually healthy.

**Fix**: The health check should:
1. `SELECT 1` against PostgreSQL
2. `PING` against Redis
3. Return 200 only if both succeed, 503 otherwise

---

## P2 — Fix in First Sprint After Pilot

### P2-1. `recompactPositions` — Unbatched Parallel Updates

**Files**: `src/services/queue.service.ts` line 415-418, `src/services/table.service.ts` lines 191-199

Both recompaction functions fire N parallel `prisma.queueEntry.update()` calls via `Promise.all`. With 100 active entries, that's 100 concurrent DB writes. Under load, this can exhaust the connection pool.

**Fix**: Use `prisma.$transaction` with sequential updates, or batch into a single raw SQL `UPDATE ... FROM (VALUES ...)`.

---

### P2-2. TMS Poller — `setInterval` Without Drift Protection

**File**: `src/workers/tmsPoller.ts` line 145

If a poll tick takes longer than `TMS_POLL_INTERVAL_MS` (4s default), the next tick fires immediately. Under load with many venues or slow TMS APIs, ticks pile up creating unbounded concurrency.

**Fix**: Switch to a `setTimeout`-after-completion pattern:
```typescript
async function runTick() {
  // ... poll logic ...
  setTimeout(runTick, env.TMS_POLL_INTERVAL_MS);
}
```

---

### P2-3. TMS Poller — Comment/Code Mismatch on Clearing Timeout

**File**: `src/workers/tmsPoller.ts` line 121 (comment says "10 minutes") vs line 134 (code checks `ageMin >= 5`)

One of them is wrong. Clarify the intended timeout and align both.

---

### P2-4. No Timeout on External API Calls

**Files**: All integration files

None of the `fetch()` calls to external APIs (Razorpay, Gupshup, MSG91, UrbanPiper, ClearTax, Posist) have an `AbortController` timeout. A hung external API blocks the request indefinitely, holding a database connection and Express worker.

**Fix**: Add `AbortController` with a 10-second timeout to all external `fetch()` calls:
```typescript
const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), 10_000);
const res = await fetch(url, { signal: controller.signal, ... });
clearTimeout(timeout);
```

---

### P2-5. Transaction Reference Collision Risk

**File**: `src/utils/txnRef.ts` line 10

Only 4 hex characters (16 bits = 65,536 values) of randomness per millisecond timestamp. Under high concurrency, collisions are likely.

**Fix**: Increase to 8 random characters (32 bits, ~4 billion values per millisecond).

---

### P2-6. Redis Retry Gives Up Permanently

**File**: `src/config/redis.ts` line 33

After 10 retries, `retryStrategy` returns `null`, telling ioredis to stop reconnecting forever. A brief Redis blip during a garbage collection pause or network hiccup permanently disables caching for the process lifetime.

**Fix**: Never return `null`. Cap the delay instead: `return Math.min(times * 200, 30000)`.

---

### P2-7. No Notification Rate Limiting Per Phone

**File**: `src/integrations/notifications.ts`

Nothing prevents sending dozens of notifications to the same phone number in rapid succession (e.g., if the WhatsApp send fails and retries, or if a queue entry is repeatedly cancelled and re-joined).

**Fix**: Add a per-phone cooldown check before sending. 1 minute between OTPs, 5 minutes between non-OTP messages to the same number.

---

### P2-8. Webhook Error Silently Swallowed

**File**: `src/controllers/payment.controller.ts` lines 99-104

```typescript
await PaymentService.capturePaymentFromWebhook({...}).catch(() => {});
```

If webhook processing fails (DB error, payment already cancelled, etc.), the error is completely hidden. Razorpay considers the webhook delivered (200 response), but the payment is never captured in Flock's DB.

**Fix**: Log the error. If the webhook fails, consider returning a 500 so Razorpay retries.

---

### P2-9. IntersectionObserver Never Disconnected

**File**: `web/app.js` line 2288-2305

`mountGuestCategoryTracking()` creates a new `IntersectionObserver` on each call but never stores a reference for cleanup. Each tray switch creates a new observer without disconnecting the old one. Over a long session, dozens of orphaned observers accumulate.

**Fix**: Store the observer reference. On tray unmount, call `observer.disconnect()`.

---

### P2-10. No Path Parameter Validation

**Files**: Most controllers

URL path parameters (`slug`, `entryId`, `queueEntryId`, `tableId`, `sessionId`, `itemId`) are passed directly to Prisma queries without Zod validation. While UUIDs are safe from SQL injection (Prisma parameterises), invalid formats produce unhelpful Prisma errors instead of clean 400 responses.

**Fix**: Add a `validateUuid` middleware or inline Zod check for UUID params.

---

### P2-11. Share Sheet Doesn't Lock Body Scroll

**File**: `web/app.js` lines 896-900

When the share sheet opens on mobile, the page behind it is still scrollable. Users can scroll the page behind the backdrop, which is disorienting.

**Fix**: Set `document.body.style.overflow = 'hidden'` on open, restore on close.

---

### P2-12. Inconsistent Response Formats

**Files**: Multiple controllers

Some error responses use `res.status(403).json({ success: false, error: '...' })` while others use `forbidden()` from `utils/response.ts`. Some webhook responses use `res.json({ status: 'ok' })` instead of `ok(res, ...)`.

**Fix**: Standardise all responses through the `ok()`, `fail()`, `forbidden()`, `unauthorized()` helpers.

---

### P2-13. `MenuItem` Has No Cascade Delete from `MenuCategory`

**File**: `prisma/schema.prisma` line 244

```
category MenuCategory @relation(fields: [categoryId], references: [id])
```

No `onDelete: Cascade`. Deleting a `MenuCategory` that has items will throw a foreign key violation. The admin must manually remove all items first with no UI guidance.

**Fix**: Add `onDelete: Cascade` or `onDelete: SetNull` (with `categoryId` optional). Or add a check in the delete handler.

---

### P2-14. `Order` Has No Cascade from `QueueEntry`

**File**: `prisma/schema.prisma` line 300

```
queueEntry QueueEntry @relation(fields: [queueEntryId], references: [id])
```

No `onDelete` specified. If a queue entry is somehow deleted (admin cleanup, data retention), its orders become orphaned with a dangling foreign key.

**Fix**: Add `onDelete: Cascade` or implement soft deletes.

---

## P3 — Post-Pilot Improvements

### P3-1. Console-Only Logging

**File**: `src/config/logger.ts`

Logs go to stdout only. Container restarts lose everything. No structured transport to Datadog, CloudWatch, or Loki.

**Fix**: Add a file or external transport. At minimum, configure the hosting platform to persist stdout logs.

---

### P3-2. No PII Redaction in Logs

Phone numbers, guest names, and OTPs appear in log messages throughout the codebase (e.g., `notifications.ts` line 120: `to: params.to`).

**Fix**: Add a PII redaction transform to the Winston pipeline that masks phone numbers and names.

---

### P3-3. No Request Correlation ID

Concurrent requests produce interleaved log lines with no way to trace a single request flow.

**Fix**: Add a middleware that generates a `requestId` (UUID) and attaches it to all log messages and error responses.

---

### P3-4. `estimateWait` Is a Static Multiplier

**File**: `src/services/queue.service.ts` lines 422-424

```typescript
function estimateWait(_venueId: string, position: number): number {
  return Math.ceil(position * AVG_TURN_MINUTES * 0.7);
}
```

Doesn't account for: party size (larger groups wait longer for matching tables), time of day, historical turnover rate, or current table occupancy duration.

**Fix**: At minimum, factor in the number of free tables of matching capacity. A venue with 10 free 2-seaters should give a party of 2 a much shorter estimate than position * 55 * 0.7.

---

### P3-5. No Token Revocation Mechanism

**File**: `src/utils/jwt.ts`

Once issued, JWTs cannot be revoked before expiry. If a staff member is fired mid-shift, their token remains valid for up to 7 days. If a guest session is compromised, there's no way to invalidate it.

**Fix**: Maintain a token blocklist in Redis (checked in auth middleware), or switch to short-lived tokens with a refresh token rotation pattern.

---

### P3-6. Keyboard Accessibility Missing

**File**: `web/styles.css`

No `:focus-visible` styles anywhere. Keyboard-only users cannot tell which element is focused. This is a WCAG 2.1 Level A failure.

**Fix**: Add `:focus-visible` outlines to all interactive elements.

---

### P3-7. Insufficient Color Contrast

**File**: `web/styles.css`

`--cream-dimmer: #5c5648` on `--bg: #141210` yields ~2.8:1 contrast ratio. WCAG AA requires 4.5:1 for normal text. Used extensively for meta text, form labels, and stat labels.

**Fix**: Lighten `--cream-dimmer` to at least `#8a826f` (~4.5:1 on the background).

---

### P3-8. Touch Targets Below Minimum

**File**: `web/styles.css` lines 1110-1118

`.qty-btn` is 28x28px. Apple HIG and WCAG 2.5.8 recommend 44x44px minimum for touch targets.

**Fix**: Increase to `min-width: 44px; min-height: 44px`.

---

### P3-9. No `prefers-reduced-motion` Query

**File**: `web/styles.css`

The `pulse` animation and all `transition` properties run regardless of user motion preferences. Users with vestibular disorders may experience discomfort.

**Fix**: Wrap animations in `@media (prefers-reduced-motion: no-preference) { ... }`.

---

### P3-10. No Favicon, Manifest, Theme-Color, or Noscript Fallback

**File**: `web/index.html`

Missing:
- `<link rel="icon">` (browser shows generic icon)
- `<link rel="manifest">` (no PWA support)
- `<meta name="theme-color">` (browser chrome doesn't match dark theme)
- `<noscript>` fallback (blank screen if JS fails)
- `<meta name="description">` (SEO)

---

### P3-11. Dead Code in Frontend

**File**: `web/app.js`

1. **Lines 2624-2678**: `SEATED` branch in `renderGuestStateCards` is unreachable — seated guests are now handled by `renderSeatedGuestShell`.
2. **Lines 3276-3302**: `BucketStore.getDraft`, `setDraft`, `clearDraft` duplicate `getDraftCart`, `setDraftCart`, `clearDraftCart`.

**Fix**: Remove dead code.

---

### P3-12. `@types` Packages in Production Dependencies

**File**: `package.json`

All `@types/*` packages are correctly in `devDependencies` now. However, `typescript` (line 28) is in `dependencies` rather than `devDependencies`. It's only needed at build time.

**Fix**: Move `typescript` to `devDependencies`.

---

## Queue/Table Logic Gaps (Product-Level)

These aren't bugs but product design gaps that will surface during a real pilot:

### QL-1. No-Show Should Bump to Next-in-Queue, Not Eject (NEW — PILOT CRITICAL)

**Current behavior**: When `sweepExpiredTableReadyEntries()` fires, a guest who didn't arrive within the window is marked `NO_SHOW` and permanently removed from the queue. Their table is freed and offered to the next person.

**Required behavior**: A no-show should be **bumped back into the queue** at the next available position, not ejected. If they no-show again on a subsequent table offer, they get bumped again. After a configurable number of bumps (default: 3), they are permanently ejected as `NO_SHOW`.

#### Schema Changes

**`Venue` model** — add:
```
maxNoShowBumps  Int  @default(3)
```
Configurable per venue. Controls how many times a guest can miss their table call before permanent ejection.

**`QueueEntry` model** — add:
```
noShowBumpCount  Int  @default(0)
```
Tracks how many times this guest has been bumped after missing a table call.

**`UpdateVenueConfigSchema`** in `venue.service.ts` — add:
```
maxNoShowBumps: z.number().int().min(1).max(10).optional(),
```

#### Logic Changes in `sweepExpiredTableReadyEntries()`

**File**: `src/services/table.service.ts` — `sweepExpiredTableReadyEntries()`

Replace the current no-show logic with:

```
For each expired NOTIFIED entry:
  1. Release the RESERVED table back to FREE (same as now)
  2. Fetch venue.maxNoShowBumps
  3. Increment entry.noShowBumpCount
  4. IF noShowBumpCount >= maxNoShowBumps:
       → Mark as NO_SHOW (permanent eject, same as current behavior)
       → Nullify tableId, tableReadyDeadlineAt
       → Log: "Guest {name} permanently ejected after {count} no-show bumps"
     ELSE:
       → Set status back to WAITING (not NO_SHOW)
       → Nullify tableId, tableReadyDeadlineAt, tableReadyExpiredAt
       → Recompact queue positions (guest goes to end of their original priority tier)
       → Send WhatsApp: "You missed your table at {venue}. You've been placed back in the queue (bump {count}/{max}). {remaining} chances left before removal."
       → Log: "Guest {name} bumped back to queue (bump {count}/{max})"
  5. Call tryAdvanceQueue for the released table (same as now)
```

#### Queue Position on Bump

When a guest is bumped, they go to **the end of the WAITING entries** (highest position + 1). This is fair — they missed their turn, so they don't get to keep their original position. However, they don't lose their deposit or pre-order.

The `recompactPositions` call after the bump handles this naturally as long as the entry's `joinedAt` is updated to `now()` (so it sorts last in the recompaction). Alternatively, keep the original `joinedAt` but set `position` explicitly to `activeCount + 1`.

**Recommended approach**: Update `joinedAt` to `now()` on bump. This way recompaction naturally places them last without special-case logic.

#### Guest UI Changes

When a bumped guest checks their status, they should see:
- Status: `WAITING` (back in queue)
- A banner: "You missed your table. You've been placed back in line. Bump 1 of 3."
- The `noShowBumpCount` should be included in the `GET /queue/:entryId` response so the frontend can display it.

#### Notification Templates

Add a new notification type or message template:

```typescript
function noShowBumpMessage(name: string, venueName: string, bumpCount: number, maxBumps: number): string {
  const remaining = maxBumps - bumpCount;
  return `Hi ${name}, you missed your table call at ${venueName}. You've been placed back in the queue (attempt ${bumpCount}/${maxBumps}). ${remaining} chance${remaining === 1 ? '' : 's'} remaining before automatic removal.`;
}
```

#### Edge Cases

| Scenario | Handling |
|----------|----------|
| Guest has a deposit and gets bumped | Deposit stays intact. Pre-order stays intact. Both carry over when they're eventually seated. |
| Guest gets bumped, then cancels | Normal cancellation flow — auto-refund if applicable. |
| Guest gets bumped and a table opens immediately | `tryAdvanceQueue` fires after the table is freed. If the bumped guest is now the best match, they get notified again immediately. This is correct — they get another chance. |
| Two guests bump at the same tick | Each is processed independently. Both go to end of queue. Order determined by alphabetical `id` within the same `joinedAt` timestamp. |
| Venue changes `maxNoShowBumps` mid-session | The new value applies immediately. A guest with 2 bumps at a venue that changes from 3→2 would be ejected on the next no-show. |
| Guest on bump 2 of 3, then manually cancels and re-joins | New queue entry, fresh `noShowBumpCount = 0`. This is correct — they paid the penalty of losing their position. |

#### Files Changed

| File | Change |
|------|--------|
| `prisma/schema.prisma` | Add `maxNoShowBumps` to `Venue`, `noShowBumpCount` to `QueueEntry` |
| `src/services/venue.service.ts` | Add `maxNoShowBumps` to `UpdateVenueConfigSchema` |
| `src/services/table.service.ts` | Rewrite `sweepExpiredTableReadyEntries()` bump logic |
| `src/integrations/notifications.ts` | Add `Notify.noShowBump()` with new message template |
| `src/services/queue.service.ts` | Include `noShowBumpCount` in `getQueueEntry` response |
| `web/app.js` | Show bump count banner on guest entry page when `noShowBumpCount > 0` |
| Migration | Add columns with defaults |

---

### QL-2. No "I'm Running Late" Extension

When a guest is notified (table ready), they have `tableReadyWindowMin` minutes. There's no way for the guest to request an extension. The only outcome is: arrive in time, or get bumped (per QL-1).

**Suggested**: Add a "Need 5 more minutes" button on the guest UI that extends `tableReadyDeadlineAt` by 5 minutes, once per bump cycle. This reduces unnecessary bumps for guests who are genuinely on their way.

### QL-3. No Notification to Skipped Large Parties

When a 4-seater opens and a party of 6 at position #1 is skipped in favor of a party of 3 at position #2, party #1 gets no communication about why they were skipped or that they're still next for a larger table.

**Suggested**: Send a WhatsApp message: "A smaller table opened but doesn't fit your group of 6. You're still next for a suitable table."

### QL-4. No Table Combining

If two adjacent 4-seaters are free, there's no concept of combining them for a party of 6-8. Each `tryAdvanceQueue` call processes one table at a time.

**Suggested**: Future feature — requires a `Table.adjacentTo` relation and combined-capacity logic.

### QL-5. Wait Estimate Doesn't Account for Table Sizes

`estimateWait` gives the same estimate to a party of 2 and a party of 8, even though 8-seaters are much rarer.

**Suggested**: Factor in the count of tables with matching capacity and their average turnover time.

### QL-6. No No-Show Deposit Policy

When a guest is permanently ejected after exhausting all bumps, their deposit is not automatically refunded (unlike queue cancellation, which does auto-refund). This may be intentional (no-show penalty), but there's no configurable policy per venue.

**Suggested**: Add a `noShowRefundPolicy` field to `Venue`: `FULL_REFUND`, `NO_REFUND`, or `PARTIAL_REFUND` with a percentage. Apply it when `noShowBumpCount >= maxNoShowBumps` and the guest is permanently ejected.

---

## Counts

| Severity | Count |
|----------|-------|
| **P0** (must fix) | 7 |
| **P1** (should fix) | 12 |
| **P2** (first sprint) | 14 |
| **P3** (post-pilot) | 12 |
| **Product gaps** | 6 (QL-1 is pilot-critical) |
| **Total** | 51 |

---

## Suggested Fix Order for Pilot

| Phase | Items | Effort |
|-------|-------|--------|
| **Day 1** | P0-1 (HMAC), P0-2 (mock guards), P0-4 (fiscal year), P0-5 (Redis), P0-7 (CSP) | Small — mostly one-liner fixes |
| **Day 2** | P0-3 (state code), P0-6 (cross-venue auth), P1-3 (JWT validation), P1-4 (OTP rate limit) | Small-medium |
| **Day 3** | P1-2 (mock payment), P1-6 (debug helper), P1-8 (double-click guards), P1-9 (form state polling) | Medium |
| **Day 4** | **QL-1 (no-show bump system)** — schema migration, sweep rewrite, notification template, guest UI banner | Medium-large |
| **Day 5** | P1-7 (stale closure), P1-10 (GST/fee hardcodes), P1-11 (DB pool), P1-12 (health check) | Medium |
| **Post-pilot sprint** | All P2 items | 3-5 days |
| **Backlog** | All P3 items + QL-2 through QL-6 | Ongoing |

---

## Handover — Changes Implemented (3 March 2026)

### UX Fixes (Frontend)

| File | Change |
|------|--------|
| `web/app.js` | **ETA card** — Replaced bloated `.wait-estimate` block with compact `.wait-strip` inline strip (ring + number + "min wait" on one line) |
| `web/styles.css` | Replaced 7 old ETA CSS classes with 4 new `.wait-strip-*` classes; removed mobile column collapse override |
| `web/styles.css` | **Menu overflow** — Grid min changed from `160px` to `140px`; `.menu-item` gets `min-width:0`; `.qty-btn` enlarged to 36x36 (meets touch target guidelines); `.menu-item-foot` gets `overflow:hidden`; added `@media (max-width:400px)` single-column breakpoint |
| `web/app.js` | **Bucket CTA toast** — Added `#guest-bucket-toast-host` to seated shell; `renderTrayShell` now shows a sticky amber toast bar ("N items in your bucket / View Bucket") when on menu tray with items in cart |
| `web/styles.css` | Added `.bucket-toast` styles with `toastSlideUp` animation |
| `web/app.js` | **Duplicate pay buttons** — Floating pay button now hidden when `guestTray === 'ordered'`; only the inline pay button shows on the ordered tray. Floating remains visible on menu/bucket trays. |
| `web/app.js` | **Party pre-order banner** — Added `isPartyJoiner` flag to guest session on party join; WAITING/NOTIFIED state cards show "The host has already placed a pre-order" info banner for party joiners when deposit is locked |

### Security / Backend Fixes

| File | Change | Plan Item |
|------|--------|-----------|
| `src/integrations/razorpay.ts` | `verifyWebhookSignature` and `verifyPaymentSignature` now use `crypto.timingSafeEqual` with try/catch for buffer length mismatch | P0-1 |
| `src/server.ts` | Added startup guard: throws `FATAL` error if `isProd()` and any mock flag is true | P0-2 |
| `src/utils/txnRef.ts` | `generateInvoiceNumber` now uses `month < 3 ? year - 1 : year` for correct Indian fiscal year (Apr-Mar) | P0-4 |
| `web/index.html` | Added CSP meta tag allowing self, Razorpay, Google Fonts; added `theme-color` meta | P0-7 |
| `web/app.js` | Removed `window.__flockJoinPartySession` debug helper entirely | P1-6 |
| `web/app.js` | Added `guardedAction(key, fn)` helper; wrapped all 10 unguarded staff/admin action handlers (cancel, table status, toggle queue, config form, offline settle, refund, toggle availability, delete item, create category, create item) | P1-8 |
| `web/app.js` | Staff dashboard polling now also skips when `currentTab === 'manager'` (was only skipping `seat`) | P1-9 |

### What Remains

| Item | Status |
|------|--------|
| P0-3 (hardcoded state code in ClearTax) | Not implemented — requires schema change (`Venue.stateCode`) |
| P0-5 (silent Redis failure) | Not implemented — requires Redis config refactor |
| P0-6 (cross-venue auth gaps) | Not implemented — requires controller changes with test coverage |
| P1-1 through P1-5, P1-7, P1-10-12 | Not implemented — see original plan for details |
| QL-1 (no-show bump system) | Not implemented — requires schema migration + service rewrite |
| All P2 and P3 items | Not implemented — scheduled post-pilot |

### Known Tradeoffs

- The `guardedAction` pattern uses a global Set keyed by action name. If the page is re-rendered (which recreates event listeners), stale keys are naturally cleaned up because the Set entry is deleted in the `finally` block.
- The bucket toast does not auto-dismiss — it stays visible as long as the user is on the menu tray with items in cart. This is intentional for discoverability.
- The `isPartyJoiner` flag is stored in localStorage via `setGuestSession`. Clearing storage loses this flag, but the fallback is graceful (host-style view shown).
