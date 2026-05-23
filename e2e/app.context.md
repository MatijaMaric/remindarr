# Remindarr — E2E Test Context

Living document owned by the `e2e-explorer` agent. Update it when exploring a new
feature or when product rules change. Do NOT duplicate information from the scoped
`CLAUDE.md` files — link to them instead.

Related docs: [`e2e/CLAUDE.md`](./CLAUDE.md) · [`frontend/CLAUDE.md`](../frontend/CLAUDE.md) ·
[`server/notifications/CLAUDE.md`](../server/notifications/CLAUDE.md)

---

## Product overview

Remindarr lets users discover and track streaming media releases. Core loop:

1. **Search** — query TMDB for a title
2. **Track** — pin it to your list; Remindarr monitors upcoming episodes
3. **Episodes** — browse the episode schedule for tracked titles
4. **Calendar feed** — subscribe to a secret ICS URL in a calendar app
5. **Notifications** — get push/webhook/email alerts when new episodes release
6. **Recommendations** — follow other users; they broadcast recommendations 1-to-N (not 1-to-1)

---

## User roles

| Role                | How created                                 | Credentials                                                                                                                                    |
| ------------------- | ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| **Bootstrap admin** | Auto-created on fresh DB boot               | Username: `admin`; password written to `<db-dir>/admin-password.txt`. Read with `readBootstrapAdminCredentials()` from `e2e/fixtures/auth.ts`. |
| **Regular user**    | Self-register via `/api/auth/sign-up/email` | Created at runtime in tests with `registerUser(request)`.                                                                                      |

Relationships:

- **Following / recommendations**: a recommendation from User A is broadcast to
  **all** of A's followers — a 1-to-N model. It is not a direct message.

---

## Authentication modes

| Mode                    | How configured                                                     | E2E mock                                                                                              |
| ----------------------- | ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| **Username + password** | Always available (better-auth)                                     | No mock needed — real signup/login in e2e.                                                            |
| **OIDC (pocketid)**     | `OIDC_ISSUER_URL`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET` env vars | `e2e/fixtures/mock-oidc.ts` — in-process RS256 OIDC provider on port `4321`. Provider ID: `pocketid`. |
| **Passkey (WebAuthn)**  | UI toggle                                                          | CDP virtual WebAuthn authenticator. **Chromium-only**. See `passkey.spec.ts`.                         |

The login page hides the username/password form when OIDC or passkey is configured.
`loginUi()` (and `LoginPage.signIn()`) handles the toggle automatically.

---

## Non-DOM knowledge

These values are never persistently visible in the DOM:

| Value                        | What it is                                                             | How to access in tests                                                                                                                                                                          |
| ---------------------------- | ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Calendar feed ICS URL**    | Secret per-user URL; disclosed only via clipboard after generation     | Route-intercept the calendar API endpoint and capture the URL from the response body, or read the clipboard via `page.evaluate(() => navigator.clipboard.readText())` after the user copies it. |
| **Admin bootstrap password** | Random password written to `<db-dir>/admin-password.txt` on first boot | `readBootstrapAdminCredentials()` in `e2e/fixtures/auth.ts:83`.                                                                                                                                 |
| **Webhook secret / payload** | Notification payloads arrive at the mock webhook server                | Introspect via `GET http://localhost:4322/__requests`; reset via `POST http://localhost:4322/__reset`. Mock server: `e2e/fixtures/mock-webhook.ts`.                                             |
| **OIDC authorization code**  | Exchanged internally between mock OIDC and backend                     | No test needs to read this directly — the mock auto-redirects.                                                                                                                                  |

---

## Test architecture — mock vs real backend

Two distinct strategies coexist in the test suite. Pick the right one per feature:

### Mock (UI-only)

Use when the feature is pure frontend state that can be fully exercised via API stubs.

```ts
import { mockLoggedIn, mockTitleEndpoints } from "../helpers";

test.beforeEach(async ({ page }) => {
  await mockLoggedIn(page);
  await mockTitleEndpoints(page, sampleTitles);
});
```

Key helpers in `e2e/helpers.ts`:

- `mockLoggedIn(page)` — stubs `/api/auth/get-session`, `/api/custom/providers`, `/api/csrf`
- `mockLoggedOut(page)` — stubs the same endpoints with `null` session
- `mockTitleEndpoints(page, titles)` — stubs title/tracking list endpoints
- `mockBrowseEndpoints(page, titles)` — stubs browse/recommendations endpoints

### Real backend

Use when the feature depends on server-side state, auth flows, or side effects
(notifications, calendar tokens, OIDC, passkey).

```ts
import { registerUser, loginUi } from "../fixtures/auth";

test.beforeEach(async ({ page, request }) => {
  const user = await registerUser(request);
  await loginUi(page, user.username, user.password);
});
```

For **notifications**: use `mock-webhook.ts` introspection endpoints — never call
real external services.

---

## E2E environment

| Setting      | Value                                                                |
| ------------ | -------------------------------------------------------------------- |
| Base URL     | `http://localhost:5173` (Vite dev server; proxies `/api` to `:3000`) |
| E2E database | `.e2e/remindarr.sqlite` (wiped per CLI invocation)                   |
| Mock OIDC    | `http://localhost:4321`                                              |
| Mock webhook | `http://localhost:4322`                                              |
| Crons        | Disabled in e2e (`*_CRON` env vars unset)                            |
| TMDB         | Placeholder key — never real HTTP                                    |

---

## Feature sections

> Each feature explored by the `e2e-explorer` agent gets its own section below.
> Sections are added or updated as the pipeline runs.

<!-- feature sections added here by e2e-explorer -->
