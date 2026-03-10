import { Database } from "bun:sqlite";
import { CONFIG } from "../config";

let db: Database;

export function getDb(): Database {
  if (!db) {
    db = new Database(CONFIG.DB_PATH, { create: true });
    db.run("PRAGMA journal_mode = WAL");
    db.run("PRAGMA foreign_keys = ON");
    initSchema(db);
    migrateSchema(db);
  }
  return db;
}

function initSchema(db: Database) {
  db.run(`
    CREATE TABLE IF NOT EXISTS titles (
      id TEXT PRIMARY KEY,
      object_type TEXT NOT NULL,
      title TEXT NOT NULL,
      release_year INTEGER,
      release_date TEXT,
      runtime_minutes INTEGER,
      short_description TEXT,
      genres TEXT,
      imdb_id TEXT,
      tmdb_id TEXT,
      poster_url TEXT,
      age_certification TEXT,
      jw_url TEXT,
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS providers (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      technical_name TEXT,
      icon_url TEXT
    )
  `);

  db.run(`
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
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS scores (
      title_id TEXT PRIMARY KEY REFERENCES titles(id),
      imdb_score REAL,
      imdb_votes INTEGER,
      tmdb_score REAL,
      jw_rating REAL
    )
  `);

  db.run(`
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
    )
  `);

  // Auth tables
  db.run(`
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
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS schema_version (
      version INTEGER PRIMARY KEY
    )
  `);

  // Indexes
  db.run("CREATE INDEX IF NOT EXISTS idx_episodes_air_date ON episodes(air_date)");
  db.run("CREATE INDEX IF NOT EXISTS idx_episodes_title_id ON episodes(title_id)");
  db.run("CREATE INDEX IF NOT EXISTS idx_titles_release_date ON titles(release_date)");
  db.run("CREATE INDEX IF NOT EXISTS idx_titles_object_type ON titles(object_type)");
  db.run("CREATE INDEX IF NOT EXISTS idx_offers_title_id ON offers(title_id)");
  db.run("CREATE INDEX IF NOT EXISTS idx_offers_provider_id ON offers(provider_id)");
  db.run("CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at)");
}

function getSchemaVersion(db: Database): number {
  const row = db.prepare("SELECT MAX(version) as version FROM schema_version").get() as any;
  return row?.version ?? 0;
}

function setSchemaVersion(db: Database, version: number) {
  db.prepare("INSERT OR REPLACE INTO schema_version (version) VALUES (?)").run(version);
}

function migrateSchema(db: Database) {
  const version = getSchemaVersion(db);

  if (version < 1) {
    // Migration 1: Add user_id to tracked table
    // Check if old tracked table exists (without user_id)
    const trackedInfo = db.prepare(
      "SELECT sql FROM sqlite_master WHERE type='table' AND name='tracked'"
    ).get() as any;

    if (trackedInfo && !trackedInfo.sql.includes("user_id")) {
      // Old tracked table exists — migrate it
      db.run("ALTER TABLE tracked RENAME TO tracked_old");

      db.run(`
        CREATE TABLE tracked (
          title_id TEXT NOT NULL REFERENCES titles(id),
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          tracked_at TEXT DEFAULT (datetime('now')),
          notes TEXT,
          PRIMARY KEY (title_id, user_id)
        )
      `);

      // Data migration happens in index.ts after admin user creation
      // via migrateTrackedData()
    } else if (!trackedInfo) {
      // Fresh install — create tracked with user_id from the start
      db.run(`
        CREATE TABLE IF NOT EXISTS tracked (
          title_id TEXT NOT NULL REFERENCES titles(id),
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          tracked_at TEXT DEFAULT (datetime('now')),
          notes TEXT,
          PRIMARY KEY (title_id, user_id)
        )
      `);
    }

    setSchemaVersion(db, 1);
  }
}

/** Migrate old tracked data to the admin user. Called from index.ts after admin creation. */
export function migrateTrackedData(adminUserId: string) {
  const d = getDb();
  const oldTable = d.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='tracked_old'"
  ).get();

  if (oldTable) {
    d.run(
      `INSERT OR IGNORE INTO tracked (title_id, user_id, tracked_at, notes)
       SELECT title_id, ?, tracked_at, notes FROM tracked_old`,
      adminUserId
    );
    d.run("DROP TABLE tracked_old");
    console.log("[Auth] Migrated existing tracked titles to admin user");
  }
}
