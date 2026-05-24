Run an on-demand agentic UX review of remindarr across 6 viewport sizes. Captures screenshots + axe accessibility results for every route, then dispatches per-route reviewer agents and publishes findings as a markdown report + GitHub issues.

**Usage**: `/ux-review [route-slug]`

- No arg → review all routes (~28 routes × 6 viewports)
- With arg → review only routes whose slug contains the string (e.g. `/ux-review calendar`)

---

## Step 1 — Pre-flight

Check that `frontend/dist/index.html` exists:

```bash
test -f frontend/dist/index.html && echo "dist ok" || echo "MISSING — run bun run build first"
```

If missing, run `bun run build` before continuing (the capture server needs the pre-built frontend).

---

## Step 2 — Capture

Run the deterministic screenshot + axe sweep:

```bash
# No arg:
bun run ux:capture 2>&1

# With route arg (e.g. "calendar"):
bun run ux:capture -- --grep "capture <arg>" 2>&1
```

This boots an isolated production server on port 3100 with a clean seeded DB (`.ux-review/`), captures screenshots and axe violations for each route at all 6 viewports into `.ux-review/artifacts/<slug>/`, and writes `.ux-review/manifest.json`.

---

## Step 3 — Enumerate routes to review

Read `.ux-review/manifest.json` to confirm seeding succeeded. Then list the artifact directories to get the captured route slugs:

```bash
ls .ux-review/artifacts/ 2>/dev/null
```

Filter by the arg if provided (slug contains the arg string). Build the list of routes to review.

---

## Step 4 — Dispatch per-route reviewer agents (parallel)

For each route slug in the captured list, dispatch one `ux-route-reviewer` subagent. Send all of them in a single message (true parallel dispatch — do NOT wait for one before sending the next).

For each agent, pass a prompt in this exact format:

> Route path: `<resolved-path-from-manifest>`
> Route slug: `<slug>`
> Description: `<description-from-routes.ts>`
> Source file: `<sourceFile-from-routes.ts>` (omit line if none)
> Artifacts directory: `.ux-review/artifacts/<slug>/`
>
> Review this route across all 6 viewports (320x568, 375x812, 640x1024, 768x1024, 1280x800, 1920x1080). Read the screenshots and axe JSON files, then return findings in the standard table format.

To build the prompt, read `ux-review/routes.ts` so you know each route's description and sourceFile.

Collect all findings as agents complete.

---

## Step 5 — Write the report

Create `docs/ux-reviews/<YYYY-MM-DD>-ux-review.md` (use today's date) with this structure:

```markdown
# UX Review — <YYYY-MM-DD>

**Scope**: <arg or "all routes">  
**Viewports**: 320×568 · 375×812 · 640×1024 · 768×1024 · 1280×800 · 1920×1080  
**Routes reviewed**: <count>  
**Screenshots**: `.ux-review/artifacts/` (local only — not committed)

---

<paste each agent's findings section in route-path alphabetical order>
```

---

## Step 6 — File / update / close GitHub issues

Ensure the label exists:

```bash
gh label create ux-review --color 0075CA --description "UX review finding — auto-filed" || true
```

Fetch all currently open `ux-review` issues:

```bash
gh issue list --label ux-review --state open --json number,title,body
```

For each reviewed route:

- **Findings present** and an issue titled `UX review: <route-path>` exists → update its body with the new findings table and add a comment: `Updated by UX review run <YYYY-MM-DD>. Report: docs/ux-reviews/<date>-ux-review.md`
- **Findings present** and no matching issue → create one:
  ```bash
  gh issue create \
    --title "UX review: <route-path>" \
    --label "ux-review" \
    --body "<findings-table>\n\nAuto-filed by /ux-review on <date>. Report: docs/ux-reviews/<date>-ux-review.md"
  ```
- **Route is clean** (no findings) and an issue exists → close it:
  ```bash
  gh issue close <number> --comment "No issues found in UX review run <YYYY-MM-DD> — closing."
  ```
- **Route is clean** and no issue exists → nothing to do.

---

## Step 7 — Summary

Print a one-line summary:

> UX review complete. <N> routes reviewed, <M> with findings. Report: `docs/ux-reviews/<date>-ux-review.md`. Issues filed/updated: <K>.
