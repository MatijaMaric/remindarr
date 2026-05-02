import {
  sqliteTable,
  text,
  integer,
  real,
  index,
  primaryKey,
  uniqueIndex,
  customType,
} from "drizzle-orm/sqlite-core";
import { relations, sql } from "drizzle-orm";

/**
 * Custom text column that accepts Date objects (auto-converted to ISO strings).
 * Needed because better-auth passes `new Date()` for createdAt/updatedAt,
 * but SQLite text columns only accept string bindings.
 */
const dateText = customType<{ data: string; driverData: string }>({
  dataType() { return "text"; },
  toDriver(value: unknown): string {
    if (value instanceof Date) return value.toISOString();
    return String(value ?? "");
  },
});
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
    imdbId: text("imdb_id"),
    tmdbId: text("tmdb_id"),
    posterUrl: text("poster_url"),
    backdropUrl: text("backdrop_url"),
    ageCertification: text("age_certification"),
    originalLanguage: text("original_language"),
    tmdbUrl: text("tmdb_url"),
    saFetchedAt: text("sa_fetched_at"),
    offersChecked: integer("offers_checked").notNull().default(0),
    updatedAt: text("updated_at").default(sql`(datetime('now'))`),
  },
  (table) => [
    index("idx_titles_release_date").on(table.releaseDate),
    index("idx_titles_object_type").on(table.objectType),
  ]
);

export const providers = sqliteTable(
  "providers",
  {
    id: integer("id").primaryKey(),
    name: text("name").notNull(),
    technicalName: text("technical_name"),
    iconUrl: text("icon_url"),
  },
  (table) => [index("idx_providers_technical_name").on(table.technicalName)]
);

export const offers = sqliteTable(
  "offers",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    titleId: text("title_id").references(() => titles.id, { onDelete: "cascade" }),
    // onDelete: restrict — providers are a reference/enum-like table seeded from TMDB
    // and are not user-deletable; block deletion if offers reference them.
    providerId: integer("provider_id").references(() => providers.id, { onDelete: "restrict" }),
    monetizationType: text("monetization_type"),
    presentationType: text("presentation_type"),
    priceValue: real("price_value"),
    priceCurrency: text("price_currency"),
    url: text("url"),
    deepLink: text("deep_link"),
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
    .references(() => titles.id, { onDelete: "cascade" }),
  imdbScore: real("imdb_score"),
  imdbVotes: integer("imdb_votes"),
  tmdbScore: real("tmdb_score"),
});

export const titleGenres = sqliteTable(
  "title_genres",
  {
    titleId: text("title_id")
      .notNull()
      .references(() => titles.id, { onDelete: "cascade" }),
    genre: text("genre").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.titleId, table.genre] }),
    index("idx_title_genres_genre").on(table.genre),
  ]
);

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
    displayUsername: text("display_username"),
    email: text("email"),
    emailVerified: integer("email_verified", { mode: "boolean" }).notNull().default(false),
    name: text("name"),
    image: text("image"),
    role: text("role"),
    banned: integer("banned", { mode: "boolean" }).default(false),
    banReason: text("ban_reason"),
    banExpires: integer("ban_expires"),
    createdAt: dateText("created_at").default(sql`(datetime('now'))`),
    updatedAt: dateText("updated_at").default(sql`(datetime('now'))`),
    // Legacy columns — kept for migration, will be removed after verification
    passwordHash: text("password_hash"),
    authProvider: text("auth_provider").notNull().default("local"),
    providerSubject: text("provider_subject"),
    isAdmin: integer("is_admin").notNull().default(0),
    profilePublic: integer("profile_public").notNull().default(0),
    profileVisibility: text("profile_visibility").notNull().default("private"),
    homepageLayout: text("homepage_layout"),
    feedToken: text("feed_token"),
    kioskToken: text("kiosk_token"),
    watchlistShareToken: text("watchlist_share_token"),
    bio: text("bio"),
    countryCode: text("country_code"),
    locale: text("locale"),
    activityStreamEnabled: integer("activity_stream_enabled").notNull().default(0),
    streamingDeparturesEnabled: integer("streaming_departures_enabled").notNull().default(1),
    departureAlertLeadDays: integer("departure_alert_lead_days").notNull().default(7),
    crowdedWeekThreshold: integer("crowded_week_threshold").notNull().default(5),
    crowdedWeekBadgeEnabled: integer("crowded_week_badge_enabled").notNull().default(1),
    themeVariant: text("theme_variant").notNull().default("dark"),
    accentColor: text("accent_color").notNull().default("amber"),
    density: text("density").notNull().default("comfortable"),
    reduceMotion: integer("reduce_motion").notNull().default(0),
    highContrast: integer("high_contrast").notNull().default(0),
    hideEpisodeSpoilers: integer("hide_episode_spoilers").notNull().default(0),
    autoplayTrailers: integer("autoplay_trailers").notNull().default(0),
    onlyMineFilter: integer("only_mine_filter").notNull().default(0),
  },
  (table) => [
    uniqueIndex("users_auth_provider_subject").on(
      table.authProvider,
      table.providerSubject
    ),
    uniqueIndex("users_feed_token_idx").on(table.feedToken),
    uniqueIndex("users_kiosk_token_idx").on(table.kioskToken),
    uniqueIndex("users_watchlist_share_token_idx").on(table.watchlistShareToken),
  ]
);

export const sessions = sqliteTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    token: text("token").notNull().unique(),
    expiresAt: dateText("expires_at").notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    impersonatedBy: text("impersonated_by"),
    createdAt: dateText("created_at").default(sql`(datetime('now'))`),
    updatedAt: dateText("updated_at").default(sql`(datetime('now'))`),
  },
  (table) => [index("idx_sessions_expires_at").on(table.expiresAt)]
);

export const account = sqliteTable(
  "account",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    accessTokenExpiresAt: dateText("access_token_expires_at"),
    refreshTokenExpiresAt: dateText("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"),
    idToken: text("id_token"),
    createdAt: dateText("created_at").default(sql`(datetime('now'))`),
    updatedAt: dateText("updated_at").default(sql`(datetime('now'))`),
  },
  (table) => [index("idx_account_user_id").on(table.userId)]
);

export const verification = sqliteTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: dateText("expires_at").notNull(),
  createdAt: dateText("created_at").default(sql`(datetime('now'))`),
  updatedAt: dateText("updated_at").default(sql`(datetime('now'))`),
});

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

export const userSubscribedProviders = sqliteTable(
  "user_subscribed_providers",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    providerId: integer("provider_id")
      .notNull()
      .references(() => providers.id, { onDelete: "restrict" }),
    createdAt: text("created_at").default(sql`(datetime('now'))`),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.providerId] }),
    index("idx_user_subscribed_providers_user_id").on(table.userId),
  ]
);

export const tracked = sqliteTable(
  "tracked",
  {
    titleId: text("title_id")
      .notNull()
      .references(() => titles.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    trackedAt: text("tracked_at").default(sql`(datetime('now'))`),
    notes: text("notes"),
    public: integer("public").notNull().default(1),
    userStatus: text("user_status"),
    notificationMode: text("notification_mode"),
    snoozeUntil: text("snooze_until"),
    remindOnRelease: integer("remind_on_release").notNull().default(0),
  },
  (table) => [
    primaryKey({ columns: [table.titleId, table.userId] }),
    index("idx_tracked_user_id").on(table.userId),
  ]
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
  (table) => [
    primaryKey({ columns: [table.episodeId, table.userId] }),
    index("idx_watched_episodes_user_id").on(table.userId),
  ]
);

export const watchedTitles = sqliteTable(
  "watched_titles",
  {
    titleId: text("title_id")
      .notNull()
      .references(() => titles.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    watchedAt: text("watched_at").default(sql`(datetime('now'))`),
  },
  (table) => [
    primaryKey({ columns: [table.titleId, table.userId] }),
    index("idx_watched_titles_user_id").on(table.userId),
  ]
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
    digestMode: text("digest_mode"),
    digestDay: integer("digest_day"),
    streamingAlertsEnabled: integer("streaming_alerts_enabled").notNull().default(1),
    quietHoursStart: text("quiet_hours_start"),
    quietHoursEnd: text("quiet_hours_end"),
    quietHoursDays: text("quiet_hours_days").notNull().default(""),
    leavingSoonAlertsEnabled: integer("leaving_soon_alerts_enabled").notNull().default(1),
    friendActivityAlertsEnabled: integer("friend_activity_alerts_enabled").notNull().default(0),
    createdAt: text("created_at").default(sql`(datetime('now'))`),
    updatedAt: text("updated_at").default(sql`(datetime('now'))`),
  },
  (table) => [
    index("idx_notifiers_user_id").on(table.userId),
    index("idx_notifiers_enabled_time").on(table.enabled, table.notifyTime),
  ]
);

export const integrations = sqliteTable(
  "integrations",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    name: text("name").notNull(),
    config: text("config").notNull(),
    enabled: integer("enabled").notNull().default(1),
    lastSyncAt: text("last_sync_at"),
    lastSyncError: text("last_sync_error"),
    createdAt: text("created_at").default(sql`(datetime('now'))`),
    updatedAt: text("updated_at").default(sql`(datetime('now'))`),
  },
  (table) => [
    index("idx_integrations_user_id").on(table.userId),
    index("idx_integrations_provider").on(table.provider),
  ]
);

export const passkey = sqliteTable("passkey", {
  id: text("id").primaryKey(),
  name: text("name"),
  publicKey: text("public_key").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  webauthnUserID: text("webauthn_user_id"),
  counter: integer("counter").notNull().default(0),
  deviceType: text("device_type"),
  backedUp: integer("backed_up", { mode: "boolean" }).default(false),
  transports: text("transports"),
  credentialID: text("credential_id").notNull(),
  aaguid: text("aaguid"),
  createdAt: dateText("created_at").default(sql`(datetime('now'))`),
});

export const oidcStates = sqliteTable("oidc_states", {
  state: text("state").primaryKey(),
  createdAt: integer("created_at").notNull(),
});

export const follows = sqliteTable(
  "follows",
  {
    followerId: text("follower_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    followingId: text("following_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    createdAt: text("created_at").default(sql`(datetime('now'))`),
  },
  (table) => [
    primaryKey({ columns: [table.followerId, table.followingId] }),
    index("idx_follows_following").on(table.followingId),
  ]
);

export const ratings = sqliteTable(
  "ratings",
  {
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    titleId: text("title_id").notNull().references(() => titles.id, { onDelete: "cascade" }),
    rating: text("rating").notNull(), // 'HATE', 'DISLIKE', 'LIKE', 'LOVE'
    createdAt: text("created_at").default(sql`(datetime('now'))`),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.titleId] }),
    index("idx_ratings_title").on(table.titleId),
  ]
);

export const recommendations = sqliteTable(
  "recommendations",
  {
    id: text("id").primaryKey(),
    fromUserId: text("from_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    titleId: text("title_id").notNull().references(() => titles.id, { onDelete: "cascade" }),
    targetUserId: text("target_user_id").references(() => users.id, { onDelete: "cascade" }),
    message: text("message"),
    createdAt: text("created_at").default(sql`(datetime('now'))`),
  },
  (table) => [
    index("idx_recommendations_from_title").on(table.fromUserId, table.titleId),
    index("idx_recommendations_from_user").on(table.fromUserId),
    index("idx_recommendations_target_user").on(table.targetUserId),
  ]
);

export const recommendationReads = sqliteTable(
  "recommendation_reads",
  {
    recommendationId: text("recommendation_id").notNull().references(() => recommendations.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    readAt: text("read_at").default(sql`(datetime('now'))`),
  },
  (table) => [
    primaryKey({ columns: [table.recommendationId, table.userId] }),
  ]
);

export const invitations = sqliteTable(
  "invitations",
  {
    id: text("id").primaryKey(),
    code: text("code").notNull().unique(),
    createdById: text("created_by_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    // onDelete: set null — preserves invite audit trail after the redeeming user is deleted.
    usedById: text("used_by_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: text("created_at").default(sql`(datetime('now'))`),
    usedAt: text("used_at"),
    expiresAt: text("expires_at").notNull(),
  },
  (table) => [
    index("idx_invitations_code").on(table.code),
  ]
);

export const plexLibraryItems = sqliteTable(
  "plex_library_items",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    integrationId: text("integration_id")
      .notNull()
      .references(() => integrations.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    titleId: text("title_id").notNull(),
    ratingKey: text("rating_key").notNull(),
    mediaType: text("media_type").notNull(), // "movie" or "show"
    plexSlug: text("plex_slug"), // watch.plex.tv slug for Android deep linking
    syncedAt: text("synced_at").default(sql`(datetime('now'))`),
  },
  (table) => [
    uniqueIndex("idx_plex_library_user_title").on(table.userId, table.titleId),
    index("idx_plex_library_integration").on(table.integrationId),
    index("idx_plex_library_title").on(table.titleId),
  ]
);

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

export const titleTags = sqliteTable(
  "title_tags",
  {
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    titleId: text("title_id").notNull().references(() => titles.id, { onDelete: "cascade" }),
    tag: text("tag").notNull(),
    createdAt: text("created_at").default(sql`(datetime('now'))`),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.titleId, table.tag] }),
    index("idx_title_tags_user_id").on(table.userId),
    index("idx_title_tags_title_id").on(table.titleId),
  ]
);

export const pinnedTitles = sqliteTable(
  "pinned_titles",
  {
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    titleId: text("title_id").notNull().references(() => titles.id, { onDelete: "cascade" }),
    position: integer("position").notNull().default(0),
    createdAt: text("created_at").default(sql`(datetime('now'))`),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.titleId] }),
    index("idx_pinned_titles_user_id").on(table.userId),
  ]
);

export const watchHistory = sqliteTable(
  "watch_history",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    titleId: text("title_id").notNull().references(() => titles.id, { onDelete: "cascade" }),
    episodeId: integer("episode_id").references(() => episodes.id, { onDelete: "set null" }),
    watchedAt: text("watched_at").notNull().default(sql`(datetime('now'))`),
    note: text("note"),
  },
  (table) => [
    index("watch_history_user_title").on(table.userId, table.titleId),
  ]
);

export const activityKindVisibility = sqliteTable(
  "activity_kind_visibility",
  {
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    visibility: text("visibility").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.kind] }),
  ]
);

export const hiddenActivityEvents = sqliteTable(
  "hidden_activity_events",
  {
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    eventKind: text("event_kind").notNull(),
    eventKey: text("event_key").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.eventKind, table.eventKey] }),
  ]
);

export const episodeRatings = sqliteTable(
  "episode_ratings",
  {
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    episodeId: integer("episode_id").notNull().references(() => episodes.id, { onDelete: "cascade" }),
    rating: text("rating").notNull(), // 'HATE', 'DISLIKE', 'LIKE', 'LOVE'
    review: text("review"),
    createdAt: text("created_at").default(sql`(datetime('now'))`),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.episodeId] }),
    index("idx_episode_ratings_episode").on(table.episodeId),
  ]
);

export const streamingAlerts = sqliteTable(
  "streaming_alerts",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    titleId: text("title_id").notNull().references(() => titles.id, { onDelete: "cascade" }),
    providerId: integer("provider_id").notNull(),
    providerName: text("provider_name").notNull(),
    alertedAt: text("alerted_at").notNull().default(sql`(datetime('now'))`),
    kind: text("kind").notNull().default("arrival"),
  },
  (table) => [
    uniqueIndex("uq_streaming_alerts_user_title_provider_kind").on(table.userId, table.titleId, table.providerId, table.kind),
    index("idx_streaming_alerts_user_title").on(table.userId, table.titleId),
  ]
);

export const notificationLog = sqliteTable(
  "notification_log",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    notifierId: text("notifier_id").notNull().references(() => notifiers.id, { onDelete: "cascade" }),
    attemptedAt: integer("attempted_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
    status: text("status", { enum: ["success", "failure", "skipped"] }).notNull(),
    latencyMs: integer("latency_ms"),
    httpStatus: integer("http_status"),
    errorMessage: text("error_message"),
    eventKind: text("event_kind"),
  },
  (table) => [
    index("idx_notification_log_notifier").on(table.notifierId, table.attemptedAt),
  ]
);

// ─── Relations ──────────────────────────────────────────────────────────────

export const titlesRelations = relations(titles, ({ many, one }) => ({
  offers: many(offers),
  scores: one(scores),
  episodes: many(episodes),
  tracked: many(tracked),
  genres: many(titleGenres),
  ratings: many(ratings),
  recommendations: many(recommendations),
}));

export const titleGenresRelations = relations(titleGenres, ({ one }) => ({
  title: one(titles, { fields: [titleGenres.titleId], references: [titles.id] }),
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

export const episodesRelations = relations(episodes, ({ one, many }) => ({
  title: one(titles, { fields: [episodes.titleId], references: [titles.id] }),
  ratings: many(episodeRatings),
}));

export const usersRelations = relations(users, ({ many }) => ({
  sessions: many(sessions),
  accounts: many(account),
  tracked: many(tracked),
  ratings: many(ratings),
  episodeRatings: many(episodeRatings),
  followers: many(follows, { relationName: "following" }),
  following: many(follows, { relationName: "follower" }),
  sentRecommendations: many(recommendations),
  recommendationReads: many(recommendationReads),
  createdInvitations: many(invitations, { relationName: "createdBy" }),
  integrations: many(integrations),
}));

export const integrationsRelations = relations(integrations, ({ one, many }) => ({
  user: one(users, { fields: [integrations.userId], references: [users.id] }),
  plexLibraryItems: many(plexLibraryItems),
}));

export const plexLibraryItemsRelations = relations(plexLibraryItems, ({ one }) => ({
  integration: one(integrations, { fields: [plexLibraryItems.integrationId], references: [integrations.id] }),
  user: one(users, { fields: [plexLibraryItems.userId], references: [users.id] }),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, { fields: [sessions.userId], references: [users.id] }),
}));

export const accountRelations = relations(account, ({ one }) => ({
  user: one(users, { fields: [account.userId], references: [users.id] }),
}));

export const trackedRelations = relations(tracked, ({ one }) => ({
  title: one(titles, { fields: [tracked.titleId], references: [titles.id] }),
  user: one(users, { fields: [tracked.userId], references: [users.id] }),
}));

export const watchedEpisodesRelations = relations(watchedEpisodes, ({ one }) => ({
  episode: one(episodes, { fields: [watchedEpisodes.episodeId], references: [episodes.id] }),
  user: one(users, { fields: [watchedEpisodes.userId], references: [users.id] }),
}));

export const watchedTitlesRelations = relations(watchedTitles, ({ one }) => ({
  title: one(titles, { fields: [watchedTitles.titleId], references: [titles.id] }),
  user: one(users, { fields: [watchedTitles.userId], references: [users.id] }),
}));

export const notifiersRelations = relations(notifiers, ({ one, many }) => ({
  user: one(users, { fields: [notifiers.userId], references: [users.id] }),
  logs: many(notificationLog),
}));

export const notificationLogRelations = relations(notificationLog, ({ one }) => ({
  notifier: one(notifiers, { fields: [notificationLog.notifierId], references: [notifiers.id] }),
}));

export const followsRelations = relations(follows, ({ one }) => ({
  follower: one(users, { fields: [follows.followerId], references: [users.id], relationName: "follower" }),
  following: one(users, { fields: [follows.followingId], references: [users.id], relationName: "following" }),
}));

export const ratingsRelations = relations(ratings, ({ one }) => ({
  user: one(users, { fields: [ratings.userId], references: [users.id] }),
  title: one(titles, { fields: [ratings.titleId], references: [titles.id] }),
}));

export const episodeRatingsRelations = relations(episodeRatings, ({ one }) => ({
  user: one(users, { fields: [episodeRatings.userId], references: [users.id] }),
  episode: one(episodes, { fields: [episodeRatings.episodeId], references: [episodes.id] }),
}));

export const recommendationsRelations = relations(recommendations, ({ one, many }) => ({
  fromUser: one(users, { fields: [recommendations.fromUserId], references: [users.id] }),
  title: one(titles, { fields: [recommendations.titleId], references: [titles.id] }),
  reads: many(recommendationReads),
}));

export const recommendationReadsRelations = relations(recommendationReads, ({ one }) => ({
  recommendation: one(recommendations, { fields: [recommendationReads.recommendationId], references: [recommendations.id] }),
  user: one(users, { fields: [recommendationReads.userId], references: [users.id] }),
}));

export const invitationsRelations = relations(invitations, ({ one }) => ({
  createdBy: one(users, { fields: [invitations.createdById], references: [users.id], relationName: "createdBy" }),
  usedBy: one(users, { fields: [invitations.usedById], references: [users.id] }),
}));

// ─── Database Instance ──────────────────────────────────────────────────────

export const passkeyRelations = relations(passkey, ({ one }) => ({
  user: one(users, { fields: [passkey.userId], references: [users.id] }),
}));

export const schemaExports = {
  titles, providers, offers, scores, titleGenres, episodes, users, sessions, account, verification, passkey, settings, tracked, watchedEpisodes, watchedTitles, notifiers, oidcStates, jobs, cronJobs, userSubscribedProviders,
  follows, ratings, episodeRatings, recommendations, recommendationReads, invitations, integrations, plexLibraryItems, titleTags,
  watchHistory, streamingAlerts, activityKindVisibility, hiddenActivityEvents, notificationLog,
  titlesRelations, providersRelations, offersRelations, scoresRelations, titleGenresRelations, episodesRelations,
  passkeyRelations,
  usersRelations, sessionsRelations, accountRelations, trackedRelations, watchedEpisodesRelations, watchedTitlesRelations, notifiersRelations,
  followsRelations, ratingsRelations, episodeRatingsRelations, recommendationsRelations, recommendationReadsRelations, invitationsRelations,
  integrationsRelations, plexLibraryItemsRelations, notificationLogRelations,
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
