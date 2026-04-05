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

# CI check (type check + lint + tests — run before committing)
bun run check                # Full CI pipeline: server tsc + frontend tsc + lint + tests

# Linting
bun run lint                 # Run ESLint on frontend
cd frontend && bun run lint  # Same, from frontend dir

# Testing
bun test                     # Run all tests (no type check)
bun test server/             # Server tests only
bun test frontend/src/       # Frontend tests only
bun test --watch             # Watch mode

# Database (Drizzle ORM)
bun run db:generate          # Generate migrations
bun run db:push              # Push schema to DB
bun run db:studio            # Open Drizzle Studio

# Docker
docker compose up --build
```

## Testing Rules

**Every change must include tests.** New features need unit tests. Bug fixes need regression tests.

- Test files are colocated: `foo.ts` → `foo.test.ts` in the same directory
- Use `bun:test` (built-in test runner) — no external test frameworks
- DB tests use in-memory SQLite via `server/test-utils/setup.ts` (`setupTestDb()` / `teardownTestDb()`)
- Frontend tests use `@testing-library/react` with `happy-dom`
- External APIs (TMDB, OIDC, Discord) must be mocked — never make real HTTP calls in tests
- **Run `bun run check` before committing** — this runs the full CI pipeline locally (server type check, frontend type check, ESLint, and all tests). Do not use `bun test` alone as it skips type checking and linting.
- Frontend code must pass ESLint with zero errors and zero warnings.
- Avoid `any` types in source files — use `unknown` for catch blocks and proper types elsewhere. Test files are exempt from `no-explicit-any`.

## Architecture

**Remindarr** — a full-stack app for tracking streaming media releases using TMDB as the data source. Supports multi-user auth, notifications, episode tracking, and scheduled sync. Locale is configurable via env vars.

### Stack
- **Runtime**: Bun (with built-in SQLite)
- **Server**: Hono framework, TypeScript strict mode
- **Frontend**: React 19 + Vite + Tailwind CSS 4 + shadcn/ui + react-router
- **Database**: SQLite via Drizzle ORM (WAL mode, auto-created on startup)
- **Observability**: Sentry (optional), structured JSON logging

### Server (`server/`)
- `index.ts` — Entry point, Hono app setup, serves static frontend in production
- `config.ts` — All configuration from env vars with defaults
- `logger.ts` — Structured JSON logger (pino-style)
- `instrument.ts` — Sentry SDK initialization
- `tracing.ts` — DB query and HTTP client tracing helpers
- `types.ts` — Shared server types

#### Auth (`server/auth/`)
- `oidc.ts` — OIDC discovery, token exchange, user creation/sync

#### Database (`server/db/`)
- `schema.ts` — SQLite schema via Drizzle ORM (13 tables: titles, providers, offers, tracked, scores, episodes, watched_episodes, users, sessions, settings, notifiers, oidc_states, schema_version)
- `repository.ts` — Re-exports all repository modules
- `repository/` — Domain-specific query modules:
  - `users.ts` — User CRUD and lookup
  - `titles.ts` — Title upsert, search, filtering
  - `episodes.ts` — Episode queries and upserts
  - `offers.ts` — Watch provider offer management
  - `tracked.ts` — User watchlist management
  - `notifiers.ts` — Notification config CRUD
  - `settings.ts` — Key-value settings store (for OIDC config via admin UI)
  - Session management lives in `repository.ts`

#### TMDB Client (`server/tmdb/`)
- `client.ts` — TMDB API client (releases, search, watch providers, details, genres, people)
- `parser.ts` — Transforms TMDB API responses to internal types

#### IMDB (`server/imdb/`)
- `resolver.ts` — Resolves IMDB URLs/IDs via autocomplete API, matches to TMDB titles

#### Jobs (`server/jobs/`)
- `queue.ts` — In-memory job queue with SQLite persistence and retry logic
- `worker.ts` — Cron scheduler (standard 5-field cron), job execution loop
- `sync.ts` — Title and episode sync job handlers
- `notifications.ts` — Notification dispatch job with dynamic cron scheduling
- `migrate-titles.ts` — Data migration job handler

#### Middleware (`server/middleware/`)
- `auth.ts` — `optionalAuth` (sets user if session exists), `requireAuth` (401), `requireAdmin` (403)
- `rate-limit.ts` — Token bucket rate limiter (per-IP via x-forwarded-for)

#### Notifications (`server/notifications/`)
- `discord.ts` — Discord webhook sender
- `content.ts` — Notification content builder (formats titles, episodes, release info)
- `registry.ts` — Provider registry (currently Discord)
- `types.ts` — Notification provider interface

#### Routes (`server/routes/`)
One file per domain, each with colocated tests:
- `titles.ts` — Title listing with filters (daysBack, objectType, provider, genre, language)
- `search.ts` — TMDB search
- `browse.ts` — Category browsing (popular, upcoming, top_rated)
- `calendar.ts` — Monthly calendar view
- `details.ts` — Movie/show/season/episode/person details
- `track.ts` — Watchlist management
- `episodes.ts` — Upcoming episodes, episode sync trigger
- `watched.ts` — Episode watched status (single + bulk)
- `sync.ts` — Manual sync trigger
- `imdb.ts` — IMDB URL resolution
- `auth.ts` — Login, logout, current user, password change, OIDC flow
- `admin.ts` — OIDC settings management (admin only)
- `notifiers.ts` — Notification config CRUD + test
- `jobs.ts` — Job stats, manual trigger
- `health.ts` — Health check

### Frontend (`frontend/src/`)
- `api.ts` — API client functions matching all backend routes
- `types.ts` — Title/Offer/Provider types + `normalizeSearchTitle()` for unified rendering

#### Pages (`frontend/src/pages/`)
- `HomePage.tsx` — Browse + search landing
- `BrowsePage.tsx` — Category browsing (popular, upcoming, top rated)
- `CalendarPage.tsx` — Monthly calendar view
- `TrackedPage.tsx` — Watchlist
- `UpcomingPage.tsx` — Upcoming releases and episodes
- `TitleDetailPage.tsx` — Movie/show details with seasons/episodes
- `SeasonDetailPage.tsx` — Season details
- `EpisodeDetailPage.tsx` — Episode details
- `PersonPage.tsx` — Actor/crew details and filmography
- `ReelsPage.tsx` — Short-form discovery UI
- `LoginPage.tsx` — Local + OIDC login
- `ProfilePage.tsx` — User profile and settings

#### Components (`frontend/src/components/`)
- `TitleCard.tsx` / `TitleList.tsx` — Title display card and grid
- `FilterBar.tsx` — Filter controls (type, provider, genre, language)
- `SearchBar.tsx` — Search with IMDB URL auto-detection
- `TrackButton.tsx` — Watchlist toggle
- `NewReleases.tsx` — New releases section
- `CategoryBar.tsx` / `CategoryBrowse.tsx` — Category navigation and browsing
- `EpisodeComponents.tsx` — Episode list and details
- `PersonCard.tsx` — Actor/crew card
- `ReelsCard.tsx` / `ReelsSeasonPanel.tsx` — Reel discovery components
- `BottomTabBar.tsx` — Mobile navigation
- `MultiSelectDropdown.tsx` — Multi-select filter dropdown
- `ErrorBoundary.tsx` — Error fallback UI
- `RequireAuth.tsx` — Auth guard wrapper
- `loadFilters.ts` — Filter data loading utility
- `ui/` — shadcn/ui primitives (button, calendar, etc.)

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
- Rate limiting uses a token bucket algorithm keyed by IP
- Auth middleware is composable: `optionalAuth` → `requireAuth` → `requireAdmin`
- OIDC settings can come from env vars (take precedence) or DB (admin UI configurable)
- Jobs use an in-memory queue with cron scheduling; notification jobs dynamically reschedule based on user timezone preferences

### API Routes
- `GET /api/titles` — Recent titles with filters (daysBack, objectType, provider, genre, language)
- `GET /api/titles/providers` — Available streaming services
- `GET /api/titles/genres` — Available genres
- `GET /api/titles/languages` — Available languages
- `GET /api/search?q=` — Live search via TMDB
- `GET /api/browse` — Browse by category (popular, upcoming, top_rated) with filters
- `GET /api/calendar` — Monthly calendar view
- `GET /api/details/movie/:id` — Movie details
- `GET /api/details/show/:id` — Show details
- `GET /api/details/show/:id/season/:season` — Season details
- `GET /api/details/show/:id/season/:season/episode/:episode` — Episode details
- `GET /api/details/person/:personId` — Person details
- `POST /api/sync` — Trigger data sync from TMDB
- `GET/POST/DELETE /api/track/:id` — Watchlist management
- `GET /api/episodes/upcoming` — Upcoming and unwatched episodes
- `POST /api/episodes/sync` — Manual episode sync
- `POST/DELETE /api/watched/:episodeId` — Mark episode watched/unwatched
- `POST /api/watched/bulk` — Bulk mark episodes
- `POST /api/imdb` — Resolve IMDB URL, save to DB, auto-track
- `POST /api/auth/login` — Local login
- `POST /api/auth/logout` — Logout
- `GET /api/auth/me` — Current user
- `GET /api/auth/providers` — Available auth methods
- `POST /api/auth/change-password` — Change password
- `GET /api/auth/oidc/authorize` — OIDC authorization redirect
- `GET /api/auth/oidc/callback` — OIDC callback
- `GET/PUT /api/admin/settings` — OIDC settings (admin only)
- `GET/POST/PUT/DELETE /api/notifiers` — Notification config CRUD
- `POST /api/notifiers/:id/test` — Send test notification
- `GET /api/jobs` — Job stats, cron schedules, history
- `POST /api/jobs/:name` — Manually trigger a job
- `GET /api/health` — Health check
