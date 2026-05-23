# Test cases: achievements

## Preconditions (shared)

- The Remindarr dev server is running (Bun on `:3000`, Vite proxy on `:5173`).
- Unless stated otherwise, the browser has an active session courtesy of
  `mockLoggedIn(page)` (stubs `GET /api/auth/get-session` with `MOCK_SESSION`).
- The achievements page is at `/achievements`.
- The achievement detail page is at `/achievements/:key`.

---

## TC-01: Achievements page loads and shows achievement cards

**Priority**: P0
**Backend**: Mock

**Why mock**: The achievement grid is a pure render of the API response. Mocking
`GET /api/achievements/me` lets us assert the exact cards without a seeded database.

**Preconditions**:

- `mockLoggedIn(page)` stubs the session.
- `page.route()` intercepts `GET **/api/achievements/me` and returns two achievements:
  one earned (`earned: true`) and one locked (`earned: false`).

```json
{
  "achievements": [
    {
      "key": "first_movie",
      "kind": "count_movies",
      "title": "First Watch",
      "description": "Watch your first movie",
      "icon": "Film",
      "threshold": 1,
      "points": 10,
      "progress": 1,
      "earned": true,
      "earnedAt": "2024-03-01T12:00:00Z",
      "category": "watching",
      "tier": "one-shot",
      "repeatable": false,
      "family": null,
      "rungIndex": null,
      "earnedCount": 1,
      "lastEarnedAt": "2024-03-01T12:00:00Z",
      "nextRung": null,
      "rarity": null
    },
    {
      "key": "watch_10",
      "kind": "count_movies",
      "title": "Binge Starter",
      "description": "Watch 10 movies",
      "icon": "Film",
      "threshold": 10,
      "points": 25,
      "progress": 3,
      "earned": false,
      "earnedAt": null,
      "category": "watching",
      "tier": "one-shot",
      "repeatable": false,
      "family": null,
      "rungIndex": null,
      "earnedCount": 0,
      "lastEarnedAt": null,
      "nextRung": null,
      "rarity": null
    }
  ]
}
```

**Steps**:

1. Set up route intercept on `**/api/achievements/me` with the payload above.
2. Call `mockLoggedIn(page)`.
3. Navigate to `/achievements`.
4. Wait for the page to finish loading (loading text disappears).

**Expected**:

- `getByText("Achievements")` heading (Kicker) is visible.
- The XP summary line is visible (e.g. contains `"1/2 earned"`).
- `getByText("First Watch")` is visible — the earned badge card.
- `getByText("Binge Starter")` is visible — the locked badge card.
- The page does not show `"No achievements yet."`.

---

## TC-02: Locked vs unlocked achievements visually differentiated

**Priority**: P1
**Backend**: Mock

**Why mock**: Visual differentiation is driven by the `earned` field in the API response.
Mocking guarantees both states are present without DB seeding.

**Preconditions**:

- Same route intercept and session mock as TC-01 (one earned, one locked).

**Steps**:

1. Set up the route intercept on `**/api/achievements/me` as in TC-01.
2. Call `mockLoggedIn(page)`.
3. Navigate to `/achievements`.
4. Wait for `getByText("First Watch")` to be visible.

**Expected**:

- The earned badge card (`getByText("First Watch")`):
  - Links to `/achievements/first_movie`.
  - Does **not** have the `opacity-60` visual treatment (it is fully opaque).
- The locked badge card (`getByText("Binge Starter")`):
  - Still links to `/achievements/watch_10` (locked badges are still navigable for self).
  - Has a progress bar visible beneath the title (rendered by `ThinProgress` for locked
    self-view).
  - Appears visually dimmer than the earned badge (Playwright `opacity` check, or presence
    of the progress bar element suffices as a proxy).

> **Note**: The locked tile renders a `ThinProgress` bar only in `mode="self"`. If the
> locator strategy is fragile, asserting the presence of a `progressbar` role element within
> the locked card's link is an acceptable alternative.

---

## TC-03: Clicking an achievement navigates to the detail page

**Priority**: P0
**Backend**: Mock

**Why mock**: Navigation is a frontend routing concern. We only need the list response so
the card renders; the destination page can be stubbed separately.

**Preconditions**:

- Route intercept on `**/api/achievements/me` returns at least the `first_movie` achievement
  (earned, from TC-01).
- Route intercept on `**/api/achievements/first_movie/me` returns a valid detail payload
  (see TC-04 preconditions).
- `mockLoggedIn(page)` is active.

**Steps**:

1. Set up both route intercepts.
2. Call `mockLoggedIn(page)`.
3. Navigate to `/achievements`.
4. Wait for `getByText("First Watch")` to be visible.
5. `getByRole("link", { name: /First Watch/i })` → click.
6. Wait for URL to change to `/achievements/first_movie`.

**Expected**:

- The browser navigates to `/achievements/first_movie`.
- The detail page renders (see TC-04 for detail assertions).

---

## TC-04: Achievement detail page shows name, description, and progress

**Priority**: P0
**Backend**: Mock

**Why mock**: All rendered fields come from a single `GET /api/achievements/:key/me`
response. Mocking is sufficient to verify the page renders each field correctly.

**Preconditions**:

- `mockLoggedIn(page)` is active.
- `page.route()` intercepts `GET **/api/achievements/watch_10/me` and returns a locked
  achievement with visible progress:

```json
{
  "key": "watch_10",
  "kind": "count_movies",
  "title": "Binge Starter",
  "description": "Watch 10 movies",
  "icon": "Film",
  "threshold": 10,
  "points": 25,
  "progress": 3,
  "earned": false,
  "earnedAt": null,
  "earnedCount": 0,
  "lastEarnedAt": null,
  "category": "watching",
  "tier": "one-shot",
  "repeatable": false,
  "family": null,
  "rungIndex": null,
  "rarity": { "bucket": "Rare", "pct": 12 },
  "ladder": null,
  "history": []
}
```

**Steps**:

1. Set up the route intercept on `**/api/achievements/watch_10/me`.
2. Call `mockLoggedIn(page)`.
3. Navigate directly to `/achievements/watch_10`.
4. Wait for `getByRole("heading", { level: 1 })` to be visible.

**Expected**:

- `getByRole("heading", { level: 1 })` text is `"Binge Starter"`.
- `getByText("Watch 10 movies")` (the description) is visible.
- `getByText("Progress")` label is visible (progress section shown for locked own-profile).
- `getByText("3 / 10")` progress counter is visible.
- `getByText(/Rare/)` rarity badge is visible.
- `getByRole("link", { name: /All achievements/i })` back link points to `/achievements`.

---

## TC-05: Empty state — no achievements

**Priority**: P1
**Backend**: Mock

**Why mock**: The empty-state branch (`achievements.length === 0`) is a frontend render
guard. Returning an empty array from the mock exercises it fully.

**Preconditions**:

- `mockLoggedIn(page)` is active.
- `page.route()` intercepts `GET **/api/achievements/me` and returns `{ "achievements": [] }`.

**Steps**:

1. Set up the route intercept on `**/api/achievements/me` with an empty achievements array.
2. Call `mockLoggedIn(page)`.
3. Navigate to `/achievements`.
4. Wait for the page to finish loading.

**Expected**:

- `getByText("Achievements")` heading (Kicker) is visible.
- `getByText("No achievements yet.")` is visible.
- No badge cards are rendered (no `getByRole("link")` within the achievements list area).
- The XP summary line (`earned · XP`) is **not** shown (it only renders when there is data).

---

## TC-06: Unauthenticated user redirected to /login

**Priority**: P0
**Backend**: Mock

**Why mock**: The auth redirect guard is a frontend `RequireAuth` component that reads
the session from `GET /api/auth/get-session`. Using `mockLoggedOut(page)` (which returns
`null` for the session) fully exercises the guard without a real auth stack.

**Preconditions**:

- `mockLoggedOut(page)` stubs `GET /api/auth/get-session` with `null` and provides mock
  providers.

**Steps**:

1. Call `mockLoggedOut(page)`.
2. Navigate to `/achievements`.
3. Wait for the URL to change away from `/achievements`.

**Expected**:

- The browser is redirected to `/login` (URL pathname is `/login`).
- The login form is visible (`getByRole("button", { name: /sign in/i })` is present).
- The achievements page content is never rendered (`getByText("Achievements")` is absent).
