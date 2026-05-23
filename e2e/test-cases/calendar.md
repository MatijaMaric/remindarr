# Test cases: upcoming / calendar

## Background

`/upcoming` is a **legacy route** that immediately redirects authenticated users to `/calendar`
(a `<Navigate to="/calendar" replace />` in `App.tsx`). The real upcoming-episodes feature
lives at `/calendar` and is rendered by `CalendarPage.tsx`, which supports grid, agenda, and
week views. The backend endpoint is `GET /api/episodes/upcoming` (returns
`{ today, upcoming, unwatched }`) and `GET /api/calendar` (returns `{ titles, episodes, count }`).

The test cases below are written against the **feature URL `/calendar`** (what users actually
see), with one TC (TC-05) specifically exercising the `/upcoming` → `/login` redirect for
unauthenticated users.

## Preconditions (shared)

- The Remindarr dev server is running (Bun on `:3000`, Vite proxy on `:5173`).
- The E2E database has been wiped; bootstrap admin has been created.
- Unless stated otherwise the browser viewport is desktop-sized (≥ 1024 px wide) so the
  desktop grid view renders (mobile renders `MobileCalendar` instead).
- `mockLoggedIn(page)` stubs `GET /api/auth/get-session` and
  `GET /api/auth/custom/providers` via `e2e/helpers.ts`.

---

## TC-01: Calendar page loads and shows upcoming episodes

**Priority**: P0
**Backend**: Mock

**Why mock**: Verifies the page renders episode data fetched from `/api/calendar` without
needing real DB rows or TMDB sync. Keeps the test hermetic and fast.

**Preconditions**:

- `mockLoggedIn(page)` has been called.
- `page.route()` intercepts `GET **/api/calendar**` and returns:
  ```json
  {
    "titles": [],
    "episodes": [
      {
        "id": 102,
        "title_id": "tv-98765",
        "season_number": 1,
        "episode_number": 2,
        "name": "Second Episode",
        "overview": "The second episode",
        "air_date": "<tomorrow's date as YYYY-MM-DD>",
        "still_path": null,
        "show_title": "Test Show",
        "poster_url": null,
        "is_watched": false,
        "offers": []
      }
    ],
    "count": 1
  }
  ```
- `page.route()` intercepts `GET **/api/user/settings**` and returns `{}`.

**Steps**:

1. Set up route intercepts as described in preconditions.
2. Call `mockLoggedIn(page)`.
3. Navigate to `/calendar`.
4. Wait for the page heading to be visible.

**Expected**:

- The URL is `/calendar` (no further redirect).
- A page heading (the current month name, e.g. "May 2026") is visible via
  `getByRole("heading")`.
- The episode name "Second Episode" or the show title "Test Show" is visible somewhere on
  the page (exact location depends on view mode — grid cell label, agenda row, etc.).
- No error banner is shown.

---

## TC-02: Episodes grouped by date/show correctly

**Priority**: P1
**Backend**: Mock

**Why mock**: The grouping logic (`groupByShow`, date-bucketing) is frontend-only. Providing
controlled mock data lets us assert the exact grouping without relying on real DB contents.

**Preconditions**:

- `mockLoggedIn(page)` has been called.
- `page.route()` intercepts `GET **/api/calendar**` and returns two episodes for the same
  show on the same day, and one episode for a different show on a different day:
  ```json
  {
    "titles": [],
    "episodes": [
      {
        "id": 201,
        "title_id": "tv-111",
        "season_number": 2,
        "episode_number": 3,
        "name": "Part One",
        "air_date": "<date A>",
        "show_title": "Alpha Show",
        "poster_url": null,
        "is_watched": false,
        "offers": [],
        "still_path": null,
        "overview": ""
      },
      {
        "id": 202,
        "title_id": "tv-111",
        "season_number": 2,
        "episode_number": 4,
        "name": "Part Two",
        "air_date": "<date A>",
        "show_title": "Alpha Show",
        "poster_url": null,
        "is_watched": false,
        "offers": [],
        "still_path": null,
        "overview": ""
      },
      {
        "id": 203,
        "title_id": "tv-222",
        "season_number": 1,
        "episode_number": 1,
        "name": "Premiere",
        "air_date": "<date B, one week later>",
        "show_title": "Beta Show",
        "poster_url": null,
        "is_watched": false,
        "offers": [],
        "still_path": null,
        "overview": ""
      }
    ],
    "count": 3
  }
  ```
- `page.route()` intercepts `GET **/api/user/settings**` and returns `{}`.

**Steps**:

1. Set up route intercepts as described in preconditions.
2. Call `mockLoggedIn(page)`.
3. Navigate to `/calendar`.
4. Wait for the page to finish loading (heading visible, no skeleton).

**Expected**:

- "Alpha Show" appears once in the calendar (the two episodes from the same show on the same
  day are grouped under a single show card, not rendered as two separate cards).
- "Beta Show" appears in its own separate cell or date group.
- The episode codes "S02E03" and "S02E04" are both visible within the Alpha Show group.
- "S01E01" is visible within the Beta Show group.
- The two date groups are visually distinct (different calendar cells or date headings).

---

## TC-03: Empty state — no upcoming episodes

**Priority**: P1
**Backend**: Mock

**Why mock**: The empty-state rendering is a frontend concern. A stub returning empty arrays
is sufficient to exercise the code path.

**Preconditions**:

- `mockLoggedIn(page)` has been called.
- `page.route()` intercepts `GET **/api/calendar**` and returns:
  ```json
  { "titles": [], "episodes": [], "count": 0 }
  ```
- `page.route()` intercepts `GET **/api/user/settings**` and returns `{}`.

**Steps**:

1. Set up route intercepts as described in preconditions.
2. Call `mockLoggedIn(page)`.
3. Navigate to `/calendar`.
4. Wait for the page heading (month name) to be visible.

**Expected**:

- The calendar grid renders and the current month heading is visible.
- No episode cards or show-title links appear anywhere on the page.
- No error banner is shown (empty is not an error — the calendar simply renders with
  empty cells).
- The page does not show a loading skeleton indefinitely.

---

## TC-04: Clicking a show title navigates to the title detail page

**Priority**: P1
**Backend**: Mock

**Why mock**: The link target (`/title/:id`) is embedded in the episode data. We only need
to verify the link is rendered with the correct `href` and that clicking it triggers
navigation — no real title-detail data is needed for the click assertion.

**Preconditions**:

- `mockLoggedIn(page)` has been called.
- `page.route()` intercepts `GET **/api/calendar**` and returns one episode with
  `title_id: "tv-98765"` and `show_title: "Test Show"`.
- `page.route()` intercepts `GET **/api/user/settings**` and returns `{}`.
- `page.route()` intercepts `GET **/api/details/show/**` and returns a minimal valid
  show-details payload (or returns an empty `{}` — the test only needs navigation to succeed,
  not the detail page to fully render).

**Steps**:

1. Set up route intercepts as described in preconditions.
2. Call `mockLoggedIn(page)`.
3. Navigate to `/calendar`.
4. Wait for "Test Show" to be visible on the page.
5. `getByRole("link", { name: /Test Show/i })` — click the first matching link.
6. Wait for URL to change.

**Expected**:

- The browser navigates to `/title/tv-98765`.
- The URL pathname is `/title/tv-98765`.

---

## TC-05: Unauthenticated user visiting /upcoming is redirected to /login

**Priority**: P0
**Backend**: Mock

**Why mock**: The `RequireAuth` guard and the `/upcoming → /calendar` redirect are both
frontend route guards. Stubbing `GET /api/auth/get-session` with `null` (logged-out state)
is sufficient; no real session or DB is needed.

**Preconditions**:

- `mockLoggedOut(page)` has been called (from `e2e/helpers.ts`), which stubs
  `GET **/api/auth/get-session` to return `null`.

**Steps**:

1. Call `mockLoggedOut(page)`.
2. Navigate to `/upcoming`.
3. Wait for the URL to change (the client-side guard triggers asynchronously).

**Expected**:

- The browser is redirected to `/login`.
- The URL pathname is `/login`.
- The login form is visible (`getByRole("heading", { name: /sign in/i })` or the username
  and password fields are present).
- The `/upcoming` or `/calendar` page content is never rendered.

> **Note**: The redirect chain is `/upcoming` → `RequireAuth` detects no session →
> `/login`. The intermediate `/calendar` redirect (which only runs for authenticated users)
> is never reached.
