# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Development Commands

```bash
# Install dependencies (run from root AND frontend/)
bun install
cd frontend && bun install

# Development
bun run dev              # Both server + frontend concurrently
bun run dev:server       # Server with hot reload (port 3000)
bun run dev:frontend     # Vite dev server (port 5173, proxies /api to :3000)

# Production build
bun run build            # Builds frontend to frontend/dist/
bun run start            # Runs production server

# Sync data from TMDB
bun run sync                              # Default sync
bun run server/cli/sync.ts [daysBack] [type]  # CLI with args

# Full CI pipeline check (run before opening a PR)
bun run check                # All type checks + lint + all tests + build + wrangler dry-run
bun run check:fast           # Type checks + lint only (fast; same as pre-push hook)

# Linting
bun run lint                 # Run ESLint on frontend
cd frontend && bun run lint  # Same, from frontend dir

# Testing
bun test                     # Run all tests (no type check)
bun test server/             # Server tests only
bun test frontend/src/       # Frontend tests only
bun test --watch             # Watch mode
bun run test:e2e             # Playwright e2e suite

# Database (Drizzle ORM)
bun run db:generate          # Generate migrations
bun run db:push              # Push schema to local DB (dev only)
bun run db:migrate:cf        # Apply migrations to Cloudflare D1 (prod)
bun run db:studio            # Open Drizzle Studio

# Docker
docker compose up --build

# Cloudflare Workers
bun run deploy:cf            # Deploy to Cloudflare
```

## Branch naming

- Claude-authored branches: `claude/NNN-short-description` where NNN is the issue number (e.g. `claude/524-pinned-favorites`)
- Human-authored branches use `feat/`, `fix/`, or `refactor/` prefixes (e.g. `fix/498-semantic-button-chips`)
- Never create branches without a prefix — bare names like `pinned-favorites` or `notification-log` are non-standard

## Testing Rules

**Every change must include tests.** New features need unit tests. Bug fixes need regression tests.

- Test files are colocated: `foo.ts` → `foo.test.ts` in the same directory
- Use `bun:test` (built-in test runner) — no external test frameworks
- DB tests use in-memory SQLite via `server/test-utils/setup.ts` (`setupTestDb()` / `teardownTestDb()`)
- Frontend tests use `@testing-library/react` with `happy-dom`
- External APIs (TMDB, OIDC, Discord) must be mocked — never make real HTTP calls in tests
- **Run `bun run check` before opening a PR** — this runs the full CI pipeline locally (all type checks, lint, all tests, frontend build, wrangler dry-run). Do not use `bun test` alone as it skips type checking and linting.
- Frontend code must pass ESLint with zero errors and zero warnings.
- Avoid `any` types in source files — use `unknown` for catch blocks and proper types elsewhere. Test files are exempt from `no-explicit-any`.

## Git hooks

The `pre-push` hook (via lefthook) runs two checks **in parallel** on every `git push`:

- **`bun run check:fast`** — server tsc + e2e tsc + frontend tsc + ESLint (fast; seconds)
- **`bun run test:changed`** — only test files colocated with files changed vs `origin/master`

CI (`test.yml`) runs the full suite on every push and PR to `master`. The hook is a fast local filter; CI is the backstop for anything the heuristic misses.

To bypass: `git push --no-verify`

## Architecture

**Remindarr** — a full-stack app for tracking streaming media releases. Deployable as a Bun server (Docker) or a Cloudflare Workers app backed by D1 + KV.

**Stack**: Bun/CF Workers · Hono · TypeScript strict · React 19 + Vite + Tailwind 4 + shadcn/ui · Drizzle ORM (SQLite/D1) · better-auth · Sentry

**Scoped guidance** (Claude Code auto-loads these when working in each directory):

- `server/CLAUDE.md` — server architecture, entry points, logging, jobs, middleware
- `server/db/CLAUDE.md` — schema, migration safety rules (CF D1), repository pattern
- `server/routes/CLAUDE.md` — route validation (zod/zValidator), API route catalog
- `server/notifications/CLAUDE.md` — provider pattern, streamingAlerts guard, test requirements
- `frontend/CLAUDE.md` — React stack, pages, components, API client patterns
- `e2e/CLAUDE.md` — Playwright config, fixtures, spec status
