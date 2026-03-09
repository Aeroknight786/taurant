# Flock — Agent Instructions

## Cursor Cloud specific instructions

### Overview

Flock is a Node.js/TypeScript Express backend serving both an API (`/api/v1/*`) and a static web frontend (`web/`). It uses Prisma ORM with PostgreSQL. All external integrations (Razorpay, Gupshup, MSG91, ClearTax, UrbanPiper) default to mock mode in development — no real API keys needed.

### Key commands

See `README.md` for full quick-start. Summary of `package.json` scripts:

| Task | Command |
|------|---------|
| Dev server | `npm run dev` (port 3000) |
| Build | `npm run build` |
| Type check (lint) | `npx tsc --noEmit` |
| MCP bootstrap | `npm run mcp:setup` |
| Prisma generate | `npm run db:generate` |
| Prisma migrate | `npm run db:migrate` |
| Seed database | `npm run db:seed` |
| Visual regression tests | `FLOCK_TEST_URL=http://localhost:3000 npx playwright test` |

No ESLint is configured; `tsc --noEmit` is the lint check.

### Non-obvious gotchas

- **Supabase roles required locally**: Prisma migrations reference PostgreSQL roles `anon` and `authenticated` (from Supabase RLS policies). Before running `npm run db:migrate` on a local PostgreSQL instance, create them:
  ```sql
  CREATE ROLE anon NOLOGIN;
  CREATE ROLE authenticated NOLOGIN;
  GRANT USAGE ON SCHEMA public TO anon, authenticated;
  ```

- **Redis is optional**: If `REDIS_URL` is blank/unset, the server starts in degraded mode with a no-op Redis stub. Health endpoint reports `"redis": "degraded"` but all features work.

- **Mock OTP in API**: Set `EXPOSE_MOCK_OTP_IN_API=true` in `.env` so that `POST /auth/*/otp/send` responses include a `mockOtp` field — needed for automated testing and Playwright tests.

- **Staff OTP endpoints require `venueId`**: Both `/auth/staff/otp/send` and `/auth/staff/otp/verify` require a `venueId` field in the request body alongside `phone` and `code`.

- **Playwright tests**: Default `FLOCK_TEST_URL` points to a remote Render deploy. Override with `FLOCK_TEST_URL=http://localhost:3000` to test locally. First run with `--update-snapshots` to generate baseline screenshots.

- **Seeded test data**: After `npm run db:seed`, the venue slug is `the-barrel-room-koramangala` and the staff manager phone for testing is `9000000002`.

### MCP servers

Two MCP servers are configured for this project:

- Repo-local bootstrap source:
  - `.codex/mcp.secrets.env`
  - `scripts/setup-mcp.sh`
- Repo-local consumer config:
  - `.cursor/mcp.json`
- Machine-level Codex config:
  - `~/.codex/config.toml`

Bootstrap/re-sync command:

```bash
npm run mcp:setup
```

Current expected MCP state:

- **Supabase** (hosted at `https://mcp.supabase.com/mcp`): Remote URL-based, scoped to project `dcoixzkyrvfzytelvael`. Provides tools for database queries, migrations, and type generation. Uses Supabase's built-in OAuth — no API key secret needed.
- Supabase login command for Codex:
  ```bash
  codex mcp login supabase
  ```

- **Render** (via `mcp-remote` bridge to `https://mcp.render.com/mcp`): Uses `sh -c` to expand `$RENDER_API_KEY` from the environment before passing it as an Authorization header. Provides tools for managing Render services, deployments, logs, and databases. Requires user to add `RENDER_API_KEY` (a Render API key from dashboard.render.com/settings#api-keys) as a Cursor secret.

Validated on 2026-03-09:

- Render MCP reachable and bound to workspace `tea-d6imr3hr0fns73be3ft0`
- Supabase MCP reachable and authenticated for project `dcoixzkyrvfzytelvael`
- Latest schema hardening migration applied through MCP:
  - `harden_party_session_and_flow_rls`
