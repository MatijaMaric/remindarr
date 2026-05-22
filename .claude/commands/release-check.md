Run the full pre-PR validation gauntlet for remindarr.

**Steps (run 1 and 2 in parallel, then 3):**

1. `bun run check` — full CI pipeline (tsc + lint + tests)
2. `bun run sentry:env-check` — verify Sentry release env vars are configured

3. After both complete: `bun run test:e2e -- --project=chromium` — Playwright e2e suite

**Then report:**

- ✅ or ❌ for each of the three steps
- For any failure: first error with file:line
- `git status` — unstaged/uncommitted files
- `git diff --stat HEAD` — scope of changes

**Pass condition**: all three steps exit zero. If any fails, do not claim the branch is ready for PR. List what needs fixing.

If `bun run sentry:env-check` fails because `SENTRY_AUTH_TOKEN` is not set locally, treat it as a warning (not a blocker) and note it in the report.
