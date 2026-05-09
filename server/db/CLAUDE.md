# Database guidance

## Schema overview

`server/db/schema.ts` — 30 SQLite tables via Drizzle ORM:

| Group | Tables |
|-------|--------|
| Content | `titles`, `providers`, `offers`, `scores`, `title_genres`, `episodes`, `streaming_alerts` |
| Auth/user | `users`, `sessions`, `account`, `verification`, `passkey`, `oidc_states`, `invitations` |
| Tracking | `tracked`, `watched_episodes`, `watched_titles`, `watch_history`, `title_tags` |
| Ratings/social | `ratings`, `episode_ratings`, `follows`, `recommendations`, `recommendation_reads` |
| Config/ops | `settings`, `notifiers`, `integrations`, `plex_library_items`, `jobs`, `cron_jobs` |

Repository modules in `server/db/repository/` (domain-specific query modules):
users, titles, episodes, offers, tracked, watched, notifiers, settings, ratings, recommendations, social, integrations, invitations, plex, stats, sessions.

## Migration Safety Rules (Cloudflare D1) ⚠️

**NEVER recreate a FK-parent table via DROP TABLE on D1.**

`PRAGMA foreign_keys=OFF` does NOT persist across `--> statement-breakpoint` boundaries on D1 — each statement runs in a separate connection context. If a migration drops a parent table while child tables have `ON DELETE CASCADE` FKs, the cascade fires unconditionally and wipes all child rows.

**Parent tables (never recreate):** `users`, `titles`, `providers`

**Safe pattern for adding columns:**
```sql
ALTER TABLE <table> ADD COLUMN <col> <type> NOT NULL DEFAULT '<val>';
```
This works for any `NOT NULL DEFAULT` column on SQLite/D1. Use it instead of the table-recreate pattern (create-new → insert-from-old → drop-old → rename-new).

**The recreate pattern is only safe for leaf tables** (tables that reference a parent but have no FK children themselves):
- Safe to recreate: `tracked`, `watched_titles`, `watch_history`, `streaming_alerts`, `ratings`, `recommendations`

**Enforcement test:** `server/db/migrations.test.ts` runs every migration with `foreign_keys=ON` throughout and asserts that `account`, `sessions`, and `passkey` rows seeded early survive all migrations. This test would have caught the 2026-04-29 production data-loss incident caused by migration 0037.

Always run `bun test server/db/migrations.test.ts` after writing a migration and before opening a PR.

## Commands

```bash
bun run db:generate      # Generate migrations from schema changes
bun run db:push          # Push schema to local DB (dev only)
bun run db:migrate:cf    # Apply migrations to Cloudflare D1 (prod)
bun run db:studio        # Open Drizzle Studio
```
