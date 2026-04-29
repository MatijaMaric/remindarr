-- Add `kind` column to streaming_alerts, and widen the unique constraint to
-- include `kind` so arrival and departure records can coexist for the same
-- (user, title, provider) triple.
--
-- SQLite does not support DROP CONSTRAINT, so we must recreate the table.
-- The old unique constraint was an inline UNIQUE(user_id, title_id, provider_id)
-- added by migration 0025 (no named index).
PRAGMA foreign_keys=OFF;
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
INSERT INTO new_streaming_alerts SELECT id, user_id, title_id, provider_id, provider_name, alerted_at, 'arrival' FROM streaming_alerts;
--> statement-breakpoint
DROP TABLE streaming_alerts;
--> statement-breakpoint
ALTER TABLE new_streaming_alerts RENAME TO streaming_alerts;
--> statement-breakpoint
CREATE INDEX idx_streaming_alerts_user_title ON streaming_alerts(user_id, title_id);
--> statement-breakpoint
PRAGMA foreign_keys=ON;
--> statement-breakpoint
ALTER TABLE `users` ADD COLUMN `streaming_departures_enabled` integer NOT NULL DEFAULT 1;
--> statement-breakpoint
ALTER TABLE `users` ADD COLUMN `departure_alert_lead_days` integer NOT NULL DEFAULT 7;
