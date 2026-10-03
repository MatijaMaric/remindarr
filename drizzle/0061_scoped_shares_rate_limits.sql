CREATE TABLE wrapped_share_tokens (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  year INTEGER NOT NULL,
  token TEXT NOT NULL UNIQUE,
  PRIMARY KEY (user_id, year)
);
--> statement-breakpoint
CREATE TABLE rate_limit_buckets (
  key TEXT PRIMARY KEY NOT NULL,
  count INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE INDEX idx_rate_limit_expiry ON rate_limit_buckets(expires_at);
