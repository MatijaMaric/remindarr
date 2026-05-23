# Test cases: reels

## Preconditions (shared)

- The Remindarr dev server is running (Bun on `:3000`, Vite proxy on `:5173`).
- Unless stated otherwise, the browser has an active session courtesy of
  `mockLoggedIn(page)` (stubs `GET /api/auth/get-session` with `MOCK_SESSION`).
- The reels page is at `/reels`.
- All test cases use `page.route()` mocks unless explicitly marked **Real**.
- The page uses a full-viewport snap-scroll layout with no standard page header. The top
  navigation bar is hidden on mobile at `/reels` (`hidden sm:block` in `App.tsx`).
- Before navigating, mock the following base endpoints:
  - `GET **/api/auth/get-session` → `MOCK_SESSION` (via `mockLoggedIn(page)`)
  - `GET **/api/auth/custom/providers` → `{ local: true, oidc: null }`
  - `GET **/api/episodes/upcoming` → standard `upcomingEpisodesResponse` fixture (see
    below) — this is the default source (`coming-soon`)

### Standard `upcomingEpisodesResponse` fixture

Used by the default `coming-soon` source (`GET /api/episodes/upcoming`):

```json
{
  "today": [],
  "upcoming": [],
  "unwatched": [
    {
      "id": 101,
      "title_id": "tv-9876",
      "season_number": 1,
      "episode_number": 1,
      "name": "Pilot",
      "overview": "The first episode of the show.",
      "air_date": "2024-03-01",
      "still_path": null,
      "show_title": "Test Show",
      "poster_url": null,
      "is_watched": false,
      "offers": []
    }
  ]
}
```

### Standard `browseTitlesResponse` fixture (for `popular` source)

Used by the `popular` source (`GET /api/browse?category=popular`):

```json
{
  "titles": [
    {
      "id": "movie-12345",
      "objectType": "MOVIE",
      "title": "Popular Movie",
      "originalTitle": "Popular Movie",
      "releaseYear": 2024,
      "releaseDate": "2024-06-15",
      "runtimeMinutes": 120,
      "shortDescription": "A popular movie",
      "genres": ["Action"],
      "imdbId": "tt1234567",
      "tmdbId": 12345,
      "posterUrl": null,
      "ageCertification": "PG-13",
      "originalLanguage": "en",
      "tmdbUrl": "https://www.themoviedb.org/movie/12345",
      "offers": [],
      "scores": { "imdbScore": 7.5, "imdbVotes": 10000, "tmdbScore": 7.8 },
      "isTracked": false
    }
  ],
  "page": 1,
  "totalPages": 1,
  "totalResults": 1
}
```

---

## TC-01: Reels page loads with source picker and first card visible

**Priority**: P0
**Backend**: Mock

**Why mock**: Verifies the full initial render — the Feed/Reels mode switcher, all source
chip buttons, and the first `ReelsCard` — without touching the real episode or browse APIs.
Mocking guarantees a stable card list for assertion.

**Preconditions**:

- `mockLoggedIn(page)` stubs the session.
- `GET **/api/episodes/upcoming` → standard `upcomingEpisodesResponse` fixture (1 unwatched
  episode: `"Test Show"` S01E01 `"Pilot"`).

**Steps**:

1. Apply all route mocks.
2. Navigate to `/reels`.
3. Wait for the source picker overlay to appear (look for
   `getByRole("button", { name: "Coming Soon" })`).

**Expected**:

- The `"Reels"` mode label (a non-interactive `<span>`) is visible in the top overlay.
- A `"Feed"` link (pointing to `/`) is visible adjacent to the `"Reels"` label.
- All five source chip buttons are visible: `"Coming Soon"`, `"Popular"`,
  `"From My Genres"`, `"Friends Loved"`, `"Movies"`.
- The `"Coming Soon"` chip is visually active (amber background, as opposed to the
  translucent style of inactive chips).
- At least one `ReelsCard` is visible for `"Test Show"` — the card shows the show title
  `"Test Show"` rendered inside the full-viewport card area.
- A `"Mark as Watched"` button (or equivalent action button rendered by `ReelsCard`) is
  visible on the first card.

---

## TC-02: Unauthenticated user is redirected to /login

**Priority**: P0
**Backend**: Mock

**Why mock**: The `/reels` route is wrapped in `<RequireAuth>` in `App.tsx`. Returning
`null` from `GET /api/auth/get-session` is sufficient to trigger the redirect — no real
auth stack needed.

**Preconditions**:

- `mockLoggedOut(page)` stubs `GET /api/auth/get-session` → `null` and provides mock
  providers.

**Steps**:

1. Call `mockLoggedOut(page)`.
2. Navigate to `/reels`.
3. Wait for the URL to change away from `/reels`.

**Expected**:

- The browser is redirected to `/login` (URL pathname is `/login`).
- The login form is visible (`getByRole("button", { name: /sign in/i })` is present).
- The Reels page content is never rendered (no `"Reels"` label or source chip buttons
  visible).

---

## TC-03: Switching source to "Popular" loads browse titles

**Priority**: P1
**Backend**: Mock

**Why mock**: Switching the source chip updates the `?source=popular` query param, which
causes `ReelsPage` to call `api.browseTitles({ category: "popular" })`. Mocking that
endpoint lets us assert the URL param change and the resulting card content.

**Preconditions**:

- `mockLoggedIn(page)` stubs the session.
- `GET **/api/episodes/upcoming` → standard `upcomingEpisodesResponse` fixture (default
  source — needed to render initial state before switching).
- `GET **/api/browse?*category=popular*` → standard `browseTitlesResponse` fixture (1
  card: `"Popular Movie"`).

**Steps**:

1. Apply all route mocks.
2. Navigate to `/reels`.
3. Wait for `getByRole("button", { name: "Coming Soon" })` to be visible.
4. Click `getByRole("button", { name: "Popular" })`.
5. Wait for the `"Popular"` chip to become active (amber background).
6. Wait for the cards to update.

**Expected**:

- The URL query string changes to `?source=popular` (or includes `source=popular`).
- The `"Popular"` chip is now visually active (amber background).
- `"Coming Soon"` chip is no longer active.
- A `ReelsCard` showing `"Popular Movie"` is visible.
- The `GET /api/browse?category=popular` request was made (assert via `page.waitForRequest`
  if needed).

---

## TC-04: Empty state — no unwatched episodes

**Priority**: P1
**Backend**: Mock

**Why mock**: When `cards.length === 0` and `friendsLovedEmpty` is false, `ReelsPage`
renders a dedicated empty-state screen (not the full Reels chrome). Returning an empty
`unwatched` array exercises this branch without seeding a database.

**Preconditions**:

- `mockLoggedIn(page)` stubs the session.
- `GET **/api/episodes/upcoming` → `{ "today": [], "upcoming": [], "unwatched": [] }`.

**Steps**:

1. Apply all route mocks.
2. Navigate to `/reels`.
3. Wait for the empty-state message to appear.

**Expected**:

- `getByText("No unwatched episodes")` is visible.
- `getByText("You're all caught up!")` is visible.
- A `"View Upcoming"` link (pointing to `/upcoming`) is visible.
- The full-viewport snap-scroll container with `ReelsCard` elements is absent.
- The source picker overlay is still rendered above the empty state (all five source chips
  are visible).

---

## TC-05: "Friends Loved" empty state — no friends yet

**Priority**: P1
**Backend**: Mock

**Why mock**: When `source === "friends-loved"` and `friendsLovedEmpty` is true (the
`fetchFriendsLoved` call returns an empty titles array), a distinct empty state renders
inside the full Reels chrome. Mocking avoids needing real follow relationships.

**Preconditions**:

- `mockLoggedIn(page)` stubs the session.
- `GET **/api/episodes/upcoming` → standard `upcomingEpisodesResponse` fixture (for
  initial default source render).
- `GET **/api/social/friends-loved**` → `{ "titles": [] }`.

**Steps**:

1. Apply all route mocks.
2. Navigate to `/reels`.
3. Wait for `getByRole("button", { name: "Coming Soon" })` to be visible.
4. Click `getByRole("button", { name: "Friends Loved" })`.
5. Wait for the friends-loved empty state to appear.

**Expected**:

- `getByText("Nothing here yet")` is visible.
- `getByText(/Follow some friends to see what they love this week/)` is visible.
- A `"Find people to follow"` link (pointing to `/discover`) is visible.
- The source picker overlay (Feed/Reels toggle + source chips) is still rendered above
  the empty state.
- No snap-scroll `ReelsCard` elements are rendered.

---

## TC-06: Top nav bar is hidden on the reels page

**Priority**: P1
**Backend**: Mock

**Why mock**: The layout behaviour (hiding the top nav on `/reels`) is a CSS class
condition in `App.tsx` (`hidden sm:block` applied to `<nav>` when `isReelsPage` is true).
No real data is needed to verify this presentational rule.

**Preconditions**:

- `mockLoggedIn(page)` stubs the session.
- `GET **/api/episodes/upcoming` → standard `upcomingEpisodesResponse` fixture.
- Viewport set to a mobile size (e.g. 390×844) to trigger `hidden` (the nav is
  `hidden sm:block` on reels, meaning it is fully hidden below `sm` breakpoint).

**Steps**:

1. Set viewport to `{ width: 390, height: 844 }`.
2. Apply all route mocks.
3. Navigate to `/reels`.
4. Wait for `getByRole("button", { name: "Coming Soon" })` to be visible.

**Expected**:

- `getByRole("navigation", { name: "Main navigation" })` is not visible in the viewport
  (it is either hidden by CSS or off-screen on mobile).
- The `"Remindarr"` logo link from the top nav is not visible.
- The Reels source picker overlay is visible at the top of the viewport (rendered as a
  fixed overlay, independent of the nav).

---

## TC-07: Marking an episode as watched shows undo bar

**Priority**: P1
**Backend**: Mock

**Why mock**: The undo bar (`ReelsUndoBar`) and optimistic state update are pure frontend
concerns. Mocking the watch endpoint lets us assert the UI change without a real database
write.

**Preconditions**:

- `mockLoggedIn(page)` stubs the session.
- `GET **/api/episodes/upcoming` → standard `upcomingEpisodesResponse` fixture (1 card:
  `"Test Show"` S01E01 id `101`).
- `POST **/api/watched/101` → HTTP 200 (fulfil with status 200, empty body or `{}`).

**Steps**:

1. Apply all route mocks.
2. Navigate to `/reels`.
3. Wait for the first `ReelsCard` for `"Test Show"` to be visible.
4. Click the `"Mark as Watched"` button (or equivalent action button on the card).
5. Wait for the undo bar to appear.

**Expected**:

- An undo bar is visible containing an episode code label (e.g. `"S01E01"`).
- An `"Undo"` button is visible in the undo bar.
- Rating buttons (`loved` / `liked` or equivalent) are visible alongside the undo bar.
- The card transitions to a `"caught up"` state (the `ReelsCard` shows a caught-up
  indicator or the episode progresses to the next one).
- The undo bar auto-dismisses after ~5 seconds if no action is taken (timer-based; test
  may skip this assertion or use a short wait).
