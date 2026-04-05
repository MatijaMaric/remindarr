-- Recreate watch_history with foreign key constraints.
-- The original migration (0023) was missing REFERENCES clauses.
PRAGMA foreign_keys=OFF;
--> statement-breakpoint
CREATE TABLE new_watch_history (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title_id text NOT NULL REFERENCES titles(id) ON DELETE CASCADE,
  episode_id integer REFERENCES episodes(id) ON DELETE SET NULL,
  watched_at text NOT NULL DEFAULT (datetime('now')),
  note text
);
--> statement-breakpoint
INSERT INTO new_watch_history SELECT * FROM watch_history;
--> statement-breakpoint
DROP TABLE watch_history;
--> statement-breakpoint
ALTER TABLE new_watch_history RENAME TO watch_history;
--> statement-breakpoint
CREATE INDEX watch_history_user_title ON watch_history(user_id, title_id);
--> statement-breakpoint
-- Recreate streaming_alerts with foreign key constraints, a unique constraint
-- on (user_id, title_id, provider_id) so onConflictDoNothing works correctly,
-- and the index that was missing from migration 0024.
CREATE TABLE new_streaming_alerts (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title_id text NOT NULL REFERENCES titles(id) ON DELETE CASCADE,
  provider_id integer NOT NULL,
  provider_name text NOT NULL,
  alerted_at text NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id, title_id, provider_id)
);
--> statement-breakpoint
INSERT OR IGNORE INTO new_streaming_alerts SELECT * FROM streaming_alerts;
--> statement-breakpoint
DROP TABLE streaming_alerts;
--> statement-breakpoint
ALTER TABLE new_streaming_alerts RENAME TO streaming_alerts;
--> statement-breakpoint
CREATE INDEX idx_streaming_alerts_user_title ON streaming_alerts(user_id, title_id);
--> statement-breakpoint
PRAGMA foreign_keys=ON;
