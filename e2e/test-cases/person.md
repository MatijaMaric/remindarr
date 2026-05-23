# Test cases: person

## Preconditions (shared)

- The Remindarr dev server is running (Bun on `:3000`, Vite proxy on `:5173`).
- Unless stated otherwise, the browser is unauthenticated (no active session cookie).
- The person page is at `/person/:personId` (e.g. `/person/287`).
- All test cases use `page.route()` mocks unless explicitly marked **Real**.
- Before navigating, mock the following base endpoints so the page renders without
  hitting the real TMDB-backed backend:
  - `GET **/api/auth/get-session` → `null` (logged-out) — or `MOCK_SESSION` when
    auth is required by the specific TC
  - `GET **/api/auth/custom/providers` → `{ local: true, oidc: null }`
  - `GET **/api/details/person/287` → standard `personDetailsResponse` fixture (see below)

### Standard `personDetailsResponse` fixture

```json
{
  "person": {
    "id": 287,
    "name": "Brad Pitt",
    "biography": "William Bradley Pitt (born December 18, 1963) is an American actor and film producer. Known for both his acting roles and his off-screen lifestyle, he has received multiple awards.",
    "birthday": "1963-12-18",
    "deathday": null,
    "place_of_birth": "Shawnee, Oklahoma, USA",
    "known_for_department": "Acting",
    "profile_path": null,
    "also_known_as": ["Brad Pitt"],
    "popularity": 45.2,
    "combined_credits": {
      "cast": [
        {
          "id": 550,
          "media_type": "movie",
          "title": "Fight Club",
          "character": "Tyler Durden",
          "release_date": "1999-10-15",
          "poster_path": null,
          "vote_average": 8.4,
          "vote_count": 26000,
          "popularity": 60.1
        },
        {
          "id": 4944,
          "media_type": "movie",
          "title": "Inglourious Basterds",
          "character": "Lt. Aldo Raine",
          "release_date": "2009-08-19",
          "poster_path": null,
          "vote_average": 8.3,
          "vote_count": 20000,
          "popularity": 45.5
        }
      ],
      "crew": [
        {
          "id": 550,
          "media_type": "movie",
          "title": "Fight Club",
          "job": "Producer",
          "department": "Production",
          "release_date": "1999-10-15",
          "poster_path": null,
          "vote_average": 8.4,
          "vote_count": 26000,
          "popularity": 60.1
        }
      ]
    },
    "external_ids": {
      "imdb_id": "nm0000093",
      "instagram_id": null,
      "twitter_id": null
    }
  }
}
```

### Empty-person fixture (for TC-04)

```json
{
  "person": {
    "id": 99999,
    "name": "Unknown Person",
    "biography": "",
    "birthday": null,
    "deathday": null,
    "place_of_birth": null,
    "known_for_department": "",
    "profile_path": null,
    "also_known_as": [],
    "popularity": 0.1,
    "combined_credits": {
      "cast": [],
      "crew": []
    },
    "external_ids": {}
  }
}
```

---

## TC-01: Person page loads with name, bio, and filmography sections

**Priority**: P0
**Backend**: Mock

**Why mock**: All rendered content (name, biography, cast/crew credits) comes from a single
`GET /api/details/person/:id` response. Mocking guarantees a stable payload for assertion
without touching the real TMDB proxy.

**Preconditions**:

- `GET **/api/auth/get-session` → `null` (unauthenticated; page is public).
- `GET **/api/auth/custom/providers` → `{ local: true, oidc: null }`.
- `GET **/api/details/person/287` → standard `personDetailsResponse` fixture.

**Steps**:

1. Apply all route mocks.
2. Navigate to `/person/287`.
3. Wait for `getByRole("heading", { level: 1 })` to be visible.

**Expected**:

- `getByRole("heading", { level: 1 })` text is `"Brad Pitt"`.
- The `"Acting"` department badge is visible (rendered as an amber-tinted span).
- `getByText(/Born:/)` is visible, followed by `"Dec 18, 1963"`.
- `getByText(/From:/)` is visible, followed by `"Shawnee, Oklahoma, USA"`.
- `getByRole("heading", { name: "Biography" })` is visible.
- The biography text begins with `"William Bradley Pitt"` and is visible on the page.
- `getByRole("heading", { name: /Acting \(2\)/ })` is visible (2 cast credits).
- `getByRole("heading", { name: /Crew \(1\)/ })` is visible (1 crew credit after
  deduplication by `id-job` key).

---

## TC-02: Unauthenticated user can access /person/:id (public page)

**Priority**: P0
**Backend**: Mock

**Why mock**: Confirms that `/person/:personId` has no `<RequireAuth>` wrapper in
`App.tsx`. An unauthenticated visitor must reach the page without being redirected to
`/login`.

**Preconditions**:

- `GET **/api/auth/get-session` → `null` (explicitly no session).
- `GET **/api/auth/custom/providers` → `{ local: true, oidc: null }`.
- `GET **/api/details/person/287` → standard `personDetailsResponse` fixture.

**Steps**:

1. Apply the unauthenticated session mock (`get-session` → `null`).
2. Apply remaining mocks listed above.
3. Navigate to `/person/287`.
4. Wait for `getByRole("heading", { level: 1 })` to be visible.

**Expected**:

- The browser URL remains `/person/287` — no redirect to `/login` occurs.
- `getByRole("heading", { level: 1 })` text is `"Brad Pitt"`.
- The top navigation bar shows a `"Sign In"` link (not a user avatar or logout button),
  confirming the unauthenticated state is correctly reflected.

---

## TC-03: Clicking a credit card navigates to /title/:id

**Priority**: P1
**Backend**: Mock

**Why mock**: Navigation is a frontend routing concern. We only need the person details
fixture to render the credit cards; the title detail page does not need to load.

**Preconditions**:

- `GET **/api/auth/get-session` → `null`.
- `GET **/api/auth/custom/providers` → `{ local: true, oidc: null }`.
- `GET **/api/details/person/287` → standard `personDetailsResponse` fixture (cast
  includes `"Fight Club"` with `id: 550`, `media_type: "movie"` → title id `"movie-550"`).
- `GET **/api/details/**` → any minimal valid response (left unrouted is acceptable — we
  assert URL change only).

**Steps**:

1. Apply all route mocks.
2. Navigate to `/person/287`.
3. Wait for `getByRole("heading", { level: 1, name: "Brad Pitt" })`.
4. Locate `getByRole("link", { name: /Fight Club/i })` in the Acting section.
5. Click the link.
6. Wait for the URL to change.

**Expected**:

- The browser URL changes to `/title/movie-550`.
- The person page heading `"Brad Pitt"` is no longer visible (navigated away).

> **Implementation note**: `CreditCard` renders a `<Link to="/title/${creditTitleId(credit)}">`.
> For a movie credit with `id: 550`, `creditTitleId()` returns `"movie-550"`. The link
> wraps both the poster image and the title text. Use
> `getByRole("link", { name: /Fight Club/i }).first()` if multiple matches exist.

---

## TC-04: Empty state — person has no known credits

**Priority**: P1
**Backend**: Mock

**Why mock**: Tests the branch where `castCredits.length === 0` and
`crewCredits.length === 0` — no Acting or Crew section renders. Returning empty credit
arrays from the mock exercises this fully.

**Preconditions**:

- `GET **/api/auth/get-session` → `null`.
- `GET **/api/auth/custom/providers` → `{ local: true, oidc: null }`.
- `GET **/api/details/person/99999` → empty-person fixture (name `"Unknown Person"`,
  empty cast and crew arrays, no biography, no birthday).

**Steps**:

1. Apply all route mocks.
2. Navigate to `/person/99999`.
3. Wait for `getByRole("heading", { level: 1 })` to be visible.

**Expected**:

- `getByRole("heading", { level: 1 })` text is `"Unknown Person"`.
- No `getByRole("heading", { name: /Acting/ })` section is present (cast array is empty).
- No `getByRole("heading", { name: /Crew/ })` section is present (crew array is empty).
- No `getByRole("heading", { name: "Biography" })` section is present (empty biography
  string is falsy and the section is conditionally rendered).
- The page renders without error (no red error message visible).

---

## TC-05: Long biography is truncated with "Show more" toggle

**Priority**: P1
**Backend**: Mock

**Why mock**: The biography truncation at 600 characters is a pure frontend behaviour
(`BIO_TRUNCATE_LENGTH`). Supplying a long biography string via the mock exercises the
toggle without any real data dependency.

**Preconditions**:

- `GET **/api/auth/get-session` → `null`.
- `GET **/api/auth/custom/providers` → `{ local: true, oidc: null }`.
- `GET **/api/details/person/287` → a variant of the standard fixture where `biography` is
  a string longer than 600 characters. Example: repeat `"A ".repeat(400)` to create an
  801-character biography, or use a realistic long text. The fixture must include cast
  credits so the page renders fully.

**Steps**:

1. Apply all route mocks with the long-biography fixture.
2. Navigate to `/person/287`.
3. Wait for `getByRole("heading", { name: "Biography" })` to be visible.
4. Verify the biography text is truncated (ends with `"..."`).
5. Click `getByRole("button", { name: "Show more" })`.

**Expected**:

- Before clicking `"Show more"`: the displayed biography text ends with `"..."` and is
  shorter than the full text.
- After clicking `"Show more"`: the `"Show more"` button changes to `"Show less"`, and the
  full biography text is visible (no trailing `"..."`).
- Clicking `"Show less"` collapses the biography back to the truncated form.

---

## TC-06: Error state — person not found

**Priority**: P1
**Backend**: Mock

**Why mock**: Tests the `isError` render branch in `PersonPage`. Returning a non-2xx
status from the mock exercises the `"Person not found"` error message without needing a
real failing TMDB call.

**Preconditions**:

- `GET **/api/auth/get-session` → `null`.
- `GET **/api/auth/custom/providers` → `{ local: true, oidc: null }`.
- `GET **/api/details/person/99998` → HTTP 404 with body `{ "error": "Not found" }`.

**Steps**:

1. Apply all route mocks, fulfilling the person endpoint with status 404.
2. Navigate to `/person/99998`.
3. Wait for the error message to appear.

**Expected**:

- `getByText("Person not found")` is visible (rendered by the `isError` branch in
  `PersonPage`).
- No `<h1>` heading with a person name is rendered.
