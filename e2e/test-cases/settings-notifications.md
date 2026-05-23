# Test cases: settings — notifications tab

## Preconditions (shared)

- The Remindarr dev server is running (Bun on `:3000`, Vite proxy on `:5173`).
- Unless stated otherwise, the browser has an active session courtesy of
  `mockLoggedIn(page)` (stubs `GET /api/auth/get-session` with `MOCK_SESSION`).
- The notifications tab is reached at `/settings?tab=notifications`.
- The tab renders up to three sections depending on browser support:
  - **Push notifications** (only when `isPushSupported()` returns true — omit in
    headless Chromium if `Notification` is not available)
  - **Notifiers** — the list of configured webhook/Discord/Telegram/ntfy/gotify
    notifiers with Add / Test / Edit / Delete actions
  - **Streaming departure alerts** — a toggle and lead-time selector
- Primary API endpoints:
  - `GET /api/notifiers` → `{ notifiers: Notifier[] }`
  - `GET /api/notifiers/providers` → `{ providers: string[] }`
  - `GET /api/user/settings/departure-alerts` → `UserSettings` subset
- The existing `notifications.spec.ts` covers the **real-backend webhook delivery**
  path. The test cases below cover the **UI layer** (rendering, form interactions,
  enable/disable toggles) that `notifications.spec.ts` does not address.

---

## TC-01: Notifications tab loads notifier list

**Priority**: P0
**Backend**: Mock

**Why mock**: The notifier list is a pure render of `GET /api/notifiers`. Mocking
lets us assert the exact card without a seeded database.

**Preconditions**:

- `mockLoggedIn(page)` stubs the session.
- `page.route()` intercepts `GET **/api/notifiers` and returns one Discord notifier:

```json
{
  "notifiers": [
    {
      "id": "notifier-1",
      "user_id": "user-1",
      "provider": "discord",
      "name": "Discord",
      "config": { "webhookUrl": "https://discord.com/api/webhooks/123/abc" },
      "notify_time": "09:00",
      "timezone": "UTC",
      "enabled": true,
      "last_sent_date": null,
      "digest_mode": null,
      "digest_day": null,
      "streaming_alerts_enabled": true,
      "quiet_hours_start": null,
      "quiet_hours_end": null,
      "quiet_hours_days": null,
      "leaving_soon_alerts_enabled": true,
      "friend_activity_alerts_enabled": false,
      "achievements_enabled": false,
      "created_at": "2024-01-01T00:00:00Z",
      "updated_at": "2024-01-01T00:00:00Z"
    }
  ]
}
```

- `page.route()` intercepts `GET **/api/notifiers/providers` and returns:

```json
{ "providers": ["discord", "telegram", "ntfy", "gotify", "webhook"] }
```

- `page.route()` intercepts `GET **/api/user/settings/departure-alerts` and returns:

```json
{ "streamingDeparturesEnabled": false, "departureAlertLeadDays": 7 }
```

- `page.route()` intercepts `GET **/api/notifier-history/notifier-1` (or
  `GET **/api/notifiers/notifier-1/history`) and returns:

```json
{ "rows": [], "successRate": 100 }
```

**Steps**:

1. Set up all route intercepts above.
2. Call `mockLoggedIn(page)`.
3. Navigate to `/settings?tab=notifications`.
4. Wait for the Notifiers card heading (`"Notifiers"`) to be visible.

**Expected**:

- A card with the heading `"Notifiers"` is visible.
- A notifier row labelled `"Discord"` is rendered.
- An `"Enabled"` status pill is visible on the Discord row.
- A `"Streaming alerts"` status pill is visible on the Discord row.
- The `"Time"` key–value shows `"09:00 UTC"`.
- The `"Frequency"` key–value shows `"Daily"` (digest_mode null → daily).
- An `"Add notifier"` button is visible.
- The breadcrumb shows `/settings › notifications`.

---

## TC-02: Unauthenticated user redirected to /login

**Priority**: P0
**Backend**: Mock

**Why mock**: The redirect is driven by `RequireAuth` reading the session stub.

**Preconditions**:

- `mockLoggedOut(page)` stubs `GET /api/auth/get-session` with `null`.

**Steps**:

1. Call `mockLoggedOut(page)`.
2. Navigate to `/settings?tab=notifications`.
3. Wait for the URL to change away from `/settings`.

**Expected**:

- The browser is redirected to `/login`.
- Notifications tab content is never rendered.

---

## TC-03: Empty notifier list shows "No notifiers configured"

**Priority**: P1
**Backend**: Mock

**Why mock**: The empty-state branch renders when `notifiers.length === 0`. Mocking
an empty array exercises it directly.

**Preconditions**:

- Same provider and departure-alerts intercepts as TC-01.
- `page.route()` intercepts `GET **/api/notifiers` and returns
  `{ "notifiers": [] }`.

**Steps**:

1. Set up all route intercepts.
2. Call `mockLoggedIn(page)`.
3. Navigate to `/settings?tab=notifications`.
4. Wait for the Notifiers card to be visible.

**Expected**:

- `getByText("No notifiers configured.")` is visible inside the Notifiers card.
- No notifier row (Discord / Telegram / etc.) is rendered.
- The `"Add notifier"` button is still present.

---

## TC-04: Add notifier form opens and renders Discord fields

**Priority**: P1
**Backend**: Mock

**Why mock**: The form toggle is purely local state (`showForm`). No API call is
made until save. Mocking prevents side effects during the form-open interaction.

**Preconditions**:

- Same intercepts as TC-03 (empty notifier list).

**Steps**:

1. Set up all route intercepts.
2. Call `mockLoggedIn(page)`.
3. Navigate to `/settings?tab=notifications`.
4. Wait for `getByRole("button", { name: /Add notifier/i })` to be visible.
5. Click `"Add notifier"`.

**Expected**:

- A form card with heading `"Add a notifier"` appears.
- Provider selector buttons are visible: Discord, Telegram, ntfy, Gotify, Webhook.
- The Discord provider button is selected by default (highlighted amber).
- A "Webhook URL" field (labelled and `type="url"`) is visible.
- A "Notification time" field (`type="time"`) is visible.
- A "Timezone" field is visible.
- Three frequency radio cards are visible: "Daily digest", "Weekly digest",
  "Off · per-event".
- A `"Create notifier"` submit button is visible.
- A `"Cancel"` button is visible.

---

## TC-05: Create notifier submits correct payload for Discord

**Priority**: P1
**Backend**: Mock

**Why mock**: `POST /api/notifiers` can be intercepted to assert the payload shape
without persisting to a real database.

**Preconditions**:

- Same intercepts as TC-03 (empty notifier list).
- `page.route()` intercepts `POST **/api/notifiers` and returns a new notifier:

```json
{
  "notifier": {
    "id": "notifier-new",
    "user_id": "user-1",
    "provider": "discord",
    "name": "Discord",
    "config": { "webhookUrl": "https://discord.com/api/webhooks/999/xyz" },
    "notify_time": "08:00",
    "timezone": "UTC",
    "enabled": true,
    "last_sent_date": null,
    "digest_mode": null,
    "digest_day": null,
    "streaming_alerts_enabled": true,
    "quiet_hours_start": null,
    "quiet_hours_end": null,
    "quiet_hours_days": null,
    "leaving_soon_alerts_enabled": true,
    "friend_activity_alerts_enabled": false,
    "achievements_enabled": false,
    "created_at": "2024-01-01T00:00:00Z",
    "updated_at": "2024-01-01T00:00:00Z"
  }
}
```

- After the POST, re-route `GET **/api/notifiers` to return the new notifier in the
  list (update the intercept).

**Steps**:

1. Set up all route intercepts.
2. Call `mockLoggedIn(page)`.
3. Navigate to `/settings?tab=notifications`.
4. Click `"Add notifier"`.
5. Fill in the Webhook URL field with
   `"https://discord.com/api/webhooks/999/xyz"`.
6. Clear and set the Notification time to `"08:00"`.
7. Click `"Create notifier"`.
8. Wait for a success message `"Notifier created"` to appear.

**Expected**:

- The `POST` intercept is called once.
- The request body contains `provider: "discord"` and
  `config.webhookUrl: "https://discord.com/api/webhooks/999/xyz"`.
- The form closes (no `"Create notifier"` button remains visible).
- A success message `"Notifier created"` is visible.

---

## TC-06: Test button on existing notifier calls test endpoint

**Priority**: P1
**Backend**: Mock

**Why mock**: The test flow is `POST /api/notifiers/:id/test`. Mocking returns a
success without requiring a real webhook server (the real-webhook case is covered
by `notifications.spec.ts`).

**Preconditions**:

- Same intercepts as TC-01 (one Discord notifier, id `"notifier-1"`).
- `page.route()` intercepts `POST **/api/notifiers/notifier-1/test` and returns:

```json
{ "success": true, "message": "Test notification sent" }
```

**Steps**:

1. Set up all route intercepts.
2. Call `mockLoggedIn(page)`.
3. Navigate to `/settings?tab=notifications`.
4. Wait for the Discord notifier row to be visible.
5. Click the `"Test"` button in the Discord notifier row.
6. Wait for the success message to appear.

**Expected**:

- The `POST` intercept is called exactly once for `notifier-1`.
- A success message `"Test notification sent"` is visible in the Notifiers card.

---

## TC-07: Disable/Enable toggle on notifier calls PUT

**Priority**: P1
**Backend**: Mock

**Why mock**: The toggle calls `PUT /api/notifiers/:id` with `{ enabled: false }`.
Mocking isolates the toggle without a real database write.

**Preconditions**:

- Same intercepts as TC-01 (Discord notifier enabled).
- `page.route()` intercepts `PUT **/api/notifiers/notifier-1` and returns:

```json
{
  "notifier": {
    "id": "notifier-1",
    "user_id": "user-1",
    "provider": "discord",
    "name": "Discord",
    "config": { "webhookUrl": "https://discord.com/api/webhooks/123/abc" },
    "notify_time": "09:00",
    "timezone": "UTC",
    "enabled": false,
    "last_sent_date": null,
    "digest_mode": null,
    "digest_day": null,
    "streaming_alerts_enabled": true,
    "quiet_hours_start": null,
    "quiet_hours_end": null,
    "quiet_hours_days": null,
    "leaving_soon_alerts_enabled": true,
    "friend_activity_alerts_enabled": false,
    "achievements_enabled": false,
    "created_at": "2024-01-01T00:00:00Z",
    "updated_at": "2024-01-01T00:00:00Z"
  }
}
```

- After the PUT, re-route `GET **/api/notifiers` to return the notifier with
  `enabled: false`.

**Steps**:

1. Set up all route intercepts.
2. Call `mockLoggedIn(page)`.
3. Navigate to `/settings?tab=notifications`.
4. Wait for the Discord notifier row to be visible.
5. Click the `"Disable"` button in the Discord notifier row.
6. Wait for `GET /api/notifiers` to be re-fetched.

**Expected**:

- The `PUT` intercept is called with a body containing `"enabled": false`.
- The status pill on the Discord row changes from `"Enabled"` to `"Disabled"`.
- The row becomes visually dimmed (`opacity-60` class applied).

---

## TC-08: Delete notifier calls DELETE and removes row

**Priority**: P1
**Backend**: Mock

**Why mock**: Delete is `DELETE /api/notifiers/:id`. Mocking prevents real data
deletion and lets us verify the row disappears from the UI.

**Preconditions**:

- Same intercepts as TC-01 (one Discord notifier).
- `page.route()` intercepts `DELETE **/api/notifiers/notifier-1` and fulfills with
  status 200 and empty body.
- After the DELETE, re-route `GET **/api/notifiers` to return `{ "notifiers": [] }`.

**Steps**:

1. Set up all route intercepts.
2. Call `mockLoggedIn(page)`.
3. Navigate to `/settings?tab=notifications`.
4. Wait for the Discord notifier row to be visible.
5. Click the `"Delete"` button in the Discord notifier row.
6. Wait for `GET /api/notifiers` to be re-fetched.

**Expected**:

- The `DELETE` intercept is called exactly once for `notifier-1`.
- The Discord notifier row is no longer rendered.
- A success message `"Notifier deleted"` is visible.
- `getByText("No notifiers configured.")` is visible after deletion.

---

## TC-09: Streaming departure alerts toggle fires PUT

**Priority**: P1
**Backend**: Mock

**Why mock**: The toggle calls `PUT /api/user/settings/departure-alerts`. Mocking
verifies the payload and UI update without persisting state.

**Preconditions**:

- Same notifier and provider intercepts as TC-03 (empty notifier list for simplicity).
- `page.route()` intercepts `GET **/api/user/settings/departure-alerts` and returns:

```json
{ "streamingDeparturesEnabled": false, "departureAlertLeadDays": 7 }
```

- `page.route()` intercepts `PUT **/api/user/settings/departure-alerts` and returns:

```json
{ "streamingDeparturesEnabled": true, "departureAlertLeadDays": 7 }
```

**Steps**:

1. Set up all route intercepts.
2. Call `mockLoggedIn(page)`.
3. Navigate to `/settings?tab=notifications`.
4. Scroll to the Streaming departure alerts card.
5. Find the "Enable departure alerts" toggle and click it (currently off).
6. Wait for the `PUT` intercept to fire.

**Expected**:

- The `PUT` intercept is called with a body containing
  `"streamingDeparturesEnabled": true`.
- The toggle switches to the on state.
- A success message `"Settings saved"` is visible.
- The lead time selector appears (conditionally rendered when enabled).

---

## TC-10: Trigger-flags section in notifier form — streaming alerts toggle

**Priority**: P1
**Backend**: Mock

**Why mock**: The trigger-flag toggles (`formStreamingAlerts`, `formLeavingSoon`,
`formFriendActivity`, `formAchievements`) are form-local state persisted on submit.
Mocking verifies the form includes correct fields in the POST payload.

**Preconditions**:

- Same intercepts as TC-05 (empty notifier list, POST stub returning new notifier).

**Steps**:

1. Set up all route intercepts.
2. Call `mockLoggedIn(page)`.
3. Navigate to `/settings?tab=notifications`.
4. Click `"Add notifier"`.
5. Fill in Webhook URL with `"https://discord.com/api/webhooks/999/xyz"`.
6. Scroll down to the Triggers section and toggle `"Streaming availability alerts"`
   off (it defaults to on).
7. Toggle `"Friend activity alerts"` on (it defaults to off).
8. Click `"Create notifier"`.
9. Wait for the success message.

**Expected**:

- The `POST` intercept is called with a body containing
  `"streaming_alerts_enabled": false` and `"friend_activity_alerts_enabled": true`.
