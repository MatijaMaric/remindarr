# Test cases: browse

## Preconditions (shared)

- The Remindarr dev server is running (Bun on `:3000`, Vite proxy on `:5173`).
- Unless stated otherwise, the browser is unauthenticated (no active session cookie).
- The browse page is at `/browse`.
- All test cases use `page.route()` mocks unless explicitly marked **Real**.
- Before navigating, mock the following base endpoints so the page renders without hitting
  the real backend:
  - `GET **/api/auth/get-session` → `null` (logged-out)
  - `GET **/api/auth/custom/providers` → `{ local: true, oidc: null }`
  - `GET **/api/titles/genres` → `{ genres: ["Action", "Drama", "Comedy"] }`
  - `GET **/api/titles/providers` → `{ providers: [{ id: 8, name: "Netflix", technical_name: "netflix", icon_url: "" }], regionProviderIds: [8] }`
  - `GET **/api/titles/languages` → `{ languages: ["en", "es"], priorityLanguageCodes: ["en"] }`
  - `GET **/api/titles/languages` (also used by the advanced search language dropdown)
  - `GET **/api/browse**` → a standard `browseTitlesResponse` fixture (see below)

### Standard `browseTitlesResponse` fixture

```json
{
  "titles": [
    {
      "id": "movie-12345",
      "objectType": "MOVIE",
      "title": "Test Movie",
      "originalTitle": "Test Movie",
      "releaseYear": 2024,
      "releaseDate": "2024-06-15",
      "runtimeMinutes": 120,
      "shortDescription": "A test movie",
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

## TC-01: Browse page loads with category tabs, filter bar, and title cards visible

**Priority**: P0
**Backend**: Mock

**Why mock**: Verifies the complete initial render — page header, category tabs, filter
dropdowns, and title grid — without touching the real TMDB-backed browse endpoint. A mock
response guarantees a stable title list for assertion.

**Preconditions**:

- All shared mocks applied (see shared preconditions above).
- `GET **/api/browse**` returns the standard `browseTitlesResponse` fixture (1 title:
  `"Test Movie"`).

**Steps**:

1. Apply all shared route mocks.
2. Navigate to `/browse`.
3. Wait for `getByRole("heading", { name: "Browse" })` to be visible.

**Expected**:

- Heading `"Browse"` (level 1) is visible.
- The kicker text above the heading contains `"Catalog"` and a title count (e.g.
  `"Catalog · 1 titles"`).
- A search bar with placeholder `"Search titles or paste IMDB link..."` is present.
- The category bar shows four buttons: `"Popular"`, `"Upcoming"`, `"Top Rated"`,
  `"Now Playing"`. The `"Popular"` button is active by default.
- The filter card shows four dropdown buttons: `"All genres"`, `"All providers"`,
  `"Any year"`, `"Any rating"`.
- The content-type group (role `group`, `aria-label="Content type"`) shows three
  buttons: `"All"` (pressed), `"Movies"`, `"Shows"`.
- `getByRole("article", { name: "Test Movie" })` is visible in the title grid.
- `getByRole("heading", { name: "Popular", level: 2 })` is visible above the title grid.

---

## TC-02: Genre filter — selecting a genre re-queries the API and updates results

**Priority**: P0
**Backend**: Mock

**Why mock**: Verifies that picking a genre adds a `genre=Action` query param to the
`/api/browse` request and that the updated results render correctly. Mocking lets us assert
the exact URL sent to the backend.

**Preconditions**:

- All shared mocks applied.
- Initial `GET **/api/browse**` (no genre param) returns the standard `browseTitlesResponse`
  fixture.
- A second `page.route()` intercepts `GET **/api/browse?*genre=Action*` and returns a
  fixture with one title: `"Action Movie"` (genre `["Action"]`).

**Steps**:

1. Apply all shared route mocks including the genre-specific intercept.
2. Navigate to `/browse` and wait for `getByRole("heading", { name: "Browse" })`.
3. Click `getByRole("button", { name: /All genres/i })` to open the Genre dropdown.
4. Wait for the genre checklist to appear.
5. Click the checkbox labelled `"Action"` inside the genre dropdown.
6. Wait for the title grid to update.

**Expected**:

- The `GET /api/browse` request includes `genre=Action` in the query string.
- The Genre dropdown button now shows `"Action"` as its summary (not `"All genres"`).
- An active filter chip with the text `"Action ×"` appears in the active-filters row.
- `getByRole("article", { name: "Action Movie" })` is visible in the title grid.
- `getByRole("article", { name: "Test Movie" })` is no longer visible (replaced by the
  genre-filtered result).

---

## TC-03: Provider filter — selecting a provider updates results

**Priority**: P0
**Backend**: Mock

**Why mock**: Same reasoning as TC-02 — validates that the provider param is forwarded to
the API and the results re-render.

**Preconditions**:

- All shared mocks applied.
- Initial `GET **/api/browse**` (no provider param) returns the standard
  `browseTitlesResponse`.
- A second route intercept matches `GET **/api/browse?*provider=8*` and returns a fixture
  with one title: `"Netflix Movie"` whose `offers` array includes a Netflix offer.

**Steps**:

1. Apply all shared route mocks including the provider-specific intercept.
2. Navigate to `/browse` and wait for `getByRole("heading", { name: "Browse" })`.
3. Click `getByRole("button", { name: /All providers/i })` to open the Provider dropdown.
4. Wait for the provider checklist to appear.
5. Click the checkbox labelled `"Netflix"` inside the provider dropdown.
6. Wait for the title grid to update.

**Expected**:

- The `GET /api/browse` request includes `provider=8` (or `provider=netflix`) in the query
  string.
- The Provider dropdown button summary changes from `"All providers"` to `"Netflix"`.
- An active filter chip with the text `"Netflix ×"` appears.
- `getByRole("article", { name: "Netflix Movie" })` is visible.

---

## TC-04: Empty results — no titles match filters

**Priority**: P1
**Backend**: Mock

**Why mock**: Tests the empty-state UI branch; we force zero results by returning an empty
`titles` array from the browse endpoint.

**Preconditions**:

- All shared mocks applied.
- `GET **/api/browse**` returns:
  ```json
  { "titles": [], "page": 1, "totalPages": 0, "totalResults": 0 }
  ```

**Steps**:

1. Apply all shared route mocks with the empty-results response.
2. Navigate to `/browse`.
3. Wait for `getByRole("heading", { name: "Browse" })`.
4. Wait for the title grid area to settle (no loading spinner).

**Expected**:

- No `<article>` elements are present in the title grid.
- The empty-state message `"No titles found."` is visible (rendered by `TitleList`).
- The filter bar is still rendered (category tabs and filter dropdowns remain visible).
- No error banner is shown.

---

## TC-05: Unauthenticated user can access /browse (public page)

**Priority**: P0
**Backend**: Mock

**Why mock**: Confirms that `/browse` is not guarded by `RequireAuth` — an unauthenticated
visitor must reach the page without being redirected to `/login`. The route in `App.tsx`
confirms this: `/browse` has no `<RequireAuth>` wrapper.

**Preconditions**:

- `GET **/api/auth/get-session` → `null` (explicitly no session).
- `GET **/api/auth/custom/providers` → `{ local: true, oidc: null }`.
- `GET **/api/titles/genres` → `{ genres: [] }`.
- `GET **/api/titles/providers` → `{ providers: [], regionProviderIds: [] }`.
- `GET **/api/titles/languages` → `{ languages: [], priorityLanguageCodes: [] }`.
- `GET **/api/browse**` → standard `browseTitlesResponse` fixture.

**Steps**:

1. Apply unauthenticated session mock (`get-session` → `null`).
2. Apply remaining mocks listed above.
3. Navigate to `/browse`.
4. Wait for `getByRole("heading", { name: "Browse" })`.

**Expected**:

- The browser URL remains `/browse` — no redirect to `/login` occurs.
- `getByRole("heading", { name: "Browse" })` is visible.
- The top navigation bar shows a `"Sign In"` link (not a user avatar or logout button),
  confirming the unauthenticated state is correctly reflected.
- The title grid renders the mocked title.

> **Note**: The `"On my services"` toggle chip does **not** appear for unauthenticated
> users (it requires `subscriptions.providerIds.length > 0` from the auth context).

---

## TC-06: Clicking a title navigates to the title detail page

**Priority**: P0
**Backend**: Mock

**Why mock**: Navigation is a frontend concern. We only need to verify that the `<Link>`
element on each title card routes to `/title/<id>`. No detail-page data needs to load.

**Preconditions**:

- All shared mocks applied.
- `GET **/api/browse**` returns the standard `browseTitlesResponse` (title id
  `"movie-12345"`, title `"Test Movie"`).
- `GET **/api/details/**` → any minimal valid response (or left unrouted — we only
  assert URL change, not detail-page render).

**Steps**:

1. Apply all shared route mocks.
2. Navigate to `/browse` and wait for `getByRole("heading", { name: "Browse" })`.
3. Wait for `getByRole("article", { name: "Test Movie" })` to be visible.
4. Click the `getByRole("link", { name: "Test Movie" })` inside that article (the poster
   or title heading link — both point to the same URL).
5. Wait for the URL to change.

**Expected**:

- The browser URL changes to `/title/movie-12345`.
- The page no longer shows the browse heading or the category tab bar.

> **Implementation note**: Each `TitleCard` renders two `<Link to="/title/${title.id}">`
> elements — one wrapping the poster image and one wrapping the heading. Either is a valid
> click target. Prefer `getByRole("link", { name: "Test Movie" })` which matches both; if
> Playwright finds multiple, scope to the article: `getByRole("article", { name: "Test Movie"
}).getByRole("link", { name: "Test Movie" }).first()`.
