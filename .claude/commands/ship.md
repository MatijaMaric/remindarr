Ship a feature branch as a pull request. Runs the full validation gauntlet, then pushes and creates a PR with the correct format and issue linkage.

**Pre-flight checks (stop and explain if any fail):**

1. `git branch --show-current` — must NOT be `master`. Never push directly to master.
2. Branch name must have a prefix: `claude/NNN-description`, `feat/…`, `fix/…`, or `refactor/…`. A bare name (e.g. `pinned-favorites`) is non-standard — explain and stop.

**Step 1 — Full validation (same gauntlet as `/release-check`):**

Run steps 1 and 2 in parallel, then step 3:

1. `bun run check` — full CI pipeline (tsc + lint + tests + build + wrangler dry-run)
2. `bun run sentry:env-check` — Sentry env vars (warn if `SENTRY_AUTH_TOKEN` missing, don't block)
3. `bun run test:e2e -- --project=chromium` — Playwright e2e suite

If `bun run check` or e2e fails: stop, report failures grouped by phase. Do NOT push until green.

**Step 2 — Resolve the issue number:**

- Extract from the branch name if present: `claude/524-foo` → `#524`
- If not in the branch name: ask the user "Which GitHub issue does this close?"

**Step 3 — Compose the PR body:**

Draft this and show it to the user for review before creating:

```
## Summary
- <what changed>
- <why>

## Test plan
- [ ] <what was tested manually or via automated suite>

Closes #NNN

🤖 Generated with [Claude Code](https://claude.com/claude-code)
```

**Step 4 — Push and create (confirm before each action):**

Confirm with the user before:

- `git push -u origin <branch>` — push the branch
- `gh pr create --title "<concise title, under 70 chars>" --body "<body>"`

**Never:** force-push, push to master, or create a PR without running validation first.
