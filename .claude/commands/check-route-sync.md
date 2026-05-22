Audit the critical invariant from `server/CLAUDE.md`: every route registered in `server/index.ts` must also be registered in `server/worker.ts` (and vice versa).

**Steps:**

1. Read `server/index.ts` — collect all `app.route(path, handler)` calls
2. Read `server/worker.ts` — collect the same
3. Diff the two sets:
   - In `index.ts` but NOT `worker.ts` → CF Worker is missing these (production gap)
   - In `worker.ts` but NOT `index.ts` → Bun server is missing these

**Report format:**

If in sync:

```
✅ IN SYNC — N routes registered in both entry points.
```

If drift detected:

```
❌ DRIFT DETECTED

Missing from worker.ts (CF prod will 404):
  - /api/foo  →  routes/foo.ts

Missing from index.ts (Bun dev will 404):
  - /api/bar  →  routes/bar.ts

Fix: add app.route("/api/<name>", <name>Route) to the missing entry point(s)
     following the existing import + registration pattern in that file.
```

**Read only — do not modify files.** Report the drift; the user decides how to proceed.
