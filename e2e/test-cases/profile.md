# Test cases: profile

## Preconditions (shared)

- The Remindarr dev server is running (Bun on `:3000`, Vite proxy on `:5173`).
- Unless stated otherwise, the browser has an active session courtesy of
  `mockLoggedIn(page)` (stubs `GET /api/auth/get-session` with `MOCK_SESSION`).
  `MOCK_SESSION.user` has `id = "user-1"`, `username = "testuser"`,
  `name = "Test User"`.
- The own-profile redirect page is at `/profile`; it redirects to `/user/testuser`.
- Another user's profile page is at `/user/:username`.
- The user-profile API endpoint is `GET /api/user/:username`; it returns a
  `UserProfileResponse` (see `frontend/src/types.ts`).
- Achievement data comes from `GET /api/achievements/me` (own) or
  `GET /api/achievements/u/:username` (other).
- The follow/unfollow API lives at `POST /DELETE /api/social/follow/:userId`.

---

## TC-01: Own profile page loads — username, display name, and follow stats visible

**Priority**: P0
**Backend**: Mock

**Why mock**: All rendered fields come directly from the `GET /api/user/:username`
response. Mocking lets us assert exact text without a seeded database.

**Preconditions**:

- `mockLoggedIn(page)` stubs the session (current user `"user-1"`, username
  `"testuser"`).
- `page.route()` intercepts `GET **/api/user/testuser` and returns:

```json
{
  "user": {
    "id": "user-1",
    "username": "testuser",
    "display_name": "Test User",
    "image": null,
    "member_since": "2024-01-01T00:00:00Z",
    "bio": "Hello, I love movies.",
    "country_code": null
  },
  "stats": {
    "tracked_count": 12,
    "watched_movies": 5,
    "watched_episodes": 42,
    "shows_completed": 2,
    "shows_total": 4,
    "total_watched_episodes": 42,
    "total_released_episodes": 60
  },
  "overview": {
    "tracked_count": 12,
    "tracked_movies": 5,
    "tracked_shows": 7,
    "watched_movies": 5,
    "watched_episodes": 42,
    "shows_completed": 2,
    "shows_total": 4,
    "total_watched_episodes": 42,
    "total_released_episodes": 60,
    "watch_time_minutes": 1800,
    "watch_time_minutes_movies": 600,
    "watch_time_minutes_shows": 1200
  },
  "genres": [],
  "monthly": [],
  "shows_by_status": {
    "watching": 2,
    "caught_up": 1,
    "completed": 2,
    "not_started": 1,
    "unreleased": 0,
    "on_hold": 0,
    "dropped": 0,
    "plan_to_watch": 1
  },
  "friends": [],
  "movies": [],
  "shows": [],
  "show_watchlist": true,
  "profile_visibility": "public",
  "activity_stream_enabled": true,
  "is_own_profile": true,
  "backdrops": [],
  "follower_count": 3,
  "following_count": 5,
  "is_following": false,
  "pinned": []
}
```

- `page.route()` intercepts `GET **/api/achievements/me` and returns
  `{ "achievements": [] }`.
- `page.route()` intercepts `GET **/api/streak/me` and returns
  `{ "currentStreak": 0, "longestStreak": 0, "lastWatchDate": null }`.
- `page.route()` intercepts `GET **/api/user/testuser/activity**` and returns
  `{ "activities": [], "has_more": false, "next_cursor": null }`.

**Steps**:

1. Set up all route intercepts above.
2. Call `mockLoggedIn(page)`.
3. Navigate to `/user/testuser`.
4. Wait for `[data-testid="profile-hero"]` to be visible.

**Expected**:

- `getByRole("heading", { level: 1 })` text is `"Test User"` (display name shown
  in the hero).
- `getByText("@testuser")` is visible (username shown in the hero).
- `getByText("3")` adjacent to "Followers" label is visible (inside
  `[data-testid="social-bar"]`).
- `getByText("5")` adjacent to "Following" label is visible.
- The page does not show an error (`"User not found"` is absent).
- No "Follow" button is visible (it is the current user's own profile; the
  `FollowButton` does not render when `user.id === userId`).

---

## TC-02: Unauthenticated access to `/profile` redirects to `/login`

**Priority**: P0
**Backend**: Mock

**Why mock**: `/profile` is not wrapped in `RequireAuth` but reads the session from
`AuthContext`. With `mockLoggedOut(page)` the component receives `user = null` and
renders `<Navigate to="/login" />` immediately — no real session needed.

**Preconditions**:

- `mockLoggedOut(page)` stubs `GET /api/auth/get-session` with `null`.

**Steps**:

1. Call `mockLoggedOut(page)`.
2. Navigate to `/profile`.
3. Wait for the URL to change away from `/profile`.

**Expected**:

- The browser redirects to `/login`.
- The login form is visible (`getByRole("button", { name: /sign in/i })` is
  present).
- The profile hero (`[data-testid="profile-hero"]`) is never rendered.

---

## TC-03: View another user's profile — their username visible

**Priority**: P0
**Backend**: Mock

**Why mock**: The profile page is a pure render of the API response. Mocking the
`GET /api/user/alice` response verifies rendering without any DB seeding.

**Preconditions**:

- `mockLoggedIn(page)` is called. Current user is `"user-1"` / `"testuser"`.
- `page.route()` intercepts `GET **/api/user/alice` and returns:

```json
{
  "user": {
    "id": "user-2",
    "username": "alice",
    "display_name": "Alice",
    "image": null,
    "member_since": "2024-03-10T00:00:00Z",
    "bio": null,
    "country_code": null
  },
  "stats": {
    "tracked_count": 20,
    "watched_movies": 10,
    "watched_episodes": 80,
    "shows_completed": 5,
    "shows_total": 8,
    "total_watched_episodes": 80,
    "total_released_episodes": 100
  },
  "overview": {
    "tracked_count": 20,
    "tracked_movies": 8,
    "tracked_shows": 12,
    "watched_movies": 10,
    "watched_episodes": 80,
    "shows_completed": 5,
    "shows_total": 8,
    "total_watched_episodes": 80,
    "total_released_episodes": 100,
    "watch_time_minutes": 3000,
    "watch_time_minutes_movies": 1000,
    "watch_time_minutes_shows": 2000
  },
  "genres": [],
  "monthly": [],
  "shows_by_status": {
    "watching": 3,
    "caught_up": 2,
    "completed": 5,
    "not_started": 2,
    "unreleased": 0,
    "on_hold": 0,
    "dropped": 0,
    "plan_to_watch": 0
  },
  "friends": [],
  "movies": [],
  "shows": [],
  "show_watchlist": true,
  "profile_visibility": "public",
  "activity_stream_enabled": true,
  "is_own_profile": false,
  "backdrops": [],
  "follower_count": 10,
  "following_count": 4,
  "is_following": false,
  "pinned": []
}
```

- `page.route()` intercepts `GET **/api/achievements/u/alice` and returns
  `{ "achievements": [] }`.
- `page.route()` intercepts `GET **/api/user/alice/activity**` and returns
  `{ "activities": [], "has_more": false, "next_cursor": null }`.

**Steps**:

1. Set up all route intercepts above.
2. Call `mockLoggedIn(page)`.
3. Navigate to `/user/alice`.
4. Wait for `[data-testid="profile-hero"]` to be visible.

**Expected**:

- `getByRole("heading", { level: 1 })` text is `"Alice"`.
- `getByText("@alice")` is visible.
- `getByText("10")` adjacent to "Followers" is visible.
- The page does not show `"User not found"`.

---

## TC-04: Follow button visible on another user's profile and functional

**Priority**: P1
**Backend**: Mock

**Why mock**: Follow state is derived from `is_following` in the profile response and
toggled via `POST/DELETE /api/social/follow/:userId`. Mocking both endpoints keeps
the test hermetic and avoids DB side-effects.

**Preconditions**:

- `mockLoggedIn(page)` is called (current user `"user-1"`).
- `GET **/api/user/alice` returns the same payload as TC-03 but with
  `"is_following": false`.
- `GET **/api/achievements/u/alice` returns `{ "achievements": [] }`.
- `GET **/api/user/alice/activity**` returns
  `{ "activities": [], "has_more": false, "next_cursor": null }`.
- `page.route()` intercepts `POST **/api/social/follow/user-2` and returns HTTP 200
  with body `{}`.
- `page.route()` intercepts `GET **/api/user/alice**` (re-fetch after follow) and
  returns the same payload but with `"is_following": true` and
  `"follower_count": 11`.

**Steps**:

1. Set up all route intercepts above.
2. Call `mockLoggedIn(page)`.
3. Navigate to `/user/alice`.
4. Wait for `[data-testid="profile-hero"]` to be visible.
5. `getByRole("button", { name: /^Follow$/i })` — assert it is visible.
6. Click the Follow button.
7. Wait for the button label to change.

**Expected**:

- Before click: button label is `"Follow"` (not Following, not Unfollow).
- After click: button label changes to `"Following"` (optimistic update).
- A success toast `"Following"` appears.
- The Follow API (`POST **/api/social/follow/user-2`) was called exactly once.

---

## TC-05: Achievements section visible on profile when earned achievements present

**Priority**: P1
**Backend**: Mock

**Why mock**: The `ProfileBadgesSummary` sidebar card renders only when
`achievementsData.length > 0` (filtered to earned). Mocking the achievements
endpoint with earned items triggers the card without seeding the DB.

**Preconditions**:

- `mockLoggedIn(page)` is called.
- `GET **/api/user/testuser` returns the own-profile payload from TC-01
  (`show_watchlist: true`).
- `GET **/api/achievements/me` returns:

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
      "category": "watching",
      "tier": "one-shot",
      "repeatable": false,
      "family": null,
      "rungIndex": null,
      "progress": 1,
      "earned": true,
      "earnedAt": "2024-03-01T12:00:00Z",
      "earnedCount": 1,
      "lastEarnedAt": "2024-03-01T12:00:00Z",
      "nextRung": null,
      "rarity": null
    }
  ]
}
```

- `GET **/api/streak/me` returns
  `{ "currentStreak": 0, "longestStreak": 0, "lastWatchDate": null }`.
- `GET **/api/user/testuser/activity**` returns
  `{ "activities": [], "has_more": false, "next_cursor": null }`.

**Steps**:

1. Set up all route intercepts above.
2. Call `mockLoggedIn(page)`.
3. Navigate to `/user/testuser`.
4. Wait for `[data-testid="profile-hero"]` to be visible.

**Expected**:

- The "Achievements" kicker label is visible in the sidebar
  (`getByText("Achievements")`).
- `getByText("1/1")` fraction (earned/total) is visible in the badges summary.
- `getByText("10 XP")` is visible (or inline as `"1/1 · 10 XP"`).
- `getByRole("link", { name: /View all achievements/i })` links to `/achievements`
  (own-profile path).

---

## TC-06: Profile stats (watch time, tracked titles) visible in sidebar

**Priority**: P1
**Backend**: Mock

**Why mock**: The `ProgressCard` sidebar card renders stats from `overview` in the
profile API response. Mocking the profile endpoint is sufficient; no DB is needed.

**Preconditions**:

- `mockLoggedIn(page)` is called.
- `GET **/api/user/testuser` returns the own-profile payload from TC-01 with
  `show_watchlist: true`.
- `GET **/api/achievements/me` returns `{ "achievements": [] }`.
- `GET **/api/streak/me` returns
  `{ "currentStreak": 0, "longestStreak": 0, "lastWatchDate": null }`.
- `GET **/api/user/testuser/activity**` returns
  `{ "activities": [], "has_more": false, "next_cursor": null }`.

**Steps**:

1. Set up all route intercepts above.
2. Call `mockLoggedIn(page)`.
3. Navigate to `/user/testuser`.
4. Wait for `[data-testid="profile-hero"]` to be visible.

**Expected**:

- The "Progress" kicker label is visible in the sidebar (`getByText("Progress")`).
- Episode progress fraction `"42/60"` is visible (watched/released episodes from
  `overview.total_watched_episodes` / `overview.total_released_episodes`).
- Watch time `"30h"` is visible (1800 minutes ÷ 60 = 30 h; rendered by
  `formatWatchTime`).
- `getByText("12")` tracked-title count is visible (from `overview.tracked_count`).

---

## TC-07: "Watch together" button links to overlap page on another user's profile

**Priority**: P1
**Backend**: Mock

**Why mock**: The "Watch together" link is rendered client-side whenever the viewer
is logged in and not viewing their own profile. Its `href` is derived from the
session username and the profile username — no API call needed to assert the link.

**Preconditions**:

- `mockLoggedIn(page)` is called (current user `"testuser"`).
- `GET **/api/user/alice` returns the other-user payload from TC-03.
- `GET **/api/achievements/u/alice` returns `{ "achievements": [] }`.
- `GET **/api/user/alice/activity**` returns
  `{ "activities": [], "has_more": false, "next_cursor": null }`.

**Steps**:

1. Set up all route intercepts above.
2. Call `mockLoggedIn(page)`.
3. Navigate to `/user/alice`.
4. Wait for `[data-testid="profile-hero"]` to be visible.

**Expected**:

- `getByRole("link", { name: /Watch together/i })` is visible in the sidebar.
- The link `href` is `/u/testuser/overlap/alice`.

---

## TC-08: Profile with hidden watchlist shows privacy message

**Priority**: P1
**Backend**: Mock

**Why mock**: The hidden-watchlist branch (`show_watchlist: false`) is a client-side
render guard driven by the `show_watchlist` field. Returning `false` in the mocked
response fully exercises this path.

**Preconditions**:

- `mockLoggedIn(page)` is called.
- `GET **/api/user/alice` returns the other-user payload from TC-03 but with:
  `"show_watchlist": false`, `"profile_visibility": "private"`.
- `GET **/api/achievements/u/alice` returns `{ "achievements": [] }`.
- (No activity intercept needed — activity section is skipped when watchlist hidden.)

**Steps**:

1. Set up the route intercepts above.
2. Call `mockLoggedIn(page)`.
3. Navigate to `/user/alice`.
4. Wait for `[data-testid="profile-hero"]` to be visible.

**Expected**:

- The watchlist grid (tabs and title cards) is not rendered.
- A privacy message is visible — one of the i18n keys resolves to something like
  `"This user's watchlist is private"` or similar
  (`getByText(/watchlist.*private/i)` or the rendered i18n string).
- The "Progress" sidebar card is not rendered (it is gated on `show_watchlist`).
