# Flock Backend API

Restaurant queue and pre-order platform for the Indian F&B market.

## Stack
- **Runtime**: Node.js 20 + TypeScript
- **Framework**: Express 4
- **Database**: PostgreSQL via Prisma ORM
- **Cache / Pub-Sub**: Redis (Upstash-compatible)
- **Payments**: Razorpay (UPI, cards)
- **Notifications**: Gupshup (WhatsApp) + MSG91 (SMS)
- **GST**: ClearTax API
- **POS**: UrbanPiper middleware

---

## Quick start

### 1. Prerequisites
- Node.js ≥ 20
- PostgreSQL (local or Supabase)
- Redis (local or Upstash)

### 2. Install
```bash
npm install
```

### 3. Configure
```bash
cp .env.example .env
# Edit .env — at minimum set DATABASE_URL, REDIS_URL, JWT_SECRET
```

### 3b. MCP setup for Codex / Cursor
```bash
npm run mcp:setup
codex mcp login supabase
```

This repo bootstraps:

- Render MCP via local `RENDER_API_KEY`
- Supabase MCP via project ref `dcoixzkyrvfzytelvael`

The bootstrap syncs:

- `.cursor/mcp.json`
- `~/.codex/config.toml`

Local secret source:

- `.codex/mcp.secrets.env`

### 4. Database
```bash
npm run db:generate   # generate Prisma client
npm run db:migrate    # run migrations
npm run db:seed       # seed demo venue, staff, menu
```

### 5. Run dev server
```bash
npm run dev
# API available at http://localhost:3000/api/v1
```

---

## Feature flags (all default to `true` in dev)

| Flag | Default | Effect |
|------|---------|--------|
| `USE_MOCK_PAYMENTS` | `true` | Razorpay orders return fake IDs, no real money |
| `USE_MOCK_NOTIFICATIONS` | `true` | WhatsApp/SMS logged to console only |
| `USE_MOCK_GST` | `true` | ClearTax returns fake IRN/QR |
| `USE_MOCK_POS` | `true` | UrbanPiper push returns mock ID |

Set all to `false` and add real API keys to go live.

---

## API Reference

### Auth
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/auth/guest/otp/send` | None | Send OTP to guest phone |
| POST | `/auth/staff/otp/send` | None | Send OTP to staff phone |
| POST | `/auth/staff/otp/verify` | None | Verify OTP → returns JWT |

### Venue
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/venues` | None | Create venue (onboarding) |
| GET | `/venues/:slug` | None | Get venue + menu for guest view |
| PATCH | `/venues/config` | Staff (Owner/Manager) | Update config (deposit %, queue open, TMS) |
| GET | `/venues/stats/today` | Staff | Today's queue, payment, cover stats |

### Queue
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/queue` | None | Guest joins queue |
| GET | `/queue/live` | Staff | Live queue for the venue |
| GET | `/queue/:entryId` | None | Guest polls own entry |
| POST | `/queue/seat` | Staff | Verify OTP → seat guest |
| DELETE | `/queue/:entryId` | Staff | Remove from queue |

### Tables
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/tables` | Staff | All tables + status |
| POST | `/tables` | Manager | Create table |
| PATCH | `/tables/:tableId/status` | Staff | Update table status (manual floor) |
| GET | `/tables/:tableId/events` | Staff | Status history for table |

### Menu
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/menu/:venueId` | None | Guest menu view |
| POST | `/menu/categories` | Manager | Add category |
| POST | `/menu/items` | Manager | Add item |
| PATCH | `/menu/items/:itemId` | Manager | Edit item |
| PATCH | `/menu/items/:itemId/toggle` | Staff | Toggle availability |
| DELETE | `/menu/items/:itemId` | Manager | Delete item |

### Orders
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/orders/preorder` | None (guest) | Create pre-order (before seating) |
| POST | `/orders/table` | Staff | Create table order (after seating) |
| GET | `/orders/bill/:queueEntryId` | None | Guest's full bill + deposit deduction |

### Payments
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/payments/deposit/initiate` | None | Create Razorpay order for deposit |
| POST | `/payments/deposit/capture` | None | Confirm deposit after Razorpay success |
| POST | `/payments/final/initiate` | None | Create Razorpay order for balance |
| POST | `/payments/final/capture` | None | Confirm final payment → triggers checkout |
| POST | `/payments/refund` | Manager | Refund deposit to guest |
| POST | `/payments/webhook/razorpay` | None (sig verified) | Razorpay event webhook |

---

## Data flow — pre-order deposit

```
Guest joins queue  →  POST /queue
Guest browses menu →  GET  /menu/:venueId
Guest adds items   →  POST /orders/preorder  →  Order created (CONFIRMED)
Guest pays         →  POST /payments/deposit/initiate  →  Razorpay order created
                   →  [Razorpay UPI sheet on frontend]
                   →  POST /payments/deposit/capture   →  Payment captured
                                                        →  QueueEntry.depositPaid updated
                                                        →  WhatsApp confirmation sent
Staff seats guest  →  POST /queue/seat  (OTP verified)  →  QueueEntry SEATED
                                                         →  Pre-order pushed to POS/KDS
Guest orders more  →  POST /orders/table
Guest pays bill    →  GET  /orders/bill/:entryId  →  Shows deposit deducted
                   →  POST /payments/final/initiate
                   →  POST /payments/final/capture  →  QueueEntry COMPLETED
                                                     →  Table → CLEARING → FREE
                                                     →  Queue auto-advances
                                                     →  GST invoice generated
```

---

## Architecture decisions

| Decision | Choice | Why |
|----------|--------|-----|
| ORM | Prisma | Type-safe queries, migration management, Indian Postgres hosting (Supabase) works perfectly |
| Queue state | Redis + Postgres | Redis for sub-100ms reads of live queue; Postgres for durability and history |
| Integration layer | Adapter pattern | Every venue has different POS/TMS. Never couple business logic to a vendor API directly. |
| GST | ClearTax | Handles all licence-type logic, IRN generation, GSTIN validation. Don't roll your own. |
| Auth | JWT + OTP only | No passwords. Phone number is identity. Matches Indian consumer behaviour. |
| POS middleware | UrbanPiper | One integration covers 80% of Indian POS market. Direct integrations (POSist, Petpooja) added later per enterprise contract. |

---

## Folder structure

```
src/
  config/          env.ts, database.ts, redis.ts, logger.ts
  controllers/     thin HTTP handlers — parse, call service, return
  integrations/    razorpay.ts, notifications.ts, cleartax.ts, urbanpiper.ts
  middleware/      auth.ts, errorHandler.ts, validate.ts
  routes/          one file per domain
  services/        all business logic — auth, queue, order, payment, table, venue
  types/           shared TypeScript interfaces
  utils/           gst.ts, otp.ts, txnRef.ts, jwt.ts, response.ts
  workers/         tmsPoller.ts — runs every 4s, syncs table state
  server.ts        bootstrap: DB + Redis connect, start poller, listen
  app.ts           Express setup: middleware, routes, error handlers
prisma/
  schema.prisma    full data model
  seed.ts          demo venue + staff + menu
```

---

## Production checklist

- [ ] Set `USE_MOCK_*` flags to `false`
- [ ] Add real Razorpay keys (test → live)
- [ ] Register TRAI DLT for MSG91 SMS
- [ ] Get Gupshup WhatsApp BSP approval + pre-approved message templates
- [ ] Configure ClearTax account + GSTIN per venue
- [ ] Set up UrbanPiper partnership for POS integration
- [ ] Deploy Postgres on Supabase (ap-south-1 equivalent) or AWS Mumbai RDS
- [ ] Deploy Redis on Upstash (Mumbai region)
- [ ] Set strong `JWT_SECRET` (32+ chars, random)
- [ ] Add `RAZORPAY_WEBHOOK_SECRET` and point Razorpay dashboard to `/payments/webhook/razorpay`
- [ ] Set up Cloudflare in front of the API (DDoS, WAF, caching)

## Current deployment and migration notes

Validated on 2026-03-09:

- Live Render service: `https://taurant.onrender.com`
- Render MCP is active and reachable
- Supabase MCP is active and reachable
- `OrderFlowEvent` table exists in production data
- `QueueEntry.displayRef` exists and new queue joins populate it
- Security hardening migration `harden_party_session_and_flow_rls` was applied to enable RLS on:
  - `PartySession`
  - `PartyParticipant`
  - `PartyBucketItem`
  - `OrderFlowEvent`

Residual DB lint state after hardening:

- security advisor: clean
- performance advisor: INFO-only findings remain for unindexed foreign keys and unused indexes

---

## Pilot deployment

Use a persistent Node host for the first pilot. The current codebase is better suited to Render/Railway/App Runner than a Vercel-only deployment because it runs as a long-lived Express service and includes a background poller.

Deployment artifacts:

- [render.yaml](/Users/adsaha/Desktop/Pricing%20Engine/C/Flock/render.yaml)
- [docs/PILOT_DEPLOYMENT_RUNBOOK.md](/Users/adsaha/Desktop/Pricing%20Engine/C/Flock/docs/PILOT_DEPLOYMENT_RUNBOOK.md)

Recommended first public guest URL shape:

- `https://<host>/v/the-barrel-room-koramangala`

Recommended staff URL shape:

- `https://<host>/staff/login`
