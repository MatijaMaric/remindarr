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
import type { DrizzleDb } from "../platform/types";

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

export const jobs = sqliteTable(
  "jobs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    name: text("name").notNull(),
    data: text("data"),
    status: text("status").notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(3),
    error: text("error"),
    runAt: text("run_at").notNull().default(sql`(datetime('now'))`),
    startedAt: text("started_at"),
    completedAt: text("completed_at"),
    createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
  },
  (table) => [
    index("idx_jobs_status_run_at").on(table.status, table.runAt),
    index("idx_jobs_name").on(table.name),
  ]
);

export const cronJobs = sqliteTable("cron_jobs", {
  name: text("name").primaryKey(),
  cron: text("cron").notNull(),
  lastRun: text("last_run"),
  nextRun: text("next_run").notNull(),
  enabled: integer("enabled").notNull().default(1),
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
  titles, providers, offers, scores, episodes, users, sessions, settings, tracked, watchedEpisodes, notifiers, oidcStates, jobs, cronJobs,
  titlesRelations, providersRelations, offersRelations, scoresRelations, episodesRelations,
  usersRelations, sessionsRelations, trackedRelations, watchedEpisodesRelations, notifiersRelations,
};

// Re-export the union type from platform for convenience
export type { DrizzleDb } from "../platform/types";

/**
 * AsyncLocalStorage allows the CF Workers entry point to set a D1-backed
 * Drizzle instance per-request. The Bun entry point uses setDbSingleton().
 */
const dbStorage = new AsyncLocalStorage<DrizzleDb>();

/** Run a callback with a specific DrizzleDb bound to ALS (used by CF Workers). */
export function runWithDb<T>(db: DrizzleDb, fn: () => T): T {
  return dbStorage.run(db, fn);
}

let dbSingleton: DrizzleDb | undefined;

/** Register a DrizzleDb singleton (called by bun-db.ts on init). */
export function setDbSingleton(db: DrizzleDb) {
  dbSingleton = db;
}

/**
 * Get the current DrizzleDb instance.
 * - In CF Workers: returns the D1-backed instance from AsyncLocalStorage.
 * - In Bun: returns the singleton set by initBunDb().
 */
export function getDb(): DrizzleDb {
  // Check ALS first (CF Workers path)
  const alsDb = dbStorage.getStore();
  if (alsDb) return alsDb;

  // Fall back to registered singleton (Bun path)
  if (dbSingleton) return dbSingleton;

  throw new Error("Database not initialized. Call initBunDb() or runWithDb() first.");
}
