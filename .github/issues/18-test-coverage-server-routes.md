---
title: "Add test coverage for untested server routes"
labels: ["testing", "priority:high"]
---

## Problem

Six server routes have zero test coverage:

| Route | File | Risk |
|-------|------|------|
| `POST /api/sync` | `server/routes/sync.ts` | HIGH — triggers full TMDB data sync |
| `GET/PUT /api/admin/settings` | `server/routes/admin.ts` | HIGH — OIDC config management |
| `POST/PUT/DELETE /api/notifiers` | `server/routes/notifiers.ts` | HIGH — notification system with config validation |
| `POST /api/episodes` | `server/routes/episodes.ts` | MEDIUM — episode watch state |
| `POST /api/imdb` | `server/routes/imdb.ts` | MEDIUM — IMDB URL resolution |
| `GET /api/calendar` | `server/routes/calendar.ts` | MEDIUM — calendar view |

## Acceptance Criteria

Each route should have tests covering:
- [ ] Happy path (valid request returns expected response)
- [ ] Invalid input (returns 400 with useful error)
- [ ] Auth requirements (returns 401/403 when needed)
- [ ] Error handling (TMDB/DB failures return 500, not crash)

## Files

- `server/routes/sync.ts` → `server/routes/sync.test.ts`
- `server/routes/admin.ts` → `server/routes/admin.test.ts`
- `server/routes/notifiers.ts` → `server/routes/notifiers.test.ts`
- `server/routes/episodes.ts` → `server/routes/episodes.test.ts`
- `server/routes/imdb.ts` → `server/routes/imdb.test.ts`
- `server/routes/calendar.ts` → `server/routes/calendar.test.ts`
