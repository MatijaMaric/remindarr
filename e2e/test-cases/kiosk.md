# Test cases: kiosk

## Preconditions (shared)

- The Remindarr dev server is running (Bun on `:3000`, Vite proxy on `:5173`).
- The kiosk page is at `/kiosk/:token` — a **public**, token-authenticated route with no
  `<RequireAuth>` wrapper. Session cookies are not required; the token in the URL path is
  the sole credential.
- The page fetches `GET /api/kiosk/:token?display=<fidelity>` directly via `fetch()` (not
  TanStack Query), sending an `X-Timezone` header.
- The shell hides the top navigation bar, bottom tab bar, install prompt, and footer when
  `location.pathname.startsWith("/kiosk/")`.
- The page polls automatically (every 5 min for `rich`/`lite`, every 30 min for `epaper`).
- All test cases use `page.route()` mocks unless explicitly marked **Real**.
- No session mock is needed (the kiosk endpoint is fully public), but apply
  `GET **/api/auth/get-session` → `null` to prevent shell auth requests from erroring.

### Standard kiosk data fixture

```json
{
  "meta": {
    "household": "alice",
    "fidelity": "rich",
    "refresh_interval_seconds": 300
  },
  "airing_now": {
    "id": 101,
    "title_id": "tt9876543",
    "show_title": "Test Show",
    "poster_url": null,
    "backdrop_url": null,
    "season_number": 1,
    "episode_number": 2,
    "ep_title": "Second Episode",
    "air_date": "2026-05-23T20:00:00Z",
    "provider": "Netflix"
  },
  "releasing_today": [
    {
      "id": 101,
      "title_id": "tt9876543",
      "show_title": "Test Show",
      "poster_url": null,
      "backdrop_url": null,
      "season_number": 1,
      "episode_number": 2,
      "ep_title": "Second Episode",
      "air_date": "2026-05-23T20:00:00Z",
      "provider": "Netflix",
      "kind": "episode"
    }
  ],
  "unwatched_queue": [
    {
      "id": 99,
      "title_id": "tt1111111",
      "show_title": "Old Show",
      "poster_url": null,
      "season_number": 2,
      "episode_number": 3,
      "ep_title": "The One",
      "air_date": "2026-04-01T00:00:00Z",
      "provider": "HBO Max",
      "left": 5
    }
  ]
}
```

---

## TC-01: Page renders the full kiosk layout with header, hero, and two panels

**Priority**: P0
**Backend**: Mock

**Why mock**: Verifies the complete initial render of the kiosk dashboard — branded header
with household name, clock and date, a hero card for the currently-airing episode, the
"Releasing today" panel, and the "Up next in your queue" panel — without a real kiosk token
in the database.

**Preconditions**:

- `GET **/api/auth/get-session` → `null`.
- `GET **/api/kiosk/test-kiosk-token` → the standard kiosk data fixture (HTTP 200).

**Steps**:

1. Apply route mocks.
2. Navigate to `/kiosk/test-kiosk-token`.
3. Wait for the kiosk header to appear (look for the `"Remindarr"` wordmark text).

**Expected**:

- The top navigation bar is hidden (the kiosk shell suppresses it).
- The bottom tab bar is hidden.
- The header contains:
  - The `"Remindarr"` wordmark.
  - A monospace badge containing `"KIOSK · RICH"` (fidelity label, uppercased).
  - The household name `"alice"`.
  - The current date (e.g. `"Friday, May 23"`) in monospace text.
  - The current time (e.g. `"08:00"`) displayed in a large amber monospace block.
- The hero card (360 px tall panel) is visible and shows:
  - The kicker text `"AIRING NOW · NETFLIX"` (uppercase monospace).
  - The large show title `"Test Show"`.
  - The episode info `"S1·E2"` and episode title `"Second Episode"`.
  - A decorative (non-interactive) `"Cast to TV"` button (aria-hidden).
- The left panel header reads `"RELEASING TODAY"` with `"1 drops"`.
  - A row for `"Test Show"` with episode code `"S1·E2"` and provider `"Netflix"` is present.
- The right panel header reads `"UP NEXT IN YOUR QUEUE"` with `"1 unwatched"`.
  - A row for `"Old Show"` with `"5 left"` is present.
- The footer contains an auto-refresh label `"Auto-refreshes every 5 min"` and a partial
  token display `"token test"`.

---

## TC-02: Invalid token shows the "Kiosk unavailable" error screen

**Priority**: P0
**Backend**: Mock

**Why mock**: Tests the error branch: when the API returns a non-OK status (401), the page
must replace the kiosk layout with a full-screen error message.

**Preconditions**:

- `GET **/api/auth/get-session` → `null`.
- `GET **/api/kiosk/bad-token` → HTTP 401 with body `{ "error": "Invalid kiosk token" }`.

**Steps**:

1. Apply route mocks.
2. Navigate to `/kiosk/bad-token`.
3. Wait for the error heading to appear.

**Expected**:

- A full-viewport dark error screen is shown.
- The heading reads `"Kiosk unavailable"`.
- The paragraph reads `"This kiosk link is no longer valid. Ask the owner to share a new
one."`.
- The kiosk header (with the "Remindarr" wordmark), panels, and footer are **not** rendered.

---

## TC-03: Kiosk page does not require an active user session

**Priority**: P0
**Backend**: Mock

**Why mock**: Confirms that the kiosk page bypasses the global `RequireAuth` guard and the
`"auth:unauthorized"` event system. The page fetches `/api/kiosk/:token` directly using
`fetch()` with no session cookie, so a `null` session must not redirect to `/login`.

**Preconditions**:

- `GET **/api/auth/get-session` → `null`.
- `GET **/api/kiosk/public-kiosk-token` → the standard kiosk data fixture.

**Steps**:

1. Apply mocks.
2. Navigate to `/kiosk/public-kiosk-token`.
3. Wait for the header wordmark `"Remindarr"` to appear.

**Expected**:

- The browser URL remains `/kiosk/public-kiosk-token` — no redirect to `/login`.
- The kiosk header with the household name `"alice"` is visible.

---

## TC-04: Kiosk renders correctly in "epaper" fidelity mode

**Priority**: P1
**Backend**: Mock

**Why mock**: Tests the `?display=epaper` query-string variant. The epaper palette uses a
light cream background (`#f6f3e8`), dark ink text (`#1a1916`), and square corners (no border
radius). The fidelity badge should read `"KIOSK · EPAPER"`.

**Preconditions**:

- `GET **/api/auth/get-session` → `null`.
- `GET **/api/kiosk/epaper-token?display=epaper` → the standard kiosk data fixture but with
  `"fidelity": "epaper"` and `"refresh_interval_seconds": 1800` in `meta`.

**Steps**:

1. Apply route mocks.
2. Navigate to `/kiosk/epaper-token?display=epaper`.
3. Wait for the header wordmark.

**Expected**:

- The fidelity badge reads `"KIOSK · EPAPER"`.
- The footer auto-refresh label reads `"Auto-refreshes every 30 min"`.
- The page `background` is `#f6f3e8` (cream) — verify via
  `page.evaluate(() => getComputedStyle(document.body).background)` or by checking the
  inline style on the outermost `<div>`.
- The hero card has square corners (no `border-radius`).

---

## TC-05: Hero falls back to "Releasing today" when nothing is airing now

**Priority**: P1
**Backend**: Mock

**Why mock**: Tests the `heroFallbackItem` path: when `airing_now` is `null` but
`releasing_today` is non-empty, the hero shows the first releasing-today item with the kicker
`"RELEASING TODAY"` instead of `"AIRING NOW"`.

**Preconditions**:

- `GET **/api/auth/get-session` → `null`.
- `GET **/api/kiosk/fallback-token` → HTTP 200:
  ```json
  {
    "meta": {
      "household": "bob",
      "fidelity": "rich",
      "refresh_interval_seconds": 300
    },
    "airing_now": null,
    "releasing_today": [
      {
        "id": 200,
        "title_id": "tt2222222",
        "show_title": "New Release",
        "poster_url": null,
        "backdrop_url": null,
        "season_number": 1,
        "episode_number": 1,
        "ep_title": "Pilot",
        "air_date": "2026-05-23T00:00:00Z",
        "provider": "Disney+",
        "kind": "series"
      }
    ],
    "unwatched_queue": []
  }
  ```

**Steps**:

1. Apply route mocks.
2. Navigate to `/kiosk/fallback-token`.
3. Wait for the header wordmark.

**Expected**:

- The hero card kicker text reads `"RELEASING TODAY · DISNEY+"` (uppercase).
- The large title text reads `"New Release"`.
- The episode info reads `"S1·E1"` and `"Pilot"`.

---

## TC-06: Hero shows "Nothing on the slate today" when all lists are empty

**Priority**: P1
**Backend**: Mock

**Why mock**: Tests the `HeroEmpty` branch: when `airing_now` is `null` and
`releasing_today` is empty (but `data` has loaded), the hero placeholder renders a monospace
empty-state message.

**Preconditions**:

- `GET **/api/auth/get-session` → `null`.
- `GET **/api/kiosk/empty-token` → HTTP 200:
  ```json
  {
    "meta": {
      "household": "carol",
      "fidelity": "rich",
      "refresh_interval_seconds": 300
    },
    "airing_now": null,
    "releasing_today": [],
    "unwatched_queue": []
  }
  ```

**Steps**:

1. Apply route mocks.
2. Navigate to `/kiosk/empty-token`.
3. Wait for the header wordmark.

**Expected**:

- The hero area shows the text `"Nothing on the slate today"` (uppercase monospace).
- The "Releasing today" panel shows the sub-message `"No releases today."`.
- The "Up next in your queue" panel shows the sub-message `"All caught up!"`.
