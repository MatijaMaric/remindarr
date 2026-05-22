Scaffold a new Hono route with zod validation, colocated tests, and dual wiring.

**Canonical references** (auto-loaded in your context): `server/routes/CLAUDE.md` — validation pattern and test block requirements; `server/CLAUDE.md` — entry-point sync invariant.

**Usage**: `/new-route <name>`

Example: `/new-route watchlist-export`

**What to generate:**

1. **`server/routes/<name>.ts`** — typed Hono app with:
   - Import of `zValidator` from `server/lib/validator.ts`
   - A schema defined at the top (or delegate to `<name>-schemas.ts` if the surface is large)
   - At least one placeholder route handler (`GET /api/<name>` returning `{ ok: true }`)
   - Auth middleware composing pattern from CLAUDE.md: `requireAuth` or `optionalAuth` as appropriate

2. **`server/routes/<name>-schemas.ts`** (optional, for large surfaces) — exports named zod schemas

3. **`server/routes/<name>.test.ts`** — colocated test with:
   - `setupTestDb` / `teardownTestDb` from `server/test-utils/setup.ts`
   - A `describe("validation", ...)` block with at least one rejection case (`res.status === 400`, `body.issues` is array)
   - A happy-path case (`res.status === 200`) using the smallest realistic body
   - Auth fixtures from `server/test-utils/auth.ts`

4. **Wire into BOTH** (CLAUDE.md: "Bun route wiring and CF route wiring must stay in sync"):
   - `server/index.ts` — add `app.route("/api/<name>", <name>Route)`
   - `server/worker.ts` — same import and route registration

**After generating:** run `bun run check` and report pass/fail. If it fails, fix before reporting done.
