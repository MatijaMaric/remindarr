CREATE TABLE IF NOT EXISTS streaming_alerts (
  id text PRIMARY KEY,
  user_id text NOT NULL,
  title_id text NOT NULL,
  provider_id integer NOT NULL,
  provider_name text NOT NULL,
  alerted_at text NOT NULL DEFAULT (datetime('now'))
);
--> statement-breakpoint
ALTER TABLE notifiers ADD COLUMN streaming_alerts_enabled integer NOT NULL DEFAULT 1;
