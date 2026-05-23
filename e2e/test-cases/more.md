# Test cases: more

## Preconditions (shared)

- The Remindarr dev server is running (Bun on `:3000`, Vite proxy on `:5173`).
- The "More" page is at `/more` — it is wrapped in `<RequireAuth>`. An unauthenticated
  visitor must be redirected to `/login`.
- The page renders entirely from `useAuth()` context data (the logged-in user object). It
  makes no independent API calls beyond what the auth session provides.
- `MorePage` returns `null` immediately if `user` is falsy, so it only renders content when
  a real session is present.
- All test cases use `page.route()` mocks unless explicitly marked **Real**.
- Before navigating, apply the following base mocks:
  - `GET **/api/auth/get-session` → `MOCK_SESSION` (from `e2e/helpers.ts`)
  - `GET **/api/auth/custom/providers` → `{ local: true, oidc: null }`

The `MOCK_SESSION` user has `username: "testuser"` and no `display_name`, so the displayed
name defaults to `"testuser"` and initials default to `"T"`.

---

## TC-01: Page loads with profile card, Discover group, Account group, and Session group

**Priority**: P0
**Backend**: Mock

**Why mock**: The entire page is derived from the auth session — no additional API calls are
made. Mocking the session is sufficient to exercise the full render.

**Preconditions**:

- All shared mocks applied (`get-session` → `MOCK_SESSION`).

**Steps**:

1. Apply all shared route mocks.
2. Navigate to `/more`.
3. Wait for the profile card link to be visible.

**Expected**:

- A profile card at the top of the page is visible. It shows:
  - An avatar circle containing the initial `"T"` (uppercased first character of `"testuser"`).
  - The display name `"testuser"` (bold).
  - The username `"@testuser"` in monospace below.
  - A chevron-right icon indicating it is a navigation link.
- A section labelled `"Discover"` (uppercase monospace group label) is present, containing
  two rows:
  - `"Discovery"` with sub-label `"Recommendations and suggestions for you"`.
  - `"Stats"` with sub-label `"Your watch history"`.
- A section labelled `"Account"` is present, containing two rows:
  - `"Profile"` (with no sub-label).
  - `"Settings"` (with no sub-label).
- A section labelled `"Session"` is present, containing one row:
  - `"Sign out"` in red text (danger style, no chevron).
- No error banner is shown.

---

## TC-02: Unauthenticated user is redirected to /login

**Priority**: P0
**Backend**: Mock

**Why mock**: Confirms that `/more` is guarded by `<RequireAuth>`. A visitor with no session
must be redirected before the page content renders.

**Preconditions**:

- `GET **/api/auth/get-session` → `null` (no session).
- `GET **/api/auth/custom/providers` → `{ local: true, oidc: null }`.

**Steps**:

1. Apply unauthenticated mocks (`get-session` → `null`).
2. Navigate to `/more`.
3. Wait for the URL to change.

**Expected**:

- The browser URL changes to `/login` (or `/login?redirect=/more`) — `RequireAuth`
  redirected the visitor.
- The profile card and the group sections are **not** visible.

---

## TC-03: Profile card and Profile row both navigate to the user's profile page

**Priority**: P1
**Backend**: Mock

**Why mock**: Navigation is a frontend concern. Both the profile card at the top and the
`"Profile"` row in the Account group are `<Link to="/user/:username">` elements.

**Preconditions**:

- All shared mocks applied.

**Steps** (profile card):

1. Apply all shared route mocks.
2. Navigate to `/more` and wait for the profile card.
3. Click the profile card link (the entire card is a `<Link>`).
4. Wait for the URL to change.

**Expected**:

- The URL changes to `/user/testuser`.

**Steps** (Profile row):

1. Re-apply mocks and navigate to `/more`.
2. Click `getByRole("link", { name: "Profile" })` inside the Account group.
3. Wait for the URL to change.

**Expected**:

- The URL changes to `/user/testuser`.

---

## TC-04: "Discovery" row navigates to /discovery

**Priority**: P1
**Backend**: Mock

**Why mock**: Validates the `to="/discovery"` prop on the Discovery `MoreRow`. No discovery
data needs to load — we only assert the URL change.

**Preconditions**:

- All shared mocks applied.

**Steps**:

1. Apply all shared route mocks.
2. Navigate to `/more` and wait for the profile card.
3. Click `getByRole("link", { name: /discovery/i })`.
4. Wait for the URL to change.

**Expected**:

- The URL changes to `/discovery`.

---

## TC-05: "Stats" row navigates to /tracked?view=stats

**Priority**: P1
**Backend**: Mock

**Why mock**: Validates the `to="/tracked?view=stats"` prop on the Stats `MoreRow`. No
tracked-page data needs to load.

**Preconditions**:

- All shared mocks applied.

**Steps**:

1. Apply all shared route mocks.
2. Navigate to `/more` and wait for the profile card.
3. Click `getByRole("link", { name: /stats/i })`.
4. Wait for the URL to change.

**Expected**:

- The URL changes to `/tracked` and the query string contains `view=stats`.

---

## TC-06: "Settings" row navigates to /settings

**Priority**: P1
**Backend**: Mock

**Why mock**: Validates the `to="/settings"` prop on the Settings `MoreRow`.

**Preconditions**:

- All shared mocks applied.

**Steps**:

1. Apply all shared route mocks.
2. Navigate to `/more` and wait for the profile card.
3. Click `getByRole("link", { name: /settings/i })`.
4. Wait for the URL to change.

**Expected**:

- The URL changes to `/settings`.

---

## TC-07: "Sign out" button logs out and redirects to /login

**Priority**: P0
**Backend**: Mock

**Why mock**: The sign-out flow calls `logout()` from `useAuth()` then calls
`navigate("/login", { replace: true })`. Mocking the sign-out API endpoint lets us verify
the redirect without a real session store.

**Preconditions**:

- All shared mocks applied.
- `POST **/api/auth/sign-out` → HTTP 200 `{ "success": true }` (better-auth sign-out
  endpoint; the exact path may vary — intercept `**/api/auth/**sign-out**` to be safe).

**Steps**:

1. Apply all shared route mocks including the sign-out intercept.
2. Navigate to `/more` and wait for the profile card.
3. Click `getByRole("button", { name: /sign out/i })`.
4. Wait for the URL to change.

**Expected**:

- The `POST /api/auth/sign-out` (or equivalent better-auth endpoint) request was made.
- The browser URL changes to `/login`.
- The profile card and group sections are no longer visible.

---

## TC-08: Page shows user display_name when set (not just username)

**Priority**: P2
**Backend**: Mock

**Why mock**: When `user.display_name` is set, the profile card shows the display name as
the primary label instead of the username. The initials avatar is also derived from the
display name in this case.

**Preconditions**:

- `GET **/api/auth/get-session` → a session with `user.display_name = "Alice Smith"` and
  `user.username = "alice"`:
  ```json
  {
    "session": {
      "id": "s1",
      "userId": "u1",
      "expiresAt": "2099-01-01T00:00:00Z",
      "token": "tok"
    },
    "user": {
      "id": "u1",
      "name": "Alice Smith",
      "email": "alice@example.com",
      "username": "alice",
      "display_name": "Alice Smith",
      "role": "user"
    }
  }
  ```
- `GET **/api/auth/custom/providers` → `{ local: true, oidc: null }`.

**Steps**:

1. Apply the above mocks.
2. Navigate to `/more` and wait for the profile card.

**Expected**:

- The profile card primary label reads `"Alice Smith"`.
- The avatar circle shows initials `"AS"` (first letters of `"Alice"` and `"Smith"`).
- The monospace sub-label reads `"@alice"`.
