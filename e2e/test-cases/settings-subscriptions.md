# Test cases: settings — subscriptions tab

## Preconditions (shared)

- The Remindarr dev server is running (Bun on `:3000`, Vite proxy on `:5173`).
- Unless stated otherwise, the browser has an active session courtesy of
  `mockLoggedIn(page)` (stubs `GET /api/auth/get-session` with `MOCK_SESSION`).
- The subscriptions tab is reached at `/settings?tab=subscriptions`.
- The tab renders two sections:
  - **Streaming subscriptions** card — a list of provider checkboxes split into
    "Your region" and "Other providers".
  - An unnamed card with the **"Only show titles from my services"** toggle.
- Primary API endpoints:
  - `GET /api/titles/providers` → `{ providers: Provider[], regionProviderIds: number[] }`
    (called on mount via `useEffect`, not TanStack Query — always re-fetched on
    component mount).
  - `GET /api/auth/get-session` (via `AuthContext`) supplies `subscriptions`
    (`{ providerIds: number[], onlyMine: boolean }`).
  - `PUT /api/user/settings/subscriptions` → `{ providerIds: number[] }`
  - `PUT /api/user/settings/subscriptions/only-mine` → `{ onlyMine: boolean }`
- Note: `SubscriptionsTab` reads subscription state from `AuthContext.subscriptions`,
  not from a separate query. The `MOCK_SESSION` does not include `subscriptions`, so
  the session mock must be extended or `AuthContext.refreshSubscriptions` must be
  intercepted if the test needs a pre-set subscription state.

---

## TC-01: Subscriptions tab loads and renders provider list

**Priority**: P0
**Backend**: Mock

**Why mock**: The provider list is fetched from `GET /api/titles/providers` on mount.
Mocking delivers a known set of providers so we can assert exact names.

**Preconditions**:

- `mockLoggedIn(page)` stubs the session (subscriptions will be initialised from
  `AuthContext`; without a real session the `selectedIds` set starts empty, which
  is fine for a load test).
- `page.route()` intercepts `GET **/api/titles/providers` and returns:

```json
{
  "providers": [
    { "id": 8, "name": "Netflix", "technical_name": "netflix", "icon_url": "" },
    {
      "id": 9,
      "name": "Amazon Prime Video",
      "technical_name": "amazon",
      "icon_url": ""
    },
    {
      "id": 337,
      "name": "Disney+",
      "technical_name": "disney",
      "icon_url": ""
    },
    {
      "id": 350,
      "name": "Apple TV+",
      "technical_name": "apple",
      "icon_url": ""
    }
  ],
  "regionProviderIds": [8, 9]
}
```

**Steps**:

1. Set up the route intercept above.
2. Call `mockLoggedIn(page)`.
3. Navigate to `/settings?tab=subscriptions`.
4. Wait for the streaming subscriptions card heading to be visible (i18n key
   `settings.subscriptions.title`).

**Expected**:

- A card with the subscriptions title is visible.
- A "Your region" group header (i18n key `settings.subscriptions.regionProviders`)
  is visible.
- `getByText("Netflix")` and `getByText("Amazon Prime Video")` are visible in the
  region group.
- An "Other providers" group header (i18n key
  `settings.subscriptions.otherProviders`) is visible.
- `getByText("Disney+")` and `getByText("Apple TV+")` are visible in the other
  providers group.
- The `"Only show titles from my services"` toggle card is visible below the
  subscriptions card.
- The breadcrumb shows `/settings › subscriptions`.

---

## TC-02: Unauthenticated user redirected to /login

**Priority**: P0
**Backend**: Mock

**Why mock**: `RequireAuth` redirects unauthenticated users before `SubscriptionsTab`
ever mounts. The session stub is sufficient.

**Preconditions**:

- `mockLoggedOut(page)` stubs `GET /api/auth/get-session` with `null`.

**Steps**:

1. Call `mockLoggedOut(page)`.
2. Navigate to `/settings?tab=subscriptions`.
3. Wait for the URL to change away from `/settings`.

**Expected**:

- The browser is redirected to `/login`.
- The subscriptions tab content is never rendered.

---

## TC-03: Empty provider list shows empty-state message

**Priority**: P1
**Backend**: Mock

**Why mock**: The empty-state branch renders when `allProviders.length === 0`. An
empty mock array exercises it directly.

**Preconditions**:

- `mockLoggedIn(page)` stubs the session.
- `page.route()` intercepts `GET **/api/titles/providers` and returns:

```json
{ "providers": [], "regionProviderIds": [] }
```

**Steps**:

1. Set up the route intercept.
2. Call `mockLoggedIn(page)`.
3. Navigate to `/settings?tab=subscriptions`.
4. Wait for the subscriptions card to be visible.

**Expected**:

- `getByText` matching i18n key `settings.subscriptions.empty` (e.g.,
  `"No streaming providers available."`) is visible inside the subscriptions card.
- No provider checkbox rows are rendered.
- The "Only show titles from my services" toggle card is still visible.

---

## TC-04: Checking a provider calls PUT subscriptions

**Priority**: P1
**Backend**: Mock

**Why mock**: Toggling a provider calls `PUT /api/user/settings/subscriptions`
immediately after the optimistic local state update. Mocking lets us assert the
exact `providerIds` payload without a real database write.

**Preconditions**:

- Same provider intercept as TC-01 (4 providers; region: 8, 9; no current
  subscriptions).
- `page.route()` intercepts `PUT **/api/user/settings/subscriptions` and returns
  `{ "providerIds": [8] }`.
- `page.route()` intercepts `GET **/api/auth/get-session` to also supply an updated
  subscriptions field after refresh, OR mock `refreshSubscriptions` by re-stubbing
  the session route with `subscriptions: { providerIds: [8], onlyMine: false }`.

**Steps**:

1. Set up all route intercepts.
2. Call `mockLoggedIn(page)`.
3. Navigate to `/settings?tab=subscriptions`.
4. Wait for `getByText("Netflix")` to be visible.
5. Click the checkbox label row for "Netflix".
6. Wait for the `PUT` intercept to fire.

**Expected**:

- The `PUT` intercept is called with a body containing `{ "providerIds": [8] }`.
- The Netflix checkbox visually switches to checked state (the amber-filled checkbox
  with a tick SVG is rendered).

---

## TC-05: Unchecking a provider removes it from PUT payload

**Priority**: P1
**Backend**: Mock

**Why mock**: Toggling off a previously-subscribed provider calls the same PUT
endpoint with the updated set (the id removed). Mocking confirms the removal.

**Preconditions**:

- Same provider intercept as TC-01.
- The session mock (or `AuthContext`) starts with Netflix (id `8`) already selected.
  Achieve this by intercepting `GET **/api/auth/get-session` with a session that
  includes `subscriptions: { providerIds: [8], onlyMine: false }` in the user
  object or via `AuthContext`'s initial load. If `MOCK_SESSION` does not support a
  `subscriptions` field, stub `GET **/api/user/settings/subscriptions` as a
  supplemental call and ensure the component's `useEffect` for subscriptions fires.
  Alternatively, first check Netflix (TC-04) then uncheck it in a follow-on step.
- `page.route()` intercepts `PUT **/api/user/settings/subscriptions` and returns
  `{ "providerIds": [] }`.

**Steps**:

1. Set up all route intercepts with Netflix pre-selected (or click it to select then
   click again to deselect).
2. Call `mockLoggedIn(page)`.
3. Navigate to `/settings?tab=subscriptions`.
4. Wait for `getByText("Netflix")` to be visible.
5. Click the Netflix checkbox row to uncheck it.
6. Wait for the `PUT` intercept to fire.

**Expected**:

- The `PUT` intercept is called with `{ "providerIds": [] }` (Netflix id `8` removed).
- The Netflix checkbox reverts to the unchecked visual state (no amber fill, no tick).

---

## TC-06: "Only show titles from my services" toggle calls PUT only-mine

**Priority**: P1
**Backend**: Mock

**Why mock**: The toggle calls `PUT /api/user/settings/subscriptions/only-mine`
directly. Mocking verifies the payload without a real write.

**Preconditions**:

- Same provider intercept as TC-01.
- The `onlyMine` state starts as `false` (from `AuthContext.subscriptions` or
  default).
- `page.route()` intercepts `PUT **/api/user/settings/subscriptions/only-mine` and
  returns `{ "onlyMine": true }`.

**Steps**:

1. Set up all route intercepts.
2. Call `mockLoggedIn(page)`.
3. Navigate to `/settings?tab=subscriptions`.
4. Wait for the "Only show titles from my services" toggle to be visible.
5. Click the toggle switch.
6. Wait for the `PUT` intercept to fire.

**Expected**:

- The `PUT` intercept is called with `{ "onlyMine": true }`.
- The toggle visually switches to the on state.

---

## TC-07: Provider save error shows error message

**Priority**: P1
**Backend**: Mock

**Why mock**: When `PUT /api/user/settings/subscriptions` returns an error, the
component rolls back the optimistic state and sets `saveError = true`. Mocking a
failing response exercises this error path.

**Preconditions**:

- Same provider intercept as TC-01.
- `page.route()` intercepts `PUT **/api/user/settings/subscriptions` and fulfills
  with status 500 and body `{ "error": "Server error" }`.

**Steps**:

1. Set up all route intercepts.
2. Call `mockLoggedIn(page)`.
3. Navigate to `/settings?tab=subscriptions`.
4. Wait for `getByText("Netflix")` to be visible.
5. Click the Netflix checkbox row.
6. Wait for the error message to appear.

**Expected**:

- An error message matching i18n key `settings.subscriptions.saveError` (e.g.,
  `"Failed to save subscriptions."`) is visible above the subscriptions card.
- The Netflix checkbox reverts to its previous (unchecked) state (optimistic rollback).

---

## TC-08: Region vs. other providers grouping is correct

**Priority**: P1
**Backend**: Mock

**Why mock**: The grouping logic (`regionProviderIds`) is pure frontend: providers
whose ids appear in `regionProviderIds` go into the "Your region" group; the rest
go into "Other providers". Mocking different sets verifies the split.

**Preconditions**:

- `mockLoggedIn(page)` stubs the session.
- `page.route()` intercepts `GET **/api/titles/providers` and returns:

```json
{
  "providers": [
    { "id": 8, "name": "Netflix", "technical_name": "netflix", "icon_url": "" },
    {
      "id": 9,
      "name": "Amazon Prime Video",
      "technical_name": "amazon",
      "icon_url": ""
    },
    { "id": 337, "name": "Disney+", "technical_name": "disney", "icon_url": "" }
  ],
  "regionProviderIds": [8]
}
```

**Steps**:

1. Set up the route intercept.
2. Call `mockLoggedIn(page)`.
3. Navigate to `/settings?tab=subscriptions`.
4. Wait for both group headers to be visible.

**Expected**:

- `getByText("Netflix")` appears inside the "Your region" group (the amber-coloured
  section header is visible above it).
- `getByText("Amazon Prime Video")` and `getByText("Disney+")` appear inside the
  "Other providers" group (the zinc-coloured section header is visible above them).
- Netflix does NOT appear in the "Other providers" group.
