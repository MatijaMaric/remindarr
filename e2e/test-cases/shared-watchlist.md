# Test cases: shared-watchlist

## Preconditions (shared)

- The Remindarr dev server is running (Bun on `:3000`, Vite proxy on `:5173`).
- The shared watchlist page is at `/share/watchlist/:token` — this is a **public** route
  with no `<RequireAuth>` wrapper. Authentication is not required to view it.
- The page fetches `GET /api/share/watchlist/:token`. The backend looks up the share token;
  if found it returns `{ username, titles[] }`; if not found it returns HTTP 404.
- All test cases use `page.route()` mocks unless explicitly marked **Real**.
- No session or auth mock is strictly required (the page is public), but apply
  `GET **/api/auth/get-session` → `null` and
  `GET **/api/auth/custom/providers` → `{ local: true, oidc: null }` to prevent spurious
  auth requests from the shell from erroring.

### Standard watchlist fixture

```json
{
  "username": "alice",
  "titles": [
    {
      "id": "tt1234567",
      "object_type": "MOVIE",
      "title": "Test Movie",
      "original_title": "Test Movie",
      "release_year": 2024,
      "release_date": "2024-01-15",
      "runtime_minutes": 120,
      "short_description": "A test movie",
      "genres": ["Action"],
      "imdb_id": "tt1234567",
      "tmdb_id": 12345,
      "poster_url": null,
      "age_certification": "PG-13",
      "original_language": "en",
      "tmdb_url": "https://www.themoviedb.org/movie/12345",
      "imdb_score": 7.5,
      "imdb_votes": 10000,
      "tmdb_score": 7.8,
      "is_tracked": false,
      "offers": []
    }
  ]
}
```

---

## TC-01: Page loads and shows the owner's titles

**Priority**: P0
**Backend**: Mock

**Why mock**: Verifies the complete initial render — heading with owner username, title count,
read-only subtitle, and the title grid — without a real user account or share token. A mock
response guarantees a stable fixture for assertion.

**Preconditions**:

- Auth shell mocks applied (`get-session` → `null`, `providers` → local only).
- `GET **/api/share/watchlist/valid-token-abc` → the standard watchlist fixture
  (`username: "alice"`, 1 title: `"Test Movie"`).

**Steps**:

1. Apply route mocks for the auth shell and the watchlist endpoint.
2. Navigate to `/share/watchlist/valid-token-abc`.
3. Wait for the `h1` heading to be visible.

**Expected**:

- The heading (level 1) reads `"1 title shared by"` and contains `"@alice"` in amber/yellow
  text.
- A subtitle reads `"Read-only view — sign in to track these titles"`.
- A title card for `"Test Movie"` is present in the grid (rendered as a `<Link>` to
  `/title/tt1234567`).
- The card shows the title text `"Test Movie"` and the year `"2024"`.
- A footer `"Powered by Remindarr"` link pointing to `/` is visible at the bottom.
- No error state (`"This link is invalid or has been revoked"`) is shown.

---

## TC-02: Page is accessible without authentication

**Priority**: P0
**Backend**: Mock

**Why mock**: Confirms that `/share/watchlist/:token` is not guarded by `RequireAuth`. An
unauthenticated visitor must reach the page without being redirected to `/login`.

**Preconditions**:

- `GET **/api/auth/get-session` → `null` (explicitly no session).
- `GET **/api/auth/custom/providers` → `{ local: true, oidc: null }`.
- `GET **/api/share/watchlist/public-token` → the standard watchlist fixture.

**Steps**:

1. Apply unauthenticated session mock (`get-session` → `null`).
2. Apply the watchlist mock.
3. Navigate to `/share/watchlist/public-token`.
4. Wait for the heading to appear.

**Expected**:

- The browser URL remains `/share/watchlist/public-token` — no redirect to `/login`.
- The heading with `"@alice"` is visible.
- The top navigation bar shows a `"Sign In"` link (unauthenticated state).

---

## TC-03: Invalid or revoked token shows the error state

**Priority**: P0
**Backend**: Mock

**Why mock**: Tests the error branch: when the API returns a non-OK response (404), the page
must show the link-invalid message instead of a title grid.

**Preconditions**:

- Auth shell mocks applied.
- `GET **/api/share/watchlist/bad-token` → HTTP 404 with body `{ "error": "Not found" }`.

**Steps**:

1. Apply route mocks (auth shell + the 404 response for the watchlist endpoint).
2. Navigate to `/share/watchlist/bad-token`.
3. Wait for the error heading to appear.

**Expected**:

- The heading reads `"This link is invalid or has been revoked"`.
- The sub-paragraph reads `"The watchlist you are looking for is no longer available."`.
- A link reading `"Go to Remindarr"` is present and points to `/`.
- No title grid or `"@username"` heading is shown.

---

## TC-04: Empty watchlist shows the empty-state message

**Priority**: P1
**Backend**: Mock

**Why mock**: Tests the zero-titles branch within a valid share link. The heading still
renders with the owner's name but the grid area shows the empty-state copy.

**Preconditions**:

- Auth shell mocks applied.
- `GET **/api/share/watchlist/empty-token` → HTTP 200:
  ```json
  { "username": "bob", "titles": [] }
  ```

**Steps**:

1. Apply route mocks.
2. Navigate to `/share/watchlist/empty-token`.
3. Wait for the heading.

**Expected**:

- The heading reads `"0 titles shared by"` with `"@bob"` in amber text.
- No title link cards are present in the page body.
- The empty-state paragraph `"This watchlist is empty"` is visible.
- The footer `"Powered by Remindarr"` is still present.

---

## TC-05: Clicking a title card navigates to the title detail page

**Priority**: P1
**Backend**: Mock

**Why mock**: Navigation is a frontend concern. The shared watchlist renders each title as a
`<Link to="/title/:id">`. We only need to verify the link href; no detail-page data needs
to load.

**Preconditions**:

- Auth shell mocks applied.
- `GET **/api/share/watchlist/nav-token` → the standard watchlist fixture (title id
  `"tt1234567"`, title `"Test Movie"`).
- `GET **/api/details/**` → left unrouted (we only assert URL change, not page render).

**Steps**:

1. Apply route mocks.
2. Navigate to `/share/watchlist/nav-token` and wait for the heading.
3. Wait for the title card link for `"Test Movie"` to be visible.
4. Click `getByRole("link", { name: "Test Movie" })`.
5. Wait for the URL to change.

**Expected**:

- The browser URL changes to `/title/tt1234567`.

---

## TC-06: Loading skeleton is shown while the API request is in flight

**Priority**: P2
**Backend**: Mock

**Why mock**: Verifies the loading state branch. By delaying the mock response we can assert
that the skeleton placeholder renders before the data arrives.

**Preconditions**:

- Auth shell mocks applied.
- `GET **/api/share/watchlist/slow-token` → the standard watchlist fixture, but the
  `page.route()` handler uses `await new Promise(r => setTimeout(r, 800))` before
  calling `route.fulfill(...)` to simulate a slow response.

**Steps**:

1. Apply route mocks with the artificial delay.
2. Navigate to `/share/watchlist/slow-token` (do NOT await the heading yet).
3. Immediately assert the loading state.
4. Then wait for the heading to appear.

**Expected**:

- While loading: an animated skeleton placeholder element is visible (from
  `TitleGridSkeleton`) and the heading is not yet present.
- After loading: the heading `"1 title shared by @alice"` appears and the skeleton is gone.
