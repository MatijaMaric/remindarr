# Test cases: watched-ratings

## Preconditions (shared)

- The Remindarr dev server is running (Bun on `:3000`, Vite proxy on `:5173`).
- The tracked page is at `/tracked` and is protected by `<RequireAuth>`.
- All test cases use `page.route()` mocks unless explicitly marked **Real**.
- Before navigating, mock the following base endpoints so the page renders without hitting
  the real backend:
  - `GET **/api/auth/get-session` → `MOCK_SESSION` (logged-in, see `e2e/helpers.ts`)
  - `GET **/api/auth/custom/providers` → `{ local: true, oidc: null }`
  - `GET **/api/titles**` → a standard `trackedTitlesResponse` fixture (see below)

### Standard `trackedTitlesResponse` fixture

```json
{
  "titles": [
    {
      "id": "tt9876543",
      "object_type": "SHOW",
      "title": "Test Show",
      "original_title": "Test Show",
      "release_year": 2023,
      "release_date": "2023-03-01",
      "runtime_minutes": 45,
      "short_description": "A test show description",
      "genres": ["Drama"],
      "imdb_id": "tt9876543",
      "tmdb_id": 98765,
      "poster_url": null,
      "age_certification": "TV-MA",
      "original_language": "en",
      "tmdb_url": "https://www.themoviedb.org/tv/98765",
      "imdb_score": 8.2,
      "tmdb_score": 8.5,
      "is_tracked": true,
      "tracked_at": "2024-01-10T00:00:00Z",
      "offers": [],
      "user_status": "watching",
      "show_status": "watching",
      "watched_episodes_count": 5,
      "total_episodes": 8,
      "released_episodes_count": 8,
      "next_episode_air_date": null,
      "latest_released_air_date": "2023-05-01"
    }
  ],
  "count": 1
}
```

> **Note**: `TrackedPage` calls `GET /api/titles` via `api.getTrackedTitles()`, which hits
> the `/api/titles` endpoint. The helper `mockTitleEndpoints(page, titles)` from
> `e2e/helpers.ts` stubs this endpoint and also stubs the `/api/titles/providers`,
> `/api/titles/genres`, and `/api/titles/languages` sub-routes. Register sub-route mocks
> **after** the general `**/api/titles**` mock so Playwright's reverse-registration order
> gives them higher precedence.

---

## TC-01: Tracked page loads and shows tracked titles in list view

**Priority**: P0
**Backend**: Mock

**Why mock**: Verifies the complete initial render — page header, stats band, status tabs,
sort dropdown, and the title list — without touching the real titles DB. A mock response
guarantees a stable title list for assertion.

**Preconditions**:

- All shared mocks applied.
- `GET **/api/titles**` returns the standard `trackedTitlesResponse` fixture (1 title:
  `"Test Show"`, status `"watching"`, 5/8 episodes watched, IMDB score 8.2).

**Steps**:

1. Apply all shared route mocks.
2. Navigate to `/tracked`.
3. Wait for `getByRole("heading", { name: "Tracked" })` to be visible.

**Expected**:

- Heading `"Tracked"` (level 1) is visible.
- The kicker text above the heading contains `"Your library · 1 title"`.
- The stats band is visible with four stat cards: `"Currently watching"`, `"Completed"`,
  `"Avg score"`, and `"Total tracked"`.
- Status tabs are visible: `"All"`, `"Watching"`, `"Completed"`, `"On Hold"`, `"Planning"`,
  `"Dropped"`. The `"All"` tab is selected by default.
- The sort dropdown shows `"sort: last aired"` by default.
- A row for `"Test Show"` is visible in the list.

---

## TC-02: Tracked page — auth required (unauthenticated redirect)

**Priority**: P0
**Backend**: Mock

**Why mock**: Confirms that `/tracked` is protected by `<RequireAuth>`. An unauthenticated
visitor must be redirected, not shown any tracked title data.

**Preconditions**:

- `GET **/api/auth/get-session` → `null` (no session).
- `GET **/api/auth/custom/providers` → `{ local: true, oidc: null }`.

**Steps**:

1. Apply the logged-out session mock.
2. Apply the providers mock.
3. Navigate to `/tracked`.
4. Wait for the URL to settle.

**Expected**:

- The browser URL changes away from `/tracked` (redirect to `/login` or `/`).
- The `"Tracked"` heading is **not** visible.
- No title row content is rendered.

---

## TC-03: Rating is displayed for a title with an IMDB score

**Priority**: P1
**Backend**: Mock

**Why mock**: Tests that the list view renders the `★ score` badge correctly when a title
has a non-null `imdb_score`. The score column is rendered in the desktop `TrackedTable`
component.

**Preconditions**:

- All shared mocks applied.
- `GET **/api/titles**` returns the standard `trackedTitlesResponse` fixture (title
  `"Test Show"`, `imdb_score: 8.2`).
- The test must run at a viewport width that triggers the desktop table layout (≥ `sm`
  breakpoint — use `page.setViewportSize({ width: 1280, height: 800 })`).

**Steps**:

1. Set viewport to 1280×800.
2. Apply all shared route mocks.
3. Navigate to `/tracked`.
4. Wait for `getByRole("heading", { name: "Tracked" })`.
5. Wait for the title row for `"Test Show"` to be visible.

**Expected**:

- Within the `"Test Show"` row, the Rating column contains the text `"★ 8.2"` (formatted
  as `★ ${score.toFixed(1)}`).
- The rating text is rendered in an amber colour (confirming the conditional style
  `color: #fbbf24` is applied when `score` is truthy).

---

## TC-04: Empty state — no tracked titles

**Priority**: P1
**Backend**: Mock

**Why mock**: Tests the empty-state message (`t("tracked.empty")`) that `TitleList` renders
when `filteredTitles.length === 0`.

**Preconditions**:

- All shared mocks applied.
- `GET **/api/titles**` returns:
  ```json
  { "titles": [], "count": 0 }
  ```

**Steps**:

1. Apply all shared route mocks with the empty response.
2. Navigate to `/tracked`.
3. Wait for `getByRole("heading", { name: "Tracked" })`.
4. Wait for the list area to settle (no loading skeleton).

**Expected**:

- No title rows are visible in the list.
- The kicker text contains `"Your library · 0 titles"`.
- An empty-state message is visible (sourced from i18n key `tracked.empty`; by default
  something like `"No titles tracked yet"` or similar).
- The stats band is still rendered (all four stat cards show `0` or `—`).
- No error banner is shown.

---

## TC-05: Clicking a title in the list navigates to the title detail page

**Priority**: P1
**Backend**: Mock

**Why mock**: Navigation is a frontend concern. We only need to verify that the `<Link>`
element in each row routes to `/title/<id>`. No detail-page data needs to load.

**Preconditions**:

- All shared mocks applied.
- `GET **/api/titles**` returns the standard `trackedTitlesResponse` (title id `"tt9876543"`,
  title `"Test Show"`).
- The test runs at desktop viewport (≥ 1280px wide) so the `TrackedTable` renders with
  clickable title links.

**Steps**:

1. Set viewport to 1280×800.
2. Apply all shared route mocks.
3. Navigate to `/tracked` and wait for `getByRole("heading", { name: "Tracked" })`.
4. Wait for the `"Test Show"` row to be visible.
5. Click `getByRole("link", { name: "Test Show" })` within the table.
6. Wait for the URL to change.

**Expected**:

- The browser URL changes to `/title/tt9876543`.
- The `"Tracked"` heading and title table are no longer visible.

> **Implementation note**: In desktop list view, `TrackedTable` renders
> `<Link to="/title/${title.id}">` wrapping the title text. In select mode this is replaced
> by a plain `<span>` — ensure select mode is NOT active (it is off by default). The mobile
> card layout also renders a `<Link>` via the `to` prop on the wrapping element.
