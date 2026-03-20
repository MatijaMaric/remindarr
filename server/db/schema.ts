import { Database } from "bun:sqlite";
import { drizzle, type BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import {
  sqliteTable,
  text,
  integer,
  real,
  index,
  primaryKey,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { relations, sql } from "drizzle-orm";
import { AsyncLocalStorage } from "node:async_hooks";
import { CONFIG } from "../config";
import { logger } from "../logger";
import type { DrizzleDb } from "../platform/types";

const log = logger.child({ module: "migration" });

// ─── Table Definitions ──────────────────────────────────────────────────────

export const titles = sqliteTable(
  "titles",
  {
    id: text("id").primaryKey(),
    objectType: text("object_type").notNull(),
    title: text("title").notNull(),
    originalTitle: text("original_title"),
    releaseYear: integer("release_year"),
    releaseDate: text("release_date"),
    runtimeMinutes: integer("runtime_minutes"),
    shortDescription: text("short_description"),
    genres: text("genres"),
    imdbId: text("imdb_id"),
    tmdbId: text("tmdb_id"),
    posterUrl: text("poster_url"),
    ageCertification: text("age_certification"),
    originalLanguage: text("original_language"),
    tmdbUrl: text("tmdb_url"),
    updatedAt: text("updated_at").default(sql`(datetime('now'))`),
  },
  (table) => [
    index("idx_titles_release_date").on(table.releaseDate),
    index("idx_titles_object_type").on(table.objectType),
  ]
);

export const providers = sqliteTable("providers", {
  id: integer("id").primaryKey(),
  name: text("name").notNull(),
  technicalName: text("technical_name"),
  iconUrl: text("icon_url"),
});

export const offers = sqliteTable(
  "offers",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    titleId: text("title_id").references(() => titles.id),
    providerId: integer("provider_id").references(() => providers.id),
    monetizationType: text("monetization_type"),
    presentationType: text("presentation_type"),
    priceValue: real("price_value"),
    priceCurrency: text("price_currency"),
    url: text("url"),
    availableTo: text("available_to"),
  },
  (table) => [
    index("idx_offers_title_id").on(table.titleId),
    index("idx_offers_provider_id").on(table.providerId),
  ]
);

export const scores = sqliteTable("scores", {
  titleId: text("title_id")
    .primaryKey()
    .references(() => titles.id),
  imdbScore: real("imdb_score"),
  imdbVotes: integer("imdb_votes"),
  tmdbScore: real("tmdb_score"),
});

export const episodes = sqliteTable(
  "episodes",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    titleId: text("title_id")
      .notNull()
      .references(() => titles.id, { onDelete: "cascade" }),
    seasonNumber: integer("season_number").notNull(),
    episodeNumber: integer("episode_number").notNull(),
    name: text("name"),
    overview: text("overview"),
    airDate: text("air_date"),
    stillPath: text("still_path"),
    updatedAt: text("updated_at").default(sql`(datetime('now'))`),
  },
  (table) => [
    uniqueIndex("episodes_title_season_episode").on(
      table.titleId,
      table.seasonNumber,
      table.episodeNumber
    ),
    index("idx_episodes_air_date").on(table.airDate),
    index("idx_episodes_title_id").on(table.titleId),
  ]
);

export const users = sqliteTable(
  "users",
  {
    id: text("id").primaryKey(),
    username: text("username").notNull().unique(),
    passwordHash: text("password_hash"),
    displayName: text("display_name"),
    authProvider: text("auth_provider").notNull().default("local"),
    providerSubject: text("provider_subject"),
    isAdmin: integer("is_admin").notNull().default(0),
    createdAt: text("created_at").default(sql`(datetime('now'))`),
  },
  (table) => [
    uniqueIndex("users_auth_provider_subject").on(
      table.authProvider,
      table.providerSubject
    ),
  ]
);

export const sessions = sqliteTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: text("expires_at").notNull(),
    createdAt: text("created_at").default(sql`(datetime('now'))`),
  },
  (table) => [index("idx_sessions_expires_at").on(table.expiresAt)]
);

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

export const tracked = sqliteTable(
  "tracked",
  {
    titleId: text("title_id")
      .notNull()
      .references(() => titles.id),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    trackedAt: text("tracked_at").default(sql`(datetime('now'))`),
    notes: text("notes"),
  },
  (table) => [primaryKey({ columns: [table.titleId, table.userId] })]
);

export const watchedEpisodes = sqliteTable(
  "watched_episodes",
  {
    episodeId: integer("episode_id")
      .notNull()
      .references(() => episodes.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    watchedAt: text("watched_at").default(sql`(datetime('now'))`),
  },
  (table) => [primaryKey({ columns: [table.episodeId, table.userId] })]
);

export const notifiers = sqliteTable(
  "notifiers",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    name: text("name").notNull(),
    config: text("config").notNull(),
    notifyTime: text("notify_time").notNull().default("09:00"),
    timezone: text("timezone").notNull().default("UTC"),
    enabled: integer("enabled").notNull().default(1),
    lastSentDate: text("last_sent_date"),
    createdAt: text("created_at").default(sql`(datetime('now'))`),
    updatedAt: text("updated_at").default(sql`(datetime('now'))`),
  },
  (table) => [
    index("idx_notifiers_user_id").on(table.userId),
    index("idx_notifiers_enabled_time").on(table.enabled, table.notifyTime),
  ]
);

export const oidcStates = sqliteTable("oidc_states", {
  state: text("state").primaryKey(),
  createdAt: integer("created_at").notNull(),
});

export const schemaVersion = sqliteTable("schema_version", {
  version: integer("version").primaryKey(),
});

// ─── Relations ──────────────────────────────────────────────────────────────

export const titlesRelations = relations(titles, ({ many, one }) => ({
  offers: many(offers),
  scores: one(scores),
  episodes: many(episodes),
  tracked: many(tracked),
}));

export const providersRelations = relations(providers, ({ many }) => ({
  offers: many(offers),
}));

export const offersRelations = relations(offers, ({ one }) => ({
  title: one(titles, { fields: [offers.titleId], references: [titles.id] }),
  provider: one(providers, {
    fields: [offers.providerId],
    references: [providers.id],
  }),
}));

export const scoresRelations = relations(scores, ({ one }) => ({
  title: one(titles, { fields: [scores.titleId], references: [titles.id] }),
}));

export const episodesRelations = relations(episodes, ({ one }) => ({
  title: one(titles, { fields: [episodes.titleId], references: [titles.id] }),
}));

export const usersRelations = relations(users, ({ many }) => ({
  sessions: many(sessions),
  tracked: many(tracked),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, { fields: [sessions.userId], references: [users.id] }),
}));

export const trackedRelations = relations(tracked, ({ one }) => ({
  title: one(titles, { fields: [tracked.titleId], references: [titles.id] }),
  user: one(users, { fields: [tracked.userId], references: [users.id] }),
}));

export const watchedEpisodesRelations = relations(watchedEpisodes, ({ one }) => ({
  episode: one(episodes, { fields: [watchedEpisodes.episodeId], references: [episodes.id] }),
  user: one(users, { fields: [watchedEpisodes.userId], references: [users.id] }),
}));

export const notifiersRelations = relations(notifiers, ({ one }) => ({
  user: one(users, { fields: [notifiers.userId], references: [users.id] }),
}));

// ─── Database Instance ──────────────────────────────────────────────────────

export const schemaExports = {
  titles, providers, offers, scores, episodes, users, sessions, settings, tracked, watchedEpisodes, notifiers, oidcStates, schemaVersion,
  titlesRelations, providersRelations, offersRelations, scoresRelations, episodesRelations,
  usersRelations, sessionsRelations, trackedRelations, watchedEpisodesRelations, notifiersRelations,
};

// Re-export the union type from platform for convenience
export type { DrizzleDb } from "../platform/types";

/**
 * AsyncLocalStorage allows the CF Workers entry point to set a D1-backed
 * Drizzle instance per-request. The Bun entry point ignores ALS and uses
 * the module-level singleton.
 */
const dbStorage = new AsyncLocalStorage<DrizzleDb>();

/** Run a callback with a specific DrizzleDb bound to ALS (used by CF Workers). */
export function runWithDb<T>(db: DrizzleDb, fn: () => T): T {
  return dbStorage.run(db, fn);
}

let drizzleDb: BunSQLiteDatabase<typeof schemaExports>;
let rawDb: Database;

/**
 * Get the current DrizzleDb instance.
 * - In CF Workers: returns the D1-backed instance from AsyncLocalStorage.
 * - In Bun: returns the bun:sqlite singleton (initializes on first call).
 */
export function getDb(): DrizzleDb {
  // Check ALS first (CF Workers path)
  const alsDb = dbStorage.getStore();
  if (alsDb) return alsDb;

  // Fall back to Bun singleton
  if (!drizzleDb) {
    rawDb = new Database(CONFIG.DB_PATH, { create: true });
    rawDb.run("PRAGMA journal_mode = WAL");
    rawDb.run("PRAGMA foreign_keys = ON");
    initSchema(rawDb);
    migrateSchema(rawDb);
    drizzleDb = drizzle(rawDb, { schema: schemaExports });
  }
  return drizzleDb as DrizzleDb;
}

/** Get the raw bun:sqlite Database for edge cases (Bun only). */
export function getRawDb(): Database {
  if (!rawDb) getDb();
  return rawDb;
}

/** Reset DB singletons (for testing with in-memory databases) */
export function resetDb() {
  if (rawDb) rawDb.close();
  drizzleDb = undefined!;
  rawDb = undefined!;
}

// ─── Schema Init (kept for backward compat with existing DBs) ───────────────

function initSchema(db: Database) {
  db.run(`
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
      tmdb_score REAL
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
    CREATE TABLE IF NOT EXISTS watched_episodes (
      episode_id INTEGER NOT NULL REFERENCES episodes(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      watched_at TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (episode_id, user_id)
    )
  `);

  db.run(`
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
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS oidc_states (
      state TEXT PRIMARY KEY,
      created_at INTEGER NOT NULL
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
  db.run("CREATE INDEX IF NOT EXISTS idx_notifiers_user_id ON notifiers(user_id)");
  db.run("CREATE INDEX IF NOT EXISTS idx_notifiers_enabled_time ON notifiers(enabled, notify_time)");
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
    const trackedInfo = db.prepare(
      "SELECT sql FROM sqlite_master WHERE type='table' AND name='tracked'"
    ).get() as any;

    if (trackedInfo && !trackedInfo.sql.includes("user_id")) {
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
    } else if (!trackedInfo) {
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

  if (getSchemaVersion(db) < 2) {
    db.run(`
      CREATE TABLE IF NOT EXISTS watched_episodes (
        episode_id INTEGER NOT NULL REFERENCES episodes(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        watched_at TEXT DEFAULT (datetime('now')),
        PRIMARY KEY (episode_id, user_id)
      )
    `);
    setSchemaVersion(db, 2);
  }

  // Migration v3: Switch from JustWatch to TMDB data source
  if (getSchemaVersion(db) < 3) {
    log.info("Migrating from JustWatch to TMDB data source", { version: 3 });

    // Clear all content data (IDs are changing from JW to TMDB format)
    db.run("DELETE FROM watched_episodes");
    db.run("DELETE FROM episodes");
    db.run("DELETE FROM offers");
    db.run("DELETE FROM scores");
    db.run("DELETE FROM tracked");
    db.run("DELETE FROM titles");
    db.run("DELETE FROM providers");

    // Rename jw_url to tmdb_url if the column exists
    const titlesInfo = db.prepare(
      "SELECT sql FROM sqlite_master WHERE type='table' AND name='titles'"
    ).get() as any;
    if (titlesInfo?.sql?.includes("jw_url")) {
      db.run("ALTER TABLE titles RENAME COLUMN jw_url TO tmdb_url");
    }

    // Remove jw_rating from scores if it exists
    const scoresInfo = db.prepare(
      "SELECT sql FROM sqlite_master WHERE type='table' AND name='scores'"
    ).get() as any;
    if (scoresInfo?.sql?.includes("jw_rating")) {
      db.run("ALTER TABLE scores DROP COLUMN jw_rating");
    }

    log.info("Migration complete, data cleared for TMDB re-sync", { version: 3 });
    setSchemaVersion(db, 3);
  }

  // Migration v4: Add original_title column to titles
  if (getSchemaVersion(db) < 4) {
    const titlesInfo = db.prepare(
      "SELECT sql FROM sqlite_master WHERE type='table' AND name='titles'"
    ).get() as any;
    if (titlesInfo && !titlesInfo.sql.includes("original_title")) {
      db.run("ALTER TABLE titles ADD COLUMN original_title TEXT");
      log.info("Added original_title column to titles table", { version: 4 });
    }
    setSchemaVersion(db, 4);
  }

  // Migration v5: Add notifiers table
  if (getSchemaVersion(db) < 5) {
    db.run(`
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
      )
    `);
    db.run("CREATE INDEX IF NOT EXISTS idx_notifiers_user_id ON notifiers(user_id)");
    db.run("CREATE INDEX IF NOT EXISTS idx_notifiers_enabled_time ON notifiers(enabled, notify_time)");
    log.info("Created notifiers table", { version: 5 });
    setSchemaVersion(db, 5);
  }

  // Migration v6: Add original_language column to titles
  if (getSchemaVersion(db) < 6) {
    const titlesInfo = db.prepare(
      "SELECT sql FROM sqlite_master WHERE type='table' AND name='titles'"
    ).get() as any;
    if (titlesInfo && !titlesInfo.sql.includes("original_language")) {
      db.run("ALTER TABLE titles ADD COLUMN original_language TEXT");
      log.info("Added original_language column to titles table", { version: 6 });
    }
    setSchemaVersion(db, 6);
  }
  // Migration v7: Add oidc_states table
  if (getSchemaVersion(db) < 7) {
    db.run(`
      CREATE TABLE IF NOT EXISTS oidc_states (
        state TEXT PRIMARY KEY,
        created_at INTEGER NOT NULL
      )
    `);
    log.info("Created oidc_states table", { version: 7 });
    setSchemaVersion(db, 7);
  }
}

/** Migrate old tracked data to the admin user. Called from index.ts after admin creation. */
export function migrateTrackedData(adminUserId: string) {
  const d = getRawDb();
  const oldTable = d.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='tracked_old'"
  ).get();

  if (oldTable) {
    d.prepare(
      `INSERT OR IGNORE INTO tracked (title_id, user_id, tracked_at, notes)
       SELECT title_id, ?, tracked_at, notes FROM tracked_old`
    ).run(adminUserId);
    d.run("DROP TABLE tracked_old");
    log.info("Migrated existing tracked titles to admin user");
  }
}
