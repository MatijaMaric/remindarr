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
import { CONFIG } from "../config";

// ─── Table Definitions ──────────────────────────────────────────────────────

export const titles = sqliteTable(
  "titles",
  {
    id: text("id").primaryKey(),
    objectType: text("object_type").notNull(),
    title: text("title").notNull(),
    releaseYear: integer("release_year"),
    releaseDate: text("release_date"),
    runtimeMinutes: integer("runtime_minutes"),
    shortDescription: text("short_description"),
    genres: text("genres"),
    imdbId: text("imdb_id"),
    tmdbId: text("tmdb_id"),
    posterUrl: text("poster_url"),
    ageCertification: text("age_certification"),
    jwUrl: text("jw_url"),
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
  jwRating: real("jw_rating"),
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

// ─── Database Instance ──────────────────────────────────────────────────────

const schemaExports = {
  titles, providers, offers, scores, episodes, users, sessions, settings, tracked, schemaVersion,
  titlesRelations, providersRelations, offersRelations, scoresRelations, episodesRelations,
  usersRelations, sessionsRelations, trackedRelations,
};

export type DrizzleDb = BunSQLiteDatabase<typeof schemaExports>;

let drizzleDb: DrizzleDb;
let rawDb: Database;

export function getDb(): DrizzleDb {
  if (!drizzleDb) {
    rawDb = new Database(CONFIG.DB_PATH, { create: true });
    rawDb.run("PRAGMA journal_mode = WAL");
    rawDb.run("PRAGMA foreign_keys = ON");
    initSchema(rawDb);
    migrateSchema(rawDb);
    drizzleDb = drizzle(rawDb, { schema: schemaExports });
  }
  return drizzleDb;
}

/** Get the raw bun:sqlite Database for edge cases */
export function getRawDb(): Database {
  if (!rawDb) getDb();
  return rawDb;
}

// ─── Schema Init (kept for backward compat with existing DBs) ───────────────

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
    console.log("[Auth] Migrated existing tracked titles to admin user");
  }
}
