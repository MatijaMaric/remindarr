# Remindarr

A full-stack app for tracking streaming media releases using JustWatch as the data source.

## Stack

- **Runtime**: [Bun](https://bun.sh) (with built-in SQLite)
- **Server**: [Hono](https://hono.dev) framework, TypeScript
- **Frontend**: React 19 + Vite + Tailwind CSS 4
- **Database**: SQLite (WAL mode, auto-created on startup)
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
# Start the API server (port 3000) with hot reload
bun run dev

# In another terminal — start Vite dev server (port 5173, proxies /api to :3000)
bun run dev:frontend
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

Set the locale via environment variables (defaults to Croatia):

| Variable | Default | Example |
|----------|---------|---------|
| `JUSTWATCH_COUNTRY` | `HR` | `US`, `DE`, `GB` |
| `JUSTWATCH_LANGUAGE` | `hr` | `en`, `de` |
| `JUSTWATCH_LOCALE` | `hr_HR` | `en_US`, `de_DE` |

## Syncing Data

```bash
bun run sync                                   # Default sync
bun run server/cli/sync.ts [daysBack] [type]   # Custom: days back, object type
```

## Project Structure

```
server/
  index.ts              # Hono app entry point
  config.ts             # JustWatch API config, DB path, pagination
  db/
    schema.ts           # SQLite schema (titles, providers, offers, tracked, scores)
    repository.ts       # All database queries
  justwatch/
    client.ts           # GraphQL client for JustWatch API
    parser.ts           # API response → internal types
    queries.ts          # GraphQL query definitions
  imdb/
    resolver.ts         # IMDB URL/ID resolution via autocomplete API
  routes/               # API route handlers
  cli/
    sync.ts             # CLI sync script

frontend/src/
  api.ts                # API client
  types.ts              # Shared types + normalizeSearchTitle()
  pages/                # HomePage, TrackedPage
  components/           # TitleCard, TitleList, FilterBar, SearchBar, etc.
```

## API

| Method | Route | Description |
|--------|-------|-------------|
| `GET` | `/api/titles` | Recent titles (filters: `daysBack`, `objectType`, `provider`) |
| `GET` | `/api/titles/providers` | Available streaming providers |
| `GET` | `/api/search?q=` | Live search via JustWatch |
| `POST` | `/api/sync` | Trigger data sync |
| `GET/POST/DELETE` | `/api/track/:id` | Watchlist management |
| `POST` | `/api/imdb` | Resolve IMDB URL, save & auto-track |
