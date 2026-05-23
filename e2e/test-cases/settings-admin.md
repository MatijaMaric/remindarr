# Test cases: settings — admin tab

## Preconditions (shared)

- The Remindarr dev server is running (Bun on `:3000`, Vite proxy on `:5173`).
- The admin tab is at `/settings?tab=admin`.
- The admin tab is only rendered when `user.is_admin === true` in the session.
  `MOCK_SESSION` (from `e2e/helpers.ts`) has `role: "user"` — for admin tests a
  custom session override is needed (see individual preconditions).
- An **admin session mock** is defined as `MOCK_SESSION` with `user.role = "admin"`
  and `user.is_admin = true` (construct inline or export `MOCK_ADMIN_SESSION` from
  a shared helper).

---

## TC-01: Admin tab is accessible to admin users and shows all sections

**Priority**: P0
**Backend**: Mock

**Why mock**: All four sections (Background jobs, OpenID Connect, Runtime config,
Server logs, Maintenance) each fetch their own API endpoint. Mocking all of them
lets us assert every section heading is present without a running backend.

**Preconditions**:

- `page.route()` stubs `GET **/api/auth/get-session` with an admin session:

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

- `page.route()` stubs `GET **/api/auth/custom/providers` with `{ "local": true, "oidc": null }`.
- `page.route()` stubs `GET **/api/admin/jobs` with:

```json
{
  "crons": [],
  "stats": {},
  "recentJobs": []
}
```

- `page.route()` stubs `GET **/api/admin/settings` with a fully unconfigured OIDC payload:

```json
{
  "oidc": {
    "issuer_url": { "value": "", "source": "unset" },
    "client_id": { "value": "", "source": "unset" },
    "client_secret": { "value": "", "source": "unset" },
    "redirect_uri": { "value": "", "source": "unset" },
    "admin_claim": { "value": "", "source": "unset" },
    "admin_value": { "value": "", "source": "unset" }
  },
  "oidc_configured": false
}
```

- `page.route()` stubs `GET **/api/admin/config` with `{ "safe": [], "secrets": [] }`.
- `page.route()` stubs `GET **/api/admin/logs**` with `{ "entries": [], "count": 0 }`.

**Steps**:

1. Set up all route intercepts above.
2. Navigate to `/settings?tab=admin`.
3. Wait for `getByText("Background jobs")` to be visible.

**Expected**:

- The settings page heading (`"Settings"`) is visible.
- The breadcrumb includes `admin` (the active tab label).
- `getByText("Background jobs")` section is visible.
- `getByText("OpenID Connect")` section heading is visible.
- `getByText("Runtime configuration")` section heading is visible.
- `getByText("Server logs")` section heading is visible.
- `getByText("Maintenance")` section heading is visible.
- The `"Manage users →"` link is visible and points to `/admin/users`.

---

## TC-02: Non-admin user cannot access the admin tab — falls back to account tab

**Priority**: P0
**Backend**: Mock

**Why mock**: Tab visibility is a frontend guard in `SettingsPage.tsx`. When
`user.is_admin` is false the `"admin"` tab is omitted from `TABS` and the URL
parameter is silently coerced to `"account"`.

**Preconditions**:

- `mockLoggedIn(page)` stubs the session with `MOCK_SESSION` (role `"user"`,
  `is_admin` not set / `false`).

**Steps**:

1. Call `mockLoggedIn(page)`.
2. Navigate to `/settings?tab=admin`.
3. Wait for the settings page to render.

**Expected**:

- The URL resolves to `/settings` (the `tab=admin` parameter is removed because the
  active tab falls back to `"account"`).
- The account tab content is shown (e.g. `getByText("Account")` heading or account
  form fields are visible).
- `getByText("Background jobs")` is **not** visible.
- `getByText("OpenID Connect")` is **not** visible.
- The admin tab link does **not** appear in the sidebar.

---

## TC-03: OIDC "Not configured" status pill shown when OIDC is unconfigured

**Priority**: P1
**Backend**: Mock

**Why mock**: The status pill (`"Not configured"` vs `"Configured"`) is driven
entirely by `oidc_configured` in the `GET /api/admin/settings` response.

**Preconditions**:

- Admin session mock (as in TC-01).
- `GET **/api/admin/settings` returns `{ ..., "oidc_configured": false }` (same
  payload as TC-01).
- Other admin API mocks from TC-01 are also active.

**Steps**:

1. Set up all route intercepts.
2. Navigate to `/settings?tab=admin`.
3. Wait for `getByText("OpenID Connect")` to be visible.

**Expected**:

- A `"Not configured"` status pill is visible next to the `"OpenID Connect"` heading.
- The four OIDC fields (`"Issuer URL"`, `"Client ID"`, `"Client Secret"`,
  `"Redirect URI"`) are rendered as editable inputs (since all sources are `"unset"`).
- `getByRole("button", { name: /Save OIDC settings/i })` is visible and enabled.

---

## TC-04: OIDC fields locked when values are set via environment variable

**Priority**: P1
**Backend**: Mock

**Why mock**: The ENV-locked display is controlled by `source === "env"` in the API
response. A mock is the cleanest way to exercise this branch.

**Preconditions**:

- Admin session mock (as in TC-01).
- `GET **/api/admin/settings` returns OIDC fields sourced from env:

```json
{
  "oidc": {
    "issuer_url": { "value": "https://auth.example.com", "source": "env" },
    "client_id": { "value": "my-client-id", "source": "env" },
    "client_secret": { "value": "***", "source": "env" },
    "redirect_uri": { "value": "", "source": "unset" },
    "admin_claim": { "value": "", "source": "unset" },
    "admin_value": { "value": "", "source": "unset" }
  },
  "oidc_configured": true
}
```

- Other admin API mocks from TC-01 active.

**Steps**:

1. Set up all route intercepts.
2. Navigate to `/settings?tab=admin`.
3. Wait for `getByText("OpenID Connect")` to be visible.

**Expected**:

- A `"Configured"` status pill is visible.
- `getByText("https://auth.example.com")` is visible (ENV display, not an `<input>`).
- `getByText("(set via environment variable)")` appears for the env-sourced fields.
- An `"ENV"` amber status pill is visible for each locked field.
- The `"Redirect URI"` field is still an editable input (source is `"unset"`).

---

## TC-05: Saving OIDC settings calls the API and shows success message

**Priority**: P1
**Backend**: Mock

**Why mock**: The save path is `PUT /api/admin/settings`. Mocking the response lets
us verify the success message without a running backend.

**Preconditions**:

- Admin session mock (as in TC-01).
- `GET **/api/admin/settings` returns the unconfigured payload from TC-01.
- Other admin API mocks from TC-01 active.
- `page.route()` intercepts `PUT **/api/admin/settings` and returns:

```json
{ "success": true, "oidc_configured": true }
```

**Steps**:

1. Set up all route intercepts.
2. Navigate to `/settings?tab=admin`.
3. Wait for `getByLabel("Issuer URL")` (or `getByPlaceholder("https://auth.example.com")`) to be visible.
4. Fill in `getByPlaceholder("https://auth.example.com")` with `"https://sso.example.com"`.
5. Fill in `getByPlaceholder("my-client-id")` with `"test-client"`.
6. Click `getByRole("button", { name: /Save OIDC settings/i })`.
7. Wait for the success message.

**Expected**:

- `getByText("OIDC configured successfully")` is visible.
- No error message is shown.

---

## TC-06: Background jobs section — "No scheduled jobs configured" empty state

**Priority**: P1
**Backend**: Mock

**Why mock**: The empty-state branch renders when `data.crons.length === 0`. Returning
an empty crons array from the mock exercises it without a real job queue.

**Preconditions**:

- Admin session mock (as in TC-01).
- `GET **/api/admin/jobs` returns `{ "crons": [], "stats": {}, "recentJobs": [] }`.
- Other admin API mocks from TC-01 active.

**Steps**:

1. Set up all route intercepts.
2. Navigate to `/settings?tab=admin`.
3. Wait for `getByText("Background jobs")` to be visible.

**Expected**:

- `getByText("No scheduled jobs configured.")` is visible within the background jobs
  card.
- No job row / table is rendered.
