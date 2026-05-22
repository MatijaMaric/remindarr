Run remindarr's eval suites — cross-cutting invariant tests that catch regressions the per-unit tests miss (e.g. a new provider that breaks the streaming-alerts guard, or a parser change that silently drops titles).

**Usage**: `/eval [domain]`

- `/eval` — run all three suites
- `/eval notifications` — cross-provider streaming-alerts guard + output stability
- `/eval tmdb` — TMDB parser golden-case regression suite
- `/eval migrations` — cascade-survival + migration integrity (superset of `migrations.test.ts`)

**Steps:**

1. Run the requested suite(s) — if more than one, run in parallel:
   - `bun run eval:notifications`
   - `bun run eval:tmdb`
   - `bun run eval:migrations`
   - (or `bun run eval` for all)

2. For each suite report:
   - ✅ PASS or ❌ FAIL
   - On failure: failing test name + assertion message + `file:line`
   - Runtime in seconds

3. If any suite fails: do NOT mark the task complete. Surface what broke so the user can decide whether to fix production code or update a golden fixture.

**Note:** these evals test cross-cutting invariants, not individual units. If an eval fails but all per-unit tests pass, the cross-cutting guard is what broke — that is the regression to fix.
