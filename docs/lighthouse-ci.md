# Lighthouse CI

Automated performance, accessibility, best-practices, and SEO auditing on every PR to `master`, implemented via [`@lhci/cli`](https://github.com/GoogleChrome/lighthouse-ci).

See [`docs/audits/2026-05-04-lighthouse.md`](audits/2026-05-04-lighthouse.md) for the original baseline scores and the rationale behind each threshold.

---

## Thresholds

| Category       | Threshold |
| -------------- | --------- |
| Performance    | ≥ 90      |
| Accessibility  | ≥ 95      |
| Best Practices | ≥ 90      |
| SEO            | ≥ 90      |

Applied to five pages on both **desktop** and **mobile** form factors.

---

## Page set

| Group  | URLs                               | Auth   |
| ------ | ---------------------------------- | ------ |
| public | `/`, `/browse`, `/title/movie-603` | none   |
| auth   | `/settings`, `/calendar`           | cookie |

Public pages are audited logged-out (avoids the mobile authed-Home → `/reels` redirect). Auth pages receive a `Cookie` header from a seeded login so `RequireAuth` renders the real page rather than the login screen.

---

## How the CI job works

1. Build the frontend (`bun run build`).
2. Boot an isolated server (`bun run server/index.ts`) on port **3200** with a fresh SQLite DB.
3. Sign up two seed users via `POST /api/auth/sign-up/email`.
4. Seed titles, episodes, and tracking via `ux-review/db-seed.ts` (no TMDB call — uses fixture data).
5. Login to capture the session cookie.
6. Run `lhci autorun` four times: **mobile/desktop** × **public/auth** page groups, each writing reports to `.lighthouseci/<formFactor>/<group>/`.
7. Upload the full `.lighthouseci/` tree as a GitHub Actions artifact named `lighthouse-reports`.

The job runs on the **1st and 15th of every month** (approximately every two weeks) via a scheduled cron, plus on-demand via `workflow_dispatch`. It is not a required merge gate in phase 1 — reports threshold warnings but never blocks (see "Phasing" below).

---

## Prerequisites

### TMDB_API_KEY GitHub secret (required for Browse)

The `/browse` page calls the TMDB Discover API. Without a real key, Browse renders an empty state. To enable full coverage:

1. Obtain a free TMDB API key at [themoviedb.org/settings/api](https://www.themoviedb.org/settings/api).
2. Go to **Settings → Secrets and variables → Actions** in the GitHub repo.
3. Add a secret named `TMDB_API_KEY` with your key.

Without the secret, Browse is audited in its empty state. The other four pages (Home, Title detail, Settings, Calendar) render from seeded data regardless.

---

## Running locally

```bash
# Requires TMDB_API_KEY for a populated Browse page (optional but recommended)
TMDB_API_KEY=<your-key> bun run lighthouse:ci
```

Reports are written to `.lighthouseci/`. Open any `*.html` file there to view a full Lighthouse report.

The `lighthouse:ci` script also runs `bun run build` first, so your `frontend/dist` is always up to date.

---

## Phasing

**Phase 1 (current)** — All assertions are `warn`-level in `lighthouserc.cjs`. The `lighthouse` job always exits green. Threshold failures appear as warnings in CI logs and in the downloaded artifact.

**Phase 2 (follow-up)** — Once CI numbers are confirmed stable, flip to enforcing:

1. In `lighthouserc.cjs`, change all four `"warn"` → `"error"`:
   ```js
   "categories:performance": ["error", { minScore: 0.9 }],
   "categories:accessibility": ["error", { minScore: 0.95 }],
   "categories:best-practices": ["error", { minScore: 0.9 }],
   "categories:seo": ["error", { minScore: 0.9 }],
   ```
2. Optionally bump `numberOfRuns` from `1` to `3` (median of three runs dampens perf noise).
3. Add `lighthouse` to the `all-passed` gate in `.github/workflows/test.yml`:
   ```yaml
   all-passed:
     needs: [server, frontend, lighthouse]
   ```
   And add the corresponding result check in the gate's `run:` block.

---

## Key files

| File                               | Purpose                                                                |
| ---------------------------------- | ---------------------------------------------------------------------- |
| `lighthouserc.cjs`                 | Parameterised lhci config (assertions, form factor, page URLs, cookie) |
| `scripts/lighthouse-ci.ts`         | Orchestration: boot server, seed DB, login, run lhci 4×                |
| `scripts/lighthouse-ci.helpers.ts` | Testable helpers: `buildCookieHeader`, page groups, `waitForHealth`    |
| `scripts/lighthouse-ci.test.ts`    | Unit tests for helpers and config                                      |
| `.github/workflows/lighthouse.yml` | Scheduled CI job (1st & 15th of month + `workflow_dispatch`)           |
