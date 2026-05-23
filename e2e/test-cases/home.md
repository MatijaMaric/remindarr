# Test cases: home

## Preconditions (shared)

- The Remindarr dev server is running (Bun on `:3000`, Vite dev server on `:5173`, Vite proxies `/api` to `:3000`).
- The home page is served at `/` (`HomeRoute` renders `HomePage` for desktop, redirects to `/reels` for authenticated mobile users).
- Unless stated otherwise, all API calls are mocked via `page.route()`.

---

## TC-01: Authenticated user sees the home page

**Priority**: P0
**Backend**: Mock

**Why mock**: Verifies that an authenticated session causes `HomePage` to render its
content area rather than the unauthenticated landing hero. A mock is sufficient — no
real DB state is needed to confirm the session-gated branch renders.

**Preconditions**:

- `mockLoggedIn(page)` stubs `/api/auth/get-session` with a valid session.
- `page.route()` stubs all auth-home data endpoints with empty-but-valid responses:
  - `GET **/api/episodes/upcoming` → `{ today: [], upcoming: [], unwatched: [] }`
  - `GET **/api/recommendations**` → `{ recommendations: [], count: 0 }`
  - `GET **/api/homepage-layout**` → omit or return the default layout
  - `GET **/api/up-next**` → `{ items: [] }`
  - `GET **/api/friends-loved**` → `{ items: [] }`
  - `GET **/api/streak**` → `null`
  - `GET **/api/movies/tracking**` → `{ to_watch: [], upcoming: [] }`
- Viewport is set to desktop width (≥ 640 px) to avoid the mobile redirect to `/reels`.

**Steps**:

1. Call `mockLoggedIn(page)` and set up all data stubs listed in preconditions.
2. Navigate to `/`.
3. Wait for the page to finish loading (skeleton disappears).

**Expected**:

- The page title is `Remindarr`.
- The unauthenticated hero heading ("Track movies & TV shows you love") is **not** visible.
- The main content area (`<main>`) is present and visible.
- The top navigation shows a "Home" link (`getByRole("link", { name: /home/i })`).
- No error banner is shown.

---

## TC-02: Home page shows tracked titles list (upcoming episodes)

**Priority**: P0
**Backend**: Mock

**Why mock**: Validates that episode data returned from `/api/episodes/upcoming` is
rendered on screen. Mocking the endpoint makes the test deterministic and fast.

**Preconditions**:

- `mockLoggedIn(page)` called.
- `GET **/api/episodes/upcoming` returns `MOCK_EPISODE` (from `e2e/helpers.ts`) in the
  `today` array: `{ today: [MOCK_EPISODE], upcoming: [], unwatched: [] }`.
- All other home data endpoints return empty/null responses (same stubs as TC-01).
- Viewport is desktop width (≥ 640 px).

**Steps**:

1. Set up mocks as described in preconditions.
2. Navigate to `/`.
3. Wait for the main content area to appear.
4. Locate the "Airing tonight" section heading.

**Expected**:

- `getByRole("heading", { name: /today/i })` (or the translated equivalent) is visible.
- The show title `"Test Show"` (from `MOCK_EPISODE.show_title`) is visible on screen.
- Episode information `"S01·E01"` is rendered within the episode card.

---

## TC-03: Home page shows upcoming episodes section

**Priority**: P1
**Backend**: Mock

**Why mock**: Confirms that `upcoming` episodes (air date in the future) are rendered in
the "Coming Up" / "This week" section. Stubbing the endpoint keeps the air dates stable.

**Preconditions**:

- `mockLoggedIn(page)` called.
- `GET **/api/episodes/upcoming` returns `MOCK_UPCOMING_EPISODE` (from `e2e/helpers.ts`)
  in the `upcoming` array:
  `{ today: [], upcoming: [MOCK_UPCOMING_EPISODE], unwatched: [] }`.
- All other home data endpoints return empty/null responses.
- Viewport is desktop width (≥ 640 px).

**Steps**:

1. Set up mocks as described in preconditions.
2. Navigate to `/`.
3. Wait for the main content area to appear.
4. Locate the upcoming-episodes section heading.

**Expected**:

- A heading matching "Coming Up" or "Airing Soon" (translated equivalent) is visible,
  **or** a "This week" section heading is present.
- The show title `"Test Show"` (from `MOCK_UPCOMING_EPISODE.show_title`) appears within
  the upcoming section.
- The episode label `"S01·E02"` is rendered in the card.

---

## TC-04: Empty state — no tracked titles

**Priority**: P1
**Backend**: Mock

**Why mock**: Confirms the empty-state message is shown when all episode lists are empty.
A real account with no tracked titles would also work, but mocking is faster and avoids
DB setup.

**Preconditions**:

- `mockLoggedIn(page)` called.
- `GET **/api/episodes/upcoming` returns `{ today: [], upcoming: [], unwatched: [] }`.
- All other home data endpoints return empty/null responses.
- Viewport is desktop width (≥ 640 px).

**Steps**:

1. Set up mocks as described in preconditions.
2. Navigate to `/`.
3. Wait for the main content area to appear.

**Expected**:

- The "Today" section (kicker "Airing tonight") is present in the layout.
- Within that section, the empty-state text is shown — `getByText(/no episodes/i)` or
  the translated equivalent (e.g. "No episodes today").
- No episode cards are rendered.
- No JavaScript error is thrown (error banner absent).

---

## TC-05: Unauthenticated user sees the landing page (not redirected)

**Priority**: P0
**Backend**: Mock

**Why mock**: The unauthenticated branch of `HomePage` is a pure frontend render that
depends only on the session state. `mockLoggedOut(page)` stubs the session endpoint to
return `null`; no real auth state is required.

**Preconditions**:

- `mockLoggedOut(page)` called (stubs `GET /api/auth/get-session` → `null`).
- `GET **/api/browse**` returns a list containing at least one title (e.g. `MOCK_SEARCH_TITLE`
  from `e2e/helpers.ts`) so the "Popular Right Now" grid has content.

**Steps**:

1. Call `mockLoggedOut(page)` and stub the browse endpoint.
2. Navigate to `/`.
3. Wait for the main content area to render.

**Expected**:

- The hero heading `getByRole("heading", { name: /track movies.*tv shows/i })` is visible.
- A `getByRole("link", { name: /sign in/i })` link pointing to `/login` is present.
- A `getByRole("link", { name: /create account/i })` link pointing to `/signup` is present.
- The "Popular Right Now" section heading is visible.
- The URL remains `/` (no redirect occurs).

---

## TC-06: Navigation — home is accessible from the nav bar

**Priority**: P1
**Backend**: Mock

**Why mock**: This test exercises the shell navigation only. Session state controls which
nav links are rendered; mocking the session is sufficient.

**Preconditions**:

- `mockLoggedIn(page)` called.
- All home data endpoints return empty responses (same stubs as TC-01).
- Viewport is desktop width (≥ 640 px).

**Steps**:

1. Set up mocks as described in preconditions.
2. Navigate to `/browse` (a page other than home).
3. Locate the "Home" nav link: `getByRole("navigation", { name: /main navigation/i })`
   → `getByRole("link", { name: /home/i })`.
4. Click the "Home" link.
5. Wait for navigation to complete.

**Expected**:

- The URL changes to `/`.
- The main content area is visible (authenticated home layout, not the landing hero).
- The "Home" nav link has an active/current style (aria-current or highlighted).
