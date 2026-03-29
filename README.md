# Remindarr

A full-stack app for tracking streaming media releases using TMDB as the data source. Browse, search, and get notified when movies and TV shows land on your streaming services.

## Features

- **Browse & Discover** — Popular, upcoming, and top-rated titles with genre/provider/language filters
- **Search** — Live search via TMDB, with IMDB URL auto-detection and resolution
- **Watchlist** — Track titles and get per-episode watched status for TV shows
- **Calendar** — Monthly calendar view of releases and upcoming episodes
- **Notifications** — Discord webhook and Web Push notifications with configurable schedules and timezone support
- **Authentication** — Local password auth, OpenID Connect (OIDC), and WebAuthn/Passkeys with admin roles
- **Social** — Follow other users, send and receive title recommendations, and rate titles (hate/dislike/like/love)
- **Invitations** — Invite-code system for controlling new user registration
- **Scheduled Sync** — Automatic title and episode syncing via cron jobs
- **Database Backups** — Automated SQLite backups with configurable retention
- **Caching** — Multi-backend caching (memory, Redis, Cloudflare KV) for TMDB responses
- **PWA** — Installable as a progressive web app

## Stack

- **Runtime**: [Bun](https://bun.sh) (with built-in SQLite)
- **Server**: [Hono](https://hono.dev) framework, TypeScript strict mode
- **Auth**: [better-auth](https://www.better-auth.com) with OIDC, passkey, and username plugins
- **Frontend**: React 19 + Vite + Tailwind CSS 4 + shadcn/ui components
- **Database**: SQLite via Drizzle ORM (WAL mode, auto-created on startup)
- **Observability**: Sentry (optional), structured JSON logging

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

This uses the image from [GitHub Container Registry](https://github.com/MatijaMaric/remindarr/pkgs/container/remindarr).

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
| `BASE_URL` | *(empty)* | Base URL of the app (required for auth callbacks) |
| `BETTER_AUTH_SECRET` | *(empty)* | Secret used to sign sessions |
| `OIDC_ISSUER_URL` | *(empty)* | OIDC provider issuer URL |
| `OIDC_CLIENT_ID` | *(empty)* | OIDC client ID |
| `OIDC_CLIENT_SECRET` | *(empty)* | OIDC client secret |
| `OIDC_REDIRECT_URI` | *(empty)* | OIDC callback URL |
| `OIDC_ADMIN_CLAIM` | *(empty)* | OIDC claim used to determine admin role |
| `OIDC_ADMIN_VALUE` | *(empty)* | Expected value of the admin claim |
| `PASSKEY_RP_ID` | *(empty)* | WebAuthn Relying Party ID (e.g. `example.com`) |
| `PASSKEY_RP_NAME` | *(empty)* | WebAuthn Relying Party display name |
| `PASSKEY_ORIGIN` | *(empty)* | WebAuthn origin (must match deployment URL) |

OIDC settings can also be configured at runtime via the admin settings API.

#### Web Push Notifications

| Variable | Default | Description |
|----------|---------|-------------|
| `VAPID_PUBLIC_KEY` | *(empty)* | VAPID public key for Web Push |
| `VAPID_PRIVATE_KEY` | *(empty)* | VAPID private key for Web Push |
| `VAPID_SUBJECT` | *(empty)* | VAPID subject (e.g. `mailto:admin@example.com`) |

#### Database Backups

| Variable | Default | Description |
|----------|---------|-------------|
| `BACKUP_DIR` | *(empty)* | Directory to store backups (disabled if empty) |
| `BACKUP_CRON` | `0 2 * * *` | Cron expression for backup schedule |
| `BACKUP_RETAIN` | `7` | Number of backups to retain |

#### Deep Links (Streaming Availability API)

| Variable | Default | Description |
|----------|---------|-------------|
| `STREAMING_AVAILABILITY_API_KEY` | *(empty)* | RapidAPI key for Streaming Availability API (enables deep links) |
| `SYNC_DEEP_LINKS_CRON` | `0 4 * * *` | Cron expression for deep link sync |
| `SA_DAILY_BUDGET` | `95` | Max API requests per day for deep link enrichment |

#### Caching

| Variable | Default | Description |
|----------|---------|-------------|
| `CACHE_BACKEND` | `memory` | Cache backend: `memory`, `redis`, or `kv` |
| `REDIS_URL` | *(empty)* | Redis connection URL (when using redis backend) |
| `CACHE_MAX_MEMORY_ENTRIES` | `1000` | Max entries in memory cache |
| `CACHE_TTL_GENRES` | `86400` | Genre cache TTL in seconds |
| `CACHE_TTL_PROVIDERS` | `86400` | Provider cache TTL in seconds |
| `CACHE_TTL_LANGUAGES` | `86400` | Language cache TTL in seconds |
| `CACHE_TTL_SEARCH` | `300` | Search result cache TTL in seconds |
| `CACHE_TTL_DETAILS` | `3600` | Details cache TTL in seconds |
| `CACHE_TTL_BROWSE` | `900` | Browse cache TTL in seconds |

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
    better-auth.ts      # better-auth setup (OIDC, passkeys, username, admin)
  db/
    schema.ts           # SQLite schema (Drizzle ORM)
    repository.ts       # Re-exports from repository/
    repository/         # Database queries by domain
      users.ts          # User CRUD
      titles.ts         # Title queries & upserts
      episodes.ts       # Episode queries
      offers.ts         # Watch provider offers
      tracked.ts        # User watchlist
      notifiers.ts      # Notification configs
      settings.ts       # Key-value settings store
  tmdb/
    client.ts           # TMDB API client (releases, search, providers, details)
    parser.ts           # API response → internal types
    sync.ts             # TMDB sync orchestration
    sync-titles.ts      # Title-specific sync logic
    types.ts            # TMDB API type definitions
  imdb/
    resolver.ts         # IMDB URL/ID resolution via autocomplete API
  cache/
    index.ts            # Cache factory (memory / redis / kv)
    types.ts            # Cache interface types
    memory.ts           # In-memory cache
    redis.ts            # Redis cache
    cloudflare-kv.ts    # Cloudflare Workers KV cache
  jobs/
    queue.ts            # In-memory job queue with persistence
    processor.ts        # Portable job execution logic (Drizzle-based)
    schedule.ts         # Notification cron scheduling with timezone support
    worker.ts           # Job worker loop
    sync.ts             # Title & episode sync job handlers
    notifications.ts    # Notification dispatch job
    backup.ts           # Database backup job
    migrate-titles.ts   # Title data migration job
    migrate-backdrops.ts # Backdrop data migration job
    migrate-offers.ts   # Offers data migration job
  middleware/
    auth.ts             # optionalAuth, requireAuth, requireAdmin
    rate-limit.ts       # Token bucket rate limiter
  notifications/
    discord.ts          # Discord webhook sender
    webpush.ts          # Web Push sender
    vapid.ts            # VAPID key management
    content.ts          # Notification content builder
    registry.ts         # Provider registry
    types.ts            # Notification types
  routes/               # API route handlers (one file per domain):
    titles.ts / search.ts / browse.ts / calendar.ts / details.ts
    track.ts / watched.ts / episodes.ts / imdb.ts / sync.ts
    social.ts           # Follow/unfollow and follower/following lists
    ratings.ts          # Title ratings (HATE/DISLIKE/LIKE/LOVE)
    recommendations.ts  # User-to-user title recommendations
    invitations.ts      # Invite-code generation and redemption
    profile.ts          # User search and public profile
    notifiers.ts / admin.ts / jobs.ts / auth-custom.ts
    health.ts / metrics.ts
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
    DiscoveryPage.tsx   # Content discovery
    TitleDetailPage.tsx # Movie/show details
    SeasonDetailPage.tsx # Season details
    EpisodeDetailPage.tsx # Episode details
    PersonPage.tsx      # Actor/crew details
    ReelsPage.tsx       # Short-form discovery
    LoginPage.tsx       # Local + OIDC + passkey login
    SignupPage.tsx      # User registration
    InvitePage.tsx      # Invitation redemption during signup
    ProfilePage.tsx     # Redirects to current user's profile
    UserProfilePage.tsx # Public user profile (tracked, followers, recommendations)
    SettingsPage.tsx    # User settings (notifications, passkeys, account)
  components/
    TitleCard.tsx       # Title display card
    TitleList.tsx       # Title grid/list
    HeroBanner.tsx      # Hero image banner with title info
    FilterBar.tsx       # Filter controls
    SearchBar.tsx       # Search with IMDB detection
    TrackButton.tsx     # Watchlist toggle
    WatchButton.tsx     # Stream button with provider deep links
    WatchedToggleButton.tsx # Episode/movie watched toggle
    RatingButtons.tsx   # Title rating (HATE/DISLIKE/LIKE/LOVE)
    FollowButton.tsx    # Follow/unfollow user
    RecommendButton.tsx # Send title recommendation
    ShareButton.tsx     # Share title or profile
    VisibilityButton.tsx # Toggle content visibility
    NewReleases.tsx     # New releases section
    CategoryBar.tsx     # Category selector
    CategoryBrowse.tsx  # Category browsing grid
    EpisodeComponents.tsx # Episode list/details
    EpisodeShowCard.tsx # Episode card with backdrop image
    PersonCard.tsx      # Actor/crew card
    ProfileBanner.tsx   # User profile header
    UserSearchDropdown.tsx # User search autocomplete
    ReelsCard.tsx       # Reel item card
    ReelsSeasonPanel.tsx # Season panel for reels
    BottomTabBar.tsx    # Mobile navigation
    MultiSelectDropdown.tsx # Multi-select filter
    ExternalLinks.tsx   # IMDB/TMDB external links
    SkeletonComponents.tsx # Loading skeleton placeholders
    InstallPrompt.tsx   # PWA install prompt
    NotificationPrompt.tsx # Push notification permission prompt
    OfflineIndicator.tsx # Offline status indicator
    ErrorBoundary.tsx   # Error fallback UI
    RequireAuth.tsx     # Auth guard wrapper
    loadFilters.ts      # Filter data loading utility
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
| `GET` | `/api/track` | Get watchlist |
| `POST` | `/api/track/:id` | Add title to watchlist |
| `DELETE` | `/api/track/:id` | Remove title from watchlist |
| `GET` | `/api/track/export` | Export watchlist as JSON |
| `POST` | `/api/track/import` | Import watchlist from JSON |
| `GET` | `/api/episodes/upcoming` | Upcoming & unwatched episodes |
| `POST` | `/api/episodes/sync` | Manual episode sync |
| `POST/DELETE` | `/api/watched/:episodeId` | Mark episode watched/unwatched |
| `POST/DELETE` | `/api/watched/movies/:titleId` | Mark movie watched/unwatched |
| `POST` | `/api/watched/bulk` | Bulk mark episodes |

### Auth

Authentication is handled by [better-auth](https://www.better-auth.com) at `/api/auth/*`. Common endpoints:

| Method | Route | Description |
|--------|-------|-------------|
| `POST` | `/api/auth/sign-in/email` | Local password login |
| `POST` | `/api/auth/sign-up/email` | Register a new account |
| `POST` | `/api/auth/sign-out` | Logout |
| `GET` | `/api/auth/get-session` | Current session / user info |
| `POST` | `/api/auth/change-password` | Change password |
| `POST` | `/api/auth/sign-in/social` | OIDC authorization redirect |
| `GET` | `/api/auth/callback/pocketid` | OIDC callback |
| `GET` | `/api/auth/custom/providers` | Available auth providers (local, OIDC, passkey) |

### Social, Ratings & Recommendations

| Method | Route | Description |
|--------|-------|-------------|
| `POST/DELETE` | `/api/social/follow/:userId` | Follow / unfollow a user |
| `GET` | `/api/social/followers` | Current user's followers |
| `GET` | `/api/social/following` | Current user's following |
| `GET` | `/api/social/followers/:userId` | Public follower list for a user |
| `GET` | `/api/social/following/:userId` | Public following list for a user |
| `POST` | `/api/ratings/:titleId` | Rate a title (`HATE`/`DISLIKE`/`LIKE`/`LOVE`) |
| `DELETE` | `/api/ratings/:titleId` | Remove rating |
| `GET` | `/api/ratings/:titleId` | Get aggregated ratings + friends' ratings |
| `POST` | `/api/recommendations` | Send a title recommendation to followers |
| `GET` | `/api/recommendations` | Recommendation feed |
| `GET` | `/api/recommendations/count` | Unread recommendation count |
| `GET` | `/api/recommendations/sent` | Recommendations sent by current user |
| `GET` | `/api/recommendations/check/:titleId` | Check if already recommended |
| `PUT` | `/api/recommendations/:id/read` | Mark recommendation as read |
| `DELETE` | `/api/recommendations/:id` | Delete recommendation |

### User Profiles & Invitations

| Method | Route | Description |
|--------|-------|-------------|
| `GET` | `/api/user/search?q=` | Search users |
| `GET` | `/api/user/:username` | Public user profile |
| `POST` | `/api/invitations` | Generate an invitation code |
| `GET` | `/api/invitations` | List own invitations |
| `POST` | `/api/invitations/redeem/:code` | Redeem an invitation code |
| `DELETE` | `/api/invitations/:id` | Revoke an invitation |

### Admin & System

| Method | Route | Description |
|--------|-------|-------------|
| `GET/PUT` | `/api/admin/settings` | OIDC settings management |
| `POST` | `/api/sync` | Trigger data sync |
| `GET` | `/api/jobs` | Job stats, schedules, history |
| `POST` | `/api/jobs/:name` | Manually trigger a job |
| `GET/POST/PUT/DELETE` | `/api/notifiers` | Notification config CRUD |
| `GET` | `/api/notifiers/providers` | Available notification providers |
| `GET` | `/api/notifiers/vapid-public-key` | VAPID public key for Web Push |
| `POST` | `/api/notifiers/:id/test` | Send test notification |
| `GET` | `/metrics` | Prometheus metrics |
| `GET` | `/api/health` | Health check |

## Testing

```bash
bun test                     # Run all tests
bun test server/             # Server tests only
bun test frontend/src/       # Frontend tests only
bun test --watch             # Watch mode
bun run check                # Full CI: type check + lint + tests
```

E2E tests use Playwright:

```bash
bun run test:e2e             # Run E2E tests
```
