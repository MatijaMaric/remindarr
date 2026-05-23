# Test cases: settings — appearance tab

## Preconditions (shared)

- The Remindarr dev server is running (Bun on `:3000`, Vite proxy on `:5173`).
- Unless stated otherwise, the browser has an active session courtesy of
  `mockLoggedIn(page)` (stubs `GET /api/auth/get-session` with `MOCK_SESSION`).
- The appearance tab is reached at `/settings?tab=appearance`.
- The tab renders four sections: **Theme**, **Accent color**, **Density**,
  **Display preferences**, **Homepage layout**, and **Crowded week** settings.
- `GET /api/user/settings/appearance` is the primary data endpoint for this tab.
- `GET /api/user/settings/homepage-layout` drives the Homepage layout section.
- `GET /api/user/settings/crowded-week` drives the Crowded week section.

---

## TC-01: Appearance tab loads with theme and accent controls

**Priority**: P0
**Backend**: Mock

**Why mock**: All rendered controls come from `GET /api/user/settings/appearance`.
Mocking the response lets us assert the exact initial state without a seeded database.

**Preconditions**:

- `mockLoggedIn(page)` stubs the session.
- `page.route()` intercepts `GET **/api/user/settings/appearance` and returns:

```json
{
  "themeVariant": "dark",
  "accentColor": "amber",
  "density": "comfortable",
  "reduceMotion": 0,
  "highContrast": 0,
  "hideEpisodeSpoilers": 0,
  "autoplayTrailers": 0
}
```

- `page.route()` intercepts `GET **/api/user/settings/homepage-layout` and returns:

```json
{
  "homepage_layout": [
    { "id": "up_next", "enabled": true },
    { "id": "unwatched", "enabled": true },
    { "id": "recommendations", "enabled": false }
  ]
}
```

- `page.route()` intercepts `GET **/api/user/settings/crowded-week` and returns:

```json
{ "crowdedWeekBadgeEnabled": 1, "crowdedWeekThreshold": 5 }
```

**Steps**:

1. Set up all route intercepts above.
2. Call `mockLoggedIn(page)`.
3. Navigate to `/settings?tab=appearance`.
4. Wait for the Theme section heading to be visible.

**Expected**:

- A section with a heading matching the theme settings title (i18n key
  `settings.theme.title`) is visible.
- A section for accent colour (i18n key `settings.accent.title`) is visible.
- A section for density (i18n key `settings.density.title`) is visible.
- A section for display preferences (i18n key `settings.displayPrefs.title`) is
  visible.
- The breadcrumb shows `/settings › appearance` (or the translated equivalent).
- No loading spinner remains; the page is fully hydrated.

---

## TC-02: Unauthenticated user redirected to /login

**Priority**: P0
**Backend**: Mock

**Why mock**: The redirect guard (`RequireAuth`) reads the session stub. No real
auth stack is needed.

**Preconditions**:

- `mockLoggedOut(page)` stubs `GET /api/auth/get-session` with `null`.

**Steps**:

1. Call `mockLoggedOut(page)`.
2. Navigate to `/settings?tab=appearance`.
3. Wait for the URL to change away from `/settings`.

**Expected**:

- The browser is redirected to `/login`.
- The appearance tab content is never rendered.

---

## TC-03: Theme picker buttons are rendered for each theme variant

**Priority**: P1
**Backend**: Mock

**Why mock**: `ThemePicker` renders buttons from a hard-coded list of variants.
The current theme comes from `localStorage` / context, not from the API response.
Mocking the session is sufficient to assert the picker renders.

**Preconditions**:

- Same intercepts as TC-01.
- `mockLoggedIn(page)` is active.

**Steps**:

1. Set up all route intercepts.
2. Call `mockLoggedIn(page)`.
3. Navigate to `/settings?tab=appearance`.
4. Wait for the theme section to be visible.
5. Query for theme variant buttons within the Theme card.

**Expected**:

- At least two theme buttons are present (e.g., Dark and Light, or Dark, Dim, Light).
- Each button is a clickable element (`role="button"` or `role="radio"`).
- The page does not show any error state.

---

## TC-04: Accent colour selection sends PUT to appearance API

**Priority**: P1
**Backend**: Mock

**Why mock**: `AccentPicker` calls `PUT /api/user/settings/appearance` on every click.
Mocking lets us assert the exact payload without a real database write.

**Preconditions**:

- Same `GET` intercepts as TC-01.
- `page.route()` intercepts `PUT **/api/user/settings/appearance` and returns the
  updated settings object with `accentColor` set to the chosen value:

```json
{
  "themeVariant": "dark",
  "accentColor": "blue",
  "density": "comfortable",
  "reduceMotion": 0,
  "highContrast": 0,
  "hideEpisodeSpoilers": 0,
  "autoplayTrailers": 0
}
```

**Steps**:

1. Set up all route intercepts.
2. Call `mockLoggedIn(page)`.
3. Navigate to `/settings?tab=appearance`.
4. Wait for the accent colour section to be visible.
5. Click an accent colour button that is not the current selection (e.g., a button
   with a different colour swatch — use `getByRole("button")` within the accent card
   and pick the second one).
6. Wait for the `PUT` intercept to fire.
7. Wait for the saved indicator to appear (text matching `settings.saved` i18n key,
   e.g., `"Saved"` in the accent card).

**Expected**:

- The `PUT` intercept is called exactly once.
- The request body contains the `accentColor` field set to the newly selected value.
- A transient "Saved" confirmation (emerald text) appears briefly in the accent card.

---

## TC-05: Display preferences toggles fire PUT on change

**Priority**: P1
**Backend**: Mock

**Why mock**: Each `SSwitch` in the display preferences card calls
`PUT /api/user/settings/appearance` immediately on toggle. Mocking isolates the
toggle-to-API flow.

**Preconditions**:

- Same `GET` intercepts as TC-01 (all display prefs start at `0` / off).
- `page.route()` intercepts `PUT **/api/user/settings/appearance` and returns:

```json
{
  "themeVariant": "dark",
  "accentColor": "amber",
  "density": "comfortable",
  "reduceMotion": 1,
  "highContrast": 0,
  "hideEpisodeSpoilers": 0,
  "autoplayTrailers": 0
}
```

**Steps**:

1. Set up all route intercepts.
2. Call `mockLoggedIn(page)`.
3. Navigate to `/settings?tab=appearance`.
4. Wait for the display preferences section to be visible.
5. Find the "Reduce motion" toggle (i18n key `settings.displayPrefs.reduceMotion`)
   and click it.
6. Wait for the `PUT` intercept to fire.

**Expected**:

- The `PUT` intercept is called with a body containing `"reduceMotion": 1`.
- The toggle switches to the enabled (on) state after the call.

---

## TC-06: Homepage layout section renders section rows

**Priority**: P1
**Backend**: Mock

**Why mock**: The layout list is driven by `GET /api/user/settings/homepage-layout`.
Mocking delivers a fixed set of sections so we can assert names and visibility icons.

**Preconditions**:

- Same `GET` intercepts as TC-01 (homepage layout returns three sections:
  `up_next` enabled, `unwatched` enabled, `recommendations` disabled).

**Steps**:

1. Set up all route intercepts.
2. Call `mockLoggedIn(page)`.
3. Navigate to `/settings?tab=appearance`.
4. Wait for the homepage layout section heading to be visible (i18n key
   `settings.homepage.title`).

**Expected**:

- Three rows are rendered in the homepage layout card.
- A row with the label matching `settings.homepage.sections.up_next` (or its
  translation, e.g., "Up next") is visible and shows an Eye icon (enabled).
- A row with the label matching `settings.homepage.sections.recommendations` is
  visible and shows an EyeOff icon (disabled), appearing visually dimmed
  (`opacity-60`).
- Each row contains a grip icon (drag handle) — `getByRole("img", { hidden: true })`
  or presence of a `GripVertical`-rendered element.

---

## TC-07: Homepage layout toggle fires PUT

**Priority**: P1
**Backend**: Mock

**Why mock**: Clicking the Eye/EyeOff button immediately calls
`PUT /api/user/settings/homepage-layout`. Mocking lets us assert the patch without
persisting to a real database.

**Preconditions**:

- Same `GET` intercepts as TC-01.
- `page.route()` intercepts `PUT **/api/user/settings/homepage-layout` and returns:

```json
{
  "homepage_layout": [
    { "id": "up_next", "enabled": false },
    { "id": "unwatched", "enabled": true },
    { "id": "recommendations", "enabled": false }
  ]
}
```

**Steps**:

1. Set up all route intercepts.
2. Call `mockLoggedIn(page)`.
3. Navigate to `/settings?tab=appearance`.
4. Wait for the homepage layout section to be visible.
5. Click the visibility toggle button for the first row (`aria-label` matching
   `settings.homepage.hideSection`).
6. Wait for the `PUT` intercept to fire.
7. Wait for the saved indicator (`settings.homepage.saved`) to appear.

**Expected**:

- The `PUT` intercept is called once with a layout array where the first section
  has `"enabled": false`.
- A transient "Saved" confirmation appears in the homepage layout card.

---

## TC-08: Crowded week badge toggle fires PUT

**Priority**: P2
**Backend**: Mock

**Why mock**: The toggle calls `PUT /api/user/settings/crowded-week`. Mocking
verifies the payload without needing real persisted state.

**Preconditions**:

- Same `GET` intercepts as TC-01 (crowded week badge enabled, threshold 5).
- `page.route()` intercepts `PUT **/api/user/settings/crowded-week` and returns:

```json
{ "crowdedWeekBadgeEnabled": 0, "crowdedWeekThreshold": 5 }
```

**Steps**:

1. Set up all route intercepts.
2. Call `mockLoggedIn(page)`.
3. Navigate to `/settings?tab=appearance`.
4. Wait for the crowded week section heading (`settings.crowdedWeek.title`) to be
   visible.
5. Click the toggle button (`aria-pressed="true"` — currently enabled) to disable it.
6. Wait for the `PUT` intercept to fire.

**Expected**:

- The `PUT` intercept is called with `{ "crowdedWeekBadgeEnabled": 0 }` (or a body
  containing that field).
- The toggle's `aria-pressed` attribute changes to `"false"`.
- The threshold input is hidden once the badge is disabled (it is conditionally
  rendered only when `enabled` is true).
