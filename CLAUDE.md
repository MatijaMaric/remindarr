# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Development Commands

```bash
# Install dependencies (run from root AND frontend/)
bun install
cd frontend && bun install

# Development
bun run dev              # Server with hot reload (port 3000)
bun run dev:frontend     # Vite dev server (port 5173, proxies /api to :3000)

# Production build
bun run build            # Builds frontend to frontend/dist/
bun run start            # Runs production server

# Sync data from TMDB
bun run sync                              # Default sync
bun run server/cli/sync.ts [daysBack] [type]  # CLI with args

# CI check (type check + tests — run before committing)
bun run check                # Full CI pipeline: server tsc + frontend tsc + tests

# Testing
bun test                     # Run all tests (no type check)
bun test server/             # Server tests only
bun test frontend/src/       # Frontend tests only
bun test --watch             # Watch mode

# Docker
docker compose up --build
```

## Testing Rules

**Every change must include tests.** New features need unit tests. Bug fixes need regression tests.

- Test files are colocated: `foo.ts` → `foo.test.ts` in the same directory
- Use `bun:test` (built-in test runner) — no external test frameworks
- DB tests use in-memory SQLite via `server/test-utils/setup.ts` (`setupTestDb()` / `teardownTestDb()`)
- External APIs (TMDB, OIDC) must be mocked — never make real HTTP calls in tests
- **Run `bun run check` before committing** — this runs the full CI pipeline locally (server type check, frontend type check, and all tests). Do not use `bun test` alone as it skips type checking.

## Architecture

**Remindarr** — a full-stack app for tracking streaming media releases using TMDB as the data source. Locale is configurable via env vars.

### Stack
- **Runtime**: Bun (with built-in SQLite)
- **Server**: Hono framework, TypeScript strict mode
- **Frontend**: React 19 + Vite + Tailwind CSS 4 (no component library)
- **Database**: SQLite (WAL mode, auto-created on startup)

### Server (`server/`)
- `index.ts` — Entry point, Hono app setup, serves static frontend in production
- `config.ts` — TMDB API config, DB path, image URLs, pagination settings
- `db/schema.ts` — SQLite schema (5 tables: titles, providers, offers, tracked, scores)
- `db/repository.ts` — All database queries (upsert, search, track/untrack, filters)
- `tmdb/client.ts` — TMDB API client (releases + search + watch providers)
- `tmdb/parser.ts` — Transforms TMDB API responses to internal types
- `imdb/resolver.ts` — Resolves IMDB URLs/IDs via autocomplete API, matches to TMDB titles
- `routes/` — API endpoints: sync, titles, search, track, imdb

### Frontend (`frontend/src/`)
- `api.ts` — API client functions matching all backend routes
- `types.ts` — Title/Offer/Provider types + `normalizeSearchTitle()` for unified rendering
- `pages/` — HomePage (browse + search) and TrackedPage (watchlist)
- `components/` — TitleCard, TitleList, FilterBar, SearchBar, TrackButton, NewReleases

### Logging
- All server-side code MUST use the structured logger from `server/logger.ts` — never use `console.log/warn/error` directly
- Create module-scoped child loggers: `const log = logger.child({ module: "my-module" })`
- Log level is configurable via `LOG_LEVEL` env var (debug, info, warn, error), defaults to "info"
- Pass contextual data as the second argument: `log.info("message", { key: value })`
- Frontend code may continue using `console.error`

### Key Patterns
- DB titles use snake_case, TMDB API search results use camelCase — `normalizeSearchTitle()` bridges the gap
- Offers are deduplicated by provider ID with priority: FLATRATE > FREE > ADS
- The SearchBar auto-detects IMDB URLs/IDs and routes to a separate resolution flow
- All DB writes use transactions for consistency

### API Routes
- `GET /api/titles` — Recent titles with filters (daysBack, objectType, provider)
- `GET /api/titles/providers` — Available streaming services
- `GET /api/search?q=` — Live search via TMDB
- `POST /api/sync` — Trigger data sync from TMDB
- `GET/POST/DELETE /api/track/:id` — Watchlist management
- `POST /api/imdb` — Resolve IMDB URL, save to DB, auto-track
