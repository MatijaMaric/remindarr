# Phase 0 Research: Trending on Home

All Technical Context items were resolvable from the existing codebase and the
constitution — no open `NEEDS CLARIFICATION` remained. This document records the
decisions and the alternatives weighed.

## D1: Data source & endpoints

- **Decision**: Use TMDB's `/trending/{movie,tv,person}/{time_window}` endpoints
  via new functions in `server/tmdb/client.ts` (`fetchTrendingMovies`,
  `fetchTrendingTv`, `fetchTrendingPeople`), defaulting to the `week` window.
- **Rationale**: Spec Assumption pins the source to the existing TMDB integration
  and a weekly window default. The client already exposes `fetchPopularMovies`,
  `discoverMovies`, etc., and a `tmdbRequest` helper with `tmdbLanguage()` — the
  trending calls follow the identical shape.
- **Alternatives considered**: Reusing `discoverMovies({ sortBy: "popularity.desc" })`
  (what `browse` "popular" does) — rejected because TMDB "popular" ≠ "trending"
  and it cannot return people.

## D2: Endpoint shape — new route vs. extend `browse`

- **Decision**: A dedicated public `GET /api/trending` returning three groups
  (`movies`, `shows`, `people`) in one payload.
- **Rationale**: `browse.ts` performs a 5-concurrent per-title detail fan-out to
  attach watch-provider deep links (`browse.ts:310-349`) — heavy and irrelevant
  to a discovery row — and has no concept of people. A separate endpoint keeps
  trending lightweight, single-round-trip, and people-capable.
- **Alternatives considered**: Add `category=trending` to `browseQuerySchema`
  — rejected (inherits the fan-out cost and still can't do people; would force
  two endpoints anyway).

## D3: Caching / the "Trending Snapshot" entity

- **Decision**: Store the user-agnostic snapshot as a single cache entry via
  `getCache()` (key e.g. `trending:v1:<lang>:<window>`), TTL = `CACHE_TTL_TRENDING`
  (default 86400s / 1 day). Apply `isTracked` to titles per request after the
  cache read.
- **Rationale**: Mirrors the proven `browse` cache pattern
  (`browse.ts:195-232, 372-385`) and the `Cache` interface in `server/cache/`.
  The cache abstraction already has Bun (memory/redis) and CF (KV) backends, so
  this is dual-runtime-safe and needs no schema/migration (Constitution III).
- **Alternatives considered**: A `trending_snapshot` DB table — rejected: adds a
  migration and a write path for data that is inherently ephemeral and already
  has a caching home. KV/memory persistence matches the freshness model better.

## D4: Freshness — lazy TTL vs. scheduled job

- **Decision**: Both. Endpoint lazily builds + caches on miss; a `sync-trending`
  cron job proactively refreshes the cache on the freshness cadence.
- **Rationale**: Lazy TTL alone makes the first visitor after expiry pay full
  TMDB latency, risking SC-002 (2s). A warm job keeps the entry fresh. FR-010
  explicitly requires scheduled refresh.
- **Dual-runtime cron**: Bun schedules via `registerCron("sync-trending", CONFIG.SYNC_TRENDING_CRON)`
  in `server/jobs/sync.ts`; CF requires the same name added to the `CRON_JOBS`
  single-source-of-truth array in `server/jobs/backend.ts`. The handler is
  registered once via `registerHandler` (shared by both runtimes).
- **Default cadence**: `0 5 * * *` (daily). Tunable via `SYNC_TRENDING_CRON`.

## D5: `isTracked` derivation

- **Decision**: For signed-in users, fetch `getTrackedTitleIds(user.id)` and set
  `isTracked` per title; people never carry tracked state.
- **Rationale**: Identical to `browse.ts:223-231`. Title IDs use the existing
  `movie-<tmdbId>` / `tv-<tmdbId>` convention so they match the `tracked` table
  and link to `/title/:id`.
- **Anonymous**: `isTracked` is always `false`; response is fully cacheable at the
  edge via `setPublicCacheIfAnon` (FR-011).

## D6: Fail-soft behavior

- **Decision**: On cache miss where the TMDB build throws, log a warning, bump
  `syncFailureTotal{source:"tmdb"}`, and return `{ movies: [], shows: [], people: [] }`
  with HTTP 200. Frontend hides any empty group and the whole section when all
  three are empty.
- **Rationale**: FR-008 / SC-003 require the rest of home to render and forbid a
  page-blocking error. Returning 200-with-empty (not 5xx) keeps the frontend
  query simple and the section gracefully absent.
- **Stale-during-outage**: Because the refresh job only overwrites the cache on a
  successful fetch, a previously cached snapshot survives a transient TMDB outage
  and continues to serve (edge case "Stale cache during outage").

## D7: Frontend placement & home-layout integration

- **Decision**: Add `"trending"` to `HomepageSectionId` and to
  `DEFAULT_HOMEPAGE_LAYOUT` (enabled, placed near the top). Render a new
  `TrendingSection` component in both the authenticated `renderSection` switch
  and the anonymous home path.
- **Rationale**: The home screen already has a customizable, per-user toggleable
  section system (`types.ts:808-836`, `HomePage.tsx renderSection`). Adding a
  section id makes trending individually toggleable for signed-in users (resolves
  the spec's open "toggleable?" design detail) while anonymous users — who have no
  layout settings — get it unconditionally, consistent with how they already see
  "Popular".
- **Reuse**: `FullBleedCarousel` for horizontal browsability (FR-007/SC-006),
  `MediaCard` for titles (gradient placeholder when `imageUrl` null — FR-003),
  `PersonCard` for people (FR-004 visual distinction + placeholder), `posterUrl()`
  for image URLs. Data fetched with a TanStack Query `["trending"]` key shared by
  both paths.

## D8: Region / language

- **Decision**: Single default region/language via existing `tmdbLanguage()`; no
  per-user personalization (spec Assumption, out of scope v1). Included in the
  cache key so a future multi-language config doesn't collide.

## Outstanding

None. All Phase 0 unknowns resolved; design proceeds to Phase 1.
