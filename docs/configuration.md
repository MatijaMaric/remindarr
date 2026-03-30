# Configuration

All configuration is via environment variables. Only `TMDB_API_KEY`, `BASE_URL`, and `BETTER_AUTH_SECRET` are required to run.

## Core

| Variable | Default | Description |
|----------|---------|-------------|
| `TMDB_API_KEY` | *(required)* | TMDB API key — get one at [themoviedb.org](https://www.themoviedb.org/settings/api) |
| `BASE_URL` | *(required)* | Full public URL of the app (e.g. `https://remindarr.example.com`) — used for auth callbacks |
| `BETTER_AUTH_SECRET` | *(required)* | Random secret for signing sessions |
| `PORT` | `3000` | Server port |
| `DB_PATH` | `./remindarr.db` | SQLite database file path |
| `LOG_LEVEL` | `info` | Log verbosity: `debug`, `info`, `warn`, `error` |
| `CORS_ORIGIN` | *(empty)* | Comma-separated allowed CORS origins |

## TMDB

| Variable | Default | Description |
|----------|---------|-------------|
| `TMDB_COUNTRY` | `HR` | Primary country code for streaming availability (`US`, `GB`, `DE`, etc.) |
| `TMDB_LANGUAGE` | `en` | Language for titles and metadata |
| `TMDB_FALLBACK_COUNTRIES` | *(empty)* | Comma-separated fallback country codes |
| `TMDB_API_TIMEOUT_MS` | `15000` | TMDB API request timeout in milliseconds |

## Sync

| Variable | Default | Description |
|----------|---------|-------------|
| `SYNC_TITLES_CRON` | `0 3 * * *` | Cron schedule for title sync |
| `SYNC_EPISODES_CRON` | `30 3 * * *` | Cron schedule for episode sync |

## Authentication

### OIDC

OIDC settings can be set via env vars (take precedence) or configured at runtime via the admin UI.

| Variable | Default | Description |
|----------|---------|-------------|
| `OIDC_ISSUER_URL` | *(empty)* | OIDC provider issuer URL |
| `OIDC_CLIENT_ID` | *(empty)* | OIDC client ID |
| `OIDC_CLIENT_SECRET` | *(empty)* | OIDC client secret |
| `OIDC_REDIRECT_URI` | *(empty)* | OIDC callback URL |
| `OIDC_ADMIN_CLAIM` | *(empty)* | JWT claim used to determine admin role |
| `OIDC_ADMIN_VALUE` | *(empty)* | Expected value of the admin claim |

### Passkeys (WebAuthn)

| Variable | Default | Description |
|----------|---------|-------------|
| `PASSKEY_RP_ID` | *(empty)* | Relying Party ID — typically your domain (e.g. `example.com`) |
| `PASSKEY_RP_NAME` | *(empty)* | Relying Party display name |
| `PASSKEY_ORIGIN` | *(empty)* | WebAuthn origin — must match your deployment URL |

## Notifications

### Web Push (VAPID)

Generate VAPID keys with: `npx web-push generate-vapid-keys`

| Variable | Default | Description |
|----------|---------|-------------|
| `VAPID_PUBLIC_KEY` | *(empty)* | VAPID public key |
| `VAPID_PRIVATE_KEY` | *(empty)* | VAPID private key |
| `VAPID_SUBJECT` | *(empty)* | Contact URI for the push service (e.g. `mailto:admin@example.com`) |

## Database Backups

| Variable | Default | Description |
|----------|---------|-------------|
| `BACKUP_DIR` | *(empty)* | Directory to store backups — backups are disabled if empty |
| `BACKUP_CRON` | `0 2 * * *` | Cron schedule for backups |
| `BACKUP_RETAIN` | `7` | Number of backups to keep |

## Deep Links (Streaming Availability API)

Enables direct "Watch on Netflix/Disney+" links. Requires a [RapidAPI](https://rapidapi.com) key with access to the Streaming Availability API.

| Variable | Default | Description |
|----------|---------|-------------|
| `STREAMING_AVAILABILITY_API_KEY` | *(empty)* | RapidAPI key |
| `SYNC_DEEP_LINKS_CRON` | `0 4 * * *` | Cron schedule for deep link sync |
| `SA_DAILY_BUDGET` | `95` | Max API requests per day |

## Caching

| Variable | Default | Description |
|----------|---------|-------------|
| `CACHE_BACKEND` | `memory` | Cache backend: `memory`, `redis`, or `kv` |
| `REDIS_URL` | *(empty)* | Redis connection URL (required when using `redis` backend) |
| `CACHE_MAX_MEMORY_ENTRIES` | `1000` | Max entries in the memory cache |
| `CACHE_TTL_GENRES` | `86400` | Genre cache TTL in seconds |
| `CACHE_TTL_PROVIDERS` | `86400` | Provider cache TTL in seconds |
| `CACHE_TTL_LANGUAGES` | `86400` | Language cache TTL in seconds |
| `CACHE_TTL_SEARCH` | `300` | Search result cache TTL in seconds |
| `CACHE_TTL_DETAILS` | `3600` | Title details cache TTL in seconds |
| `CACHE_TTL_BROWSE` | `900` | Browse cache TTL in seconds |

## Observability

| Variable | Default | Description |
|----------|---------|-------------|
| `SENTRY_DSN` | *(empty)* | Sentry DSN for error tracking |
