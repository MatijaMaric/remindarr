# Test cases: discovery

## Preconditions (shared)

- The Remindarr dev server is running (Bun on `:3000`, Vite proxy on `:5173`).
- Unless stated otherwise, the browser has an active session courtesy of
  `mockLoggedIn(page)` (stubs `GET /api/auth/get-session` with `MOCK_SESSION`).
- The discovery page is at `/discovery`.
- All test cases use `page.route()` mocks unless explicitly marked **Real**.
- Before navigating, mock the following base endpoints so the page renders without
  hitting the real backend:
  - `GET **/api/auth/get-session` → `MOCK_SESSION` (logged-in) via `mockLoggedIn(page)`
  - `GET **/api/auth/custom/providers` → `{ local: true, oidc: null }`
  - `GET **/api/recommendations**` → standard `recommendationsResponse` fixture (see below)
  - `GET **/api/recommendations/count` → `{ count: 0 }`
  - `GET **/api/suggestions**` → standard `suggestionsAggregateResponse` fixture (see below)

### Standard `recommendationsResponse` fixture

```json
{
  "recommendations": [
    {
      "id": "rec-1",
      "title": {
        "id": "movie-99001",
        "title": "Friend Rec Movie",
        "object_type": "MOVIE",
        "poster_url": null
      },
      "from_user": {
        "username": "alice",
        "display_name": "Alice",
        "image": null
      },
      "message": "You will love this!",
      "is_targeted": false,
      "read_at": null,
      "created_at": "2025-05-20T10:00:00Z"
    }
  ]
}
```

### Standard `suggestionsAggregateResponse` fixture

```json
{
  "flat": [
    {
      "id": "movie-42001",
      "objectType": "MOVIE",
      "title": "Suggested Movie",
      "originalTitle": "Suggested Movie",
      "releaseYear": 2024,
      "releaseDate": "2024-08-10",
      "runtimeMinutes": 110,
      "shortDescription": "A suggested pick",
      "genres": ["Drama", "Thriller"],
      "imdbId": "tt4200100",
      "tmdbId": 42001,
      "posterUrl": null,
      "ageCertification": "R",
      "originalLanguage": "en",
      "tmdbUrl": "https://www.themoviedb.org/movie/42001",
      "offers": [],
      "scores": { "imdbScore": 7.2, "imdbVotes": 8000, "tmdbScore": 7.5 },
      "isTracked": false,
      "matchScore": 92
    },
    {
      "id": "movie-42002",
      "objectType": "MOVIE",
      "title": "More For You Movie",
      "originalTitle": "More For You Movie",
      "releaseYear": 2023,
      "releaseDate": "2023-11-01",
      "runtimeMinutes": 95,
      "shortDescription": "Another pick",
      "genres": ["Action"],
      "imdbId": "tt4200200",
      "tmdbId": 42002,
      "posterUrl": null,
      "ageCertification": "PG-13",
      "originalLanguage": "en",
      "tmdbUrl": "https://www.themoviedb.org/movie/42002",
      "offers": [],
      "scores": { "imdbScore": 6.8, "imdbVotes": 5000, "tmdbScore": 7.0 },
      "isTracked": false,
      "matchScore": 80
    }
  ],
  "groups": [
    {
      "source": {
        "id": "movie-10001",
        "title": "Inception",
        "posterUrl": null,
        "reason": "loved"
      },
      "suggestions": [
        {
          "id": "movie-42001",
          "objectType": "MOVIE",
          "title": "Suggested Movie",
          "originalTitle": "Suggested Movie",
          "releaseYear": 2024,
          "releaseDate": "2024-08-10",
          "runtimeMinutes": 110,
          "shortDescription": "A suggested pick",
          "genres": ["Drama", "Thriller"],
          "imdbId": "tt4200100",
          "tmdbId": 42001,
          "posterUrl": null,
          "ageCertification": "R",
          "originalLanguage": "en",
          "tmdbUrl": "https://www.themoviedb.org/movie/42001",
          "offers": [],
          "scores": { "imdbScore": 7.2, "imdbVotes": 8000, "tmdbScore": 7.5 },
          "isTracked": false,
          "matchScore": 92
        }
      ],
      "hiddenCount": 0
    }
  ]
}
```

---

## TC-01: Discovery page loads — heading, tabs, and hero card visible

**Priority**: P0
**Backend**: Mock

**Why mock**: Verifies the full initial render — the "For you" page heading, the tab bar,
and the hero card — without touching the real recommendations or suggestions APIs. Mocking
guarantees a stable payload for assertion.

**Preconditions**:

- `mockLoggedIn(page)` stubs the session.
- `GET **/api/recommendations**` → standard `recommendationsResponse` fixture.
- `GET **/api/recommendations/count` → `{ count: 0 }`.
- `GET **/api/suggestions**` → standard `suggestionsAggregateResponse` fixture (2 flat
  suggestions: `"Suggested Movie"` as hero, `"More For You Movie"` in the "More for you"
  rail).

**Steps**:

1. Apply all route mocks listed in shared preconditions.
2. Navigate to `/discovery`.
3. Wait for `getByRole("heading", { name: "For you" })` to be visible.

**Expected**:

- `getByRole("heading", { name: "For you" })` (level 1, rendered by `PageHeader`) is
  visible.
- The kicker text `"Based on what you watch & who you follow"` is visible above the
  heading.
- Two tab pills are visible: `getByRole("button", { name: "For you" })` and
  `getByRole("button", { name: /Activity/i })`. The `"For you"` pill is active.
- The hero card section is rendered with the heading `"Suggested Movie"` (an `<h2>` inside
  the `DiscoveryHero` component).
- A `"Track"` button and a `"View details"` link are visible inside the hero card.
- A `"Not interested"` button is visible inside the hero card.
- The `"More for you"` kicker and the `"Suggested next"` section heading are visible
  (rendered by `SectionHead`).
- `"More For You Movie"` appears as a suggestion card in the "Suggested next" horizontal
  rail.

---

## TC-02: Unauthenticated user is redirected to /login

**Priority**: P0
**Backend**: Mock

**Why mock**: The `/discovery` route is wrapped in `<RequireAuth>` in `App.tsx`. Returning
`null` from `GET /api/auth/get-session` is sufficient to trigger the redirect — no real
auth stack is needed.

**Preconditions**:

- `mockLoggedOut(page)` stubs `GET /api/auth/get-session` → `null` and provides mock
  providers.

**Steps**:

1. Call `mockLoggedOut(page)`.
2. Navigate to `/discovery`.
3. Wait for the URL to change away from `/discovery`.

**Expected**:

- The browser is redirected to `/login` (URL pathname is `/login`).
- The login form is visible (`getByRole("button", { name: /sign in/i })` is present).
- The discovery page content is never rendered (`getByRole("heading", { name: "For you" })`
  is absent).

---

## TC-03: "For you" tab shows algo sections (Because you… rails)

**Priority**: P1
**Backend**: Mock

**Why mock**: The "Because you…" rails come from the `groups` array in the suggestions
aggregate. Mocking lets us assert the exact section title without requiring a seeded
database with a tracked title.

**Preconditions**:

- `mockLoggedIn(page)` stubs the session.
- `GET **/api/recommendations**` → `{ "recommendations": [] }` (no friend recs, to keep
  the hero purely algo-driven and the "Friends are recommending" section absent).
- `GET **/api/recommendations/count` → `{ count: 0 }`.
- `GET **/api/suggestions**` → standard `suggestionsAggregateResponse` fixture (1 group
  with `reason: "loved"` and source title `"Inception"`).

**Steps**:

1. Apply route mocks.
2. Navigate to `/discovery`.
3. Wait for `getByRole("heading", { name: "For you" })` to be visible.
4. Wait for `getByText(/Because you loved/i)` to be visible.

**Expected**:

- `getByText("Because you loved Inception")` section heading is visible.
- Inside that section, `getByText("Suggested Movie")` card is visible.
- The "Friends are recommending" section is absent (no friend recs in the fixture).

---

## TC-04: Activity tab shows incoming friend recommendations

**Priority**: P1
**Backend**: Mock

**Why mock**: The Activity tab renders the `recommendations` array. Mocking it lets us
assert specific sender names and message text without a real follow/recommend flow.

**Preconditions**:

- `mockLoggedIn(page)` stubs the session.
- `GET **/api/recommendations**` → standard `recommendationsResponse` fixture (1 rec from
  `"alice"` for `"Friend Rec Movie"` with message `"You will love this!"`).
- `GET **/api/recommendations/count` → `{ count: 1 }`.
- `GET **/api/suggestions**` → `{ "flat": [], "groups": [] }` (no algo suggestions, so the
  "For you" tab shows empty state; we immediately switch to Activity).

**Steps**:

1. Apply route mocks.
2. Navigate to `/discovery`.
3. Wait for `getByRole("heading", { name: "For you" })` to be visible.
4. Click `getByRole("button", { name: /Activity/i })`.
5. Wait for `getByText("Friend Rec Movie")` to be visible.

**Expected**:

- The `"Activity"` pill is now active.
- `getByText("Alice")` (sender display name) is visible in the recommendation card.
- `getByText("Friend Rec Movie")` is visible as the title link.
- `getByText(/"You will love this!"/)` message is visible (displayed as an italic quote).
- A `"Track"` button and a `"Dismiss"` button are visible on the card.
- The unread badge on the `"Activity"` tab shows `"1"` (because `count: 1`).

---

## TC-05: Activity tab shows unread count badge

**Priority**: P1
**Backend**: Mock

**Why mock**: The unread badge count comes from `GET /api/recommendations/count`. Mocking
with a specific count value lets us assert the badge renders correctly.

**Preconditions**:

- `mockLoggedIn(page)` stubs the session.
- `GET **/api/recommendations/count` → `{ count: 3 }`.
- `GET **/api/recommendations**` → `{ "recommendations": [] }`.
- `GET **/api/suggestions**` → `{ "flat": [], "groups": [] }`.

**Steps**:

1. Apply route mocks.
2. Navigate to `/discovery`.
3. Wait for `getByRole("heading", { name: "For you" })` to be visible.

**Expected**:

- The `"Activity"` pill has a badge showing `"3"` (rendered as a small rounded span
  adjacent to the pill label).

---

## TC-06: Empty state — no suggestions and no recommendations

**Priority**: P1
**Backend**: Mock

**Why mock**: The empty-state paragraph (`discovery.empty` i18n key) renders when there is
no hero, no `moreForYou`, no `recsByTitle`, and no groups. Returning empty arrays from both
APIs exercises this branch.

**Preconditions**:

- `mockLoggedIn(page)` stubs the session.
- `GET **/api/recommendations**` → `{ "recommendations": [] }`.
- `GET **/api/recommendations/count` → `{ count: 0 }`.
- `GET **/api/suggestions**` → `{ "flat": [], "groups": [] }`.

**Steps**:

1. Apply route mocks.
2. Navigate to `/discovery`.
3. Wait for `getByRole("heading", { name: "For you" })` to be visible.
4. Ensure the loading spinner/skeleton is no longer present.

**Expected**:

- No hero card is rendered (no `<h2>` with a title heading inside a card).
- No `"Suggested next"` or `"Friends are recommending"` sections are visible.
- The empty-state paragraph (translated `discovery.empty` string, e.g. `"Nothing to show
yet"` or similar) is visible in the "For you" tab content area.

---

## TC-07: Clicking a suggested title navigates to /title/:id

**Priority**: P1
**Backend**: Mock

**Why mock**: Navigation is a frontend concern. We only need the suggestions fixture to
render the hero card; the title detail page does not need to load.

**Preconditions**:

- `mockLoggedIn(page)` stubs the session.
- `GET **/api/recommendations**` → `{ "recommendations": [] }`.
- `GET **/api/recommendations/count` → `{ count: 0 }`.
- `GET **/api/suggestions**` → standard `suggestionsAggregateResponse` fixture (hero is
  `"Suggested Movie"` with id `"movie-42001"`).
- `GET **/api/details/**` → any minimal valid response (left unrouted is fine — we assert
  URL change only).

**Steps**:

1. Apply all route mocks.
2. Navigate to `/discovery`.
3. Wait for `getByRole("heading", { name: "For you" })` to be visible.
4. Wait for `getByRole("link", { name: "View details" })` to be visible inside the hero
   card.
5. Click `getByRole("link", { name: "View details" })`.
6. Wait for the URL to change.

**Expected**:

- The browser URL changes to `/title/movie-42001`.
- The discovery heading `"For you"` is no longer visible (navigated away).

---

## TC-08: Tracking a hero suggestion shows "✓ Tracked" state

**Priority**: P1
**Backend**: Mock

**Why mock**: The Track action is an optimistic UI update (`setTrackedSet`). Mocking the
`POST /api/titles/track/movie-42001` endpoint lets us assert the button state change without
a real database write.

**Preconditions**:

- `mockLoggedIn(page)` stubs the session.
- `GET **/api/recommendations**` → `{ "recommendations": [] }`.
- `GET **/api/recommendations/count` → `{ count: 0 }`.
- `GET **/api/suggestions**` → standard `suggestionsAggregateResponse` fixture (hero is
  `"Suggested Movie"`, id `"movie-42001"`).
- `POST **/api/titles/track/movie-42001` → `{ success: true }` (or simply fulfil with
  status 200).

**Steps**:

1. Apply all route mocks.
2. Navigate to `/discovery`.
3. Wait for `getByRole("heading", { name: "For you" })` to be visible.
4. Click the `getByRole("button", { name: "Track" })` inside the hero card.

**Expected**:

- The `"Track"` button in the hero card changes to `"✓ Tracked"` (optimistic update).
- No error toast appears.
- The `"Not interested"` button is replaced by `"Undo dismiss"` or remains absent
  (tracked state overrides dismissed state).
