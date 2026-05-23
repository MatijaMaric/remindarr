Generate a Playwright spec for a feature using the 4-agent e2e pipeline.

**Usage**: `/gen-e2e <feature>`

Example: `/gen-e2e calendar-feed`

**Context** (read before starting):

- `e2e/CLAUDE.md` — conventions, mock-vs-real split, spec status, CI rules
- `e2e/app.context.md` — product rules and non-DOM knowledge

---

**Pre-flight: confirm dev server is running**

```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:5173
```

If the result is not `200`: stop and tell the user to run `bun run dev` first, then re-run this command.

---

**Step 1 — Exploration** (dispatch `e2e-explorer` subagent)

Prompt:

> "Explore the '<feature>' feature for remindarr's e2e pipeline. The dev server is running at localhost:5173. Read the frontend source in `frontend/src/`, the server route in `server/routes/`, walk the live UI with playwright-cli, and update `e2e/app.context.md` with a feature section covering API routes, user roles, non-DOM knowledge, and UI states to cover."

---

**Step 2 — Test-case authoring** (dispatch `e2e-test-case-author` subagent)

Prompt:

> "Write test cases for the '<feature>' feature. Read `e2e/app.context.md` (just updated) and the relevant frontend page and server route. Write `e2e/test-cases/<feature>.md` with preconditions, steps, and expected results for each test case. Decide mock vs real backend per case. Stop after writing the file — do NOT generate any TypeScript code."

---

**Step 3 — STOP for human approval**

After the test-case doc is written, tell the user:

> Test cases are ready at `e2e/test-cases/<feature>.md`. Review them and reply **approve** to generate the automation code, or describe the changes you want.

**Do NOT proceed to Step 4 without explicit user approval.**

---

**Step 4 — Automation** (dispatch `e2e-automation` subagent — only after approval)

Prompt:

> "The test cases at `e2e/test-cases/<feature>.md` are human-approved. Generate the Page Object at `e2e/pages/<feature>-page.ts` and the spec at `e2e/<feature>.spec.ts`. Follow `e2e/CLAUDE.md` conventions. Use `playwright-cli` to discover locators. Run `bun run test:e2e -- --project=chromium <feature>` and report pass/fail."

---

**Step 5 — Report**

Summarise what was created. Always end with:

> Generated specs are **local-only** by default. To add to CI, update the spec list in `.github/workflows/e2e.yml` once the spec is stable on your machine.
