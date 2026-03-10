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

# Sync data from JustWatch
bun run sync                              # Default sync
bun run server/cli/sync.ts [daysBack] [type]  # CLI with args

# Docker
docker compose up --build
```

## Architecture

**JWSync** — a full-stack app for tracking streaming media releases using JustWatch as the data source. Locale is configurable via env vars (defaults to hr_HR).

### Stack
- **Runtime**: Bun (with built-in SQLite)
- **Server**: Hono framework, TypeScript strict mode
- **Frontend**: React 19 + Vite + Tailwind CSS 4 (no component library)
- **Database**: SQLite (WAL mode, auto-created on startup)

### Server (`server/`)
- `index.ts` — Entry point, Hono app setup, serves static frontend in production
- `config.ts` — JustWatch API config, DB path, image URLs, pagination settings
- `db/schema.ts` — SQLite schema (5 tables: titles, providers, offers, tracked, scores)
- `db/repository.ts` — All database queries (upsert, search, track/untrack, filters)
- `justwatch/client.ts` — GraphQL client for JustWatch API (releases + search)
- `justwatch/parser.ts` — Transforms JW API responses to internal types
- `justwatch/queries.ts` — GraphQL query definitions
- `imdb/resolver.ts` — Resolves IMDB URLs/IDs via autocomplete API, matches to JW titles
- `routes/` — API endpoints: sync, titles, search, track, imdb

### Frontend (`frontend/src/`)
- `api.ts` — API client functions matching all backend routes
- `types.ts` — Title/Offer/Provider types + `normalizeSearchTitle()` for unified rendering
- `pages/` — HomePage (browse + search) and TrackedPage (watchlist)
- `components/` — TitleCard, TitleList, FilterBar, SearchBar, TrackButton, NewReleases

### Key Patterns
- DB titles use snake_case, JustWatch API search results use camelCase — `normalizeSearchTitle()` bridges the gap
- Offers are deduplicated by provider ID with priority: FLATRATE > FREE > ADS
- The SearchBar auto-detects IMDB URLs/IDs and routes to a separate resolution flow
- All DB writes use transactions for consistency

### API Routes
- `GET /api/titles` — Recent titles with filters (daysBack, objectType, provider)
- `GET /api/titles/providers` — Available streaming services
- `GET /api/search?q=` — Live search via JustWatch
- `POST /api/sync` — Trigger data sync from JustWatch
- `GET/POST/DELETE /api/track/:id` — Watchlist management
- `POST /api/imdb` — Resolve IMDB URL, save to DB, auto-track
