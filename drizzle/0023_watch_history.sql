CREATE TABLE IF NOT EXISTS watch_history (
  id text PRIMARY KEY,
  user_id text NOT NULL,
  title_id text NOT NULL,
  episode_id integer,
  watched_at text NOT NULL DEFAULT (datetime('now')),
  note text
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS watch_history_user_title ON watch_history(user_id, title_id);
