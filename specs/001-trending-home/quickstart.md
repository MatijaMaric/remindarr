# Quickstart & Validation: Trending on Home

Runnable validation for the Trending on Home feature. See
[contracts/trending-api.md](./contracts/trending-api.md) and
[data-model.md](./data-model.md) for shapes; this guide proves the feature works
end-to-end.

## Prerequisites

- `bun install` at repo root and in `frontend/`.
- `TMDB_API_KEY` set in env for live manual checks (tests mock TMDB and need no key).

## 1. Run the automated gate

```bash
bun run check
```

Must pass: server tsc + frontend tsc + ESLint (zero warnings) + all tests +
frontend build + wrangler dry-run. This is the authoritative pre-PR gate.

Focused runs during development:

```bash
bun test server/routes/trending.test.ts   # endpoint: validation, happy path, isTracked, cache, fail-soft
bun test server/tmdb/client.test.ts        # TMDB trending fetchers (mocked HTTP)
bun test server/jobs/sync.test.ts          # sync-trending warms the cache
bun test frontend/src/components/TrendingSection.test.tsx
bun test frontend/src/pages/HomePage.test.tsx
```

## 2. Manual API check (Bun)

```bash
bun run dev:server          # port 3000
curl -s "http://localhost:3000/api/trending" | jq '{movies: (.movies|length), shows: (.shows|length), people: (.people|length), refreshedAt}'
curl -s "http://localhost:3000/api/trending?time_window=day" | jq '.movies[0]'
curl -s "http://localhost:3000/api/trending?time_window=bogus" -o /dev/null -w "%{http_code}\n"   # expect 400
```

Expected: arrays of movies/shows/people (each may be empty); a `400` for the bad
`time_window`. A second call should be served from cache (watch server logs for a
cache-hit / no TMDB call).

## 3. Manual UI check

```bash
bun run dev                 # server + Vite (frontend on :5173)
```

- **Signed out**: open `/` → a labeled "Trending" section shows trending movies,
  shows, and people with posters/photos. Clicking a title → `/title/:id`;
  clicking a person → `/person/:id`. (FR-001, FR-005, FR-006, FR-011)
- **Signed in**: open `/` → same section; a title already on your watchlist shows
  its tracked state (FR-012). Toggle the section off via the home layout settings
  and confirm it disappears (home-layout integration).
- **Mobile viewport** (DevTools narrow): the rows are horizontally scrollable and
  the layout doesn't break (FR-007, SC-006).
- **Missing artwork**: a title/person without an image shows a placeholder, not a
  broken image (FR-003, FR-004).

## 4. Fail-soft validation (FR-008, SC-003)

Simulate the upstream being unavailable:

- Unit: the `fail-soft` test in `trending.test.ts` rejects the TMDB fetch with a
  cold cache and asserts HTTP 200 with all-empty groups.
- Manual: temporarily unset `TMDB_API_KEY` (cold cache) and load `/` → the rest
  of the home screen renders normally and the trending section is gracefully
  absent (no page-blocking error).

## 5. Freshness validation (FR-010, SC-004)

- Trigger the refresh job and confirm the cache is repopulated:
  - Bun: enqueue/await `sync-trending` (see `server/jobs/sync.test.ts` for the
    programmatic path) or wait for the `SYNC_TRENDING_CRON` schedule.
- Confirm `refreshedAt` advances after a refresh and that reads between refreshes
  are served from cache (no per-load TMDB calls).

## Success criteria mapping

| Criterion                                    | Validated by                              |
| -------------------------------------------- | ----------------------------------------- |
| SC-001 section visible on first load         | Step 3 (signed-in) + HomePage test        |
| SC-002 visible within 2s                     | Step 2 cache hit + warm job (step 5)      |
| SC-003 100% render during outage             | Step 4                                    |
| SC-004 freshness ≤ window                    | Step 5                                    |
| SC-005 correct navigation targets            | Step 3 link checks + TrendingSection test |
| SC-006 no layout breakage across breakpoints | Step 3 mobile + responsive check          |
