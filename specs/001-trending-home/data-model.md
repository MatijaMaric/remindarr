# Phase 1 Data Model: Trending on Home

**No database schema changes.** All entities below are in-memory / cache / API
shapes. The `titles` and `tracked` tables are read-only inputs; nothing is
written by this feature (existing background syncs continue to own `titles`).

## Entity: TrendingTitle

A movie or TV show currently trending per TMDB.

| Field         | Type                | Notes                                                                                |
| ------------- | ------------------- | ------------------------------------------------------------------------------------ |
| `id`          | `string`            | `movie-<tmdbId>` or `tv-<tmdbId>` — links to `/title/:id`, matches `tracked.titleId` |
| `objectType`  | `"MOVIE" \| "SHOW"` | Drives badge + which TMDB endpoint produced it                                       |
| `title`       | `string`            | Display title                                                                        |
| `posterUrl`   | `string \| null`    | TMDB poster path; `null` → placeholder (FR-003)                                      |
| `releaseDate` | `string \| null`    | Optional, for subtitle/meta                                                          |
| `isTracked`   | `boolean`           | Overlaid per request from `getTrackedTitleIds`; `false` for anon (FR-012)            |

- **Source/derivation**: `parseDiscoverMovie` / `parseDiscoverTv` over TMDB
  trending results (reused from `server/tmdb/parser.ts`). The user-agnostic cached
  form omits `isTracked`; it is added after the cache read.
- **Validation rules**: FR-014 — the section MUST NOT show the same item twice;
  de-duplicate by `id` when assembling each group.

## Entity: TrendingPerson

An actor or creator currently trending per TMDB. Not trackable (spec Assumption).

| Field                | Type             | Notes                                                      |
| -------------------- | ---------------- | ---------------------------------------------------------- |
| `id`                 | `number`         | TMDB person id — links to `/person/:id` (FR-006)           |
| `name`               | `string`         | Display name (FR-004)                                      |
| `profileUrl`         | `string \| null` | TMDB profile path; `null` → placeholder (FR-004 edge case) |
| `knownForDepartment` | `string \| null` | Optional, for subtitle                                     |

- **Source/derivation**: `parseTrendingPerson` over TMDB `/trending/person/week`
  results (new lightweight parser; no DB persistence, no detail fan-out).
- **Validation rules**: de-duplicate by `id`; omit the people group entirely when
  empty rather than rendering an empty labeled group (FR-013).

## Entity: TrendingSnapshot

The cached, user-agnostic collection serving the section quickly (FR-010).

| Field         | Type                               | Notes                                         |
| ------------- | ---------------------------------- | --------------------------------------------- |
| `movies`      | `TrendingTitle[]` (no `isTracked`) | May be empty                                  |
| `shows`       | `TrendingTitle[]` (no `isTracked`) | May be empty                                  |
| `people`      | `TrendingPerson[]`                 | May be empty                                  |
| `refreshedAt` | `string` (ISO)                     | When the snapshot was built; bounds staleness |

- **Storage**: single cache entry via `getCache()`; key
  `trending:v1:<tmdbLanguage()>:<timeWindow>`; TTL `CACHE_TTL_TRENDING` (default
  86400s). Written by the endpoint (lazy, on miss) and by the `sync-trending` job
  (proactive). Only overwritten on a successful TMDB build → survives outages.

## API response shape (per request)

The endpoint returns the snapshot with `isTracked` overlaid onto title groups:

```jsonc
{
  "movies": [
    {
      "id": "movie-123",
      "objectType": "MOVIE",
      "title": "...",
      "posterUrl": "/x.jpg",
      "releaseDate": "2026-01-01",
      "isTracked": false,
    },
  ],
  "shows": [
    {
      "id": "tv-456",
      "objectType": "SHOW",
      "title": "...",
      "posterUrl": null,
      "releaseDate": null,
      "isTracked": true,
    },
  ],
  "people": [
    {
      "id": 789,
      "name": "...",
      "profileUrl": "/p.jpg",
      "knownForDepartment": "Acting",
    },
  ],
  "refreshedAt": "2026-06-17T05:00:00.000Z",
}
```

On total upstream failure with a cold cache, all three arrays are empty and the
section is hidden client-side (fail-soft, FR-008).

## Frontend type additions (`frontend/src/types.ts`)

- `TrendingTitle`, `TrendingPerson`, `TrendingSnapshot` interfaces mirroring the
  response above (snake/camel handled per the existing `normalizeSearchTitle`
  convention if needed).
- `HomepageSectionId` gains `"trending"`; `DEFAULT_HOMEPAGE_LAYOUT` gains
  `{ id: "trending", enabled: true }` near the top.

## State transitions

The snapshot has no per-record lifecycle. Its only "state" is fresh vs. expired,
governed by the cache TTL and the refresh job. There are no user-mutable states
introduced by this feature.
