# Configuration

All configuration is via environment variables. Only `TMDB_API_KEY`, `BASE_URL`, and `BETTER_AUTH_SECRET` are required to run.

## Core

| Variable             | Default          | Description                                                                                 |
| -------------------- | ---------------- | ------------------------------------------------------------------------------------------- |
| `TMDB_API_KEY`       | _(required)_     | TMDB API key — get one at [themoviedb.org](https://www.themoviedb.org/settings/api)         |
| `BASE_URL`           | _(required)_     | Full public URL of the app (e.g. `https://remindarr.example.com`) — used for auth callbacks |
| `BETTER_AUTH_SECRET` | _(required)_     | Random secret for signing sessions                                                          |
| `PORT`               | `3000`           | Server port                                                                                 |
| `DB_PATH`            | `./remindarr.db` | SQLite database file path                                                                   |
| `LOG_LEVEL`          | `info`           | Log verbosity: `debug`, `info`, `warn`, `error`                                             |
| `CORS_ORIGIN`        | _(empty)_        | Comma-separated allowed CORS origins                                                        |

## Rate limits and proxies

Bun uses the network peer for rate-limit identity. `TRUSTED_PROXIES` defaults to empty; set exact comma-separated proxy IPs only when your reverse proxy overwrites `X-Forwarded-For` or appends the actual client address. Chains are traversed from the trusted peer toward the first untrusted address. Workers use the platform's `CF-Connecting-IP` and atomic D1 counters. Both runtimes return HTTP 503 with `Retry-After` when enforcement is unavailable.

| Variable                       | Default   | Description                                 |
| ------------------------------ | --------- | ------------------------------------------- |
| `TRUSTED_PROXIES`              | _(empty)_ | Trusted Bun proxy IPs, e.g. `127.0.0.1,::1` |
| `GLOBAL_RATE_LIMIT_PER_MINUTE` | `300`     | Aggregate API requests per client           |
| `AUTH_RATE_LIMIT_PER_MINUTE`   | `20`      | Authentication requests per client          |

## TMDB

| Variable                  | Default   | Description                                                              |
| ------------------------- | --------- | ------------------------------------------------------------------------ |
| `TMDB_COUNTRY`            | `HR`      | Primary country code for streaming availability (`US`, `GB`, `DE`, etc.) |
| `TMDB_LANGUAGE`           | `en`      | Language for titles and metadata                                         |
| `TMDB_FALLBACK_COUNTRIES` | _(empty)_ | Comma-separated fallback country codes                                   |
| `TMDB_API_TIMEOUT_MS`     | `15000`   | TMDB API request timeout in milliseconds                                 |

## Sync

| Variable             | Default      | Description                    |
| -------------------- | ------------ | ------------------------------ |
| `SYNC_TITLES_CRON`   | `0 3 * * *`  | Cron schedule for title sync   |
| `SYNC_EPISODES_CRON` | `30 3 * * *` | Cron schedule for episode sync |

## Authentication

### OIDC

OIDC settings can be set via env vars (take precedence) or configured at runtime via the admin UI.

| Variable             | Default   | Description                            |
| -------------------- | --------- | -------------------------------------- |
| `OIDC_ISSUER_URL`    | _(empty)_ | OIDC provider issuer URL               |
| `OIDC_CLIENT_ID`     | _(empty)_ | OIDC client ID                         |
| `OIDC_CLIENT_SECRET` | _(empty)_ | OIDC client secret                     |
| `OIDC_REDIRECT_URI`  | _(empty)_ | OIDC callback URL                      |
| `OIDC_ADMIN_CLAIM`   | _(empty)_ | JWT claim used to determine admin role |
| `OIDC_ADMIN_VALUE`   | _(empty)_ | Expected value of the admin claim      |

### Passkeys (WebAuthn)

| Variable          | Default   | Description                                                   |
| ----------------- | --------- | ------------------------------------------------------------- |
| `PASSKEY_RP_ID`   | _(empty)_ | Relying Party ID — typically your domain (e.g. `example.com`) |
| `PASSKEY_RP_NAME` | _(empty)_ | Relying Party display name                                    |
| `PASSKEY_ORIGIN`  | _(empty)_ | WebAuthn origin — must match your deployment URL              |

## Notifications

### Web Push (VAPID)

Generate VAPID keys with: `npx web-push generate-vapid-keys`

| Variable            | Default   | Description                                                        |
| ------------------- | --------- | ------------------------------------------------------------------ |
| `VAPID_PUBLIC_KEY`  | _(empty)_ | VAPID public key                                                   |
| `VAPID_PRIVATE_KEY` | _(empty)_ | VAPID private key                                                  |
| `VAPID_SUBJECT`     | _(empty)_ | Contact URI for the push service (e.g. `mailto:admin@example.com`) |

## Database Backups

| Variable        | Default     | Description                                                |
| --------------- | ----------- | ---------------------------------------------------------- |
| `BACKUP_DIR`    | _(empty)_   | Directory to store backups — backups are disabled if empty |
| `BACKUP_CRON`   | `0 2 * * *` | Cron schedule for backups                                  |
| `BACKUP_RETAIN` | `7`         | Number of backups to keep                                  |

## Deep Links (Streaming Availability API)

Enables direct "Watch on Netflix/Disney+" links. Requires a [RapidAPI](https://rapidapi.com) key with access to the Streaming Availability API.

| Variable                         | Default     | Description                      |
| -------------------------------- | ----------- | -------------------------------- |
| `STREAMING_AVAILABILITY_API_KEY` | _(empty)_   | RapidAPI key                     |
| `SYNC_DEEP_LINKS_CRON`           | `0 4 * * *` | Cron schedule for deep link sync |
| `SA_DAILY_BUDGET`                | `95`        | Max API requests per day         |

## Caching

### Outbound integration destinations

Custom webhook, ntfy, Gotify, Plex and push-service origins must be approved by
the operator. Set comma-separated **exact origins**, including a non-default port:

```dotenv
OUTBOUND_ALLOWED_ORIGINS=https://hooks.example.com,https://notify.example.com
OUTBOUND_PRIVATE_ORIGINS=http://192.168.1.20:32400,http://gotify.internal:8080
```

The first setting permits public destinations only; DNS answers containing
loopback, private, link-local or reserved addresses are rejected. The second
explicitly permits the named internal services. These settings come from the
process environment or Workers bindings, never a user's integration settings.
No wildcards, paths, URL credentials or redirects are accepted. Requests time
out after 10 seconds and response bodies are limited to 8 MiB. Provider response
bodies are not returned by the notifier test API.

Standard Discord, Telegram, ntfy.sh, Plex cloud and browser push service origins
are included by the application. Existing custom integrations need an operator
allowlist entry after upgrading. Allow only origins and DNS zones you trust:
the public-address check is a DNS preflight, not connection-level DNS pinning.
Use network egress controls when untrusted DNS or compromised allowed services
are in the deployment's threat model.

### Offline access

After an authenticated online visit, the browser may retain the current account's
library, calendar and visited title details in IndexedDB. Access expires at the
earlier of 24 hours or the server session's expiry. The cache holds at most 100
responses, each limited to 2 million serialized characters. Logout, account
changes, rejected sessions and expiry clear private offline state.

Watchlist adds/removes are durably queued before the UI says “Queued for sync”.
Reopening the app online verifies the session before replay; requests include
the intended account ID, which the backend checks against the authenticated
account. Replay is serialized across tabs where Web Locks are available. Retries
set the desired tracked/untracked state idempotently; they are not a guarantee
of exactly one HTTP request after a crash. Queued work expires with offline
access and is deliberately discarded by logout. Episode changes require an
online connection. Browser storage must be enabled.

| Variable                   | Default   | Description                                                |
| -------------------------- | --------- | ---------------------------------------------------------- |
| `CACHE_BACKEND`            | `memory`  | Cache backend: `memory`, `redis`, or `kv`                  |
| `REDIS_URL`                | _(empty)_ | Redis connection URL (required when using `redis` backend) |
| `CACHE_MAX_MEMORY_ENTRIES` | `1000`    | Max entries in the memory cache                            |
| `CACHE_TTL_GENRES`         | `86400`   | Genre cache TTL in seconds                                 |
| `CACHE_TTL_PROVIDERS`      | `86400`   | Provider cache TTL in seconds                              |
| `CACHE_TTL_LANGUAGES`      | `86400`   | Language cache TTL in seconds                              |
| `CACHE_TTL_SEARCH`         | `300`     | Search result cache TTL in seconds                         |
| `CACHE_TTL_DETAILS`        | `3600`    | Title details cache TTL in seconds                         |
| `CACHE_TTL_BROWSE`         | `900`     | Browse cache TTL in seconds                                |

## Observability

| Variable     | Default   | Description                   |
| ------------ | --------- | ----------------------------- |
| `SENTRY_DSN` | _(empty)_ | Sentry DSN for error tracking |

`METRICS_TOKEN` enables Bun's `/metrics` endpoint and requires the scraper to
send `Authorization: Bearer <token>`. The endpoint is disabled (404) when unset.
For upgrades from versions that logged token-bearing URLs, follow the
[telemetry token remediation steps](telemetry-token-remediation.md).
