-- Remindarr initial schema for D1
-- Apply with: wrangler d1 migrations apply remindarr

CREATE TABLE IF NOT EXISTS titles (
  id TEXT PRIMARY KEY,
  object_type TEXT NOT NULL,
  title TEXT NOT NULL,
  original_title TEXT,
  release_year INTEGER,
  release_date TEXT,
  runtime_minutes INTEGER,
  short_description TEXT,
  genres TEXT,
  imdb_id TEXT,
  tmdb_id TEXT,
  poster_url TEXT,
  age_certification TEXT,
  original_language TEXT,
  tmdb_url TEXT,
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS providers (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  technical_name TEXT,
  icon_url TEXT
);

CREATE TABLE IF NOT EXISTS offers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title_id TEXT REFERENCES titles(id),
  provider_id INTEGER REFERENCES providers(id),
  monetization_type TEXT,
  presentation_type TEXT,
  price_value REAL,
  price_currency TEXT,
  url TEXT,
  available_to TEXT
);

CREATE TABLE IF NOT EXISTS scores (
  title_id TEXT PRIMARY KEY REFERENCES titles(id),
  imdb_score REAL,
  imdb_votes INTEGER,
  tmdb_score REAL
);

CREATE TABLE IF NOT EXISTS episodes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title_id TEXT NOT NULL REFERENCES titles(id) ON DELETE CASCADE,
  season_number INTEGER NOT NULL,
  episode_number INTEGER NOT NULL,
  name TEXT,
  overview TEXT,
  air_date TEXT,
  still_path TEXT,
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(title_id, season_number, episode_number)
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT,
  display_name TEXT,
  auth_provider TEXT NOT NULL DEFAULT 'local',
  provider_subject TEXT,
  is_admin INTEGER NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(auth_provider, provider_subject)
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tracked (
  title_id TEXT NOT NULL REFERENCES titles(id),
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tracked_at TEXT DEFAULT (datetime('now')),
  notes TEXT,
  PRIMARY KEY (title_id, user_id)
);

CREATE TABLE IF NOT EXISTS watched_episodes (
  episode_id INTEGER NOT NULL REFERENCES episodes(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  watched_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (episode_id, user_id)
);

CREATE TABLE IF NOT EXISTS notifiers (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  name TEXT NOT NULL,
  config TEXT NOT NULL,
  notify_time TEXT NOT NULL DEFAULT '09:00',
  timezone TEXT NOT NULL DEFAULT 'UTC',
  enabled INTEGER NOT NULL DEFAULT 1,
  last_sent_date TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS oidc_states (
  state TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL
);

-- Jobs tables (used by the in-app job queue)
CREATE TABLE IF NOT EXISTS jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  data TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  error TEXT,
  run_at TEXT NOT NULL DEFAULT (datetime('now')),
  started_at TEXT,
  completed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS cron_jobs (
  name TEXT PRIMARY KEY,
  cron TEXT NOT NULL,
  last_run TEXT,
  next_run TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_titles_release_date ON titles(release_date);
CREATE INDEX IF NOT EXISTS idx_titles_object_type ON titles(object_type);
CREATE INDEX IF NOT EXISTS idx_offers_title_id ON offers(title_id);
CREATE INDEX IF NOT EXISTS idx_offers_provider_id ON offers(provider_id);
CREATE INDEX IF NOT EXISTS idx_episodes_air_date ON episodes(air_date);
CREATE INDEX IF NOT EXISTS idx_episodes_title_id ON episodes(title_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_notifiers_user_id ON notifiers(user_id);
CREATE INDEX IF NOT EXISTS idx_notifiers_enabled_time ON notifiers(enabled, notify_time);
CREATE INDEX IF NOT EXISTS idx_jobs_status_run_at ON jobs(status, run_at);
CREATE INDEX IF NOT EXISTS idx_jobs_name ON jobs(name);

-- Clean up legacy schema_version table
DROP TABLE IF EXISTS schema_version;
