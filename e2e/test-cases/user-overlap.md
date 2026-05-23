# Test cases: user-overlap

## Preconditions (shared)

- The Remindarr dev server is running (Bun on `:3000`, Vite proxy on `:5173`).
- The overlap page is at `/u/:username/overlap/:friendUsername`.
  Example: `/u/testuser/overlap/alice`.
- The overlap API endpoint is `GET /api/overlap/:friendUsername` (requires auth;
  returns `OverlapResponse` — see `frontend/src/types.ts`).
- Unless stated otherwise, `mockLoggedIn(page)` is called so the `RequireAuth`
  guard passes. `MOCK_SESSION.user` has `id = "user-1"`, `username = "testuser"`,
  `name = "Test User"`.

---

## TC-01: Page loads showing shared titles and header avatars

**Priority**: P0
**Backend**: Mock

**Why mock**: The overlap grid and header are a pure render of the `GET /api/overlap`
response. Mocking lets us assert exact titles and counts without a seeded database.

**Preconditions**:

- `mockLoggedIn(page)` is called.
- `page.route()` intercepts `GET **/api/overlap/alice` and returns:

```json
{
  "titles": [
    {
      "id": "tt1234567",
      "object_type": "MOVIE",
      "title": "Inception",
      "original_title": "Inception",
      "release_year": 2010,
      "release_date": "2010-07-16",
      "runtime_minutes": 148,
      "short_description": "A thief who steals corporate secrets.",
      "genres": ["Action", "Sci-Fi"],
      "imdb_id": "tt1375666",
      "tmdb_id": "27205",
      "poster_url": null,
      "age_certification": "PG-13",
      "original_language": "en",
      "tmdb_url": null,
      "imdb_score": 8.8,
      "imdb_votes": 2000000,
      "tmdb_score": 8.4,
      "is_tracked": true,
      "is_watched": true,
      "offers": [],
      "viewer_rating": "LOVE",
      "friend_rating": "LIKE"
    },
    {
      "id": "tt9876543",
      "object_type": "SHOW",
      "title": "Breaking Bad",
      "original_title": "Breaking Bad",
      "release_year": 2008,
      "release_date": "2008-01-20",
      "runtime_minutes": 47,
      "short_description": "A chemistry teacher turned drug lord.",
      "genres": ["Drama", "Crime"],
      "imdb_id": "tt0903747",
      "tmdb_id": "1396",
      "poster_url": null,
      "age_certification": "TV-MA",
      "original_language": "en",
      "tmdb_url": null,
      "imdb_score": 9.5,
      "imdb_votes": 1500000,
      "tmdb_score": 9.3,
      "is_tracked": true,
      "is_watched": false,
      "offers": [],
      "viewer_rating": null,
      "friend_rating": null
    }
  ],
  "sharedProviders": [],
  "counts": {
    "intersection": 2,
    "viewerOnly": 3,
    "friendOnly": 1
  },
  "friendUser": {
    "username": "alice",
    "displayName": "Alice",
    "image": null
  }
}
```

**Steps**:

1. Set up the route intercept on `**/api/overlap/alice` with the payload above.
2. Call `mockLoggedIn(page)`.
3. Navigate to `/u/testuser/overlap/alice`.
4. Wait for `getByRole("heading", { level: 1 })` to be visible.

**Expected**:

- `getByRole("heading", { level: 1 })` text is `"What to watch together"`.
- `getByText(/with @alice/i)` subtitle is visible.
- The viewer avatar label `"@testuser"` is visible.
- The friend avatar label `"@alice"` is visible (as a link).
- `getByText("2")` in the "in common" stat badge is visible.
- `getByText("3")` in the "yours only" stat badge is visible.
- `getByText("Inception")` title card is visible in the grid.
- `getByText("Breaking Bad")` title card is visible in the grid.

---

## TC-02: Auth required — unauthenticated user redirected to `/login`

**Priority**: P0
**Backend**: Mock

**Why mock**: The route is wrapped in `RequireAuth`, which reads the session from
`GET /api/auth/get-session`. Stubbing with `null` via `mockLoggedOut(page)` fully
exercises the guard.

**Preconditions**:

- `mockLoggedOut(page)` stubs `GET /api/auth/get-session` with `null`.

**Steps**:

1. Call `mockLoggedOut(page)`.
2. Navigate to `/u/testuser/overlap/alice`.
3. Wait for the URL to change away from `/u/testuser/overlap/alice`.

**Expected**:

- The browser redirects to `/login`.
- The overlap heading (`"What to watch together"`) is never rendered.
- The login form is visible (`getByRole("button", { name: /sign in/i })` is
  present).

---

## TC-03: Shows titles in common between current user and target user

**Priority**: P1
**Backend**: Mock

**Why mock**: The `filteredTitles` list is derived entirely from the API response
`titles` array. Using a deterministic mock guarantees we assert the exact titles
rendered without any DB state.

**Preconditions**:

- Same setup as TC-01 (two shared titles, `counts.intersection = 2`).

**Steps**:

1. Set up the route intercept on `**/api/overlap/alice` as in TC-01.
2. Call `mockLoggedIn(page)`.
3. Navigate to `/u/testuser/overlap/alice`.
4. Wait for `getByRole("heading", { level: 1 })` to be visible.

**Expected**:

- The grid contains exactly 2 `TitleCard` elements (Playwright locator:
  `page.locator('.grid > *')` should have `count() === 2`, or assert both title
  texts are present).
- `getByText("Inception")` is visible.
- `getByText("Breaking Bad")` is visible.
- The "in common" stat badge shows `"2"`.
- Filter buttons `"All"`, `"Movies only"`, and `"Watchable now"` are visible.

---

## TC-04: Empty state when no titles in common

**Priority**: P1
**Backend**: Mock

**Why mock**: The empty-state branch (`counts.intersection === 0`) is a client-side
guard. Returning `{ titles: [], counts: { intersection: 0, ... } }` is sufficient
to trigger it without any DB state.

**Preconditions**:

- `mockLoggedIn(page)` is called.
- `page.route()` intercepts `GET **/api/overlap/alice` and returns:

```json
{
  "titles": [],
  "sharedProviders": [],
  "counts": {
    "intersection": 0,
    "viewerOnly": 5,
    "friendOnly": 3
  },
  "friendUser": {
    "username": "alice",
    "displayName": "Alice",
    "image": null
  }
}
```

**Steps**:

1. Set up the route intercept with the empty payload above.
2. Call `mockLoggedIn(page)`.
3. Navigate to `/u/testuser/overlap/alice`.
4. Wait for `getByRole("heading", { level: 1 })` to be visible.

**Expected**:

- The title grid is not rendered (no `TitleCard` elements visible).
- The empty-state message is visible:
  `getByText(/don't have any titles in common yet/i)` matches the rendered i18n
  string (`"You and @alice don't have any titles in common yet. Try recommending
something!"`).
- A link `"View @alice's profile"` is visible and points to `/user/alice`.
- The "in common" stat badge shows `"0"`.

---

## TC-05: Clicking a shared title navigates to title detail

**Priority**: P1
**Backend**: Mock

**Why mock**: Navigation is a frontend routing concern. We only need the overlap
response so the grid renders; the destination page can be stubbed separately to
stay hermetic.

**Preconditions**:

- `mockLoggedIn(page)` is called.
- `GET **/api/overlap/alice` returns the TC-01 payload (includes `"Inception"` with
  `id = "tt1234567"`).
- `page.route()` intercepts `GET **/api/details/movie/tt1234567` and returns a
  minimal movie-detail payload (at minimum `{ "title": { ...MOCK_TITLE }, "tmdb": null, "country": "US" }`).

**Steps**:

1. Set up both route intercepts above.
2. Call `mockLoggedIn(page)`.
3. Navigate to `/u/testuser/overlap/alice`.
4. Wait for `getByText("Inception")` to be visible.
5. Click the `TitleCard` for `"Inception"` (the link wrapping the card, navigates
   to `/title/tt1234567`).
6. Wait for the URL to change to `/title/tt1234567`.

**Expected**:

- The browser navigates to `/title/tt1234567`.
- The title detail page renders (URL pathname is `/title/tt1234567`).

---

## TC-06: Filter — "Movies only" hides shows

**Priority**: P1
**Backend**: Mock

**Why mock**: Filtering is a pure client-side operation (`filterMode` state) on the
already-fetched `data.titles` array. Mocking the overlap response with mixed
`object_type` values is sufficient to exercise both filter branches.

**Preconditions**:

- `mockLoggedIn(page)` is called.
- `GET **/api/overlap/alice` returns the TC-01 payload (one `MOVIE`, one `SHOW`).

**Steps**:

1. Set up the route intercept as in TC-01.
2. Call `mockLoggedIn(page)`.
3. Navigate to `/u/testuser/overlap/alice`.
4. Wait for both `"Inception"` and `"Breaking Bad"` to be visible.
5. Click the `"Movies only"` filter button.

**Expected**:

- `getByText("Inception")` remains visible (it is a `MOVIE`).
- `getByText("Breaking Bad")` is no longer visible (it is a `SHOW`).
- The `"Movies only"` button has the active/amber style (`bg-amber-500` class or
  equivalent).

---

## TC-07: Shared streaming providers section visible when present

**Priority**: P1
**Backend**: Mock

**Why mock**: The "Both subscribed to" section renders only when
`sharedProviders.length > 0`. Providing providers in the mocked response directly
tests this branch.

**Preconditions**:

- `mockLoggedIn(page)` is called.
- `GET **/api/overlap/alice` returns the TC-01 payload but with `sharedProviders`
  populated:

```json
{
  "sharedProviders": [
    {
      "id": 8,
      "name": "Netflix",
      "technical_name": "nfx",
      "icon_url": "https://example.com/netflix.png"
    }
  ]
}
```

(All other fields identical to TC-01.)

**Steps**:

1. Set up the route intercept with the `sharedProviders` array above.
2. Call `mockLoggedIn(page)`.
3. Navigate to `/u/testuser/overlap/alice`.
4. Wait for `getByRole("heading", { level: 1 })` to be visible.

**Expected**:

- `getByText(/Both subscribed to/i)` section header is visible.
- `getByText("Netflix")` provider chip is visible.
- The shared-providers count stat badge shows `"1 shared streaming services"`.

---

## TC-08: Private watchlist — error state shown with back-to-profile link

**Priority**: P1
**Backend**: Mock

**Why mock**: The error branch triggers when the API returns an error message
containing `"private"` or `"mutual followers"`. Mocking a rejected response with
status 403 and matching body exercises the error render path without a real auth
stack.

**Preconditions**:

- `mockLoggedIn(page)` is called.
- `page.route()` intercepts `GET **/api/overlap/alice` and responds with HTTP 403:

```json
{ "error": "This user's watchlist is private." }
```

**Steps**:

1. Set up the 403 route intercept above
   (`route.fulfill({ status: 403, json: { error: "This user's watchlist is private." } })`).
2. Call `mockLoggedIn(page)`.
3. Navigate to `/u/testuser/overlap/alice`.
4. Wait for the error message to appear.

**Expected**:

- `getByText(/watchlist is private/i)` is visible.
- The title grid is not rendered.
- `getByRole("link", { name: /Back to profile/i })` is visible and points to
  `/user/alice`.
