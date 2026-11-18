# Test cases: signup

## Preconditions (shared)

- The Remindarr dev server is running (Bun on `:3000`, Vite proxy on `:5173`).
- The E2E database has been wiped and the bootstrap admin user has been auto-created.
- Unless stated otherwise, the browser is unauthenticated (no active session cookie).
- The signup page is at `/signup`.

---

## TC-01: Happy path — sign up with all fields filled

**Priority**: P0
**Backend**: Mock (sign-up + stateful get-session)

**Why mock**: Keeps the suite hermetic and lets the test control when the session becomes
signed in. Cookie issuance and persistence are better-auth's job and are covered by its
own tests; this case verifies the UI's request body and the redirect contract.

**Preconditions**:

- No existing account with the chosen username or email.

**Steps**:

1. Navigate to `/signup`.
2. `getByLabel("Username")` → fill `testuser_01`.
3. `getByLabel("Email")` → fill `testuser01@example.com`.
4. `getByLabel("Display Name")` → fill `Test User One`.
5. `getByLabel("Password")` → fill `securePass1`.
6. `getByRole("button", { name: /create account/i })` → click.
7. Wait for URL to change away from `/signup` (i.e., URL pathname is `/`).

**Expected**:

- While the signed-in get-session response is held, the page stays on `/signup`.
- Once released, the browser is redirected to `/` and the nav shows the new user's profile
  link (`"Test User One"` → `/user/<username>`), i.e. the app is signed in.
- The sign-up request body carries `username`, `email` and `name: "Test User One"`.

> **Automation note**: the spec mocks sign-up. Since #1429 the redirect is driven only by
> AuthContext's `user` becoming set (SignupPage's effect), which happens when get-session
> returns a user after sign-up. The get-session mock must therefore be stateful: `null`
> before the sign-up call, signed in after it (`mockSessionAfterSignup` in the spec).

---

## TC-02: Happy path — display name omitted (defaults to username)

**Priority**: P1
**Backend**: Mock (sign-up + stateful get-session)

**Why mock**: The fallback is client-side — SignupPage sends `name = username` when the
Display Name field is blank (`name || username`) — so the request body is what matters.

**Preconditions**:

- No existing account with the chosen username or email.

**Steps**:

1. Navigate to `/signup`.
2. `getByLabel("Username")` → fill `testuser_02`.
3. `getByLabel("Email")` → fill `testuser02@example.com`.
4. Leave `getByLabel("Display Name")` empty.
5. `getByLabel("Password")` → fill `securePass2`.
6. `getByRole("button", { name: /create account/i })` → click.
7. Wait for URL to change to `/`.

**Expected**:

- The sign-up request body has `name` equal to the username.
- Same redirect contract as TC-01: stays on `/signup` until the session is signed in, then
  lands on `/` with the nav profile link named after the username.

---

## TC-03: Loading state — button shows "Creating account…" during request

**Priority**: P1
**Backend**: Mock (with artificial delay)

**Why mock**: The loading state is purely a frontend concern. Intercepting the API call
lets us pause it long enough to assert the button state without depending on backend
latency.

**Preconditions**:

- Page is loaded and unauthenticated.
- `page.route()` intercepts `POST /api/auth/sign-up/email` and delays the response
  by at least 1 000 ms before returning a 200 success body.

**Steps**:

1. Set up route intercept on `**/api/auth/sign-up/email` that waits ~1 000 ms before
   fulfilling with a successful payload.
2. Navigate to `/signup`.
3. `getByLabel("Username")` → fill `loadingtest`.
4. `getByLabel("Email")` → fill `loadingtest@example.com`.
5. `getByLabel("Password")` → fill `securePass3`.
6. `getByRole("button", { name: /create account/i })` → click.
7. **Immediately** after clicking, assert the button state (before the response arrives).

**Expected**:

- The submit button text changes to `"Creating account…"` (or similar in-progress label).
- The submit button is disabled (`disabled` attribute present) while the request is in-flight.
- After the mocked response resolves, the button is no longer shown (redirect has occurred
  or button returns to its default state).

---

## TC-04: Duplicate username — error banner

**Priority**: P0
**Backend**: Mock

**Why mock**: The server response for a duplicate username is deterministic and can be
replicated with a `page.route()` stub. No real DB state is required.

**Preconditions**:

- `page.route()` intercepts `POST /api/auth/sign-up/email` and returns:
  - HTTP 422 (or the status better-auth uses for this error)
  - JSON body: `{ "message": "Username is already taken. Please try another." }`
    (match whatever the real server returns — see explorer findings).

**Steps**:

1. Set up route intercept as described in preconditions.
2. Navigate to `/signup`.
3. `getByLabel("Username")` → fill `existinguser`.
4. `getByLabel("Email")` → fill `new@example.com`.
5. `getByLabel("Password")` → fill `securePass4`.
6. `getByRole("button", { name: /create account/i })` → click.
7. Wait for the error banner to appear.

**Expected**:

- A red/error banner is visible above the form.
- The banner text contains `"Username is already taken. Please try another."`.
- The URL remains `/signup` (no redirect).
- The form fields retain their values so the user can correct the username.

---

## TC-05: Duplicate email — error banner

**Priority**: P0
**Backend**: Mock

**Why mock**: Same reasoning as TC-04 — the server response is known and can be stubbed.

**Preconditions**:

- `page.route()` intercepts `POST /api/auth/sign-up/email` and returns an error response
  with message `"User already exists. Use another email."`.

**Steps**:

1. Set up route intercept as described in preconditions.
2. Navigate to `/signup`.
3. `getByLabel("Username")` → fill `brandnewuser`.
4. `getByLabel("Email")` → fill `existing@example.com`.
5. `getByLabel("Password")` → fill `securePass5`.
6. `getByRole("button", { name: /create account/i })` → click.
7. Wait for the error banner to appear.

**Expected**:

- A red/error banner is visible above the form.
- The banner text contains `"User already exists. Use another email."`.
- The URL remains `/signup`.

---

## TC-06: Password too short — blocked by HTML5 validation

**Priority**: P1
**Backend**: Mock (only to detect a stray request)

**Why**: Since #1429 the password field has `minLength={8}`, so a sub-8-character password
is rejected by the browser and never reaches better-auth.

**Preconditions**:

- `page.route()` intercepts `POST /api/auth/sign-up/email` and records whether it was hit.

**Steps**:

1. Navigate to `/signup`.
2. `getByLabel("Username")` → fill `shortpwuser`.
3. `getByLabel("Email")` → fill `shortpw@example.com`.
4. `getByLabel("Password")` → fill `abc1234` (7 characters).
5. Click the `"Sign Up"` button.

**Expected**:

- The password field reports `validity.tooShort === true` and is focused.
- No sign-up request was sent.
- The URL remains `/signup`.

---

## TC-07: Invalid username characters — blocked by HTML5 validation

**Priority**: P1
**Backend**: Mock (only to detect a stray request)

**Why**: Since #1429 the username field has `pattern="[a-zA-Z0-9_.\-]+"`, matching the
server's `usernameValidator` (dashes are allowed by both). Characters outside that set are
rejected by the browser before any request.

**Steps**:

1. Navigate to `/signup`.
2. `getByLabel("Username")` → fill `bad!username`.
3. `getByLabel("Email")` → fill `invalid@example.com`.
4. `getByLabel("Password")` → fill `securePass7`.
5. Click the `"Sign Up"` button.

**Expected**:

- The username field reports `validity.patternMismatch === true` and is focused.
- No sign-up request was sent.
- The URL remains `/signup`.

---

## TC-08: Empty form submit — HTML5 browser prevents submission

**Priority**: P2
**Backend**: None (pure UI)

**Why pure UI**: This tests browser-native form validation — no network request is made.

**Preconditions**:

- None. Navigate to `/signup` on a fresh, unauthenticated browser.

**Steps**:

1. Navigate to `/signup`.
2. Do not fill any fields.
3. `getByRole("button", { name: /create account/i })` → click.

**Expected**:

- No POST request is made to `/api/auth/sign-up/email`.
- The browser shows its native validation UI (e.g. "Please fill out this field" tooltip).
- Focus moves to the first empty required field (`getByLabel("Username")`).
- The URL remains `/signup`.

> **Note**: All three required fields (Username, Email, Password) have `required` on their
> HTML `<input>` elements. The browser will stop at the first unfilled required field.

---

## TC-09: Already logged in — navigating to /signup redirects to /

**Priority**: P1
**Backend**: Mock

**Why mock**: The redirect-if-logged-in guard is a frontend route check. Using
`mockLoggedIn(page)` (from `e2e/helpers.ts`) to stub `/api/auth/get-session` is
sufficient; no real session is needed.

**Preconditions**:

- `mockLoggedIn(page)` has been called to stub `GET /api/auth/get-session` with an
  active session payload.

**Steps**:

1. Call `mockLoggedIn(page)` to inject a mock session.
2. Navigate to `/signup`.
3. Wait briefly for any client-side redirect to complete.

**Expected**:

- The browser is redirected from `/signup` to `/` (home page).
- The `/signup` page content is never rendered (the redirect happens before render or
  immediately on mount).

---

## TC-10: Navigation links — Sign in / Sign up cross-links

**Priority**: P2
**Backend**: None (pure UI)

**Why pure UI**: This only tests that anchor `<a>` elements exist with the correct `href`.
No auth or API call is involved.

**Preconditions**:

- None. Use an unauthenticated browser.

**Steps — Part A (signup → login link)**:

1. Navigate to `/signup`.
2. Locate the `getByRole("link", { name: /sign in/i })` link on the signup page.
3. Click the link.
4. Wait for navigation to complete.

**Expected (Part A)**:

- Browser navigates to `/login`.
- The login form is visible.

**Steps — Part B (login → signup link)**:

1. Navigate to `/login`.
2. Locate the `getByRole("link", { name: /sign up/i })` link on the login page.
3. Click the link.
4. Wait for navigation to complete.

**Expected (Part B)**:

- Browser navigates to `/signup`.
- The signup form is visible with all four fields (Username, Email, Display Name, Password).
