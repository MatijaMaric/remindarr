# Test cases: admin users page

## Preconditions (shared)

- The Remindarr dev server is running (Bun on `:3000`, Vite proxy on `:5173`).
- The admin users page is at `/admin/users`.
- The page requires an authenticated session where `user.is_admin === true`.
  Construct the admin session inline (or via a shared `MOCK_ADMIN_SESSION` helper):

```json
{
  "session": {
    "id": "session-1",
    "userId": "user-1",
    "expiresAt": "<future ISO>",
    "token": "mock-session-token"
  },
  "user": {
    "id": "user-1",
    "name": "Admin User",
    "email": "admin@example.com",
    "username": "admin",
    "role": "admin",
    "is_admin": true
  }
}
```

- `GET **/api/auth/custom/providers` returns `{ "local": true, "oidc": null }`.
- A canonical **two-user list** response for `GET **/api/admin/users**`:

```json
{
  "users": [
    {
      "id": "user-1",
      "username": "admin",
      "name": "Admin User",
      "email": "admin@example.com",
      "role": "admin",
      "is_admin": 1,
      "auth_provider": "credential",
      "banned": false,
      "ban_reason": null,
      "ban_expires": null,
      "created_at": "2024-01-01T00:00:00Z",
      "updated_at": "2024-01-01T00:00:00Z"
    },
    {
      "id": "user-2",
      "username": "regularuser",
      "name": "Regular User",
      "email": "regular@example.com",
      "role": "user",
      "is_admin": 0,
      "auth_provider": "credential",
      "banned": false,
      "ban_reason": null,
      "ban_expires": null,
      "created_at": "2024-02-01T00:00:00Z",
      "updated_at": "2024-02-01T00:00:00Z"
    }
  ],
  "total": 2,
  "page": 1,
  "page_size": 25,
  "total_pages": 1
}
```

---

## TC-01: Admin users page loads and shows user list

**Priority**: P0
**Backend**: Mock

**Why mock**: The user table is a pure render of `GET /api/admin/users`. Mocking the
response lets us assert exact rows without a seeded database.

**Preconditions**:

- Admin session mock (as in shared preconditions).
- `GET **/api/admin/users**` returns the canonical two-user list.

**Steps**:

1. Set up all route intercepts above.
2. Navigate to `/admin/users`.
3. Wait for `getByRole("heading", { level: 1 })` to be visible.

**Expected**:

- `getByRole("heading", { level: 1 })` text contains `"Users"` (translation key
  `admin.users.title`).
- `getByText("admin")` (username) is visible in the table.
- `getByText("regularuser")` is visible in the table.
- Two rows appear in the `<tbody>`.
- The `"← Back to settings"` link is visible and points to `/settings`.
- A total count label is visible (`"2 users"` or similar).

---

## TC-02: Non-admin user sees access-denied message

**Priority**: P0
**Backend**: Mock

**Why mock**: The access-denied guard is `if (!me?.is_admin) return <div>…</div>`.
Mocking the session with a non-admin user fully exercises this branch.

**Preconditions**:

- `mockLoggedIn(page)` stubs the session with `MOCK_SESSION` (role `"user"`,
  `is_admin` false).

**Steps**:

1. Call `mockLoggedIn(page)`.
2. Navigate to `/admin/users`.
3. Wait for the page to render.

**Expected**:

- `getByText(/access denied/i)` or the translated `admin.accessDenied` message is
  visible.
- No user table is rendered (`getByRole("table")` is absent).

---

## TC-03: Unauthenticated user is redirected to /login

**Priority**: P0
**Backend**: Mock

**Why mock**: The `RequireAuth` wrapper redirects unauthenticated sessions before the
page component even mounts.

**Preconditions**:

- `mockLoggedOut(page)` stubs `GET /api/auth/get-session` with `null`.

**Steps**:

1. Call `mockLoggedOut(page)`.
2. Navigate to `/admin/users`.
3. Wait for the URL to change away from `/admin/users`.

**Expected**:

- The browser is redirected to `/login`.
- The login form is visible (`getByRole("button", { name: /sign in/i })` is present).

---

## TC-04: Role badges are shown for admin and regular users

**Priority**: P1
**Backend**: Mock

**Why mock**: Badge rendering depends on `user.role === "admin"` and
`user.is_admin === 1`. Both states are present in the canonical two-user list.

**Preconditions**:

- Admin session mock.
- `GET **/api/admin/users**` returns the canonical two-user list.

**Steps**:

1. Set up all route intercepts.
2. Navigate to `/admin/users`.
3. Wait for the user table to appear.

**Expected**:

- An `"Admin"` role badge is visible in the `admin` user's row (amber styling).
- A `"User"` role badge is visible in the `regularuser` row (neutral/zinc styling).
- The `admin` row (which is the currently-signed-in user) shows a `"You"` label
  instead of action buttons.
- The `regularuser` row shows action buttons (role toggle, ban, delete icons).

---

## TC-05: Promoting a regular user to admin updates their role badge

**Priority**: P1
**Backend**: Mock

**Why mock**: The promote action is `PUT /api/admin/users/:id/role` followed by a
`GET /api/admin/users` refetch. Both can be mocked to assert the badge updates.

**Preconditions**:

- Admin session mock.
- `GET **/api/admin/users**` initially returns the canonical two-user list.
- `PUT **/api/admin/users/user-2/role` returns `{ "message": "Role updated" }`.
- After the PUT, `GET **/api/admin/users**` returns the same list with `user-2`
  promoted (`"role": "admin"`, `"is_admin": 1`).

**Steps**:

1. Set up all route intercepts.
2. Navigate to `/admin/users`.
3. Wait for `getByText("regularuser")` to be visible.
4. Identify the role-toggle button in `regularuser`'s row:
   `getByRole("button", { name: /promote/i })` (aria-label is the translation of
   `admin.users.promote`).
5. Click the promote button.
6. Wait for the refetch to complete.

**Expected**:

- The `regularuser` row now displays an `"Admin"` badge (amber styling).
- The role-toggle button aria-label changes to the `"Demote"` translation.
- No error toast is shown.

---

## TC-06: Deleting a user removes them from the table

**Priority**: P1
**Backend**: Mock

**Why mock**: Delete is `DELETE /api/admin/users/:id` + refetch. Mocking both lets
us assert the row disappears without touching a real database.

**Preconditions**:

- Admin session mock.
- `GET **/api/admin/users**` initially returns the canonical two-user list.
- `DELETE **/api/admin/users/user-2` returns `{ "message": "User deleted" }`.
- After the DELETE, `GET **/api/admin/users**` returns only the admin user:

```json
{
  "users": [
    {
      "id": "user-1",
      "username": "admin",
      "name": "Admin User",
      "email": "admin@example.com",
      "role": "admin",
      "is_admin": 1,
      "auth_provider": "credential",
      "banned": false,
      "ban_reason": null,
      "ban_expires": null,
      "created_at": "2024-01-01T00:00:00Z",
      "updated_at": "2024-01-01T00:00:00Z"
    }
  ],
  "total": 1,
  "page": 1,
  "page_size": 25,
  "total_pages": 1
}
```

**Steps**:

1. Set up all route intercepts.
2. Navigate to `/admin/users`.
3. Wait for `getByText("regularuser")` to be visible.
4. Click the delete button in `regularuser`'s row:
   `getByRole("button", { name: /delete user/i })` (aria-label `admin.users.delete`).
5. A confirmation dialog appears — click the `"Delete"` confirmation button
   (`getByRole("button", { name: /delete/i })` inside the dialog, translation key
   `admin.users.deleteConfirmButton`).
6. Wait for the dialog to close and refetch to complete.

**Expected**:

- The confirmation dialog closes.
- `getByText("regularuser")` is no longer in the DOM.
- Only the `admin` row remains in the table.
- The total-count label updates to reflect `1 user`.

---

## TC-07: Banning a user shows the ban confirmation dialog

**Priority**: P1
**Backend**: Mock

**Why mock**: The ban flow opens an `AlertDialog` with an optional reason input.
Exercising the dialog open/close state only requires a mock for the ban API response.

**Preconditions**:

- Admin session mock.
- `GET **/api/admin/users**` returns the canonical two-user list.
- `PUT **/api/admin/users/user-2/ban` returns `{ "message": "User banned" }`.
- After the PUT, `GET **/api/admin/users**` returns the list with `user-2` banned
  (`"banned": true`).

**Steps**:

1. Set up all route intercepts.
2. Navigate to `/admin/users`.
3. Wait for `getByText("regularuser")` to be visible.
4. Click the ban button in `regularuser`'s row:
   `getByRole("button", { name: /ban user/i })` (aria-label `admin.users.ban`).
5. The ban dialog appears — optionally fill in a ban reason.
6. Click the `"Ban"` confirmation button (translation key `admin.users.banConfirm`).
7. Wait for the dialog to close and refetch to complete.

**Expected**:

- The ban dialog opens (`getByText(/ban/i)` dialog title is visible).
- After confirming, the dialog closes.
- `regularuser`'s row now shows a `"Banned"` badge (red styling).
- The ban button icon changes to an `"Unban"` button (aria-label `admin.users.unban`).

---

## TC-08: Search filters the user list

**Priority**: P1
**Backend**: Mock

**Why mock**: The search input triggers a query-param change on
`GET /api/admin/users?search=…`. Mocking the filtered response verifies the UI
re-renders correctly.

**Preconditions**:

- Admin session mock.
- `GET **/api/admin/users**` (no search param) returns the canonical two-user list.
- `GET **/api/admin/users?search=regular**` returns only the `regularuser` entry
  (`total: 1`, `total_pages: 1`).

**Steps**:

1. Set up both route intercepts.
2. Navigate to `/admin/users`.
3. Wait for both user rows to appear.
4. Type `"regular"` into the search input
   (`getByPlaceholder(...)` / `getByRole("textbox")` for the search field).
5. Wait for the table to re-render.

**Expected**:

- Only `getByText("regularuser")` is visible in the table.
- `getByText("admin")` (username) is **not** visible in the table body.
