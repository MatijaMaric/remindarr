# Test cases: up-next

## Preconditions (shared)

- The Remindarr dev server is running (Bun on `:3000`, Vite proxy on `:5173`).
- The **Up Next** section is rendered as part of the home page (`/`) within the
  `"up_next"` homepage layout section. It is powered by `GET /api/up-next` and
  rendered by the `UpNextRow` component, which itself renders `EpisodeCard` and
  `RecommendationCard` items inside a `FullBleedCarousel`.
- The home page at `/` requires authentication (`<RequireAuth>` is applied for the
  auth data query, and the authenticated view requires `user !== null`).
- All test cases use `page.route()` mocks unless explicitly marked **Real**.
- Before navigating, mock the following base endpoints:
  - `GET **/api/auth/get-session` → `MOCK_SESSION` (logged-in, see `e2e/helpers.ts`)
  - `GET **/api/auth/custom/providers` → `{ local: true, oidc: null }`
  - `GET **/api/episodes/upcoming` → `{ today: [], upcoming: [], unwatched: [] }`
  - `GET **/api/up-next**` → a standard `upNextResponse` fixture (see below)
  - `GET **/api/recommendations**` → `{ recommendations: [], count: 0 }`
  - `GET **/api/up-next/friends-loved**` → `{ items: [] }` (or abort — endpoint may not be
    shipped; `HomePage` catches its error silently)
  - `GET **/api/user/settings/homepage-layout` → a layout fixture that includes
    `{ "id": "up_next", "enabled": true }` (see layout fixture below)
  - `GET **/api/movies/tracking` → `{ to_watch: [], upcoming: [] }`
  - `GET **/api/user/streak` → `null` (or abort — caught silently)

### Standard `upNextResponse` fixture

```json
{
  "items": [
    {
      "kind": "in_progress",
      "titleId": 98765,
      "title": "Test Show",
      "posterUrl": null,
      "nextEpisodeId": 101,
      "nextEpisodeTitle": "Pilot",
      "nextEpisodeSeason": 1,
      "nextEpisodeNumber": 1,
      "nextEpisodeAirDate": "2023-03-01",
      "unwatchedCount": 3
    }
  ]
}
```

### Minimal homepage layout fixture

```json
{
  "homepage_layout": [
    { "id": "up_next", "enabled": true },
    { "id": "unwatched", "enabled": false },
    { "id": "recommendations", "enabled": false },
    { "id": "today", "enabled": false },
    { "id": "upcoming", "enabled": false },
    { "id": "airing_soon", "enabled": false },
    { "id": "friends_loved", "enabled": false },
    { "id": "movies_to_watch", "enabled": false },
    { "id": "upcoming_movies", "enabled": false },
    { "id": "streak", "enabled": false }
  ]
}
```

> **Why mock the layout**: `HomePage` fetches `GET /api/user/settings/homepage-layout` and
> renders only sections whose `enabled` flag is `true`. By returning a layout with only
> `up_next` enabled we isolate the section under test and prevent noise from other sections.

---

## TC-01: Up Next section renders show cards with episode details

**Priority**: P0
**Backend**: Mock

**Why mock**: Verifies the full initial render of the Up Next carousel — section heading,
kind badge, show title, episode code (`S01·E01`), episode title, unwatched-count badge,
and "Mark Watched" button — without touching the real episode DB.

**Preconditions**:

- All shared mocks applied.
- `GET **/api/up-next**` returns the standard `upNextResponse` fixture (1 item,
  kind `"in_progress"`, show `"Test Show"`, `S01E01 "Pilot"`, 3 unwatched).
- `GET **/api/user/settings/homepage-layout` returns the minimal layout fixture with
  `up_next` enabled.

**Steps**:

1. Apply all shared route mocks.
2. Navigate to `/`.
3. Wait for `getByText("Up Next")` (the section heading `t("home.upNext.title")`) to be
   visible.

**Expected**:

- The section kicker text contains `t("home.upNext.inProgress")` (e.g. `"In Progress"`).
- The section heading `t("home.upNext.title")` (e.g. `"Up Next"`) is visible.
- An `EpisodeCard` for `"Test Show"` is visible within the carousel.
- The kind badge on the card contains the text matching `t("home.upNext.inProgress")`
  (e.g. `"In Progress"`).
- The episode code `"S01·E01"` is visible within the card.
- The episode title `"Pilot"` is visible within the card.
- The unwatched-count badge shows `"+3"` (rendered when `unwatchedCount > 1`).
- A "Mark watched" button (`t("home.markWatched")`) is visible inside the card.

---

## TC-02: Up Next — auth required (unauthenticated user sees landing page instead)

**Priority**: P0
**Backend**: Mock

**Why mock**: Confirms that an unauthenticated visitor does NOT see the Up Next section.
`HomePage` shows a landing page (`SignIn` / `SignUp` links + popular titles) when
`user === null`. The Up Next section is never rendered for logged-out users.

**Preconditions**:

- `GET **/api/auth/get-session` → `null` (no session).
- `GET **/api/auth/custom/providers` → `{ local: true, oidc: null }`.
- `GET **/api/browse**` → `{ titles: [], page: 1, totalPages: 1, totalResults: 0 }`.

**Steps**:

1. Apply the logged-out session mock and providers mock.
2. Apply a minimal browse mock so the landing page renders without errors.
3. Navigate to `/`.
4. Wait for the page to render.

**Expected**:

- The browser URL remains `/` (no redirect; home page is public).
- The `"Up Next"` section heading is **not** visible.
- A `"Sign In"` link or button is visible (the landing CTA).
- No `EpisodeCard` or `UpNextRow` content is rendered.

---

## TC-03: Up Next — episode details are visible (show name, episode number, title)

**Priority**: P1
**Backend**: Mock

**Why mock**: Isolated check that all three key data fields (show name, episode code,
episode title) are co-present in the rendered card, confirming the `EpisodeCard` layout
passes all props through correctly.

**Preconditions**:

- All shared mocks applied.
- `GET **/api/up-next**` returns:
  ```json
  {
    "items": [
      {
        "kind": "newly_aired",
        "titleId": 11111,
        "title": "My Drama",
        "posterUrl": null,
        "nextEpisodeId": 202,
        "nextEpisodeTitle": "The Reveal",
        "nextEpisodeSeason": 2,
        "nextEpisodeNumber": 5,
        "nextEpisodeAirDate": "2026-04-15",
        "unwatchedCount": 1
      }
    ]
  }
  ```
- `GET **/api/user/settings/homepage-layout` returns the minimal layout fixture with
  `up_next` enabled.

**Steps**:

1. Apply all shared route mocks.
2. Navigate to `/` and wait for the Up Next section heading to be visible.
3. Locate the card for `"My Drama"` in the carousel.

**Expected**:

- The show name `"My Drama"` is visible as the card heading.
- The episode code `"S02·E05"` is visible (amber-coloured monospace font as rendered by
  `EpisodeCard`).
- The episode title `"The Reveal"` is visible (prefixed with `" · "` in the subtitle line).
- The kind badge shows `t("home.upNext.newEpisodes")` (e.g. `"New Episodes"`).
- The unwatched-count badge is **not** shown (since `unwatchedCount === 1`, which is
  not `> 1`).

---

## TC-04: Up Next — empty state when no items returned

**Priority**: P1
**Backend**: Mock

**Why mock**: Tests the empty-state message (`t("home.upNext.empty")`) that `UpNextRow`
renders when the `items` array is empty.

**Preconditions**:

- All shared mocks applied.
- `GET **/api/up-next**` returns:
  ```json
  { "items": [] }
  ```
- `GET **/api/user/settings/homepage-layout` returns the minimal layout fixture with
  `up_next` enabled.

**Steps**:

1. Apply all shared route mocks with the empty up-next response.
2. Navigate to `/`.
3. Wait for the Up Next section heading to be visible.
4. Wait for the carousel area to settle.

**Expected**:

- No `EpisodeCard` or `RecommendationCard` is rendered inside the Up Next section.
- The empty-state message (`t("home.upNext.empty")`, e.g. `"You're all caught up!"` or
  similar) is visible inside the `UpNextRow` component.
- No error banner is shown.

---

## TC-05: Clicking a title in Up Next navigates to the title detail page

**Priority**: P1
**Backend**: Mock

**Why mock**: Navigation is a frontend concern. We only need to verify that the `<Link>`
elements inside `EpisodeCard` route to `/title/<titleId>`. No detail-page data needs to
load.

**Preconditions**:

- All shared mocks applied.
- `GET **/api/up-next**` returns the standard `upNextResponse` fixture (titleId `98765`,
  title `"Test Show"`).
- `GET **/api/user/settings/homepage-layout` returns the minimal layout fixture with
  `up_next` enabled.
- `GET **/api/titles/98765` → any minimal valid response (or left unrouted — we only
  assert the URL change, not the detail-page render).

**Steps**:

1. Apply all shared route mocks.
2. Navigate to `/` and wait for the Up Next section heading to be visible.
3. Wait for the `"Test Show"` card to be visible in the carousel.
4. Click the `<Link>` wrapping the poster image or the heading inside the `EpisodeCard`
   (both link to `/title/98765`).
5. Wait for the URL to change.

**Expected**:

- The browser URL changes to `/title/98765`.
- The home page Up Next section is no longer visible.

> **Implementation note**: `EpisodeCard` in `UpNextRow.tsx` renders two `<Link to="/title/${item.titleId}">` elements — one wrapping the poster image (the outer `<Link className="block relative">`) and one wrapping the heading `<h3>` text. Either is a valid click target. Prefer `getByRole("link", { name: "Test Show" })` and scope to the carousel section if multiple matches arise.
