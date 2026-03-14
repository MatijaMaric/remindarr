---
title: "Add test coverage for TMDB API client"
labels: ["testing", "priority:high"]
---

## Problem

`server/tmdb/client.ts` is 200+ lines and the core integration point with the TMDB API. It has zero test coverage. This is the most critical untested module — bugs here affect all data displayed in the app.

Functions to test:
- `fetchReleases()` — fetches movie/show releases by date range
- `searchTitles()` — searches TMDB by query string
- `fetchWatchProviders()` — gets streaming availability
- `discoverMovies()` / `discoverShows()` — browse with filters
- `fetchGenres()` / `fetchProviders()` / `fetchLanguages()` — filter metadata
- `fetchPersonDetails()` / `fetchPersonCredits()` — person pages

## Acceptance Criteria

- [ ] Mock `fetch` to avoid real HTTP calls (per project rules)
- [ ] Test successful responses with realistic TMDB payloads
- [ ] Test API error responses (4xx, 5xx) return useful errors
- [ ] Test malformed/partial TMDB responses don't crash
- [ ] Test query parameter construction (pagination, locale, filters)

## Files

- `server/tmdb/client.ts` → `server/tmdb/client.test.ts`
