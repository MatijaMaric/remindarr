<!--
SYNC IMPACT REPORT
==================
Version change: (template/unversioned) → 1.0.0
Bump rationale: First ratified constitution. Initial adoption of the full
  principle set, so versioning starts at 1.0.0 (MAJOR baseline).

Modified principles: (none — initial definition)
  Placeholder principles replaced with concrete, project-derived principles:
    [PRINCIPLE_1] → I. Test-Driven Quality (NON-NEGOTIABLE)
    [PRINCIPLE_2] → II. Dual-Runtime Parity (Bun + Cloudflare)
    [PRINCIPLE_3] → III. Database Migration Safety (NON-NEGOTIABLE)
    [PRINCIPLE_4] → IV. Type Safety & Lint Discipline
    [PRINCIPLE_5] → V. Observability & Structured Logging

Added sections:
  - Additional Constraints & Conventions (was [SECTION_2])
  - Development Workflow & Quality Gates (was [SECTION_3])

Removed sections: (none)

Templates requiring updates:
  ✅ .specify/templates/plan-template.md — Constitution Check gate references
     the constitution generically; no edit required (gates resolve at plan time).
  ✅ .specify/templates/spec-template.md — no constitution-coupled sections; aligned.
  ✅ .specify/templates/tasks-template.md — task categories already cover tests,
     migrations, lint/type gates; aligned.
  ✅ .specify/templates/constitution-template.md — source template, left intact.

Follow-up TODOs: (none)
-->

# Remindarr Constitution

## Core Principles

### I. Test-Driven Quality (NON-NEGOTIABLE)

Every change MUST ship with tests. New features MUST include unit tests; bug
fixes MUST include a regression test that fails before the fix and passes after.

- Test files are colocated (`foo.ts` → `foo.test.ts`) and use the built-in
  `bun:test` runner — no external test frameworks.
- DB-dependent tests MUST use the in-memory SQLite harness
  (`setupTestDb()` / `teardownTestDb()`); never top-level-`await` DB code in a
  test file, since it runs before setup.
- External services (TMDB, OIDC, Discord, all outbound HTTP) MUST be mocked —
  no real network calls in tests. `spyOn`/`mock.module` MUST be restored in
  `afterEach` to avoid cross-file leakage on CI.
- `bun run check` (full type checks + lint + all tests + build + wrangler
  dry-run) MUST pass locally before a PR is opened. `bun test` alone is
  insufficient because it skips type checking and lint.

Rationale: the app dispatches real notifications and mutates user-owned data on
two runtimes; untested changes have caused production incidents. Tests are the
contract, not an afterthought.

### II. Dual-Runtime Parity (Bun + Cloudflare)

The same codebase MUST run as a Bun server (Docker) and as a Cloudflare Workers
app (D1 + KV). Feature work MUST preserve parity between the two runtimes.

- Every route registered in `server/index.ts` MUST also be registered in
  `server/worker.ts`. The CF worker MUST expose every API the Bun server does.
- Shared code MUST use the platform abstraction (`server/platform/`), not
  Bun-specific APIs, for password hashing, DB handles, and runtime services.
- Configuration flows through `server/config.ts`; CF runtime values are applied
  via `patchConfig()` from env bindings, never hard-coded.

Rationale: divergence between runtimes produces "works on Bun, 500s on Workers"
bugs that are invisible until deployed. Parity is a structural invariant.

### III. Database Migration Safety (NON-NEGOTIABLE)

Schema changes MUST be safe on Cloudflare D1, where `PRAGMA foreign_keys=OFF`
does not persist across statement-breakpoint boundaries.

- NEVER recreate an FK-parent table (`users`, `titles`, `providers`) via
  DROP/recreate; a cascading delete will wipe child rows.
- Add columns with `ALTER TABLE <t> ADD COLUMN <c> <type> NOT NULL DEFAULT
'<val>'`. The create-new → copy → drop-old → rename pattern is permitted ONLY
  for leaf tables with no FK children.
- `server/db/migrations.test.ts` MUST stay green: it runs every migration with
  `foreign_keys=ON` and asserts early-seeded `account`/`sessions`/`passkey`
  rows survive. Run it after writing any migration and before opening a PR.
- All DB access goes through the repository modules in
  `server/db/repository/`; ad-hoc queries scattered across routes are not
  permitted.

Rationale: a parent-table recreate caused a real production data-loss incident
(migration 0037, 2026-04-29). This principle exists to make that class of bug
impossible to reintroduce.

### IV. Type Safety & Lint Discipline

The codebase MUST remain strictly typed and warning-free.

- TypeScript runs in strict mode. `any` is forbidden in source files: use
  `unknown` for catch clauses and precise types elsewhere. Test files are
  exempt from `no-explicit-any` only.
- Frontend and server code MUST pass ESLint with zero errors and zero warnings.
- Do not introduce type casts that defeat the type system to satisfy a
  toolchain quirk (e.g. casting `applicationServerKey` in push code breaks Bun
  CI); fix the root cause instead.

Rationale: strict types and a clean lint baseline are the cheapest defense
against whole categories of runtime errors and keep the codebase reviewable.

### V. Observability & Structured Logging

Server behavior MUST be observable in production.

- All server-side code MUST use the structured logger from
  `server/logger.ts` (`logger.child({ module })`); never `console.*` directly.
  The second argument is structured context, not string interpolation.
  Frontend code may continue to use `console.error`.
- Operational surfaces — Sentry (optional), Prometheus metrics at `/metrics`,
  and `LOG_LEVEL`-controlled JSON logs — MUST be kept functional as features
  are added; new long-running paths (jobs, sync, notification dispatch) MUST
  emit logs and, where relevant, metrics.

Rationale: the system runs unattended (cron sync, scheduled notifications,
job retries). Without structured, queryable logs and metrics, failures are
silent until a user reports them.

## Additional Constraints & Conventions

- **Stack**: Bun / CF Workers · Hono · TypeScript strict · React 19 + Vite +
  Tailwind 4 + shadcn/ui · Drizzle ORM (SQLite/D1) · better-auth · Sentry.
  Changes that swap a core stack element require explicit justification under
  Governance.
- **Route validation**: every route accepting user input (query, body, path)
  MUST validate shape with zod/`zValidator`. Business-rule validation (e.g.
  `validateConfig` for notifiers) belongs in the handler/provider, not the zod
  schema.
- **Notification providers** MUST follow the registry pattern
  (`server/notifications/registry.ts`), guard streaming-alert rendering with
  `streamingAlerts.length > 0`, and ship the full provider test matrix (title,
  episode, alert present, alert absent, `validateConfig` failure).
- **Branch naming**: Claude-authored branches use `claude/NNN-short-description`
  (NNN = issue number); human branches use `feat/`, `fix/`, or `refactor/`
  prefixes. Never push directly to `master` (branch protection). Link issues
  to PRs with `Closes #NNN`.
- **Secrets** are never committed; configuration flows through env vars with
  defaults in `server/config.ts`.

## Development Workflow & Quality Gates

- **Pre-push hook** (lefthook) runs `bun run check:fast` (server/e2e/frontend
  tsc + ESLint) and `bun run test:changed` in parallel. It is a fast local
  filter, not a substitute for the full gate.
- **CI** (`test.yml`) runs the full suite on every push and PR to `master` and
  is the authoritative backstop.
- **Before opening a PR**, `bun run check` MUST pass locally, plus
  `bun test server/db/migrations.test.ts` for any migration.
- **Code review**: every PR MUST be verified for compliance with these
  principles. A reviewer SHOULD block any PR that adds untested behavior,
  breaks runtime parity, performs an unsafe migration, or introduces `any` /
  lint warnings in source.
- In worktrees, use `bun install --ignore-scripts` to avoid the lefthook
  prepare step failing on a shared `core.hooksPath`.

## Governance

This constitution supersedes ad-hoc practice. Where a scoped `CLAUDE.md`
provides more detail, it elaborates — it must never contradict — these
principles.

- **Amendments** MUST be proposed via PR, describe the change and its rationale,
  and update any dependent templates and scoped guidance in the same change.
- **Versioning** follows semantic versioning of governance:
  - MAJOR — backward-incompatible removal or redefinition of a principle.
  - MINOR — a new principle or materially expanded mandatory guidance.
  - PATCH — clarifications, wording, and non-semantic refinements.
- **Compliance review**: PRs and code reviews MUST verify adherence. Any
  deviation MUST be justified in the PR description and, if accepted, captured
  as an amendment rather than left as undocumented precedent.
- Runtime development guidance lives in the root and scoped `CLAUDE.md` files;
  consult them for the concrete how-to behind each principle.

**Version**: 1.0.0 | **Ratified**: 2026-03-10 | **Last Amended**: 2026-06-17
