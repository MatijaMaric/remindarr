CREATE TABLE title_tags (
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title_id text NOT NULL REFERENCES titles(id) ON DELETE CASCADE,
  tag text NOT NULL,
  created_at text DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, title_id, tag)
);
--> statement-breakpoint
CREATE INDEX idx_title_tags_user_id ON title_tags(user_id);
--> statement-breakpoint
CREATE INDEX idx_title_tags_title_id ON title_tags(title_id);
