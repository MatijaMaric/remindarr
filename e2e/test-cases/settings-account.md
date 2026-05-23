# Test cases: settings — account tab

## Preconditions (shared)

- The Remindarr dev server is running (Bun on `:3000`, Vite proxy on `:5173`).
- Unless stated otherwise, the browser has an active session courtesy of
  `mockLoggedIn(page)` (stubs `GET /api/auth/get-session` with `MOCK_SESSION`).
- The settings page is at `/settings` (account tab is the default; no `?tab=` needed).
- The account tab renders: **User** card, **Edit profile** card, **Passkeys** card
  (browser-dependent), **Profile visibility** card, **Activity stream** card, and
  **Social / Invite** card.

---

## TC-01: Account tab loads with user identity card

**Priority**: P0
**Backend**: Mock

**Why mock**: The user identity card reads from the session (`MOCK_SESSION`). The
profile edit form calls `GET /api/user/me/profile`. Both can be stubbed to assert
the exact fields without a seeded database.

**Preconditions**:

- `mockLoggedIn(page)` stubs the session with `MOCK_SESSION` (username `"testuser"`).
- `page.route()` intercepts `GET **/api/user/me/profile` and returns:

```json
{
  "display_name": "Test User",
  "bio": null,
  "country_code": "US",
  "locale": null
}
```

- `page.route()` intercepts `GET **/api/track` and returns:

```json
{
  "titles": [],
  "count": 0,
  "profile_public": true,
  "profile_visibility": "public"
}
```

- `page.route()` intercepts `GET **/api/user/me/activity-settings` and returns:

```json
{ "enabled": false, "kind_visibility": {} }
```

**Steps**:

1. Set up all route intercepts above.
2. Call `mockLoggedIn(page)`.
3. Navigate to `/settings`.
4. Wait for the page heading to be visible.

**Expected**:

- `getByRole("heading", { name: /Settings/i })` or a kicker containing `"testuser"` is
  visible.
- A read-only input with value `"testuser"` (the username field) is visible.
- An input labelled `"Display name"` showing `"Test User"` or `"testuser"` is visible.
- A read-only input labelled `"Auth provider"` with value `"local"` is visible.
- A read-only input labelled `"Role"` with value `"user"` is visible.
- The breadcrumb area shows `/settings › account`.

---

## TC-02: Unauthenticated user redirected to /login

**Priority**: P0
**Backend**: Mock

**Why mock**: The redirect is driven by the `RequireAuth` component reading the session
stub. `mockLoggedOut(page)` exercises the guard without a real auth stack.

**Preconditions**:

- `mockLoggedOut(page)` stubs `GET /api/auth/get-session` with `null`.

**Steps**:

1. Call `mockLoggedOut(page)`.
2. Navigate to `/settings`.
3. Wait for the URL to change away from `/settings`.

**Expected**:

- The browser is redirected to `/login` (URL pathname is `/login`).
- The login form or sign-in button is visible.
- Settings page content (`getByText("Settings")`) is never rendered.

---

## TC-03: Profile edit form saves display name

**Priority**: P1
**Backend**: Mock

**Why mock**: The save is a `PATCH /api/user/me/profile`. Mocking lets us assert
the request body and success message without hitting a real database.

**Preconditions**:

- Same intercepts as TC-01.
- `page.route()` intercepts `PATCH **/api/user/me/profile` and returns:

```json
{
  "display_name": "Updated Name",
  "bio": null,
  "country_code": "US",
  "locale": null
}
```

**Steps**:

1. Set up all route intercepts.
2. Call `mockLoggedIn(page)`.
3. Navigate to `/settings`.
4. Locate the "Edit profile" card and clear the Display name field.
5. Type `"Updated Name"` into the Display name field.
6. Click the Save button in the Edit profile card.
7. Wait for a success message to appear.

**Expected**:

- A success message (e.g., "Profile saved" or i18n equivalent) appears in the Edit
  profile card.
- The `PATCH` intercept was called exactly once with a body containing
  `"display_name": "Updated Name"`.

---

## TC-04: Password change form is shown only for local auth users

**Priority**: P1
**Backend**: Mock

**Why mock**: Visibility of the password form is conditioned on
`user.auth_provider === "local"`, which is present in the session stub.

**Preconditions**:

- `mockLoggedIn(page)` stubs the session with `MOCK_SESSION` (no `auth_provider` field
  set, defaults to `"local"`). Note: `MOCK_SESSION.user` does not include
  `auth_provider`; the component treats a missing or `"local"` value as local auth.
- Same profile and track intercepts as TC-01.

**Steps**:

1. Set up all route intercepts.
2. Call `mockLoggedIn(page)`.
3. Navigate to `/settings`.
4. Scan the page for a section titled "Change password" (or i18n key
   `profile.changePassword`).

**Expected**:

- A card or section with a heading matching "Change password" is visible.
- A password input labelled "Current password" is present.
- A password input labelled "New password" is present.
- A submit button for changing the password is present.

---

## TC-05: Password change form hidden for OIDC users

**Priority**: P1
**Backend**: Mock

**Why mock**: The form guard (`user.auth_provider === "local"`) is evaluated from the
session object. We can test the hidden-form branch by overriding the session user
without needing a real OIDC provider.

**Preconditions**:

- `page.route()` intercepts `GET **/api/auth/get-session` and returns a session where
  `user.auth_provider` is `"oidc"` (or any non-`"local"` value):

```json
{
  "session": {
    "id": "session-1",
    "userId": "user-1",
    "expiresAt": "2099-01-01T00:00:00.000Z",
    "token": "mock-session-token"
  },
  "user": {
    "id": "user-1",
    "name": "Test User",
    "email": "test@example.com",
    "username": "testuser",
    "role": "user",
    "auth_provider": "oidc"
  }
}
```

- Same profile and track intercepts as TC-01.

**Steps**:

1. Set up all route intercepts.
2. Navigate to `/settings`.
3. Wait for the user identity card to be visible.

**Expected**:

- The user identity card is visible with `auth_provider` showing `"oidc"`.
- No "Change password" card or heading is rendered on the page.

---

## TC-06: Profile visibility selector renders and updates

**Priority**: P1
**Backend**: Mock

**Why mock**: The visibility options (public / friends_only / private) are rendered
from `GET /api/track` and saved via `PATCH /api/user/profile/visibility`. Both can
be fully exercised with stubs.

**Preconditions**:

- Same intercepts as TC-01 (track returns `profile_visibility: "public"`).
- `page.route()` intercepts `PATCH **/api/user/profile/visibility` and returns:

```json
{ "profile_visibility": "private" }
```

**Steps**:

1. Set up all route intercepts.
2. Call `mockLoggedIn(page)`.
3. Navigate to `/settings`.
4. Wait for the visibility selector section to be visible
   (`[data-testid="visibility-selector"]`).
5. Click the radio card for "private" (or `getByText(/Only me/i)` within the
   visibility section).
6. Wait for the `PATCH` call to complete.

**Expected**:

- The `PATCH` intercept is called with a body selecting `"private"`.
- The "private" radio card becomes the selected state (visually highlighted) after
  the response.

---

## TC-07: Activity stream toggle fires PATCH

**Priority**: P1
**Backend**: Mock

**Why mock**: The activity stream section reads from `GET /api/user/me/activity-settings`
and writes via `PATCH`. Mocking isolates the toggle behaviour.

**Preconditions**:

- `page.route()` intercepts `GET **/api/user/me/activity-settings` and returns
  `{ "enabled": false, "kind_visibility": {} }`.
- `page.route()` intercepts `PATCH **/api/user/me/activity-settings` and returns
  `{ "enabled": true, "kind_visibility": {} }`.
- Other intercepts from TC-01 are active.

**Steps**:

1. Set up all route intercepts.
2. Call `mockLoggedIn(page)`.
3. Navigate to `/settings`.
4. Find the "Activity stream" card and locate the "Show activity on profile" toggle
   (`SSwitch` labelled accordingly).
5. Click the toggle.
6. Wait for the `PATCH` intercept to fire.

**Expected**:

- The `PATCH` intercept is called with `{ "enabled": true }` (or a body containing
  `enabled: true`).
- The toggle visually switches to the enabled state.

---

## TC-08: Social / Invite link navigates to /invite

**Priority**: P2
**Backend**: Mock

**Why mock**: The link is a static `<Link to="/invite">` and does not call any API.
Mocking the session is sufficient.

**Preconditions**:

- Same intercepts as TC-01.
- `mockLoggedIn(page)` is active.

**Steps**:

1. Set up all route intercepts.
2. Call `mockLoggedIn(page)`.
3. Navigate to `/settings`.
4. Locate the Social card and click the link mentioning invitations
   (e.g., `getByRole("link", { name: /invite/i })`).

**Expected**:

- The browser navigates to `/invite` (URL pathname is `/invite`).
