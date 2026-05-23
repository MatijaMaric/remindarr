# Test cases: title detail

## Preconditions (shared)

- The Remindarr dev server is running (Bun on `:3000`, Vite proxy on `:5173`).
- Unless stated otherwise, the browser is unauthenticated (no active session cookie).
- The title detail page is at `/title/:id`.
  - Movie IDs do **not** start with `tv-` (e.g. `tt1234567` or `movie-12345`).
  - Show IDs start with `tv-` (e.g. `tv-tt9876543`), which causes `TitleDetailPage` to call
    `GET /api/details/show/:id` instead of `GET /api/details/movie/:id`.
- All test cases use `page.route()` mocks unless explicitly marked **Real**.
- The detail endpoints return the `MOCK_MOVIE_DETAILS` or `MOCK_SHOW_DETAILS` fixtures
  exported from `e2e/helpers.ts`; extended versions are defined per TC below.
- Additional requests spawned by sub-components (`/api/ratings/**`, `/api/suggestions/**`,
  `/api/watch-history/**`) should be silenced with a catch-all stub returning safe empty
  payloads to prevent noise — or left unrouted if they do not affect the assertions.

### Standard base mocks (apply before every navigation)

```
GET **/api/auth/get-session       → null  (logged-out)
GET **/api/auth/custom/providers  → { local: true, oidc: null }
```

For authenticated TCs, replace the session stub with `mockLoggedIn(page)`.

---

## TC-01: Movie detail page loads title, metadata strip, and overview

**Priority**: P0
**Backend**: Mock

**Why mock**: All visible fields (title, genre chips, IMDB score, runtime, overview) come
directly from `GET /api/details/movie/:id`. Mocking guarantees a stable payload for
assertion without a seeded TMDB-backed database.

**Preconditions**:

- `mockLoggedOut(page)` stubs the session.
- `page.route()` intercepts `GET **/api/details/movie/tt1234567` and returns
  `MOCK_MOVIE_DETAILS` (imported from `e2e/helpers.ts`), extended with an overview:

```json
{
  "title": {
    "id": "tt1234567",
    "object_type": "MOVIE",
    "title": "Test Movie",
    "original_title": "Test Movie",
    "release_year": 2024,
    "release_date": "2024-01-15",
    "runtime_minutes": 120,
    "short_description": "A test movie description",
    "genres": ["Action", "Drama"],
    "imdb_id": "tt1234567",
    "tmdb_id": "12345",
    "poster_url": null,
    "age_certification": "PG-13",
    "original_language": "en",
    "tmdb_url": "https://www.themoviedb.org/movie/12345",
    "imdb_score": 7.5,
    "imdb_votes": 10000,
    "tmdb_score": 7.8,
    "is_tracked": false,
    "offers": []
  },
  "tmdb": {
    "id": 12345,
    "title": "Test Movie",
    "original_title": "Test Movie",
    "overview": "A test movie description",
    "tagline": "A great movie",
    "runtime": 120,
    "release_date": "2024-01-15",
    "status": "Released",
    "budget": 50000000,
    "revenue": 120000000,
    "original_language": "en",
    "genres": [
      { "id": 28, "name": "Action" },
      { "id": 18, "name": "Drama" }
    ],
    "production_companies": [],
    "production_countries": [],
    "spoken_languages": [],
    "poster_path": null,
    "backdrop_path": null,
    "vote_average": 7.8,
    "vote_count": 5000,
    "imdb_id": "tt1234567",
    "credits": { "cast": [], "crew": [] },
    "release_dates": { "results": [] },
    "watch/providers": { "results": {} }
  },
  "country": "US"
}
```

- Stub any secondary requests that sub-components fire (ratings, suggestions,
  watch-history) to return empty safe payloads.

**Steps**:

1. Apply the base mocks and the detail route intercept.
2. Navigate to `/title/tt1234567`.
3. Wait for `getByRole("heading", { level: 1 })` to be visible.

**Expected**:

- `getByRole("heading", { level: 1 })` text is `"Test Movie"`.
- A `Kicker` element containing `"Movie"` and `"2024"` is visible (rendered by `MovieHero`).
- Genre chips `"Action"` and `"Drama"` are visible.
- The IMDB chip `"★ 7.5"` is visible in the hero area.
- The metadata strip contains `"RUNTIME"` / `"2h 0m"` (or `"120 min"`) and `"STATUS"` /
  `"Released"`.
- `getByText("A test movie description")` (the overview paragraph) is visible.
- The page does not redirect to `/login`.

---

## TC-02: Show detail page loads title, seasons grid, and metadata strip

**Priority**: P0
**Backend**: Mock

**Why mock**: The seasons grid and metadata counts (`1 season`, `8 episodes`) are driven
entirely by the `MOCK_SHOW_DETAILS` fixture. No real TMDB calls are needed.

**Preconditions**:

- `mockLoggedOut(page)` stubs the session.
- `page.route()` intercepts `GET **/api/details/show/tv-tt9876543` and returns
  `MOCK_SHOW_DETAILS` (from `e2e/helpers.ts`):

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
    "id": 98765,
    "name": "Test Show",
    "original_name": "Test Show",
    "overview": "A test show description",
    "tagline": "A great show",
    "first_air_date": "2023-03-01",
    "last_air_date": "2023-03-01",
    "status": "Returning Series",
    "type": "Scripted",
    "number_of_seasons": 1,
    "number_of_episodes": 8,
    "episode_run_time": [45],
    "original_language": "en",
    "genres": [{ "id": 18, "name": "Drama" }],
    "created_by": [],
    "networks": [],
    "production_companies": [],
    "production_countries": [],
    "spoken_languages": [],
    "seasons": [
      {
        "id": 1,
        "season_number": 1,
        "name": "Season 1",
        "episode_count": 8,
        "air_date": "2023-03-01",
        "overview": "Season 1 overview",
        "poster_path": null
      }
    ],
    "poster_path": null,
    "backdrop_path": null,
    "vote_average": 8.5,
    "vote_count": 20000,
    "credits": { "cast": [], "crew": [] },
    "content_ratings": { "results": [] },
    "watch/providers": { "results": {} },
    "external_ids": { "imdb_id": "tt9876543" }
  },
  "country": "US"
}
```

- Stub ratings and suggestions sub-requests to return empty payloads.

**Steps**:

1. Apply base mocks and the detail route intercept.
2. Navigate to `/title/tv-tt9876543`.
3. Wait for `getByRole("heading", { level: 1 })` to be visible.

**Expected**:

- `getByRole("heading", { level: 1 })` text is `"Test Show"`.
- A `Kicker` element containing `"TV Show"` and `"2023"` is visible (rendered by
  `ShowHero`).
- The metadata strip contains `"SEASONS"` / `"1"` and `"EPISODES"` / `"8"` and `"STATUS"`
  / `"Returning Series"`.
- The `"Seasons"` section heading (level 2) is visible.
- A season card with the text `"Season 1"` is visible inside the seasons grid.
- `getByText("8 episodes")` is visible inside that season card.

---

## TC-03: Unauthenticated user can view a title detail page (public route)

**Priority**: P0
**Backend**: Mock

**Why mock**: Confirms that `/title/:id` has no `RequireAuth` wrapper (verified in
`App.tsx` — the route is wrapped in a plain `<Page>` not `<RequireAuth>`). An unauthenticated
visitor must reach the page without being redirected to `/login`.

**Preconditions**:

- `mockLoggedOut(page)` stubs the session with `null`.
- `page.route()` intercepts `GET **/api/details/movie/tt1234567` and returns the
  payload from TC-01.
- Stub sub-requests (ratings, suggestions, watch-history) with empty safe payloads.

**Steps**:

1. Apply `mockLoggedOut(page)`.
2. Apply the detail route intercept.
3. Navigate to `/title/tt1234567`.
4. Wait for `getByRole("heading", { level: 1 })` to be visible.

**Expected**:

- The browser URL remains `/title/tt1234567` — no redirect to `/login` occurs.
- `getByRole("heading", { level: 1 })` text is `"Test Movie"`.
- The `TrackButton` is **not** rendered (`getByText(/Track/i)` is absent), because
  `TrackButton` renders `null` when `user` is falsy.
- The top navigation bar shows a `"Sign In"` link, confirming the unauthenticated state.

---

## TC-04: Authenticated user sees Track button and can track a title

**Priority**: P1
**Backend**: Mock

**Why mock**: The track action (`POST /api/titles/:id/track`) and the optimistic UI update
in `TrackButton` are pure frontend+API concerns. Mocking the session and the track endpoint
lets us assert the full track flow without a real DB.

**Preconditions**:

- `mockLoggedIn(page)` stubs a valid session.
- `page.route()` intercepts `GET **/api/details/movie/tt1234567` and returns the TC-01
  payload with `"is_tracked": false`.
- `page.route()` intercepts `POST **/api/titles/tt1234567/track` and returns
  `{ "id": "tt1234567", "is_tracked": true }` (HTTP 200).
- Stub ratings, suggestions, watch-history sub-requests with empty payloads.

**Steps**:

1. Apply `mockLoggedIn(page)` and all route intercepts above.
2. Navigate to `/title/tt1234567`.
3. Wait for `getByRole("heading", { level: 1 })` to be visible.
4. Assert the `TrackButton` shows its untracked state: `getByRole("button", { name: /Track/i })` with `aria-pressed="false"`.
5. Click `getByRole("button", { name: /Track/i })`.
6. Wait for the button state to change.

**Expected**:

- After the click, `getByRole("button", { name: /Tracked/i })` with `aria-pressed="true"`
  is visible (optimistic update applied immediately).
- A success toast `"Title tracked"` appears at the bottom of the screen.
- The `POST /api/titles/tt1234567/track` request was made exactly once.

---

## TC-05: Authenticated user can untrack a title (confirm dialog)

**Priority**: P1
**Backend**: Mock

**Why mock**: The untrack confirm dialog (`AlertDialog`) and the `DELETE` call are
frontend-only concerns. Mocking keeps the test deterministic.

**Preconditions**:

- `mockLoggedIn(page)` stubs a valid session.
- `page.route()` intercepts `GET **/api/details/movie/tt1234567` and returns the TC-01
  payload with `"is_tracked": true` (already tracked).
- `page.route()` intercepts `DELETE **/api/titles/tt1234567/track` and returns HTTP 200
  with `{}`.
- Stub ratings, suggestions, watch-history sub-requests with empty payloads.

**Steps**:

1. Apply `mockLoggedIn(page)` and all route intercepts.
2. Navigate to `/title/tt1234567`.
3. Wait for `getByRole("button", { name: /Tracked/i })` with `aria-pressed="true"` to be
   visible.
4. Click `getByRole("button", { name: /Tracked/i })`.
5. Wait for the confirm dialog to appear.
6. Click the confirm (Remove / Untrack) button inside the dialog.

**Expected**:

- The confirm `AlertDialog` appears after step 4 (contains the title name and a description
  asking to confirm).
- After confirming, the button reverts to `getByRole("button", { name: /Track/i })` with
  `aria-pressed="false"`.
- A success toast `"Removed from tracked"` appears.
- The `DELETE /api/titles/tt1234567/track` request was made exactly once.

---

## TC-06: Error state when title is not found

**Priority**: P1
**Backend**: Mock

**Why mock**: The error branch in `TitleDetailPage` (`isError === true`) is exercised by
returning a non-2xx status from the detail endpoint. No real backend is needed.

**Preconditions**:

- `mockLoggedOut(page)` stubs a logged-out session.
- `page.route()` intercepts `GET **/api/details/movie/tt0000000` and returns HTTP 404
  with body `{ "error": "Not found" }`.

**Steps**:

1. Apply `mockLoggedOut(page)`.
2. Register the route intercept for `**/api/details/movie/tt0000000` fulfilling with
   `{ status: 404, json: { error: "Not found" } }`.
3. Navigate to `/title/tt0000000`.
4. Wait for the error text to appear.

**Expected**:

- `getByText(/Failed to load details/i)` is visible (rendered by the `isError` branch in
  `TitleDetailPage`).
- The page does not show a heading for any title.
- No skeleton / loading spinner remains visible.

---

## TC-07: Clicking a season card navigates to the season detail page

**Priority**: P1
**Backend**: Mock

**Why mock**: Navigation between `/title/:id` and `/title/:id/season/:num` is a frontend
routing concern. We only need the show detail response to render the seasons grid; no
season-detail data needs to load.

**Preconditions**:

- `mockLoggedOut(page)` stubs the session.
- `page.route()` intercepts `GET **/api/details/show/tv-tt9876543` and returns the TC-02
  payload (1 season, `season_number: 1`).
- Leave `GET **/api/details/show/tv-tt9876543/season/1` unrouted or stub it with any
  valid minimal payload — we only assert the URL change.

**Steps**:

1. Apply base mocks and the show detail route intercept.
2. Navigate to `/title/tv-tt9876543`.
3. Wait for `getByRole("heading", { name: "Seasons", level: 2 })` to be visible.
4. Click `getByRole("link", { name: /Season 1/i })` inside the seasons grid.
5. Wait for the URL to change.

**Expected**:

- The browser URL changes to `/title/tv-tt9876543/season/1`.
- The previous page heading `"Test Show"` is no longer visible (navigation completed).

> **Implementation note**: Each season card in `ShowDetail` is rendered as a
> `<Link to="/title/${title.id}/season/${s.season_number}">`. The link's accessible name
> comes from the `<h3>` inside it (`s.name`). Scope the locator to the seasons grid section
> if `getByRole("link", { name: /Season 1/i })` matches multiple elements.
