# Tasks: Trending on Home

**Input**: Design documents from `/specs/001-trending-home/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/trending-api.md

**Tests**: INCLUDED — Constitution Principle I (Test-Driven Quality) is NON-NEGOTIABLE and `contracts/trending-api.md` enumerates required tests. Test tasks precede their implementation within each story.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing.

> **Scope note (FR-002 / SC-001)**: FR-002 (movies + TV + people) and SC-001 (all three visible on first load) are MUST-level but are fully satisfied only after **US2 (P2)**. The US1 MVP intentionally ships movies + TV shows; people are an incremental P2 addition per the spec's prioritization.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: US1 / US2 / US3 (maps to spec.md user stories); omitted for Setup / Foundational / Polish
- Exact file paths are included in every task

## Path Conventions

Web app (single repo): server code under `server/`, frontend under `frontend/src/`. Tests are colocated (`foo.ts` → `foo.test.ts`).

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Configuration and observability scaffolding touched by all stories.

- [x] T001 Add `CACHE_TTL_TRENDING` (default `86400`), `SYNC_TRENDING_CRON` (default `"0 5 * * *"`), and `TRENDING_TIME_WINDOW` (default `"week"`) to the config schema in `server/config.ts`
- [x] T002 [P] Add a `trendingCacheTotal{result="hit"|"miss"}` Prometheus counter mirroring `browseCacheTotal` in `server/metrics/index.ts`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Frontend type + fetcher plumbing that every user-story phase depends on.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [x] T003 [P] Add `TrendingTitle`, `TrendingPerson`, and `TrendingSnapshot` interfaces, add `"trending"` to `HomepageSectionId`, and add `{ id: "trending", enabled: true }` near the top of `DEFAULT_HOMEPAGE_LAYOUT` in `frontend/src/types.ts`
- [x] T004 Add `getTrending(signal?)` fetcher (calls `GET /api/trending`, returns `TrendingSnapshot`) to `frontend/src/api.ts` (depends on T003 types)

**Checkpoint**: Config, metrics, and shared frontend types/fetcher exist — story implementation can begin.

---

## Phase 3: User Story 1 - Discover trending movies and TV shows on the home screen (Priority: P1) 🎯 MVP

**Goal**: A labeled "Trending" section on home shows currently-trending movies and TV shows (poster + title), each linking to `/title/:id`; tracked titles reflect their tracked state.

**Independent Test**: Load `/` (signed-in) → "Trending" section shows movies and TV shows with posters/titles; clicking a title opens its detail view; an already-tracked title shows its tracked state.

### Tests for User Story 1 ⚠️ (write first, ensure they fail)

- [x] T005 [P] [US1] TMDB client tests for `fetchTrendingMovies` / `fetchTrendingTv` (mocked HTTP via `spyOn`, `afterEach` restore; assert correct endpoint + parsing) in `server/tmdb/client.test.ts`
- [x] T006 [P] [US1] Route tests in `server/routes/trending.test.ts`: validation (`time_window=bogus` → 400 with `issues`), happy path (200 with `movies`/`shows` arrays; trending fetchers called), `isTracked` overlay (signed-in tracker → `true`, anon → `false`), cache hit (2nd request does not re-call TMDB), dedupe + empty group (duplicate ids collapsed, empty type → `[]`)
- [x] T007 [P] [US1] `TrendingSection` test: renders movie/TV rows, title links to `/title/:id`, missing poster → placeholder (no broken image) in `frontend/src/components/TrendingSection.test.tsx`
- [x] T008 [P] [US1] `HomePage` test: trending section appears in both anonymous and authenticated paths in `frontend/src/pages/HomePage.test.tsx`

### Implementation for User Story 1

- [x] T009 [P] [US1] Add typed TMDB trending movie/TV response types to `server/tmdb/types.ts`
- [x] T010 [US1] Add `fetchTrendingMovies` and `fetchTrendingTv` (using `tmdbRequest` + `tmdbLanguage()`, default `week` window) to `server/tmdb/client.ts`, reusing `parseDiscoverMovie` / `parseDiscoverTv` from `server/tmdb/parser.ts` (depends on T009)
- [x] T011 [US1] Create `GET /api/trending` in `server/routes/trending.ts`: `zValidator("query", …)` for `time_window`, build movies/shows groups, cache via `getCache()` (key `trending:v1:<lang>:<window>`, TTL `CACHE_TTL_TRENDING`), overlay `isTracked` from `getTrackedTitleIds(user.id)` (`server/db/repository`), de-dupe by `id`, bump `trendingCacheTotal`, `logger.child({ module: "trending" })` (depends on T001, T002, T010)
- [x] T012 [US1] Register `/api/trending` with `optionalAuth` (`app.use("/api/trending", …)` + `app.use("/api/trending/*", …)` + `app.route`) in `server/index.ts` (Bun)
- [x] T013 [US1] Register the identical `/api/trending` + `optionalAuth` block in `server/worker.ts` (CF parity — enforced by `check-route-sync`)
- [x] T014 [P] [US1] Create `TrendingSection` component rendering title rows with `FullBleedCarousel` + `MediaCard` (gradient placeholder when `posterUrl` null) in `frontend/src/components/TrendingSection.tsx`
- [x] T015 [US1] Render `TrendingSection` in both the anonymous home path and the authenticated `renderSection` switch, fed by a TanStack Query `["trending"]` key calling `getTrending`, in `frontend/src/pages/HomePage.tsx` (depends on T004, T014)

**Checkpoint**: Trending movies + TV shows are live on home, signed-in and signed-out, with tracked-state overlay. MVP is shippable.

---

## Phase 4: User Story 2 - Discover trending people on the home screen (Priority: P2)

**Goal**: The trending section also shows trending people (name + profile photo), visually distinct from titles, each linking to `/person/:id`. Completes FR-002 / SC-001.

**Independent Test**: Load `/` → trending people appear with name and photo (placeholder when no photo); clicking a person opens `/person/:id`.

### Tests for User Story 2 ⚠️ (write first, ensure they fail)

- [x] T016 [P] [US2] `parseTrendingPerson` + `fetchTrendingPeople` tests (mocked HTTP, `afterEach` restore) in `server/tmdb/client.test.ts` / `server/tmdb/parser.test.ts`
- [x] T017 [P] [US2] Extend `frontend/src/components/TrendingSection.test.tsx`: renders person rows, person links to `/person/:id`, missing profile photo → placeholder, people group omitted when empty (FR-013)

### Implementation for User Story 2

- [x] T018 [P] [US2] Add `TmdbTrendingPersonResult` and trending-person response type to `server/tmdb/types.ts`
- [x] T019 [US2] Add `parseTrendingPerson` (maps to `TrendingPerson`: `id`, `name`, `profileUrl`, `knownForDepartment`; no DB persistence) to `server/tmdb/parser.ts` (depends on T018)
- [x] T020 [US2] Add `fetchTrendingPeople` (TMDB `/trending/person/<window>`) to `server/tmdb/client.ts` (depends on T019)
- [x] T021 [US2] Add the `people` group (de-duped by `id`) to the snapshot build in `server/routes/trending.ts` (depends on T011, T020)
- [x] T022 [US2] Render a `PersonCard` people row (visually distinct, placeholder for missing photo, links to `/person/:id`) in `frontend/src/components/TrendingSection.tsx` (depends on T014)

**Checkpoint**: Movies, TV shows, AND people render in the trending section; each navigates to the correct detail surface. FR-002 / SC-001 fully satisfied.

---

## Phase 5: User Story 3 - Reliable, fresh, and unobtrusive trending content (Priority: P3)

**Goal**: The section fails soft on upstream errors, shows a non-blocking loading state, and stays fresh via cache + a scheduled refresh job — never blocking the rest of home.

**Independent Test**: Simulate TMDB unavailable with a cold cache → `/` still renders fully and the trending section is gracefully absent; trigger `sync-trending` → cache repopulates and `refreshedAt` advances.

### Tests for User Story 3 ⚠️ (write first, ensure they fail)

- [x] T023 [P] [US3] Fail-soft route test in `server/routes/trending.test.ts`: TMDB fetch rejects + cold cache → HTTP 200 with `{ movies: [], shows: [], people: [] }` (no 5xx)
- [x] T024 [P] [US3] `sync-trending` job test in `server/jobs/sync.test.ts`: running the handler populates the cache; unset `TMDB_API_KEY` skips without throwing; cache not overwritten on TMDB failure (stale survives)
- [x] T025 [P] [US3] Loading + empty-state test in `frontend/src/components/TrendingSection.test.tsx`: loading placeholder renders while the query is pending and does NOT block siblings; the whole section is hidden when all groups are empty (FR-008, FR-009, FR-013)

### Implementation for User Story 3

- [x] T026 [US3] Add fail-soft handling to `server/routes/trending.ts`: on cache miss + TMDB build error, log warn, increment `syncFailureTotal{source:"tmdb"}`, return all-empty groups with `refreshedAt: now`; serve stale cache on error when warm; apply `setPublicCacheIfAnon(c, CACHE_TTL_TRENDING)` from `server/routes/cache-headers.ts` (depends on T011)
- [x] T027 [US3] Add a non-blocking loading placeholder and hide-when-all-empty / omit-empty-group behavior to `frontend/src/components/TrendingSection.tsx` (depends on T014)
- [x] T028 [P] [US3] Register `sync-trending` via `registerHandler` (builds snapshot, writes cache, no-op on unset key, only overwrites on success) and schedule `registerCron("sync-trending", CONFIG.SYNC_TRENDING_CRON)` in `server/jobs/sync.ts` (depends on T010, T020)
- [x] T029 [US3] Add `{ name: "sync-trending", cron: CONFIG.SYNC_TRENDING_CRON }` to the `CRON_JOBS` array in `server/jobs/backend.ts` (CF parity) (depends on T028)

**Checkpoint**: Feature is production-hardened — fail-soft, loading state, cached, and refreshed on schedule across both runtimes.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [x] T030 [P] Verify the dual-runtime route-sync invariant with `bun run check-route-sync` (or the `/check-route-sync` skill) — `/api/trending` registered identically in `server/index.ts` and `server/worker.ts`
- [x] T031 [P] Run the `quickstart.md` manual validation, incl. mobile-viewport / breakpoint check for FR-007 + SC-006 (no automated viewport test; manual or `/ux-review` is the coverage of record)
- [x] T032 Run `bun run check` — full CI gate (server tsc + frontend tsc + ESLint zero-warning + all tests + frontend build + wrangler dry-run) before opening the PR

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately.
- **Foundational (Phase 2)**: Depends on Setup — BLOCKS all user stories.
- **User Stories (Phase 3–5)**: All depend on Foundational. US1 → US2 → US3 in priority order; US2 and US3 build on the US1 route + component files.
- **Polish (Phase 6)**: Depends on all targeted stories being complete.

### User Story Dependencies

- **US1 (P1)**: Independent after Foundational — the MVP.
- **US2 (P2)**: Extends US1's `trending.ts` route and `TrendingSection.tsx`; independently testable (people rows) but shares those files.
- **US3 (P3)**: Hardens US1's route + component and adds the refresh job; independently testable (fail-soft + job).

### Within Each User Story

- Tests are written first and must fail before implementation.
- TMDB types → parser → client functions → route → registration.
- Frontend types/fetcher (Foundational) → component → HomePage wiring.

### Parallel Opportunities

- T002 (metrics) runs parallel to T001.
- All US1 test tasks (T005–T008) run in parallel; T009 and T014 run in parallel with the tests and each other.
- US2 tests T016–T017 in parallel; T018 parallels them.
- US3 tests T023–T025 in parallel; T028 parallels T026/T027.
- Polish T030 + T031 run in parallel; T032 runs last.
- US1/US2/US3 share the route + `TrendingSection` files, so coordinate those edits; the TMDB-type/client and job tasks are the cleanest parallel splits.

---

## Parallel Example: User Story 1

```bash
# Launch all US1 tests together (write first, expect red):
Task: "client tests for fetchTrendingMovies/fetchTrendingTv in server/tmdb/client.test.ts"
Task: "route tests in server/routes/trending.test.ts"
Task: "TrendingSection test in frontend/src/components/TrendingSection.test.tsx"
Task: "HomePage test in frontend/src/pages/HomePage.test.tsx"

# Then independent implementation files in parallel:
Task: "TMDB trending types in server/tmdb/types.ts"
Task: "TrendingSection component in frontend/src/components/TrendingSection.tsx"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Phase 1 Setup → Phase 2 Foundational.
2. Phase 3 (US1): trending movies + TV shows on home, dual-runtime route, tracked overlay.
3. **STOP and VALIDATE** US1 independently (signed-in/out, tracked state, navigation).
4. Ship the MVP. (Note: FR-002/SC-001 — which require people — complete at US2.)

### Incremental Delivery

1. Setup + Foundational → foundation ready.
2. US1 → test → ship (movies + TV). **MVP**
3. US2 → test → ship (adds people; completes FR-002/SC-001).
4. US3 → test → ship (fail-soft, loading, cache refresh job).

### Notes

- [P] = different files, no incomplete dependencies.
- Each story is an independently testable increment; commit after each task or logical group.
- Mock all TMDB HTTP (`spyOn` + `afterEach` restore) — never make real calls in tests.
- No DB migration is introduced — the snapshot lives in `getCache()`.
