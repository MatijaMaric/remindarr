-- Add `kind` column to streaming_alerts, and widen the unique constraint to
-- include `kind` so arrival and departure records can coexist for the same
-- (user, title, provider) triple.
--
-- SQLite does not support DROP CONSTRAINT, so we must recreate the table.
-- The old unique constraint was an inline UNIQUE(user_id, title_id, provider_id)
-- added by migration 0025 (no named index).
--
-- Also adds streaming_departures_enabled and departure_alert_lead_days to users
-- using table recreation (idempotent: safe to apply even if these columns were
-- previously added under a different migration filename).
PRAGMA foreign_keys=OFF;
--> statement-breakpoint
DROP TABLE IF EXISTS new_streaming_alerts;
--> statement-breakpoint
CREATE TABLE new_streaming_alerts (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title_id text NOT NULL REFERENCES titles(id) ON DELETE CASCADE,
  provider_id integer NOT NULL,
  provider_name text NOT NULL,
  alerted_at text NOT NULL DEFAULT (datetime('now')),
  kind text NOT NULL DEFAULT 'arrival',
  UNIQUE(user_id, title_id, provider_id, kind)
);
--> statement-breakpoint
INSERT OR IGNORE INTO new_streaming_alerts SELECT id, user_id, title_id, provider_id, provider_name, alerted_at, 'arrival' FROM streaming_alerts;
--> statement-breakpoint
DROP TABLE streaming_alerts;
--> statement-breakpoint
ALTER TABLE new_streaming_alerts RENAME TO streaming_alerts;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_streaming_alerts_user_title ON streaming_alerts(user_id, title_id);
--> statement-breakpoint
-- Add new columns to users without table recreation.
-- Table recreation with DROP TABLE users triggers ON DELETE CASCADE on child tables
-- (account, passkey, sessions) on Cloudflare D1 because PRAGMA foreign_keys=OFF
-- does not persist across statement-breakpoint boundaries on D1. Both columns have
-- NOT NULL DEFAULT so ALTER TABLE ADD COLUMN is safe on SQLite/D1.
ALTER TABLE `users` ADD COLUMN `streaming_departures_enabled` integer NOT NULL DEFAULT 1;
--> statement-breakpoint
ALTER TABLE `users` ADD COLUMN `departure_alert_lead_days` integer NOT NULL DEFAULT 7;
