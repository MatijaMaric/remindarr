# Test cases: settings — integrations tab

## Preconditions (shared)

- The Remindarr dev server is running (Bun on `:3000`, Vite proxy on `:5173`).
- Unless stated otherwise, the browser has an active session courtesy of
  `mockLoggedIn(page)` (stubs `GET /api/auth/get-session` with `MOCK_SESSION`).
- The integrations tab is reached via `/settings?tab=integrations`.
- `MOCK_SESSION.user.role` is `"user"` (not admin) — the integrations tab is
  available to all authenticated users.

---

## TC-01: Integrations tab loads and shows Plex section

**Priority**: P0
**Backend**: Mock

**Why mock**: The page renders immediately from two GET responses (`/api/integrations`
and `/api/feed/token`). Mocking both lets us assert the section headings without a
seeded database.

**Preconditions**:

- `mockLoggedIn(page)` stubs the session.
- `page.route()` intercepts `GET **/api/integrations` and returns an empty list:

```json
{ "integrations": [] }
```

- `page.route()` intercepts `GET **/api/feed/token` and returns `{ "token": null }`.
- `page.route()` intercepts `GET **/api/kiosk/token` and returns `{ "token": null }`.
- `page.route()` intercepts `GET **/api/share/watchlist/token` and returns `{ "token": null }`.

**Steps**:

1. Set up all route intercepts above.
2. Call `mockLoggedIn(page)`.
3. Navigate to `/settings?tab=integrations`.
4. Wait for the page to finish loading (skeleton disappears).

**Expected**:

- The breadcrumb shows `/settings › integrations` (or the translated equivalent).
- The `"Plex"` section heading is visible.
- The subtitle `"Connect your Plex server to automatically sync your watched history."` is visible.
- `getByRole("button", { name: /Connect Plex/i })` is visible (no existing integration).

---

## TC-02: Unauthenticated user is redirected to /login

**Priority**: P0
**Backend**: Mock

**Why mock**: The auth redirect is enforced by the `RequireAuth` component which reads
the session stub. No backend needed.

**Preconditions**:

- `mockLoggedOut(page)` stubs `GET /api/auth/get-session` with `null`.

**Steps**:

1. Call `mockLoggedOut(page)`.
2. Navigate to `/settings?tab=integrations`.
3. Wait for the URL to change away from `/settings`.

**Expected**:

- The browser is redirected to `/login`.
- The integrations tab content is never rendered (`getByText("Plex")` is absent).

---

## TC-03: Connect Plex button is visible when no integration exists

**Priority**: P0
**Backend**: Mock

**Why mock**: The button's visibility is driven solely by the `GET /api/integrations`
response returning an empty list. Mocking is sufficient.

**Preconditions**:

- `mockLoggedIn(page)` stubs the session.
- `page.route()` intercepts `GET **/api/integrations` and returns `{ "integrations": [] }`.

**Steps**:

1. Set up the route intercept.
2. Call `mockLoggedIn(page)`.
3. Navigate to `/settings?tab=integrations`.
4. Wait for `getByText("Plex")` to be visible.

**Expected**:

- `getByRole("button", { name: /Connect Plex/i })` is visible.
- No integration card (server name, "Disconnect" button) is shown.

---

## TC-04: Clicking "Connect Plex" opens the PIN-waiting state

**Priority**: P1
**Backend**: Mock

**Why mock**: `POST /api/integrations/plex/pin` is intercepted to return a fake PIN
and auth URL. No real Plex API is called; `window.open` can be suppressed via
`page.evaluate` or a route that simply returns the mock response without opening a
real window.

**Preconditions**:

- `mockLoggedIn(page)` stubs the session.
- `page.route()` intercepts `GET **/api/integrations` → `{ "integrations": [] }`.
- `page.route()` intercepts `POST **/api/integrations/plex/pin` → returns:

```json
{
  "pinId": 42,
  "authUrl": "https://app.plex.tv/auth#?clientID=mock&code=mock-pin"
}
```

- Suppress the popup: `page.on("popup", popup => popup.close())` (or route the popup
  URL to a blank page).

**Steps**:

1. Set up all route intercepts above.
2. Call `mockLoggedIn(page)`.
3. Navigate to `/settings?tab=integrations`.
4. Wait for `getByRole("button", { name: /Connect Plex/i })` to be visible.
5. Click `getByRole("button", { name: /Connect Plex/i })`.
6. Wait for the waiting-state hint to appear.

**Expected**:

- The `"Connect Plex"` button disappears.
- Text `"Waiting for authorization"` (or `/Waiting for authorization/i`) is visible.
- A `"Cancel"` button is visible.
- A link `"Open authorization page"` is visible and points to the mock `authUrl`.

---

## TC-05: Plex already connected — shows server card with name and Disconnect button

**Priority**: P1
**Backend**: Mock

**Why mock**: The connected state is purely a render of the `/api/integrations` list.
A single mock entry exercises all card fields without a live Plex account.

**Preconditions**:

- `mockLoggedIn(page)` stubs the session.
- `page.route()` intercepts `GET **/api/integrations` and returns one Plex integration:

```json
{
  "integrations": [
    {
      "id": "integ-1",
      "user_id": "user-1",
      "provider": "plex",
      "name": "My Plex Server",
      "config": {
        "serverUrl": "http://192.168.1.10:32400",
        "serverId": "abc123",
        "serverName": "My Plex Server",
        "plexUsername": "plexuser",
        "syncMovies": true,
        "syncEpisodes": true
      },
      "enabled": true,
      "last_sync_at": "2024-03-01T12:00:00Z",
      "last_sync_error": null,
      "created_at": "2024-01-01T00:00:00Z",
      "updated_at": "2024-03-01T12:00:00Z"
    }
  ]
}
```

**Steps**:

1. Set up the route intercept.
2. Call `mockLoggedIn(page)`.
3. Navigate to `/settings?tab=integrations`.
4. Wait for `getByText("My Plex Server")` to be visible.

**Expected**:

- `getByText("My Plex Server")` is visible.
- `getByText("http://192.168.1.10:32400")` is visible (server URL).
- An `"Enabled"` status pill is visible.
- `getByRole("button", { name: /Disconnect/i })` is visible.
- `getByRole("button", { name: /Sync now/i })` is visible and enabled.
- `getByRole("button", { name: /Disable/i })` is visible (toggle button in enabled state).
- The `"Connect Plex"` button **is** visible (the app always shows it in idle state to allow adding additional servers).

---

## TC-06: Disconnecting Plex removes the integration card

**Priority**: P1
**Backend**: Mock

**Why mock**: Disconnect is a `DELETE /api/integrations/:id` call followed by a
`GET /api/integrations` refetch. Both can be mocked to assert the UI reverts to the
empty state.

**Preconditions**:

- `mockLoggedIn(page)` stubs the session.
- `page.route()` intercepts `GET **/api/integrations` initially returns the connected
  integration from TC-05 (one Plex entry).
- `page.route()` intercepts `DELETE **/api/integrations/integ-1` → returns `200 {}`.
- After the DELETE resolves, the `GET **/api/integrations` mock is updated (via
  `page.unroute` + re-route) to return `{ "integrations": [] }`.

**Steps**:

1. Set up the connected-integration GET mock.
2. Call `mockLoggedIn(page)`.
3. Navigate to `/settings?tab=integrations`.
4. Wait for `getByRole("button", { name: /Disconnect/i })` to be visible.
5. Set up the DELETE route intercept and the empty-list GET re-route.
6. Click `getByRole("button", { name: /Disconnect/i })`.
7. Wait for the success message to appear.

**Expected**:

- The success message `"Plex integration disconnected."` is visible.
- The `"My Plex Server"` integration card disappears.
- `getByRole("button", { name: /Connect Plex/i })` reappears (empty state restored).
