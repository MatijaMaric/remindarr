# Contract: `GET /api/trending`

Public, optional-auth endpoint that returns the current trending snapshot
(movies, TV shows, people) for the home screen.

## Registration (dual-runtime — both required)

- **Bun**: `server/index.ts` — `app.use("/api/trending", optionalAuth)` +
  `app.use("/api/trending/*", optionalAuth)` then `app.route("/api/trending", trendingRoutes)`.
- **CF Workers**: `server/worker.ts` — the identical registration block (parity
  invariant; CI/`check-route-sync` enforces this).

Auth tier: **optional auth** (same as `/api/browse`) — signed-out users get the
snapshot with `isTracked: false`; signed-in users get the `isTracked` overlay.

## Request

```
GET /api/trending
```

### Query parameters (validated with `zValidator("query", …)`)

| Param         | Type                         | Default  | Notes                                              |
| ------------- | ---------------------------- | -------- | -------------------------------------------------- |
| `time_window` | `"day" \| "week"` (zod enum) | `"week"` | Optional override of the configured default window |

No body. No path params. Unknown params ignored. Invalid `time_window` → HTTP 400
with `{ error: "Validation failed", issues: ZodIssue[] }` (standard validator).

## Response — 200 OK

```jsonc
{
  "movies": [
    {
      "id": "movie-123",
      "objectType": "MOVIE",
      "title": "Example Movie",
      "posterUrl": "/abc.jpg",
      "releaseDate": "2026-01-01",
      "isTracked": false,
    },
  ],
  "shows": [
    {
      "id": "tv-456",
      "objectType": "SHOW",
      "title": "Example Show",
      "posterUrl": null,
      "releaseDate": null,
      "isTracked": true,
    },
  ],
  "people": [
    {
      "id": 789,
      "name": "Example Person",
      "profileUrl": "/p.jpg",
      "knownForDepartment": "Acting",
    },
  ],
  "refreshedAt": "2026-06-17T05:00:00.000Z",
}
```

### Guarantees

- Any of `movies` / `shows` / `people` MAY be `[]` (empty group omitted by the
  client, FR-013).
- No duplicate `id` within any group (FR-014).
- `posterUrl` / `profileUrl` MAY be `null` (client renders placeholder, FR-003/4).
- `isTracked` present only on title items; `true` only for the requesting
  signed-in user (FR-012). Always `false` for anonymous requests.

### Caching headers

`setPublicCacheIfAnon(c, <CACHE_TTL_TRENDING>)` — anonymous responses are edge-
cacheable; authenticated responses are `private, no-store` (because of the
per-user `isTracked` overlay).

## Fail-soft contract (FR-008, SC-003)

- Upstream TMDB error **with a warm cache** → serve the cached snapshot (stale
  tolerated within the cache lifetime).
- Upstream TMDB error **with a cold cache** → HTTP **200** with
  `{ movies: [], shows: [], people: [], refreshedAt: <now> }`. The endpoint MUST
  NOT return 5xx for upstream trending failures; the home screen must still render.
- A warning is logged (`logger.child({ module: "trending" })`) and
  `syncFailureTotal{source:"tmdb"}` incremented.

## Observability

- `trendingCacheTotal{result="hit"|"miss"}` Prometheus counter (mirrors
  `browseCacheTotal`).
- Structured logs on miss/build and on upstream failure.

## Required tests (`server/routes/trending.test.ts`)

1. **validation** — invalid `time_window` → 400 with `issues` array.
2. **happy path** — default request → 200 with `movies`/`shows`/`people` arrays
   (TMDB mocked); asserts the TMDB trending fetchers were called.
3. **isTracked overlay** — authenticated user tracking a returned title → that
   title's `isTracked === true`; anonymous → all `false`.
4. **cache hit** — second request does not re-call TMDB (counter/spy assertion).
5. **fail-soft** — TMDB fetch rejects + cold cache → 200 with all-empty groups.
6. **dedupe / empty group** — duplicate ids collapsed; empty type returns `[]`.

## Related scheduled job — `sync-trending`

Not an HTTP contract, but part of the feature surface:

- Handler registered via `registerHandler("sync-trending", …)` (shared runtime).
- Bun cron: `registerCron("sync-trending", CONFIG.SYNC_TRENDING_CRON)`.
- CF cron: add `{ name: "sync-trending", cron: <same> }` to `CRON_JOBS` in
  `server/jobs/backend.ts`.
- Behavior: builds the snapshot and writes the cache; no-op (logged) when
  `TMDB_API_KEY` is unset; only overwrites cache on success (preserves stale data
  on failure).
- Test (`server/jobs/sync.test.ts`): running the handler populates the cache;
  unset API key skips without throwing.
