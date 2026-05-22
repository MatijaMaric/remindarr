# Server guidance

See also: `server/db/CLAUDE.md` (migration safety), `server/routes/CLAUDE.md` (route validation + API catalog), `server/notifications/CLAUDE.md` (provider pattern).

## Stack

- **Runtime**: Bun (primary) or Cloudflare Workers — same codebase, different entry points
- **Framework**: Hono + TypeScript strict mode
- **Database**: SQLite via Drizzle ORM (WAL mode under Bun; Cloudflare D1 on Workers)
- **Auth**: better-auth (username + admin + passkey + generic OAuth/OIDC plugins)
- **Cache**: in-memory, Redis, or Cloudflare KV (selected by `CACHE_BACKEND`)
- **Observability**: Sentry (optional), Prometheus metrics at `/metrics`, structured JSON logging

## Entry points

| File               | Purpose                                                                           |
| ------------------ | --------------------------------------------------------------------------------- |
| `server/index.ts`  | Bun entry — Hono app setup, serves static frontend in prod                        |
| `server/worker.ts` | CF Workers entry — patches CONFIG from env bindings; excludes Bun-only job worker |
| `server/config.ts` | All configuration from env vars with defaults; `patchConfig()` for CF runtime     |

**Critical invariant**: every route registered in `server/index.ts` must also be registered in `server/worker.ts`. They must stay in sync — the CF worker must expose every API that the Bun server does.

## Directory map

```
server/
  auth/         better-auth instance factory
  cache/        memory / redis / cloudflare-kv backends
  db/           schema, migrations, repositories — see server/db/CLAUDE.md
  imdb/         IMDB URL resolution via autocomplete API
  jobs/         in-memory queue + cron scheduler (Bun); DO alarms (CF)
  lib/          shared utilities (validator.ts, etc.)
  middleware/   auth, rate-limit
  metrics/      Prometheus counters/histograms/gauges
  notifications/ providers + content builder — see server/notifications/CLAUDE.md
  platform/     Bun vs CF platform abstraction (password hashing, DB handle)
  plex/         library sync, account linking, metadata enrichment
  routes/       one file per domain — see server/routes/CLAUDE.md
  streaming-availability/ deep-link enrichment via external API
  tmdb/         TMDB API client, parser, sync
  test-utils/   setupTestDb, teardownTestDb, fixtures, auth helpers
```

## Logging rules

**All server-side code MUST use the structured logger from `server/logger.ts`. Never use `console.log/warn/error` directly.**

```ts
import { logger } from "server/logger.ts";
const log = logger.child({ module: "my-module" });

log.info("message", { key: value }); // structured, second arg is context
log.debug("sync started", { titleId });
log.error("request failed", { error: err.message });
```

- Log level: `LOG_LEVEL` env var (debug, info, warn, error), defaults to `"info"`
- Frontend code may continue using `console.error`

## Jobs system

**Bun**: in-memory queue with SQLite persistence + exponential-backoff retry. Polling loop in `server/jobs/worker.ts`. 5-field cron via `cron-parser` in `server/jobs/schedule.ts`.

**Cloudflare**: Durable Object alarms (`@cloudflare/actors/alarms`) for per-job scheduling. A single daily Worker cron acts as bootstrap/recovery tick. Entry: `server/jobs/worker-cf.ts`.

Jobs: TMDB sync (`sync.ts`), notification dispatch (`notifications.ts`), DB backup (`backup.ts`), title migration (`migrate-titles.ts`).

Notification jobs dynamically reschedule based on user timezone preferences.

## Platform abstraction

`server/platform/types.ts` defines the platform interface. Implementations:

- `server/platform/bun.ts` — password hashing via Bun, DB handle
- `server/platform/cloudflare.ts` — CF-specific impl

Use the platform interface, not Bun-specific APIs, in shared code.

## Key patterns (server-wide)

- Rate limiting: token bucket keyed by `x-forwarded-for`. Deployments MUST terminate at a proxy that sets this header.
- Auth middleware is composable: `optionalAuth` → `requireAuth` → `requireAdmin` (all in `server/middleware/auth.ts`)
- OIDC settings have env-var precedence over DB (admin UI editable but env overrides)
- All DB writes use transactions for consistency
- Recommendations are 1-to-N broadcast (to followers), not 1-to-1
