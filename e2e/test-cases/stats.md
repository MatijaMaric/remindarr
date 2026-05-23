# Test cases: stats

## Preconditions (shared)

- The Remindarr dev server is running (Bun on `:3000`, Vite proxy on `:5173`).
- The stats view is reached via the **Tracked** page at `/tracked` — the route `/stats`
  is a redirect alias to `/tracked?view=stats`, and the Stats view is activated by clicking
  the **Stats** pill on that page. Note: `TrackedPage` does **not** read `?view=stats`
  from the URL query param; the pill must be clicked to switch views.
- `GET /api/stats` is the backing endpoint (requires auth).
- Unless stated otherwise, the browser is authenticated via `mockLoggedIn(page)`.

---

## TC-01: Stats page loads with stats sections visible

**Priority**: P0
**Backend**: Mock

**Why mock**: The stats layout and section headings are pure frontend concerns. Mocking
`GET /api/stats` with a realistic payload lets the test assert that all six sections render
correctly without depending on a seeded database.

**Preconditions**:

- `mockLoggedIn(page)` has been called.
- `page.route()` intercepts `GET **/api/stats` and returns HTTP 200 with a payload
  containing non-zero overview counts, at least one genre, at least one language, 13
  monthly entries, and non-zero `shows_by_status` values.
- `page.route()` intercepts `GET **/api/titles**` and returns `{ titles: [], count: 0 }`.

**Steps**:

1. Set up route intercepts as described in preconditions.
2. Navigate to `/tracked`.
3. `getByText("Stats")` (the Stats pill) → click.
4. Wait for the stats content to appear (skeleton disappears).

**Expected**:

- The heading `getByText("Stats")` is visible on the page.
- The overview grid is visible, containing cards labelled:
  - `getByText("Movies Watched")`
  - `getByText("Episodes Watched")`
  - `getByText("Shows Tracked")`
  - `getByText("Movies Tracked")`
  - `getByText("Watch Time")`
  - `getByText("Watchlist ETA")`
- The section heading `getByText("Monthly Activity")` is visible.
- The legend items `getByText("Episodes")` and `getByText("Movies")` are visible.
- The section heading `getByText("Top Genres")` is visible.
- The section heading `getByText("Top Languages")` is visible.
- The section heading `getByText("Shows by Status")` is visible.
- The watch-time breakdown cards `getByText("TV Watch Time")` and
  `getByText("Movie Watch Time")` are visible.

---

## TC-02: Stats show correct counts

**Priority**: P1
**Backend**: Mock

**Why mock**: The displayed values come directly from the API response. Mocking the
response with specific numbers lets the test assert exact rendered values without
seeding a database.

**Preconditions**:

- `mockLoggedIn(page)` has been called.
- `page.route()` intercepts `GET **/api/stats` and returns:

  ```json
  {
    "overview": {
      "watched_movies": 12,
      "watched_episodes": 84,
      "tracked_shows": 5,
      "tracked_movies": 7,
      "watch_time_minutes": 3720,
      "watch_time_minutes_shows": 1260,
      "watch_time_minutes_movies": 2460
    },
    "genres": [
      { "genre": "Drama", "count": 30 },
      { "genre": "Action", "count": 18 }
    ],
    "languages": [
      { "language": "en", "count": 45 },
      { "language": "ja", "count": 10 }
    ],
    "monthly": [
      { "month": "2026-05", "movies_watched": 3, "episodes_watched": 12 }
    ],
    "shows_by_status": {
      "watching": 3,
      "caught_up": 1,
      "not_started": 0,
      "completed": 1,
      "on_hold": 0,
      "dropped": 0,
      "plan_to_watch": 0,
      "unreleased": 0
    },
    "pace": {
      "minutesPerDay": 62,
      "watchlistEtaDays": 14
    }
  }
  ```

- `page.route()` intercepts `GET **/api/titles**` and returns `{ titles: [], count: 0 }`.

**Steps**:

1. Set up route intercepts as described in preconditions.
2. Navigate to `/tracked`.
3. `getByText("Stats")` (the Stats pill) → click.
4. Wait for the stats content to render (no skeleton visible).

**Expected**:

- The Movies Watched card displays the value `12`.
- The Episodes Watched card displays the value `84`.
- The Shows Tracked card displays the value `5`.
- The Movies Tracked card displays the value `7`.
- The Watch Time card displays `62h` (3720 min = 62h exactly).
- The Watchlist ETA card displays `~2w` (14 days formatted as approximately 2 weeks).
- The TV Watch Time breakdown card displays `21h` and sub-label containing `84 episodes`.
- The Movie Watch Time breakdown card displays `41h` and sub-label containing `12 movies`.
- `getByText("Drama")` is visible in the Top Genres section with count `30`.
- `getByText("Action")` is visible in the Top Genres section with count `18`.
- `getByText("English")` is visible in the Top Languages section with count `45`.
- `getByText("Japanese")` is visible in the Top Languages section with count `10`.
- In the Shows by Status grid, a cell shows `3` with label `Watching`.
- In the Shows by Status grid, a cell shows `1` with label `Caught Up`.
- In the Shows by Status grid, a cell shows `1` with label `Completed`.
- Status entries with count `0` (`Not Started`, `On Hold`, `Dropped`, `Plan to Watch`,
  `Unreleased`) are **not** rendered (the component returns `null` for zero-count entries).

---

## TC-03: Empty stats — new user with no watch history

**Priority**: P1
**Backend**: Mock

**Why mock**: A zero-state user is trivial to reproduce via a mock response. This test
verifies that the page does not crash or show broken UI when all counts are zero, genre
and language arrays are empty, and monthly activity has no data.

**Preconditions**:

- `mockLoggedIn(page)` has been called.
- `page.route()` intercepts `GET **/api/stats` and returns:

  ```json
  {
    "overview": {
      "watched_movies": 0,
      "watched_episodes": 0,
      "tracked_shows": 0,
      "tracked_movies": 0,
      "watch_time_minutes": 0,
      "watch_time_minutes_shows": 0,
      "watch_time_minutes_movies": 0
    },
    "genres": [],
    "languages": [],
    "monthly": [],
    "shows_by_status": {
      "watching": 0,
      "caught_up": 0,
      "not_started": 0,
      "completed": 0,
      "on_hold": 0,
      "dropped": 0,
      "plan_to_watch": 0,
      "unreleased": 0
    },
    "pace": {
      "minutesPerDay": 0,
      "watchlistEtaDays": null
    }
  }
  ```

- `page.route()` intercepts `GET **/api/titles**` and returns `{ titles: [], count: 0 }`.

**Steps**:

1. Set up route intercepts as described in preconditions.
2. Navigate to `/tracked`.
3. `getByText("Stats")` (the Stats pill) → click.
4. Wait for the stats content to render.

**Expected**:

- The six overview cards are visible with value `0` for counts and `0h` for watch time.
- The Watchlist ETA card displays `—` (the null ETA sentinel).
- The TV Watch Time card displays `0h` with sub-label `0 episodes`.
- The Movie Watch Time card displays `0h` with sub-label `0 movies`.
- The `Top Genres` section heading is **not** rendered (empty array → section hidden).
- The `Top Languages` section heading is **not** rendered (empty array → section hidden).
- The `Shows by Status` section heading is **not** rendered
  (`tracked_shows === 0` guards the entire block).
- The Monthly Activity section **is** still rendered (the chart container is always shown,
  but all bar columns are flat/empty).
- No error banner or crash is visible.

---

## TC-04: Unauthenticated user is redirected to /login

**Priority**: P0
**Backend**: Mock

**Why mock**: The auth guard is a frontend `RequireAuth` component that reads the session
from `GET /api/auth/get-session`. Using `mockLoggedOut(page)` (from `e2e/helpers.ts`) to
return `null` is sufficient to trigger the redirect without a real server.

**Preconditions**:

- `mockLoggedOut(page)` has been called (stubs `GET /api/auth/get-session` → `null` and
  `GET /api/auth/custom/providers` → `{ local: true, oidc: null }`).

**Steps**:

1. Call `mockLoggedOut(page)` to inject a mock logged-out session.
2. Navigate to `/stats`.
3. Wait for navigation to settle.

**Expected**:

- The browser first redirects to `/tracked?view=stats` (the alias redirect from `App.tsx`).
- Then the `RequireAuth` guard on the Tracked page redirects to `/login`.
- The final URL is `/login` (or `/login?redirect=...`).
- The login form is visible: `getByRole("heading", { name: /sign in/i })`.
- The stats page content (overview cards, Monthly Activity heading) is **not** visible.
