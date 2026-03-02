# Flock Pilot Deployment Runbook

Last updated: 2026-03-02

## Goal

Move Flock from local-only validation to a stable HTTPS pilot deployment that can be used in a real restaurant with:

- a public guest QR link
- a stable staff dashboard URL
- a public Razorpay webhook endpoint
- real WhatsApp/SMS delivery when enabled

This runbook assumes the current code shape remains:

- one Express app
- backend + frontend served together
- Supabase Postgres
- optional Redis

## Hosting Recommendation

PM source-of-truth (Notion `Integrations`) requires:

- AWS Mumbai as the primary hosting target

For the current codebase, the practical interim shortcut for a fast controlled pilot is:

- Render web service

Why:

- the app is already a long-lived Express process
- the app serves both UI and API together
- the app has a background poller
- webhook handling is simpler on one stable process

Do not use Vercel as the primary host for this current codebase unless the frontend and backend are split.

Important:

- Render is an implementation shortcut for speed, not the PM-source final infrastructure direction
- the long-term faithful target remains AWS Mumbai

## Deployment Artifact

Render blueprint file:

- [render.yaml](/Users/adsaha/Desktop/Pricing%20Engine/C/Flock/render.yaml)

This is set up for:

- Node 20
- `npm install && npm run build`
- `npm run start`
- health check at `/api/v1/health`

`autoDeploy` is intentionally set to `false` so you can control pilot releases manually.

## Render Setup

## 1. Create the service

In Render:

1. Create a new Web Service.
2. Point it at this repo.
3. Use the provided `render.yaml`, or mirror its values manually.
4. Use a branch dedicated to pilot release if you want safer promotion.

## 2. Set required environment variables

These must be set before first successful production boot:

### Core app

- `NODE_ENV=production`
- `API_VERSION=v1`
- `APP_ALLOWED_ORIGINS=https://<render-host>` (comma-separated if you later add a custom domain)

Current implementation requirement (temporary divergence from PM source truth):

- `JWT_SECRET=<strong random secret>`
- `JWT_EXPIRES_IN=7d`
- `OTP_EXPIRES_SECONDS=300`

PM source truth requires:

- Firebase Auth for staff/admin auth

So `JWT_SECRET` is still required for the current codebase, but should be treated as an implementation-gap placeholder until Firebase Auth replaces the custom JWT stack.

### Database

- `DATABASE_URL=<Supabase session pooler URI>`

Use the Supabase **session pooler** URI, not the direct `db.` host and not the transaction pooler.

### Redis

Preferred:

- `REDIS_URL=<Upstash Redis URL>`

If `REDIS_URL` is omitted, the app now skips Redis cleanly and runs in degraded mode without attempting a localhost fallback.

### Feature flags

For first deployment dry run:

- `USE_MOCK_PAYMENTS=true`
- `USE_MOCK_NOTIFICATIONS=true`
- `USE_MOCK_GST=true`
- `USE_MOCK_POS=true`

For real pilot:

- `USE_MOCK_PAYMENTS=false`
- `USE_MOCK_NOTIFICATIONS=false`
- `USE_MOCK_GST=<your operational choice>`
- `USE_MOCK_POS=true` is acceptable for the first pilot

## Stable URL Plan

Use one stable public URL for the first pilot, for example:

- `https://flock-pilot.onrender.com`

If you add a custom domain, prefer:

- `https://pilot.flock.<your-domain>`

The guest QR code should point directly to:

- `https://<host>/v/the-barrel-room-koramangala`

The staff entry route is:

- `https://<host>/staff/login`

The health check is:

- `https://<host>/api/v1/health`

## Razorpay Go-Live Checklist

## What you need

- `RAZORPAY_KEY_ID`
- `RAZORPAY_KEY_SECRET`
- `RAZORPAY_WEBHOOK_SECRET`
- `RAZORPAY_ACCOUNT_NUMBER`

## Render env vars

Set:

- `RAZORPAY_KEY_ID`
- `RAZORPAY_KEY_SECRET`
- `RAZORPAY_WEBHOOK_SECRET`
- `RAZORPAY_ACCOUNT_NUMBER`
- `USE_MOCK_PAYMENTS=false`

## Webhook configuration

In Razorpay, point the webhook to:

- `https://<host>/api/v1/payments/webhook/razorpay`

Subscribe at minimum to:

- `payment.captured`
- `payment.failed`

The current backend already verifies signatures and handles both events.

## Dry-run sequence

Before allowing real guests:

1. Create a test queue entry.
2. Create a pre-order.
3. Run a real test payment with a low-value item.
4. Confirm:
- client callback path succeeds
- webhook is received
- payment is marked captured exactly once

## WhatsApp / SMS Go-Live Checklist

## What you need

Primary:

- `GUPSHUP_API_KEY`
- `GUPSHUP_APP_NAME`
- `GUPSHUP_SOURCE_NUMBER`

Fallback:

- `MSG91_AUTH_KEY`
- `MSG91_SENDER_ID`
- `MSG91_TEMPLATE_ID_OTP`
- `MSG91_TEMPLATE_ID_QUEUE`
- `MSG91_TEMPLATE_ID_TABLE_READY`

## Render env vars

Set:

- `GUPSHUP_API_KEY`
- `GUPSHUP_APP_NAME`
- `GUPSHUP_SOURCE_NUMBER`
- `MSG91_*` values as needed
- `USE_MOCK_NOTIFICATIONS=false`

## Required templates

Approve templates for at least:

- OTP
- queue joined
- table ready
- order confirmed

## Dry-run sequence

Before guest usage:

1. Trigger staff OTP.
2. Trigger guest queue join.
3. Trigger deposit confirmation.
4. Verify message delivery on actual phones.

## Supabase / Data Checklist

Before first public pilot session:

0. Apply the checked-in RLS hardening migration if the target environment does not already have it:
   - `20260302170000_harden_public_rls_policies`
1. Replace or edit seed/demo venue data with the restaurant's real data.
2. Replace or edit the menu with the restaurant's real menu.
3. Verify:
- deposit %
- table-ready window
- table labels and capacities
- staff phones

## Pre-Pilot Release Checklist

Before you hand this to a restaurant:

1. Deploy to Render and confirm health check passes.
2. Confirm guest route loads.
3. Confirm staff login route loads.
4. Confirm Supabase DB is reachable from Render.
5. Confirm webhook endpoint is reachable over HTTPS.
6. Turn on real Razorpay only after webhook verification succeeds.
7. Turn on real notifications only after template delivery succeeds.
8. Keep `USE_MOCK_POS=true` for the first pilot unless UrbanPiper is fully ready.
9. Remove transient test queue/order/payment records.

## First On-Site Pilot Mode

Run the first restaurant session in assisted mode:

- one operator from your side present
- one manager trained
- one host trained
- one controlled service window

Manual fallback remains acceptable for:

- table operations
- POS re-entry
- final settlement if required

## Immediate Follow-On Work After Deployment

After the first stable deployment exists:

1. Add minimum viable production RLS policies.
2. Add a cleanup script or SQL for transient test data.
3. Add a pilot operator checklist for service-time usage.
4. Only then move on to true integration hardening and multi-venue readiness.
