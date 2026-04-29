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
- **Run `bun run check` before committing** — this runs the full CI pipeline locally (server type check, frontend type check, ESLint, and all tests). Do not use `bun test` alone as it skips type checking and linting.
- Frontend code must pass ESLint with zero errors and zero warnings.
- Avoid `any` types in source files — use `unknown` for catch blocks and proper types elsewhere. Test files are exempt from `no-explicit-any`.

## Architecture

**Remindarr** — a full-stack app for tracking streaming media releases using TMDB as the data source. Supports multi-user auth (local + OIDC + WebAuthn passkeys), Discord/Telegram/Gotify/Ntfy/Webhook/Web Push notifications, episode tracking, social features (follow, recommendations, ratings), a public `.ics` calendar feed, and scheduled TMDB sync. Deployable as a Bun server (Docker) or a Cloudflare Workers app backed by D1 + KV.

### Stack
- **Runtime**: Bun (server) or Cloudflare Workers
- **Server**: Hono framework, TypeScript strict mode
- **Frontend**: React 19 + Vite + Tailwind CSS 4 + shadcn/ui + react-router + Vite PWA
- **Database**: SQLite via Drizzle ORM (WAL mode when run under Bun; Cloudflare D1 on Workers)
- **Auth**: better-auth (username + admin + passkey + generic OAuth/OIDC plugins)
- **Cache**: in-memory, Redis, or Cloudflare KV
- **Observability**: Sentry (optional), Prometheus metrics at `/metrics`, structured JSON logging

### Server (`server/`)
- `index.ts` — Bun entry point, Hono app setup, serves static frontend in production
- `worker.ts` — Cloudflare Workers entry point; patches CONFIG from env bindings; excludes the Bun-only job worker
- `config.ts` — All configuration from env vars with defaults; `patchConfig()` for CF runtime
- `logger.ts` — Structured JSON logger (pino-style)
- `instrument.ts` — Sentry SDK initialization (Bun)
- `sentry.ts` — Shared Sentry exports
- `tracing.ts` — DB query and HTTP client tracing helpers
- `startup-validation.ts` — Fatal-if-missing env checks, startup summary log
- `graceful-shutdown.ts` — SIGTERM/SIGINT handler for worker/DB/cache teardown
- `types.ts` — Shared server types

#### Auth (`server/auth/`)
- `better-auth.ts` — better-auth instance factory with OIDC + passkey + admin plugins, trusted origins, passkey RP config

#### Platform (`server/platform/`)
- `bun.ts` — Bun platform impl (password hashing, DB handle)
- `cloudflare.ts` — CF platform impl
- `types.ts` — Platform interface

#### Database (`server/db/`)
- `schema.ts` — SQLite schema via Drizzle ORM. Current tables (30):
  - **Content**: `titles`, `providers`, `offers`, `scores`, `title_genres`, `episodes`, `streaming_alerts`
  - **Auth/user**: `users`, `sessions`, `account`, `verification`, `passkey`, `oidc_states`, `invitations`
  - **Tracking**: `tracked`, `watched_episodes`, `watched_titles`, `watch_history`, `title_tags`
  - **Ratings/social**: `ratings`, `episode_ratings`, `follows`, `recommendations`, `recommendation_reads`
  - **Config/ops**: `settings`, `notifiers`, `integrations`, `plex_library_items`, `jobs`, `cron_jobs`
- `bun-db.ts` — Bun sqlite initialization, migration runner
- `cloudflare-db.ts` — D1 adapter
- `migrate-auth.ts` — One-time better-auth data migration
- `repository.ts` — Re-exports all repository modules
- `repository/` — Domain-specific query modules (users, titles, episodes, offers, tracked, watched, notifiers, settings, ratings, recommendations, social, integrations, invitations, plex, stats, sessions)

#### TMDB Client (`server/tmdb/`)
- `client.ts` — TMDB API client (releases, search, watch providers, details, genres, people)
- `parser.ts` — Transforms TMDB API responses to internal types
- `sync.ts` + `sync-titles.ts` — Periodic release and episode sync

#### IMDB (`server/imdb/`)
- `resolver.ts` — Resolves IMDB URLs/IDs via autocomplete API, matches to TMDB titles

#### Plex (`server/plex/`)
- Library sync, account linking, metadata enrichment

#### Cache (`server/cache/`)
- `index.ts` — Factory: selects memory / redis / cloudflare-kv based on `CACHE_BACKEND`
- `memory.ts`, `redis.ts`, `cloudflare-kv.ts` — Backends
- `types.ts` — Cache interface

#### Streaming Availability (`server/streaming-availability/`)
- Deep-link enrichment via external API (optional)

#### Metrics (`server/metrics/`)
- Counters, histograms, gauges exposed at `/metrics` in Prometheus text format

#### Jobs (`server/jobs/`)
- `queue.ts` — In-memory job queue with SQLite persistence and exponential-backoff retry
- `worker.ts` — Polling loop + cron scheduler (5-field cron via `cron-parser`)
- `schedule.ts` — Cron-callback plumbing
- `sync.ts` — Title and episode sync job handlers
- `notifications.ts` — Notification dispatch with dynamic per-user scheduling
- `backup.ts` — DB backup job
- `migrate-titles.ts` — Data migration job handler

#### Middleware (`server/middleware/`)
- `auth.ts` — `optionalAuth` (sets user if session exists), `requireAuth` (401), `requireAdmin` (403)
- `rate-limit.ts` — Token bucket rate limiter (per-IP via `x-forwarded-for`)

#### Notifications (`server/notifications/`)
- `registry.ts` — Provider registry (Discord, Telegram, Gotify, Ntfy, Webhook, Web Push)
- `content.ts` — Notification content builder (titles, episodes, streaming alerts)
- `discord.ts`, `telegram.ts`, `gotify.ts`, `ntfy.ts`, `webhook.ts`, `webpush.ts` — Providers
- `vapid.ts` — VAPID key handling
- `types.ts` — Provider interface

#### Routes (`server/routes/`)
One file per domain, each with colocated tests:
- `titles.ts` — Title listing with filters (daysBack, objectType, provider, genre, language)
- `search.ts` — TMDB search (rate-limited)
- `browse.ts` — Category browsing (popular, upcoming, top_rated)
- `calendar.ts` — Monthly calendar view
- `details.ts` — Movie/show/season/episode/person details
- `track.ts` — Watchlist add/remove (requires auth)
- `episodes.ts` — Upcoming episodes, episode sync trigger
- `watched.ts` — Episode watched status (single + bulk)
- `sync.ts` — Manual sync trigger (admin only, rate-limited)
- `imdb.ts` — IMDB URL resolution
- `auth-custom.ts` — Custom auth endpoints (providers discovery); better-auth handles the rest at `/api/auth/*`
- `admin.ts` — OIDC settings + user management (admin only)
- `notifiers.ts` — Notification channel CRUD + test
- `integrations.ts` — External integration CRUD (Plex, etc.)
- `import.ts` — Watchlist CSV import
- `profile.ts` — User profile (public view)
- `social.ts` — Follow/unfollow, follower/following lists
- `ratings.ts` — Title and episode ratings (HATE/DISLIKE/LIKE/LOVE)
- `recommendations.ts` — Recommendation broadcast to followers
- `invitations.ts` — Signup invite codes
- `feed.ts` — Public `.ics` calendar feed (token-authenticated) + token management
- `stats.ts` — User statistics
- `user-settings.ts` — Per-user settings (homepage layout, etc.)
- `jobs.ts` / `jobs-cf.ts` — Job stats + manual trigger (Bun / CF variants)
- `metrics.ts` — Prometheus metrics
- `health.ts` — Health check

### Frontend (`frontend/src/`)
- `main.tsx` — Entry point with BrowserRouter + ErrorBoundary + AuthProvider
- `App.tsx` — Lazy-loaded route tree with RequireAuth guards
- `api.ts` — API client functions matching all backend routes (uses `fetchJson` helper with 401 CustomEvent)
- `types.ts` — Title/Offer/Provider types + `normalizeSearchTitle()` for unified rendering
- `i18n.ts` + `locales/` — i18next setup (currently English-only scaffolding)
- `instrument.ts` — Sentry frontend init
- `sw.ts` — Service worker (Workbox strategies + BackgroundSync + push handler)

#### Pages (`frontend/src/pages/`)
- `HomePage.tsx` — Browse + search landing with customizable layout
- `BrowsePage.tsx` — Category browsing + filters
- `CalendarPage.tsx` — Monthly episode calendar grid
- `DiscoveryPage.tsx` — Personalized discovery feed
- `TrackedPage.tsx` — Watchlist + stats view
- `UpcomingPage.tsx` — Upcoming releases (legacy; redirects to `/calendar`)
- `StatsPage.tsx` — User statistics
- `ReelsPage.tsx` — Swipeable short-form discovery
- `TitleDetailPage.tsx` / `SeasonDetailPage.tsx` / `EpisodeDetailPage.tsx` — Content detail pages
- `PersonPage.tsx` — Actor/crew details and filmography
- `UserProfilePage.tsx` — Public user profile
- `ProfilePage.tsx` — Current user (redirects to UserProfilePage)
- `SettingsPage.tsx` — Notifiers, integrations, password, invitations, layout
- `InvitePage.tsx` — Create/manage invitations
- `LoginPage.tsx` — Local + passkey + OIDC login
- `SignupPage.tsx` — Local signup
- `MorePage.tsx` — Mobile-only menu overlay
- `AdminUsersPage.tsx` — Admin user management
- `NotFoundPage.tsx` — 404 fallback

#### Components (`frontend/src/components/`)
Inventory is large (~45 components). Broad groups:
- **Title display**: `TitleCard`, `TitleList`, `NewReleases`, `FullBleedCarousel`, `HeroBanner`, `ScrollableRow`, `CategoryBar`, `CategoryBrowse`, `AgendaCalendar`
- **Filters/search**: `FilterBar`, `MultiSelectDropdown`, `SearchBar`, `UserSearchDropdown`
- **Actions**: `TrackButton`, `WatchButton`, `WatchButtonGroup`, `WatchedToggleButton`, `RatingButtons`, `EpisodeRatingButtons`, `FollowButton`, `RecommendButton`, `ShareButton`, `VisibilityButton`, `StatusPicker`, `TagList`, `NotificationModePicker`
- **Episode/reels**: `EpisodeComponents`, `EpisodeShowCard`, `ReelsCard`, `ReelsSeasonPanel`, `ReelsUndoBar`
- **Navigation/shell**: `BottomTabBar`, `RequireAuth`, `ErrorBoundary`, `ScrollToTop`, `SkeletonComponents`, `OfflineIndicator`, `InstallPrompt`, `NotificationPrompt`, `KeyboardShortcutsModal`, `ThemePicker`
- **People**: `PersonCard`, `ExternalLinks`, `ProfileBanner`
- **Utilities**: `loadFilters.ts`, `useDominantColor.ts`
- **Design system**: `design/Chip`, `design/Kicker`, `design/PageHeader`, `design/Pill`
- **shadcn/ui primitives** (`ui/`): `alert-dialog`, `button`, `calendar`, `skeleton`, `tabs`

#### Context / Hooks / Lib
- `context/AuthContext.tsx` — Session state, providers, login/signup/logout; listens for `"auth:unauthorized"` CustomEvent
- `hooks/` — `useApiCall`, `useGridNavigation`, `useInstallPrompt`, `useIsMobile`, `useKeyboardShortcut`, `usePushSubscriptionSync`, `useScrollRestoration`, `useTheme`
- `lib/` — `auth-client` (better-auth browser client), `push` (Web Push subscription), `groupShows`, `base64`, `utils`

### Logging
- All server-side code MUST use the structured logger from `server/logger.ts` — never use `console.log/warn/error` directly
- Create module-scoped child loggers: `const log = logger.child({ module: "my-module" })`
- Log level is configurable via `LOG_LEVEL` env var (debug, info, warn, error), defaults to "info"
- Pass contextual data as the second argument: `log.info("message", { key: value })`
- Frontend code may continue using `console.error`

### Migration Safety Rules (Cloudflare D1)

**NEVER recreate a FK-parent table via DROP TABLE on D1.** `PRAGMA foreign_keys=OFF` does not persist across `--> statement-breakpoint` boundaries on D1 — each statement runs in a separate connection context. If a migration drops a parent table (`users`, `titles`, `providers`) while child tables have `ON DELETE CASCADE` FKs, the cascade fires unconditionally and wipes all child rows.

**Safe pattern for adding columns:** use `ALTER TABLE <table> ADD COLUMN <col> <type> DEFAULT <val>` instead of the table-recreate pattern (create new, insert from old, drop old, rename new). `ADD COLUMN` works for any `NOT NULL DEFAULT` column on SQLite/D1 and avoids the cascade risk entirely.

The table-recreate pattern (with `PRAGMA foreign_keys=OFF`) is only safe for **child tables** (tables that reference a parent but have no FK children themselves). Examples of safe recreates: `tracked`, `watched_titles`, `watch_history`, `streaming_alerts`, `ratings`, `recommendations`.

`server/db/migrations.test.ts` enforces this: it runs every migration with `foreign_keys=ON` throughout and asserts that `account`, `sessions`, and `passkey` rows seeded early survive all migrations. This test would have caught the 2026-04-29 production data-loss incident caused by migration 0037.

### Key Patterns
- DB titles use snake_case, TMDB API search results use camelCase — `normalizeSearchTitle()` bridges the gap
- Offers are deduplicated by provider ID with priority: FLATRATE > FREE > ADS
- The SearchBar auto-detects IMDB URLs/IDs and routes to a separate resolution flow
- All DB writes use transactions for consistency
- Rate limiting uses a token bucket algorithm keyed by `x-forwarded-for` — deployments MUST terminate at a proxy that sets this header
- Auth middleware is composable: `optionalAuth` → `requireAuth` → `requireAdmin`
- OIDC settings have env-var precedence over DB (admin UI editable)
- Jobs use an in-memory queue with cron scheduling on Bun. Cloudflare uses Durable Object alarms (`@cloudflare/actors/alarms`) for per-job scheduling; a single daily Worker cron acts as the bootstrap/recovery tick that arms DOs and runs stale-job recovery
- Notification jobs dynamically reschedule based on user timezone preferences
- Recommendations are 1-to-N broadcast (to followers), not 1-to-1
- New notification providers must guard on `streamingAlerts.length` before rendering streaming-alert content
- The Bun route wiring in `server/index.ts` and the CF route wiring in `server/worker.ts` must stay in sync

### Route validation
- Use zod + `zValidator` from `server/lib/validator.ts` for request shape validation at the route boundary.
- Schemas are defined at the top of the route file (or a sibling `*-schemas.ts` for large surfaces) and applied as middleware: `app.post("/", zValidator("json", schema), handler)`.
- Validation failures return HTTP 400 with `{ error: "Validation failed", issues: ZodIssue[] }`. Successful requests are not changed.
- Supported targets: `"json"`, `"query"`, `"param"`, `"form"`, `"header"`, `"cookie"`. For multipart `File` uploads, parse `FormData` manually and feed into `schema.safeParse(...)` (see `server/routes/import.ts`) — `instanceof File` is unreliable in the Bun test env, duck-type the upload instead.
- Provider- or business-level validation (e.g. notifier `validateConfig`, timezone semantics, uniqueness) runs AFTER zod inside the handler. Zod only validates shape/types.
- Tests for every migrated route should include a `describe("validation", ...)` block asserting `res.status === 400` and that the response body exposes an `issues` array.
- **Happy-path requirement**: also include at least one test that sends the smallest realistic body the frontend actually sends and asserts `res.status === 200`. This prevents schema regressions (e.g. zod 3→4 semantic changes) from slipping past a rejection-only test suite. If the frontend can omit any optional field, the happy-path test must exercise that minimal shape. (Background: #577 / #578 — a silent HTTP 400 regression ran in prod undetected because only rejection cases were tested.)

### API Routes
Grouped by middleware. All routes are under `/api` except `/metrics`.

**Public (no auth)**
- `GET /api/health` — Health check
- `GET /metrics` — Prometheus metrics (optionally bearer-guarded via `METRICS_TOKEN`)
- `POST|GET /api/auth/*` — better-auth handler (login, signup, session, passkey, OIDC callback)
- `GET /api/auth/custom/providers` — Available auth methods
- `GET /api/feed/calendar.ics?token=<user-feed-token>` — Public ICS calendar feed

**Optional auth (`is_tracked` depends on session)**
- `GET /api/titles` — Recent titles with filters
- `GET /api/titles/{providers,genres,languages}` — Filter catalogs
- `GET /api/search?q=` — TMDB search (rate-limited: 30/min)
- `GET /api/browse` — Category browsing
- `GET /api/calendar` — Monthly calendar
- `GET /api/user/:username` — Public user profile
- `GET /api/social/{followers,following}/:id` — Follower lists
- `GET /api/ratings/*` — Ratings read endpoints (write checks auth internally)
- `GET /api/details/{movie,show,person}/...` — Detail pages
- `GET /api/episodes/upcoming` — Upcoming episodes

**Requires auth**
- `GET/POST/DELETE /api/track/:id` — Watchlist
- `POST/DELETE /api/watched/:episodeId`, `POST /api/watched/bulk` — Watched status
- `POST /api/imdb` — IMDB URL resolve + auto-track
- `GET/POST/PUT/DELETE /api/notifiers` + `POST /api/notifiers/:id/test`
- `GET/POST/PUT/DELETE /api/integrations`
- `POST /api/import` — CSV watchlist import
- `GET /api/stats` — User statistics
- `GET/PUT /api/user/settings` — Per-user settings
- `POST/DELETE /api/social/follow` — Follow/unfollow
- `POST/DELETE /api/ratings` — Rate a title/episode
- `GET/POST /api/recommendations` — Recommendations
- `GET/POST/DELETE /api/invitations` — Invite codes
- `GET/POST/DELETE /api/feed/token` — Feed token management
- `POST /api/episodes/sync` — Manual episode sync

**Admin only**
- `GET/PUT /api/admin/settings` — OIDC settings
- `GET/PATCH /api/admin/users` — User admin
- `GET /api/jobs`, `POST /api/jobs/:name` — Job stats + manual trigger
- `POST /api/sync` — Manual TMDB sync (rate-limited: 5/min)
