# Test cases: invite-accept

## Preconditions (shared)

- The Remindarr dev server is running (Bun on `:3000`, Vite proxy on `:5173`).
- The invite page is at `/invite` (wrapped in `<RequireAuth>` — the user must be logged in).
- When a share link is visited (`/invite?code=<code>`), the page auto-redeems the code via
  `POST /api/invitations/redeem/:code` immediately after mount.
- All test cases use `page.route()` mocks unless explicitly marked **Real**.
- Before navigating, apply the following base mocks so the page shell renders without hitting
  the real backend:
  - `GET **/api/auth/get-session` → `MOCK_SESSION` (logged-in user, from `e2e/helpers.ts`)
  - `GET **/api/auth/custom/providers` → `{ local: true, oidc: null }`
  - `GET **/api/invitations` → `{ invitations: [] }` (empty list by default)

### Standard invitation fixture

```json
{
  "invitations": [
    {
      "id": "inv-001",
      "code": "ABCD1234",
      "created_at": "2026-05-20T10:00:00Z",
      "expires_at": "2026-06-20T10:00:00Z",
      "used_at": null,
      "used_by": null
    }
  ]
}
```

### Standard used-invitation fixture

```json
{
  "invitations": [
    {
      "id": "inv-002",
      "code": "EFGH5678",
      "created_at": "2026-05-01T08:00:00Z",
      "expires_at": "2026-06-01T08:00:00Z",
      "used_at": "2026-05-10T14:00:00Z",
      "used_by": {
        "id": "user-2",
        "username": "alice",
        "display_name": "Alice",
        "image": null
      }
    }
  ]
}
```

---

## TC-01: Page loads with heading, generate button, and empty invitation list

**Priority**: P0
**Backend**: Mock

**Why mock**: Verifies the initial render of the invite management UI — heading, generate
button, and empty-state message — without touching the real invitation store.

**Preconditions**:

- All shared mocks applied (`get-session` → `MOCK_SESSION`).
- `GET **/api/invitations` → `{ invitations: [] }`.

**Steps**:

1. Apply all shared route mocks.
2. Navigate to `/invite`.
3. Wait for the `h1` heading to be visible.

**Expected**:

- The page heading (level 1) is visible and contains the invite page title (e.g. `"Invite"`
  or similar i18n key rendered as a heading with a `UserPlus` icon beside it).
- A prominent amber/yellow button labelled `"Create invite link"` (or similar) is visible and
  enabled.
- The empty-state paragraph (`"No invitations yet"` or similar) is visible because the
  invitations list is empty.
- No error banner is shown.
- The URL remains `/invite` — no redirect occurred (confirming `RequireAuth` let the logged-in
  user through).

---

## TC-02: Generating an invitation link adds it to the list

**Priority**: P0
**Backend**: Mock

**Why mock**: Validates the create-invitation mutation: the button click fires
`POST /api/invitations`, the list re-fetches, and the new invitation card renders with a
pending status badge and copy/share actions.

**Preconditions**:

- All shared mocks applied.
- `GET **/api/invitations` (initial fetch) → `{ invitations: [] }`.
- `POST **/api/invitations` → `{ id: "inv-001", code: "ABCD1234", expires_at: "2026-06-20T10:00:00Z" }` (HTTP 201).
- `GET **/api/invitations` (re-fetch after mutation) → the standard invitation fixture
  containing one pending invitation with code `"ABCD1234"`.

**Steps**:

1. Apply all shared route mocks.
2. Navigate to `/invite` and wait for the heading to appear.
3. Click the `getByRole("button", { name: /create invite link/i })`.
4. Wait for the invitation list to update.

**Expected**:

- The `POST /api/invitations` request was made.
- A success toast (Sonner) appears briefly.
- The invitation card for `"ABCD1234"` is visible.
- The status badge on the card reads `"Pending"` (pending clock icon).
- The card shows the code `"ABCD1234"` in a monospace `<code>` element.
- A `"Share"` (or copy) button and a `"Revoke"` button are visible in the card actions.
- The empty-state message is no longer visible.

---

## TC-03: Auto-redeeming a valid invite code shows a success banner

**Priority**: P0
**Backend**: Mock

**Why mock**: The redeem flow is triggered by the `?code=` query parameter on mount. Mocking
`POST /api/invitations/redeem/:code` lets us verify the success banner renders with the
inviter's name without needing a real invitation in the DB.

**Preconditions**:

- All shared mocks applied.
- `GET **/api/invitations` → standard invitation fixture (or empty — not the focus here).
- `POST **/api/invitations/redeem/VALIDCODE` → HTTP 200:
  ```json
  {
    "success": true,
    "inviter": { "id": "user-99", "username": "bob", "display_name": "Bob" }
  }
  ```

**Steps**:

1. Apply all shared route mocks including the redeem intercept.
2. Navigate to `/invite?code=VALIDCODE`.
3. Wait for the heading to appear.
4. Wait for the redeem banner to become visible (the `redeeming` spinner disappears and
   `redeemResult` is set).

**Expected**:

- While redeeming, a loading message (e.g. `"Redeeming..."`) is briefly visible.
- After success, a green banner is visible containing the inviter's name `"Bob"` (the
  `t("invite.redeemSuccess", { name: "Bob" })` message).
- A success toast also appears.
- The URL is updated to `/invite` (the `?code=` param is removed via `setSearchParams({},
{ replace: true })`).
- No red error banner is shown.

---

## TC-04: Auto-redeeming an expired/invalid code shows an error banner

**Priority**: P1
**Backend**: Mock

**Why mock**: Tests the error branch: the backend returns a 4xx and the page should show a
red error banner with the server's error message.

**Preconditions**:

- All shared mocks applied.
- `POST **/api/invitations/redeem/BADCODE` → HTTP 410 with body:
  ```json
  { "error": "Invitation has expired" }
  ```
  (Trigger the rejection by having `page.route()` call
  `route.fulfill({ status: 410, json: { error: "Invitation has expired" } })`. The api
  client will throw, and the `.catch` block in the `useEffect` will set `redeemResult` to
  `{ status: "error", message: "Invitation has expired" }`.)

**Steps**:

1. Apply all shared route mocks including the failing redeem intercept.
2. Navigate to `/invite?code=BADCODE`.
3. Wait for the heading to appear.
4. Wait for the error banner to become visible.

**Expected**:

- A red error banner is visible containing the message `"Invitation has expired"`.
- An error toast also appears.
- The URL is updated to `/invite` (code param removed).
- No green success banner is shown.

---

## TC-05: Revoking a pending invitation removes it (or marks it revoked)

**Priority**: P1
**Backend**: Mock

**Why mock**: Validates the revoke mutation: clicking the revoke button fires
`DELETE /api/invitations/:id`, the list re-fetches, and the card disappears (or is removed
from the pending state).

**Preconditions**:

- All shared mocks applied.
- `GET **/api/invitations` (initial) → standard invitation fixture (1 pending invitation,
  id `"inv-001"`).
- `DELETE **/api/invitations/inv-001` → `{ success: true }` (HTTP 200).
- `GET **/api/invitations` (re-fetch) → `{ invitations: [] }`.

**Steps**:

1. Apply all shared route mocks.
2. Navigate to `/invite` and wait for the invitation card with code `"ABCD1234"` to appear.
3. Click the `getByRole("button", { name: /revoke/i })` within the invitation card.
4. Wait for the list to update.

**Expected**:

- The `DELETE /api/invitations/inv-001` request was made.
- A success toast appears.
- The invitation card for `"ABCD1234"` is no longer visible.
- The empty-state message reappears.

---

## TC-06: Unauthenticated user is redirected to /login

**Priority**: P0
**Backend**: Mock

**Why mock**: Confirms that `/invite` is guarded by `<RequireAuth>`. An unauthenticated
visitor must be redirected to `/login`, never reaching the invite UI.

**Preconditions**:

- `GET **/api/auth/get-session` → `null` (no session).
- `GET **/api/auth/custom/providers` → `{ local: true, oidc: null }`.

**Steps**:

1. Apply unauthenticated mocks (`get-session` → `null`).
2. Navigate to `/invite`.
3. Wait for the URL to change.

**Expected**:

- The browser URL changes to `/login` (or `/login?redirect=/invite`) — `RequireAuth`
  redirected the visitor.
- The invite heading and the generate-invitation button are **not** visible.

---

## TC-07: Used invitation card shows who redeemed it and links to their profile

**Priority**: P1
**Backend**: Mock

**Why mock**: Tests the `"used"` status branch of `InvitationCard`. A used invitation renders
a green card with a `"Used by Alice"` label and a link to `@alice`'s profile page.

**Preconditions**:

- All shared mocks applied.
- `GET **/api/invitations` → the standard used-invitation fixture (code `"EFGH5678"`,
  used by `{ username: "alice", display_name: "Alice" }`).

**Steps**:

1. Apply all shared route mocks.
2. Navigate to `/invite` and wait for the heading.
3. Wait for an invitation card to appear.

**Expected**:

- The status badge shows a green `"Used"` state (CheckCircle2 icon).
- The card body contains text matching `"Used by Alice"` or similar.
- A link with text `"@alice"` is present and its `href` equals `/user/alice`.
- No `"Revoke"` or `"Share"` button is visible (pending-only actions are hidden for used
  invitations).
- The card has a green tinted background/border (CSS classes `bg-green-900/20`,
  `border-green-900/40`).
