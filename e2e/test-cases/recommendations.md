# Test cases: recommendations

## Preconditions (shared)

- The Remindarr dev server is running (Bun on `:3000`, Vite proxy on `:5173`).
- All test cases target the **Discovery page** at `/discovery`, which is the primary
  surface for received recommendations. The page is protected by `<RequireAuth>`.
- All test cases use `page.route()` mocks unless explicitly marked **Real**.
- Before navigating, mock the following base endpoints so the page renders without hitting
  the real backend:
  - `GET **/api/auth/get-session` → `MOCK_SESSION` (logged-in, see `e2e/helpers.ts`)
  - `GET **/api/auth/custom/providers` → `{ local: true, oidc: null }`
  - `GET **/api/recommendations` → a standard `recommendationsResponse` fixture (see below)
  - `GET **/api/recommendations/count` → `{ count: 0 }`
  - `GET **/api/suggestions/aggregate**` → `{ groups: [], flat: [] }`

### Standard `recommendationsResponse` fixture

```json
{
  "recommendations": [
    {
      "id": "rec-1",
      "from_user": {
        "id": "user-2",
        "username": "alice",
        "display_name": "Alice",
        "image": null
      },
      "title": {
        "id": "tt9999001",
        "title": "Recommended Show",
        "object_type": "SHOW",
        "poster_url": null
      },
      "message": "You will love this one!",
      "created_at": "2026-05-20T10:00:00Z",
      "read_at": null,
      "is_targeted": false
    }
  ],
  "count": 1
}
```

> **Product rule**: Recommendations are a **1-to-N broadcast** — when a user recommends a
> title, it goes to **all** of their followers, not to a single named recipient. The
> `is_targeted: true` flag marks the rare case where a specific recipient was chosen via
> "Pick a person". Tests must never imply the default flow is 1-to-1.

---

## TC-01: Discovery page — Activity tab loads and shows received recommendations

**Priority**: P0
**Backend**: Mock

**Why mock**: Verifies the full render of the Activity tab — sender info, title card, optional
message, unread indicator — without real user/follower data. A mock response guarantees a
stable recommendation for assertion.

**Preconditions**:

- All shared mocks applied.
- `GET **/api/recommendations` returns the standard `recommendationsResponse` fixture
  (1 recommendation from `@alice`, title `"Recommended Show"`, message present, unread).
- `GET **/api/recommendations/count` → `{ count: 1 }`.

**Steps**:

1. Apply all shared route mocks.
2. Navigate to `/discovery`.
3. Wait for `getByRole("heading", { name: "For you" })` to be visible.
4. Click the pill button labelled `"Activity"` to switch tabs.
5. Wait for the recommendation card list to appear.

**Expected**:

- The "Activity" pill button is active (visually selected).
- A card is visible containing the text `"Alice"` (sender display name).
- The card shows the title `"Recommended Show"`.
- The card shows the message text `"You will love this one!"`.
- An amber left border is present on the card (indicating it is unread: `border-l-2 border-l-amber-500`).
- A `"Track"` button and a `"Dismiss"` button are visible within the card.

---

## TC-02: Discovery page — auth required (unauthenticated redirect)

**Priority**: P0
**Backend**: Mock

**Why mock**: Confirms that `/discovery` is protected by `<RequireAuth>`. An unauthenticated
visitor must be redirected away from the page, not shown any recommendation data.

**Preconditions**:

- `GET **/api/auth/get-session` → `null` (no session).
- `GET **/api/auth/custom/providers` → `{ local: true, oidc: null }`.

**Steps**:

1. Apply the logged-out session mock.
2. Apply the providers mock.
3. Navigate to `/discovery`.
4. Wait for the URL to settle.

**Expected**:

- The browser URL changes away from `/discovery` (redirect to `/login` or `/`).
- The "For you" heading is **not** visible.
- No recommendation card content is rendered.

---

## TC-03: Sending a recommendation from a title detail page (broadcast to all followers)

**Priority**: P1
**Backend**: Mock

**Why mock**: Tests the `RecommendButton` flow — opening the recommend dialog, confirming the
default "All followers" audience selection, submitting, and seeing the success toast — without
hitting the real recommendation or title API.

**Preconditions**:

- All shared mocks applied.
- `GET **/api/titles/tt1234567` → any valid title detail response (movie).
- `GET **/api/recommendations/check/tt1234567` → `{ recommended: false, id: null }`.
- `POST **/api/recommendations` → `{ id: "rec-new-1" }` (200 OK).
- Navigate to a title detail page such as `/title/tt1234567`.

**Steps**:

1. Apply all shared route mocks plus the title-specific mocks listed above.
2. Navigate to `/title/tt1234567`.
3. Wait for the title detail page to render (e.g. wait for the title heading to be visible).
4. Click the button with title `"Recommend"` (`RecommendButton`).
5. Wait for the recommend dialog to open (heading `"Recommend this title"` visible).
6. Confirm the `"All followers"` audience button (`data-testid="audience-all"`) is active by default.
7. Optionally type a message in `data-testid="recommend-message"`.
8. Click `data-testid="recommend-send"` to submit.
9. Wait for the dialog to close.

**Expected**:

- The dialog heading `"Recommend this title"` appears.
- The `"All followers"` button is selected (amber highlight) before the user changes anything.
- The `POST /api/recommendations` request body includes `{ "titleId": "tt1234567" }` (no
  `targetUserId`, confirming the broadcast intent).
- A success toast appears with the text `"Recommendation sent to all followers!"`.
- The `RecommendButton` now shows `"Recommended"` text with a check icon.

---

## TC-04: Empty state — no received recommendations

**Priority**: P1
**Backend**: Mock

**Why mock**: Tests the empty-state message in the Activity tab when the backend returns an
empty recommendations list.

**Preconditions**:

- All shared mocks applied.
- `GET **/api/recommendations` returns:
  ```json
  { "recommendations": [], "count": 0 }
  ```
- `GET **/api/recommendations/count` → `{ count: 0 }`.

**Steps**:

1. Apply all shared route mocks with the empty recommendations response.
2. Navigate to `/discovery`.
3. Wait for `getByRole("heading", { name: "For you" })`.
4. Click the `"Activity"` pill button to switch to the Activity tab.
5. Wait for the tab content to settle.

**Expected**:

- No recommendation cards are rendered.
- An empty-state message (sourced from i18n key `discovery.empty`) is visible — by default
  this is text such as `"No recommendations yet"` or similar placeholder text.
- No error banner or spinner is shown.

---

## TC-05: Clicking a recommended title navigates to the title detail page

**Priority**: P1
**Backend**: Mock

**Why mock**: Navigation is a frontend concern. We only need to verify that the link inside
a `RecommendationCard` routes to `/title/<id>`. No detail-page data needs to load.

**Preconditions**:

- All shared mocks applied.
- `GET **/api/recommendations` returns the standard `recommendationsResponse` fixture
  (title id `"tt9999001"`, title `"Recommended Show"`).

**Steps**:

1. Apply all shared route mocks.
2. Navigate to `/discovery`.
3. Wait for `getByRole("heading", { name: "For you" })`.
4. Click the `"Activity"` pill button.
5. Wait for the recommendation card for `"Recommended Show"` to be visible.
6. Click the link wrapping the title name or poster thumbnail inside the card
   (the `<Link to="/title/tt9999001">` element).
7. Wait for the URL to change.

**Expected**:

- The browser URL changes to `/title/tt9999001`.
- The Discovery page heading `"For you"` is no longer visible.

> **Implementation note**: The `RecommendationCard` in `DiscoveryPage.tsx` renders a
> `<Link to="/title/${rec.title.id}">` around both the poster image and the title text.
> Either is a valid click target.
