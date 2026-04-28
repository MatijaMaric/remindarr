CREATE TABLE IF NOT EXISTS pinned_titles (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title_id TEXT NOT NULL REFERENCES titles(id) ON DELETE CASCADE,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, title_id)
);
CREATE INDEX IF NOT EXISTS idx_pinned_titles_user_id ON pinned_titles (user_id);
