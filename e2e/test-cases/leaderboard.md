# Test cases: leaderboard

## Preconditions (shared)

- The Remindarr dev server is running (Bun on `:3000`, Vite dev server on `:5173`).
- The leaderboard page is at `/leaderboard`.
- The leaderboard API endpoint is `GET /api/leaderboard` (requires auth; returns
  `{ entries: LeaderboardEntry[] }` where each entry has `userId`, `username`, `name`,
  `image`, `xp`, `badgeCount`, `rank`).
- Unless stated otherwise, `mockLoggedIn(page)` is called before each test so the
  `RequireAuth` guard passes.

---

## TC-01: Leaderboard loads and shows ranked users

**Priority**: P0
**Backend**: Mock

**Why mock**: The leaderboard data is deterministic once stubbed — mocking keeps the test
hermetic, avoids a real DB with follow relationships, and lets us assert exact text.

**Preconditions**:

- `mockLoggedIn(page)` is called with `MOCK_SESSION` (current user id `"user-1"`).
- `page.route()` intercepts `GET **/api/leaderboard` and returns:
  ```json
  {
    "entries": [
      {
        "userId": "user-2",
        "username": "alice",
        "name": "Alice",
        "image": null,
        "xp": 500,
        "badgeCount": 3,
        "rank": 1
      },
      {
        "userId": "user-3",
        "username": "bob",
        "name": "Bob",
        "image": null,
        "xp": 420,
        "badgeCount": 2,
        "rank": 2
      },
      {
        "userId": "user-4",
        "username": "charlie",
        "name": "Charlie",
        "image": null,
        "xp": 310,
        "badgeCount": 1,
        "rank": 3
      },
      {
        "userId": "user-5",
        "username": "diana",
        "name": "Diana",
        "image": null,
        "xp": 200,
        "badgeCount": 0,
        "rank": 4
      }
    ]
  }
  ```

**Steps**:

1. Call `mockLoggedIn(page)`.
2. Set up `page.route()` intercept on `**/api/leaderboard` as described above.
3. Navigate to `/leaderboard`.
4. Wait for the heading to appear: `getByRole("heading", { name: /leaderboard/i })`.

**Expected**:

- The page heading `"Leaderboard"` is visible.
- The subtitle `"Among people you follow"` is visible.
- The podium section shows exactly three entries (ranks 1–3): `"Alice"`, `"Bob"`,
  `"Charlie"` with their rank labels `#1`, `#2`, `#3`.
- Rank labels use `#` prefix (e.g. `getByText("#1")` is visible).
- XP values are visible for podium entries (e.g. `"500 XP"` for Alice).
- The ranked-list section below the podium shows `"Diana"` at `#4`.
- No error banner is rendered.

---

## TC-02: Current user's entry is highlighted

**Priority**: P1
**Backend**: Mock

**Why mock**: The highlight is a purely client-side comparison of `entry.userId` against the
session's user id. A mocked session and mocked leaderboard response are sufficient.

**Preconditions**:

- `mockLoggedIn(page)` is called. `MOCK_SESSION.user.id` is `"user-1"`.
- `page.route()` intercepts `GET **/api/leaderboard` and returns an entry for the current
  user in both the podium and the list:
  ```json
  {
    "entries": [
      {
        "userId": "user-2",
        "username": "alice",
        "name": "Alice",
        "image": null,
        "xp": 600,
        "badgeCount": 4,
        "rank": 1
      },
      {
        "userId": "user-1",
        "username": "testuser",
        "name": "Test User",
        "image": null,
        "xp": 500,
        "badgeCount": 3,
        "rank": 2
      },
      {
        "userId": "user-3",
        "username": "bob",
        "name": "Bob",
        "image": null,
        "xp": 400,
        "badgeCount": 2,
        "rank": 3
      },
      {
        "userId": "user-4",
        "username": "charlie",
        "name": "Charlie",
        "image": null,
        "xp": 200,
        "badgeCount": 0,
        "rank": 4
      }
    ]
  }
  ```
  (Current user is rank 2 — in the podium.)

**Steps**:

1. Call `mockLoggedIn(page)`.
2. Set up `page.route()` intercept as described above.
3. Navigate to `/leaderboard`.
4. Wait for `getByRole("heading", { name: /leaderboard/i })` to be visible.
5. Locate the podium card containing `"Test User"` / `"@testuser"`.

**Expected**:

- The current user's podium card has a visually distinct highlight (amber border/background).
  Assert by checking that the card container has an amber highlight class or `aria` attribute
  distinguishable from the other cards — use `getByText("@testuser").locator("..")` to
  reach the card's parent and assert it has `class` containing `amber` or equivalent.
- The other podium cards (Alice, Bob) do not carry the same highlight styling.
- If the current user appears in the ranked list (rank 4+), that row is similarly
  highlighted compared to adjacent rows.

---

## TC-03: Empty leaderboard — no entries (or only the user themselves)

**Priority**: P1
**Backend**: Mock

**Why mock**: The empty state is a client-side branch (`entries.length <= 1`). A mocked
empty array response exercises this path without any DB state.

**Preconditions**:

- `mockLoggedIn(page)` is called.
- `page.route()` intercepts `GET **/api/leaderboard` and returns `{ "entries": [] }`.

**Steps**:

1. Call `mockLoggedIn(page)`.
2. Set up `page.route()` intercept returning `{ "entries": [] }`.
3. Navigate to `/leaderboard`.
4. Wait for the page to finish loading (no skeleton/pulse elements visible).

**Expected**:

- The heading `"Leaderboard"` and subtitle `"Among people you follow"` are visible.
- The empty-state message `"Follow people to see them on the leaderboard."` is visible
  (`getByText(/follow people to see them on the leaderboard/i)`).
- No podium cards are rendered.
- No ranked-list rows are rendered.
- A trophy icon is present alongside the empty-state message.

---

## TC-04: Clicking a user navigates to their profile

**Priority**: P2
**Backend**: Mock

**Why P2 / design note**: The current `LeaderboardPage.tsx` renders names and usernames as
plain text — there are no `<a>` or `<Link>` elements wrapping the user cards. This TC
documents the **expected navigation behaviour** so that when clickable profiles are added the
test can be promoted to P1 and automated.

**Preconditions**:

- `mockLoggedIn(page)` is called.
- `page.route()` intercepts `GET **/api/leaderboard` and returns at least three entries
  (same payload as TC-01).

**Steps** (manual / future automation):

1. Call `mockLoggedIn(page)`.
2. Set up `page.route()` intercept with a multi-entry payload.
3. Navigate to `/leaderboard`.
4. Wait for the leaderboard entries to render.
5. Click the podium card or list row for username `"alice"`.

**Expected** (target behaviour once implemented):

- The browser navigates to `/user/alice`.
- The user profile page for Alice is rendered (heading or username `"alice"` visible).

**Current state**: This navigation is not yet implemented. The TC is recorded so it can
be automated once the feature ships. When automating, add a `page.route()` stub for
`**/api/user/alice` returning a minimal profile payload to keep the test hermetic.

---

## TC-05: Auth requirement — unauthenticated access redirects to login

**Priority**: P0
**Backend**: Mock

**Why mock**: The `RequireAuth` guard in `App.tsx` is a client-side route check. Stubbing
`GET /api/auth/get-session` with a null session via `mockLoggedOut(page)` is sufficient;
no real session or DB state is required.

**Preconditions**:

- `mockLoggedOut(page)` is called to stub the session endpoint with `null`.
- No `mockLoggedIn(page)` call is made.

**Steps**:

1. Call `mockLoggedOut(page)` to inject a null session.
2. Navigate directly to `/leaderboard`.
3. Wait for any client-side redirect to resolve.

**Expected**:

- The browser is redirected away from `/leaderboard` to `/login` (or equivalent auth
  entry point).
- The leaderboard content (`getByRole("heading", { name: /leaderboard/i })`) is never
  rendered.
- The login form (or login page) is visible.
