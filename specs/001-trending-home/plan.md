# Implementation Plan: Trending on Home

**Branch**: `001-trending-home` | **Date**: 2026-06-17 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-trending-home/spec.md`

## Summary

Surface currently-trending movies, TV shows, and people from TMDB as a new
section on the home screen, for both signed-in and signed-out users. The data
is served from a **cache-backed, user-agnostic "trending snapshot"** exposed by
a dedicated public `GET /api/trending` endpoint, with per-request `isTracked`
overlay for titles. A scheduled `sync-trending` job refreshes the snapshot daily
(configurable) so the section stays fresh without hitting TMDB on every load. The
endpoint and section **fail soft**: on cache miss + upstream error, empty groups
are returned and the section is hidden, never blocking the rest of home.

No database schema change is required — the snapshot lives in the existing cache
abstraction (MemoryCache on Bun, Cloudflare KV on Workers), which sidesteps
migration-safety risk entirely.

## Technical Context

**Language/Version**: TypeScript (strict mode), Bun runtime + Cloudflare Workers

**Primary Dependencies**: Hono (server), Drizzle ORM (read-only here), TMDB API,
React 19 + Vite + Tailwind 4 + shadcn/ui + TanStack Query (frontend)

**Storage**: No new persistence. Trending snapshot stored via the cache
abstraction (`server/cache/` — MemoryCache / RedisCache / CloudflareKvCache).
Existing `tracked` table is read for `isTracked` overlay.

**Testing**: `bun:test` with in-memory SQLite (`setupTestDb`/`teardownTestDb`),
`@testing-library/react` + happy-dom for frontend. TMDB mocked via `spyOn` with
`afterEach` restore.

**Target Platform**: Bun server (Docker) AND Cloudflare Workers (D1 + KV) — dual
runtime parity required.

**Project Type**: Web application (frontend + server in one repo).

**Performance Goals**: Trending section visible (content or placeholder) within
2s of home appearing (SC-002); cached reads serve in well under that.

**Constraints**: Must respect TMDB rate limits (no per-load fan-out); fail soft
so 100% of home loads render even when TMDB is down (SC-003); content no older
than the freshness window — default daily refresh (SC-004).

**Scale/Scope**: ~10 trending items per type (movie/TV/person) per snapshot;
single default region/language; one new endpoint, one new job, one home section.

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design._

| Principle                                       | Status  | Notes                                                                                                                                                                                                                                                                                                                                               |
| ----------------------------------------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| I. Test-Driven Quality (NON-NEGOTIABLE)         | ✅ PASS | Colocated tests planned: `trending.test.ts` (route, validation + happy path + isTracked + fail-soft), TMDB client fetch tests, `sync-trending` job test, frontend section component test. All TMDB HTTP mocked with `afterEach` restore.                                                                                                            |
| II. Dual-Runtime Parity (Bun + CF)              | ✅ PASS | Route registered in BOTH `server/index.ts` and `server/worker.ts` with `optionalAuth`. Job handler via shared `registerHandler`; cron scheduled in `server/jobs/sync.ts` (`registerCron`, Bun) AND added to `CRON_JOBS` in `server/jobs/backend.ts` (CF). Cache via `getCache()` abstraction — no Bun-specific APIs. Config via `server/config.ts`. |
| III. Database Migration Safety (NON-NEGOTIABLE) | ✅ PASS | **No schema change.** Snapshot is a cache entry; `tracked`/`titles` read-only. `migrations.test.ts` unaffected.                                                                                                                                                                                                                                     |
| IV. Type Safety & Lint Discipline               | ✅ PASS | Typed TMDB person/trending responses in `server/tmdb/types.ts`; zod `zValidator` on query; no `any` in source; frontend ESLint clean.                                                                                                                                                                                                               |
| V. Observability & Structured Logging           | ✅ PASS | `logger.child({ module: "trending" })` in route + job; `trendingCacheTotal{result}` Prometheus counter (hit/miss) mirroring `browseCacheTotal`; job logs counts; upstream failures `log.warn` + `syncFailureTotal{source:"tmdb"}`.                                                                                                                  |

**Result**: No violations. Complexity Tracking not required.

## Project Structure

### Documentation (this feature)

```text
specs/001-trending-home/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/
│   └── trending-api.md  # GET /api/trending contract
└── tasks.md             # Phase 2 output (/speckit-tasks — NOT created here)
```

### Source Code (repository root)

```text
server/
├── tmdb/
│   ├── client.ts            # + fetchTrendingMovies / fetchTrendingTv / fetchTrendingPeople
│   ├── client.test.ts       # + trending fetch tests (mocked HTTP)
│   ├── types.ts             # + TmdbTrendingPersonResult / response types
│   └── parser.ts            # + parseTrendingPerson (reuse parseDiscoverMovie/Tv)
├── routes/
│   ├── trending.ts          # NEW — GET /api/trending (snapshot build + cache + isTracked)
│   └── trending.test.ts     # NEW — validation + happy path + isTracked + fail-soft
├── jobs/
│   ├── sync.ts              # + registerHandler("sync-trending") + registerCron
│   ├── sync.test.ts         # + sync-trending warms cache
│   └── backend.ts           # + { name: "sync-trending", cron } in CRON_JOBS (CF parity)
├── config.ts               # + CACHE_TTL_TRENDING, SYNC_TRENDING_CRON, TRENDING_TIME_WINDOW
├── index.ts                # + register /api/trending (optionalAuth) — Bun
├── worker.ts               # + register /api/trending (optionalAuth) — CF parity
└── metrics/                # + trendingCacheTotal counter

frontend/
├── src/
│   ├── api.ts                       # + getTrending(signal) fetcher
│   ├── types.ts                     # + "trending" in HomepageSectionId + DEFAULT layout; TrendingSnapshot types
│   ├── components/
│   │   ├── TrendingSection.tsx      # NEW — renders movie/TV/person rows (FullBleedCarousel + MediaCard/PersonCard)
│   │   └── TrendingSection.test.tsx # NEW — renders rows, hides empty groups, person/title links, placeholders
│   └── pages/
│       ├── HomePage.tsx             # + render TrendingSection in anon + auth paths; ["trending"] query
│       └── HomePage.test.tsx        # + trending section appears; fail-soft (absent on error)
```

**Structure Decision**: Web application layout — existing `server/` (Hono, dual
entry points) and `frontend/` (React). The feature adds one server route, TMDB
client functions, one scheduled job, and one frontend section component plus the
home-layout wiring. No new top-level directories.

## Architecture Decisions (summary; see research.md)

1. **Dedicated `/api/trending` endpoint, not a new `browse` category.** `browse`
   does an expensive per-title detail fan-out (watch-provider deep links) and
   handles only movies/TV. Trending needs a lightweight poster+title row plus
   people, served from a single cached snapshot — a different altitude.
2. **Snapshot = cache entry, not a DB table.** The spec's "Trending Snapshot"
   maps to a `getCache()` value with a TTL. This satisfies FR-010 caching and
   avoids any migration (Constitution III) entirely.
3. **User-agnostic payload + per-request `isTracked` overlay** — the exact proven
   pattern from `browse.ts:223-231` / `:379-385`. People carry no tracked state.
4. **Lazy cache + scheduled warm.** The endpoint populates the cache on miss
   (daily TTL); `sync-trending` proactively refreshes it on a cron so the first
   post-expiry visitor doesn't pay TMDB latency (SC-002).
5. **Fail soft.** Cache miss + TMDB error → return `{ movies: [], shows: [], people: [] }`; the section renders nothing rather than erroring (FR-008, SC-003).

## Complexity Tracking

No constitution violations — section intentionally empty.
