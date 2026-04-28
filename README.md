# Remindarr

A self-hosted app for tracking streaming media releases. Browse, search, and get notified when movies and TV shows land on your streaming services.

![Remindarr browse page](docs/screenshot.png)

## Features

- **Browse & Discover** — Popular, upcoming, and top-rated titles with genre, provider, and language filters
- **Watchlist** — Track titles and follow per-episode watched status for TV shows
- **Calendar** — Monthly calendar view of releases and upcoming episodes
- **Notifications** — Discord webhook and Web Push with configurable schedules and timezone support
- **Authentication** — Local accounts, OpenID Connect (OIDC), and WebAuthn/Passkeys
- **PWA** — Installable as a progressive web app

## Quick Start

The easiest way to run Remindarr is with Docker. A Cloudflare Workers deploy is also supported — see [Deploy](#deploy) below.

**1. Get a TMDB API key** at [themoviedb.org](https://www.themoviedb.org/settings/api) (free).

**2. Create a `docker-compose.yml`:**

```yaml
services:
  remindarr:
    image: ghcr.io/matijamaric/remindarr:latest
    ports:
      - "3000:3000"
    volumes:
      - remindarr-data:/app/data
    environment:
      - DB_PATH=/app/data/remindarr.db
      - TMDB_API_KEY=your_tmdb_api_key
      - BASE_URL=http://localhost:3000
      - BETTER_AUTH_SECRET=change_this_to_a_random_secret

volumes:
  remindarr-data:
```

**3. Start it:**

```bash
docker compose up -d
```

The app is available at `http://localhost:3000`.

## Deploy

### Docker (recommended for self-hosted)

The `ghcr.io/matijamaric/remindarr:latest` image is a multi-stage build with a non-root user, a healthcheck against `/api/health`, and a `/app/data` volume for the SQLite database. Use the `docker-compose.yml` snippet above or run it directly:

```bash
docker run -d \
  -p 3000:3000 \
  -v remindarr-data:/app/data \
  -e DB_PATH=/app/data/remindarr.db \
  -e TMDB_API_KEY=... \
  -e BASE_URL=https://remindarr.example.com \
  -e BETTER_AUTH_SECRET=... \
  ghcr.io/matijamaric/remindarr:latest
```

For notifications, OIDC, backups, and every other variable see [`docs/configuration.md`](docs/configuration.md) or the committed [`.env.example`](.env.example) template.

### Reverse proxy + `X-Forwarded-For`

The rate limiter and IP-based session logging key on the `x-forwarded-for` header. **Deploy behind a reverse proxy that sets this header reliably** (Caddy, nginx, Traefik, Cloudflare, etc.) — otherwise rate-limit keys fall back to `"anonymous"` and are trivially poolable. If the app is exposed directly to the internet, add a proxy or tighten limits per your threat model. See [REVIEW.md finding P1-4](REVIEW.md) for detail.

### Cloudflare Workers

Remindarr ships with a [`wrangler.toml`](wrangler.toml) and a [`server/worker.ts`](server/worker.ts) entry point so the same code deploys to Workers + D1 + KV.

```bash
# Create D1 database + KV namespace (one-time)
wrangler d1 create remindarr
wrangler kv:namespace create CACHE_KV

# Apply migrations
bun run db:migrate:cf

# Set secrets
wrangler secret put TMDB_API_KEY
wrangler secret put BETTER_AUTH_SECRET
# ...and OIDC_CLIENT_SECRET / SENTRY_DSN / VAPID_* as needed

# Deploy
bun run deploy:cf
```

Runtime differences vs the Bun deploy:
- In-memory job worker is replaced by Workers cron triggers (configured in `wrangler.toml`).
- Cache defaults to KV; set `CACHE_BACKEND=kv` for both Bun and Workers.
- Session IP detection uses `cf-connecting-ip` in addition to `x-forwarded-for`.

## Configuration

| Variable | Required | Description |
|----------|----------|-------------|
| `TMDB_API_KEY` | Yes | TMDB API key |
| `BASE_URL` | Yes | Full URL of the app (e.g. `https://remindarr.example.com`) |
| `BETTER_AUTH_SECRET` | Yes | Random secret for signing sessions |
| `TMDB_COUNTRY` | No (default: `HR`) | Country code for streaming availability (`US`, `GB`, etc.) |
| `TMDB_LANGUAGE` | No (default: `en`) | Language for titles |
| `DB_PATH` | No (default: `./remindarr.db`) | SQLite database path |

For OIDC, Web Push, notifications, caching, and all other options see [docs/configuration.md](docs/configuration.md).

## Development

```bash
bun install
cd frontend && bun install

bun run dev        # Start server + frontend concurrently
bun run check      # Type check + lint + tests (run before committing)
```

Requires [Bun](https://bun.sh) v1.0+.

## Stack

- **Runtime**: Bun + SQLite
- **Server**: Hono, TypeScript strict mode
- **Frontend**: React 19, Vite, Tailwind CSS 4, shadcn/ui
- **Database**: SQLite via Drizzle ORM
- **Auth**: better-auth (local, OIDC, passkeys)

[![ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/Y8Y61YL4CM)
