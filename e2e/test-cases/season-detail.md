# Test cases: season detail

## Preconditions (shared)

- The Remindarr dev server is running (Bun on `:3000`, Vite proxy on `:5173`).
- Unless stated otherwise, the browser is unauthenticated (no active session cookie).
- The season detail page is at `/title/:id/season/:season`.
  - Example: `/title/tv-tt9876543/season/1`.
- All test cases use `page.route()` mocks unless explicitly marked **Real**.
- The primary detail endpoint is `GET /api/details/show/:id/season/:num`, which returns
  a `SeasonDetailsResponse` (see `frontend/src/types.ts`).
- The episode watch-status endpoint `GET /api/episodes/status/:titleId/:season` is only
  called when a user session is active; it returns `{ episodes: [] }` for logged-out users.
- Additional requests spawned by sub-components (`/api/ratings/**`, `/api/suggestions/**`)
  should be silenced with empty safe stubs to prevent noise.

### Standard base mocks (apply before every navigation)

```
GET **/api/auth/get-session       → null  (logged-out)
GET **/api/auth/custom/providers  → { local: true, oidc: null }
```

For authenticated TCs, replace the session stub with `mockLoggedIn(page)`.

### Standard `MOCK_SEASON_DETAILS` fixture

Used in TCs below unless a TC specifies its own variant.

```json
{
  "title": {
    "id": "tv-tt9876543",
    "object_type": "SHOW",
    "title": "Test Show",
    "original_title": "Test Show",
    "release_year": 2023,
    "release_date": "2023-03-01",
    "runtime_minutes": 45,
    "short_description": "A test show description",
    "genres": ["Drama"],
    "imdb_id": "tt9876543",
    "tmdb_id": "98765",
    "poster_url": null,
    "age_certification": "TV-MA",
    "original_language": "en",
    "tmdb_url": "https://www.themoviedb.org/tv/98765",
    "imdb_score": 8.2,
    "imdb_votes": 50000,
    "tmdb_score": 8.5,
    "is_tracked": false,
    "offers": []
  },
  "tmdb": {
    "id": 101,
    "name": "Season 1",
    "overview": "The first season of Test Show.",
    "air_date": "2023-03-01",
    "poster_path": null,
    "season_number": 1,
    "vote_average": 8.1,
    "episodes": [
      {
        "id": 1001,
        "name": "Pilot",
        "overview": "The first episode.",
        "air_date": "2023-03-01",
        "episode_number": 1,
        "season_number": 1,
        "still_path": null,
        "runtime": 48,
        "vote_average": 8.5,
        "guest_stars": [],
        "crew": []
      },
      {
        "id": 1002,
        "name": "Second Episode",
        "overview": "The second episode.",
        "air_date": "2023-03-08",
        "episode_number": 2,
        "season_number": 1,
        "still_path": null,
        "runtime": 44,
        "vote_average": 7.9,
        "guest_stars": [],
        "crew": []
      }
    ],
    "credits": { "cast": [], "crew": [] }
  },
  "seasonNumber": 1,
  "country": "US",
  "seasons": [
    {
      "id": 101,
      "season_number": 1,
      "name": "Season 1",
      "episode_count": 2,
      "air_date": "2023-03-01",
      "overview": "Season 1 overview",
      "poster_path": null
    }
  ]
}
```

---

## TC-01: Season page loads with show title breadcrumb, season heading, and episode list

**Priority**: P0
**Backend**: Mock

**Why mock**: All rendered content (breadcrumb, season name, episode rows) comes from a
single `GET /api/details/show/:id/season/:num` response. Mocking guarantees a stable
episode list for assertion.

**Preconditions**:

- `mockLoggedOut(page)` stubs the session.
- `page.route()` intercepts `GET **/api/details/show/tv-tt9876543/season/1` and returns
  the `MOCK_SEASON_DETAILS` fixture above.

**Steps**:

1. Apply base mocks and the season detail route intercept.
2. Navigate to `/title/tv-tt9876543/season/1`.
3. Wait for `getByRole("heading", { level: 1 })` to be visible.

**Expected**:

- `getByRole("heading", { level: 1 })` text is `"Season 1"`.
- The breadcrumb contains a link back to `Test Show` pointing to
  `/title/tv-tt9876543`.
- `getByRole("heading", { name: /Episodes/i, level: 2 })` is visible.
- The episode list contains exactly two rows — one for `"Pilot"` and one for
  `"Second Episode"`.
- The season overview `"The first season of Test Show."` is visible.
- The page does not redirect to `/login`.

---

## TC-02: Episodes listed with correct episode numbers and titles

**Priority**: P0
**Backend**: Mock

**Why mock**: Episode number display (`01`, `02`) and episode name rendering are pure
frontend concerns driven by `tmdb.episodes` in the fixture. No real TMDB call needed.

**Preconditions**:

- Same route intercept as TC-01 (`MOCK_SEASON_DETAILS`).
- `mockLoggedOut(page)` stubs the session.

**Steps**:

1. Apply base mocks and the season detail route intercept.
2. Navigate to `/title/tv-tt9876543/season/1`.
3. Wait for `getByRole("heading", { level: 1 })` to be visible.

**Expected**:

- A monospace episode-number badge with text `"01"` is visible in the first episode row.
- A monospace episode-number badge with text `"02"` is visible in the second episode row.
- `getByRole("heading", { name: "Pilot", level: 3 })` is visible.
- `getByRole("heading", { name: "Second Episode", level: 3 })` is visible.
- Each episode row contains a link to the episode detail page:
  - `getByRole("link", { name: "Pilot" })` href ends with
    `/title/tv-tt9876543/season/1/episode/1`.
  - `getByRole("link", { name: "Second Episode" })` href ends with
    `/title/tv-tt9876543/season/1/episode/2`.

> **Implementation note**: Each episode row wraps the still image and title/description in
> a single `<Link to="/title/${title.id}/season/${seasonNumber}/episode/${ep.episode_number}">`.
> The accessible name of the link resolves from the `<h3>` inside it (the episode name).

---

## TC-03: Unauthenticated user can view a season page (public route)

**Priority**: P0
**Backend**: Mock

**Why mock**: Confirms that `/title/:id/season/:season` has no `RequireAuth` wrapper
(verified in `App.tsx`). An unauthenticated visitor must reach the page without being
redirected to `/login`.

**Preconditions**:

- `mockLoggedOut(page)` stubs the session with `null`.
- `page.route()` intercepts `GET **/api/details/show/tv-tt9876543/season/1` and returns
  `MOCK_SEASON_DETAILS`.

**Steps**:

1. Apply `mockLoggedOut(page)`.
2. Apply the season detail route intercept.
3. Navigate to `/title/tv-tt9876543/season/1`.
4. Wait for `getByRole("heading", { level: 1 })` to be visible.

**Expected**:

- The browser URL remains `/title/tv-tt9876543/season/1` — no redirect to `/login`.
- `getByRole("heading", { level: 1 })` text is `"Season 1"`.
- No watched-pill buttons are rendered for any episode row — the episode status
  endpoints (`GET /api/episodes/status/**`) are only called when a user session exists,
  and `hasStatus` is `false` for logged-out visitors, so `EpisodeWatchedPill` components
  are absent.
- The top navigation bar shows a `"Sign In"` link.

---

## TC-04: Authenticated user sees watched-pill buttons; clicking one toggles watched state

**Priority**: P1
**Backend**: Mock

**Why mock**: The toggle flow involves an optimistic update in `SeasonDetailPage`
(`toggleWatchedMutation`). Mocking the session, episode-status endpoint, and
`POST /api/watched/:id` lets us exercise the full optimistic-update path without a real DB.

**Preconditions**:

- `mockLoggedIn(page)` stubs a valid session.
- `page.route()` intercepts `GET **/api/details/show/tv-tt9876543/season/1` and returns
  `MOCK_SEASON_DETAILS` (episodes with air dates in the past so they are "released").
- `page.route()` intercepts `GET **/api/episodes/status/tv-tt9876543/1` and returns:

```json
{
  "episodes": [
    { "episode_number": 1, "id": 1001, "is_watched": false },
    { "episode_number": 2, "id": 1002, "is_watched": false }
  ]
}
```

- `page.route()` intercepts `POST **/api/watched/1001` and returns HTTP 200 with `{}`.
- `page.route()` intercepts `GET **/api/seasons/ratings/**` or
  `GET **/api/ratings/**` (season ratings) and returns `{ "ratings": {} }`.

**Steps**:

1. Apply `mockLoggedIn(page)` and all route intercepts.
2. Navigate to `/title/tv-tt9876543/season/1`.
3. Wait for `getByRole("heading", { level: 1 })` to be visible.
4. Locate the watched-pill button for the first episode: `getByRole("button", { name: /Mark as watched/i }).first()`.
5. Assert it has `aria-pressed="false"`.
6. Click the button.
7. Wait for the button state to change.

**Expected**:

- Before the click: the pill button has `aria-pressed="false"` and text `"Mark"` (or
  `"Watch"` — the short label rendered by `EpisodeWatchedPill` in its unwatched state).
- After the click: the same pill button has `aria-pressed="true"` and text `"Watched"`,
  and its visual style shifts to amber (optimistic update).
- The `POST /api/watched/1001` request was made exactly once.
- No error toast appears.

> **Note**: Watched-pill buttons are rendered only when `hasStatus` is `true` (i.e., when
> `GET /api/episodes/status` returns at least one entry). Stub that endpoint first, then
> navigate — TanStack Query fires it immediately on mount when `user` is truthy.

---

## TC-05: Authenticated user can mark all episodes watched and sees progress counter update

**Priority**: P1
**Backend**: Mock

**Why mock**: The "Mark all watched" button and the `X of N watched · Y remaining` counter
are frontend-only derived from `statusMap`. Mocking the endpoints lets us assert the counter
without a real DB.

**Preconditions**:

- `mockLoggedIn(page)` stubs a valid session.
- `page.route()` intercepts `GET **/api/details/show/tv-tt9876543/season/1` and returns
  `MOCK_SEASON_DETAILS`.
- `page.route()` intercepts `GET **/api/episodes/status/tv-tt9876543/1` and returns:

```json
{
  "episodes": [
    { "episode_number": 1, "id": 1001, "is_watched": false },
    { "episode_number": 2, "id": 1002, "is_watched": false }
  ]
}
```

- `page.route()` intercepts `POST **/api/watched/bulk` (or the bulk watch endpoint used
  by `watchEpisodesBulk`) and returns HTTP 200 with `{}`.
- Stub `GET **/api/ratings/**` with `{ "ratings": {} }`.

**Steps**:

1. Apply `mockLoggedIn(page)` and all route intercepts.
2. Navigate to `/title/tv-tt9876543/season/1`.
3. Wait for `getByRole("heading", { level: 1 })` to be visible.
4. Verify the progress counter reads `"0 of 2 watched · 2 remaining"`.
5. Click `getByRole("button", { name: /Mark all watched/i })`.
6. Wait for the counter to update.

**Expected**:

- After the click, the progress counter reads `"2 of 2 watched · 0 remaining"` (optimistic
  update applied immediately via `allWatchedMutation`).
- The `"Mark all watched"` button is replaced by `"Mark all unwatched"` (rendered when
  `allReleasedWatched` is `true`).
- The bulk watched endpoint was called once.

---

## TC-06: Back navigation from season detail returns to the title detail page

**Priority**: P1
**Backend**: Mock

**Why mock**: The breadcrumb link `<Link to="/title/${title.id}">` is a frontend routing
concern. We only need the season detail response to render the breadcrumb; no title-detail
data needs to load.

**Preconditions**:

- `mockLoggedOut(page)` stubs the session.
- `page.route()` intercepts `GET **/api/details/show/tv-tt9876543/season/1` and returns
  `MOCK_SEASON_DETAILS`.
- Leave `GET **/api/details/show/tv-tt9876543` unrouted or stub it with any valid minimal
  `ShowDetailsResponse` — we only assert the URL change.

**Steps**:

1. Apply base mocks and the season detail route intercept.
2. Navigate to `/title/tv-tt9876543/season/1`.
3. Wait for `getByRole("heading", { level: 1 })` to be visible.
4. Click `getByRole("link", { name: "Test Show" })` in the breadcrumb.
5. Wait for the URL to change.

**Expected**:

- The browser URL changes to `/title/tv-tt9876543`.
- The season heading `"Season 1"` is no longer visible (navigation completed).

---

## TC-07: Error state when season is not found

**Priority**: P1
**Backend**: Mock

**Why mock**: The error branch in `SeasonDetailPage` (`error || !data`) renders a plain
`"Season not found"` message. Returning a 404 from the mock exercises it without any real
backend.

**Preconditions**:

- `mockLoggedOut(page)` stubs the session.
- `page.route()` intercepts `GET **/api/details/show/tv-tt9876543/season/99` and returns
  HTTP 404 with body `{ "error": "Season not found" }`.

**Steps**:

1. Apply `mockLoggedOut(page)`.
2. Register the route intercept for `**/api/details/show/tv-tt9876543/season/99`
   fulfilling with `{ status: 404, json: { error: "Season not found" } }`.
3. Navigate to `/title/tv-tt9876543/season/99`.
4. Wait for the error text to appear.

**Expected**:

- `getByText("Season not found")` is visible (rendered by the error branch in
  `SeasonDetailPage`).
- No episode rows or season heading are rendered.
- No skeleton / loading spinner remains visible.
