# Render Smoke Release Sheet

Last updated: 2026-03-07

Use this for the **first hosted Render deployment** only.

Goal:
- verify the combined Express app boots on Render
- verify health, guest, staff, and admin routes load
- keep all external integrations mocked

## Render Service Settings

- Runtime: `Node`
- Build command: `npm install && npm run build`
- Start command: `npm run start`
- Health check path: `/api/v1/health`
- Auto deploy: `false`

## Environment Variables

Set these values in the Render dashboard for the smoke release.

### Core

- `NODE_ENV=production`
- `PORT=10000`
- `API_VERSION=v1`
- `APP_ALLOWED_ORIGINS=https://<your-render-service>.onrender.com`
- `RATE_LIMIT_STRATEGY_VERSION=2`
- `RATE_LIMIT_OPERATOR_READ_MAX=800`
- `RATE_LIMIT_OPERATOR_WRITE_MAX=240`
- `RATE_LIMIT_GUEST_POLL_MAX=1500`
- `RATE_LIMIT_OTP_SEND_MAX=8`
- `RATE_LIMIT_OTP_VERIFY_MAX=12`

### Database

- `DATABASE_URL=<Supabase session pooler URI>`

### Auth

- `JWT_SECRET=<strong-random-secret>`
- `JWT_EXPIRES_IN=7d`
- `OTP_EXPIRES_SECONDS=300`

### Redis

- `REDIS_URL=`

Leave this blank for the smoke release if Upstash is not ready.
The app now skips Redis cleanly and runs in degraded mode.

### Payments

- `RAZORPAY_KEY_ID=rzp_test_placeholder`
- `RAZORPAY_KEY_SECRET=placeholder`
- `RAZORPAY_WEBHOOK_SECRET=placeholder`
- `RAZORPAY_ACCOUNT_NUMBER=placeholder`

### Notifications

- `GUPSHUP_API_KEY=placeholder`
- `GUPSHUP_APP_NAME=FlockApp`
- `GUPSHUP_SOURCE_NUMBER=placeholder`
- `MSG91_AUTH_KEY=placeholder`
- `MSG91_SENDER_ID=FLOCK`
- `MSG91_TEMPLATE_ID_OTP=placeholder`
- `MSG91_TEMPLATE_ID_QUEUE=placeholder`
- `MSG91_TEMPLATE_ID_TABLE_READY=placeholder`

### GST / POS

- `CLEARTAX_API_KEY=placeholder`
- `CLEARTAX_BASE_URL=https://api.cleartax.in/v1`
- `URBANPIPER_USERNAME=placeholder`
- `URBANPIPER_API_KEY=placeholder`
- `URBANPIPER_BASE_URL=https://api.urbanpiper.com/v1`

### Feature Flags

- `USE_MOCK_PAYMENTS=true`
- `USE_MOCK_NOTIFICATIONS=true`
- `USE_MOCK_GST=true`
- `USE_MOCK_POS=true`

### TMS

- `TMS_POLL_INTERVAL_MS=180000`
- `TABLE_READY_WINDOW_MINUTES=10`

## Smoke Validation Checklist

After deploy succeeds:

1. Open `https://<host>/api/v1/health`
   - expect: JSON status `ok` or `degraded` with `db: "ok"`
   - expect: `rateLimitStrategyVersion: 2`
2. Open `https://<host>/v/the-barrel-room-koramangala`
   - expect: guest landing loads
3. Open `https://<host>/staff/login`
   - expect: staff login loads
4. Open `https://<host>/admin/login`
   - expect: admin login loads
5. Join one guest queue entry
   - expect: queue entry created
6. Log into staff
   - expect: dashboard loads
7. Log into admin
   - expect: menu view loads

## Exit Criteria

The smoke release is good if:

- the service boots
- the health check passes
- guest, staff, and admin routes render
- one mock guest journey works
- no Render boot/runtime error appears in logs

Only after that should you move to the real integration cutover release.
