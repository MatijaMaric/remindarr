# Remindarr

A full-stack app for tracking streaming media releases using TMDB as the data source. Browse, search, and get notified when movies and TV shows land on your streaming services.

## Features

- **Browse & Discover** — Popular, upcoming, and top-rated titles with genre/provider/language filters
- **Search** — Live search via TMDB, with IMDB URL auto-detection and resolution
- **Watchlist** — Track titles and get per-episode watched status for TV shows
- **Calendar** — Monthly calendar view of releases and upcoming episodes
- **Notifications** — Discord webhook notifications with configurable schedules and timezone support
- **Authentication** — Local password auth and OpenID Connect (OIDC) with admin roles
- **Scheduled Sync** — Automatic title and episode syncing via cron jobs
- **PWA** — Installable as a progressive web app

## Stack

- **Runtime**: [Bun](https://bun.sh) (with built-in SQLite)
- **Server**: [Hono](https://hono.dev) framework, TypeScript strict mode
- **Frontend**: React 19 + Vite + Tailwind CSS 4 + shadcn/ui components
- **Database**: SQLite via Drizzle ORM (WAL mode, auto-created on startup)
- **Observability**: Sentry (optional), structured JSON logging
- **Deployment**: Docker

## Getting Started

### Prerequisites

- [Bun](https://bun.sh) v1.0+

### Install

```bash
bun install
cd frontend && bun install
```

### Development

```bash
# Start both server and frontend concurrently
bun run dev

# Or start them separately:
bun run dev:server      # API server with hot reload (port 3000)
bun run dev:frontend    # Vite dev server (port 5173, proxies /api to :3000)
```

### Production

```bash
bun run build    # Build frontend
bun run start    # Start production server on port 3000
```

### Docker

**Option 1: Build locally**

```bash
docker compose up --build
```

**Option 2: Use published image**

```bash
docker compose up
```

This uses the image from [GitHub Container Registry](https://github.com/MatijaMaric/jwsync/pkgs/container/jwsync).

The app is available at `http://localhost:3000`. Data is persisted in a Docker volume.

### Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `TMDB_API_KEY` | *(required)* | Your TMDB API key |
| `TMDB_COUNTRY` | `HR` | Primary country code (`US`, `DE`, `GB`, etc.) |
| `TMDB_LANGUAGE` | `en` | Language for TMDB results (`hr`, `de`, etc.) |
| `TMDB_FALLBACK_COUNTRIES` | *(empty)* | Comma-separated fallback country codes |
| `TMDB_API_TIMEOUT_MS` | `15000` | TMDB API request timeout in ms |
| `PORT` | `3000` | Server port |
| `DB_PATH` | `./remindarr.db` | SQLite database file path |
| `LOG_LEVEL` | `info` | Log level: `debug`, `info`, `warn`, `error` |
| `SYNC_TITLES_CRON` | `0 3 * * *` | Cron expression for title sync |
| `SYNC_EPISODES_CRON` | `30 3 * * *` | Cron expression for episode sync |
| `CORS_ORIGIN` | *(empty)* | Comma-separated allowed CORS origins |
| `SENTRY_DSN` | *(empty)* | Sentry DSN for error tracking |

#### Authentication

| Variable | Default | Description |
|----------|---------|-------------|
| `SESSION_DURATION_HOURS` | `168` (7 days) | Auth session duration |
| `OIDC_ISSUER_URL` | *(empty)* | OIDC provider issuer URL |
| `OIDC_CLIENT_ID` | *(empty)* | OIDC client ID |
| `OIDC_CLIENT_SECRET` | *(empty)* | OIDC client secret |
| `OIDC_REDIRECT_URI` | *(empty)* | OIDC callback URL |
| `OIDC_ADMIN_CLAIM` | *(empty)* | OIDC claim used to determine admin role |
| `OIDC_ADMIN_VALUE` | *(empty)* | Expected value of the admin claim |

OIDC settings can also be configured at runtime via the admin settings API.

## Syncing Data

```bash
bun run sync                                   # Default sync
bun run server/cli/sync.ts [daysBack] [type]   # Custom: days back, object type
```

Sync also runs automatically via cron jobs (configurable via `SYNC_TITLES_CRON` and `SYNC_EPISODES_CRON`).

## Project Structure

```
server/
  index.ts              # Hono app entry point
  config.ts             # All configuration (env vars, defaults)
  logger.ts             # Structured JSON logger
  instrument.ts         # Sentry instrumentation
  tracing.ts            # DB & HTTP tracing helpers
  types.ts              # Shared server types
  auth/
    oidc.ts             # OIDC discovery, token exchange, user sync
  db/
    schema.ts           # SQLite schema (Drizzle ORM)
    repository.ts       # Re-exports from repository/
    repository/         # Database queries by domain
      users.ts          # User CRUD
      sessions.ts       # Session management (in repository.ts)
      titles.ts         # Title queries & upserts
      episodes.ts       # Episode queries
      offers.ts         # Watch provider offers
      tracked.ts        # User watchlist
      notifiers.ts      # Notification configs
      settings.ts       # Key-value settings store
  tmdb/
    client.ts           # TMDB API client (releases, search, providers, details)
    parser.ts           # API response → internal types
  imdb/
    resolver.ts         # IMDB URL/ID resolution via autocomplete API
  jobs/
    queue.ts            # In-memory job queue with persistence
    worker.ts           # Cron scheduler & job execution
    sync.ts             # Title & episode sync job handlers
    notifications.ts    # Notification dispatch job
    migrate-titles.ts   # Data migration job
  middleware/
    auth.ts             # optionalAuth, requireAuth, requireAdmin
    rate-limit.ts       # Token bucket rate limiter
  notifications/
    discord.ts          # Discord webhook sender
    content.ts          # Notification content builder
    registry.ts         # Provider registry
    types.ts            # Notification types
  routes/               # API route handlers (one file per domain)
  cli/
    sync.ts             # CLI sync script

frontend/src/
  api.ts                # API client functions
  types.ts              # Shared types + normalizeSearchTitle()
  pages/
    HomePage.tsx        # Browse + search landing
    BrowsePage.tsx      # Category browsing (popular, upcoming, top rated)
    CalendarPage.tsx    # Monthly calendar view
    TrackedPage.tsx     # Watchlist
    UpcomingPage.tsx    # Upcoming releases
    TitleDetailPage.tsx # Movie/show details
    SeasonDetailPage.tsx # Season details
    EpisodeDetailPage.tsx # Episode details
    PersonPage.tsx      # Actor/crew details
    ReelsPage.tsx       # Short-form discovery
    LoginPage.tsx       # Local + OIDC login
    ProfilePage.tsx     # User profile/settings
  components/
    TitleCard.tsx       # Title display card
    TitleList.tsx       # Title grid/list
    FilterBar.tsx       # Filter controls
    SearchBar.tsx       # Search with IMDB detection
    TrackButton.tsx     # Watchlist toggle
    NewReleases.tsx     # New releases section
    CategoryBar.tsx     # Category selector
    CategoryBrowse.tsx  # Category browsing grid
    EpisodeComponents.tsx # Episode list/details
    PersonCard.tsx      # Actor/crew card
    ReelsCard.tsx       # Reel item card
    ReelsSeasonPanel.tsx # Season panel for reels
    BottomTabBar.tsx    # Mobile navigation
    MultiSelectDropdown.tsx # Multi-select filter
    ErrorBoundary.tsx   # Error fallback UI
    RequireAuth.tsx     # Auth guard wrapper
    ui/                 # shadcn/ui primitives
```

## API

### Titles & Discovery

| Method | Route | Description |
|--------|-------|-------------|
| `GET` | `/api/titles` | Recent titles (filters: `daysBack`, `objectType`, `provider`) |
| `GET` | `/api/titles/providers` | Available streaming providers |
| `GET` | `/api/titles/genres` | Available genres |
| `GET` | `/api/titles/languages` | Available languages |
| `GET` | `/api/search?q=` | Live search via TMDB |
| `GET` | `/api/browse` | Browse by category (`popular`, `upcoming`, `top_rated`) |
| `GET` | `/api/calendar` | Calendar view by month |
| `POST` | `/api/imdb` | Resolve IMDB URL, save & auto-track |

### Details

| Method | Route | Description |
|--------|-------|-------------|
| `GET` | `/api/details/movie/:id` | Movie details |
| `GET` | `/api/details/show/:id` | Show details |
| `GET` | `/api/details/show/:id/season/:season` | Season details |
| `GET` | `/api/details/show/:id/season/:season/episode/:episode` | Episode details |
| `GET` | `/api/details/person/:personId` | Person details |

### Tracking & Episodes

| Method | Route | Description |
|--------|-------|-------------|
| `GET/POST/DELETE` | `/api/track/:id` | Watchlist management |
| `GET` | `/api/episodes/upcoming` | Upcoming & unwatched episodes |
| `POST` | `/api/episodes/sync` | Manual episode sync |
| `POST/DELETE` | `/api/watched/:episodeId` | Mark episode watched/unwatched |
| `POST` | `/api/watched/bulk` | Bulk mark episodes |

### Auth

| Method | Route | Description |
|--------|-------|-------------|
| `POST` | `/api/auth/login` | Local password login |
| `POST` | `/api/auth/logout` | Logout |
| `GET` | `/api/auth/me` | Current user info |
| `GET` | `/api/auth/providers` | Available auth providers |
| `POST` | `/api/auth/change-password` | Change password |
| `GET` | `/api/auth/oidc/authorize` | OIDC authorization redirect |
| `GET` | `/api/auth/oidc/callback` | OIDC callback |

### Admin & System

| Method | Route | Description |
|--------|-------|-------------|
| `GET/PUT` | `/api/admin/settings` | OIDC settings management |
| `POST` | `/api/sync` | Trigger data sync |
| `GET` | `/api/jobs` | Job stats, schedules, history |
| `POST` | `/api/jobs/:name` | Manually trigger a job |
| `GET/POST/PUT/DELETE` | `/api/notifiers` | Notification config CRUD |
| `POST` | `/api/notifiers/:id/test` | Send test notification |
| `GET` | `/api/health` | Health check |

## Testing

```bash
bun test                     # Run all tests
bun test server/             # Server tests only
bun test frontend/src/       # Frontend tests only
bun test --watch             # Watch mode
bun run check                # Full CI: type check + tests
```
