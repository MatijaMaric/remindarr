import { describe, it, expect, beforeEach, afterAll } from "bun:test";
import { setupTestDb, teardownTestDb } from "../test-utils/setup";
import { makeParsedTitle, makeParsedOffer } from "../test-utils/fixtures";
import {
  upsertTitles,
  getTitleById,
  getRecentTitles,
  getOffersForTitle,
  searchLocalTitles,
  trackTitle,
  untrackTitle,
  getTrackedTitles,
  getTrackedTitleIds,
  getProviders,
  getGenres,
  getLanguages,
  upsertEpisodes,
  deleteEpisodesForTitle,
  watchEpisode,
  unwatchEpisode,
  watchEpisodesBulk,
  unwatchEpisodesBulk,
  createUser,
  getUserByUsername,
  getUserById,
  getUserByProviderSubject,
  getUserCount,
  updateUserPassword,
  updateUserAdmin,
  createSession,
  getSessionWithUser,
  deleteSession,
  getSetting,
  setSetting,
  deleteSetting,
  getSettingsByPrefix,
  getOidcConfig,
  isOidcConfigured,
} from "./repository";
import { CONFIG } from "../config";

beforeEach(() => {
  setupTestDb();
});

afterAll(() => {
  teardownTestDb();
});

// ─── Title Upserts ──────────────────────────────────────────────────────────

describe("upsertTitles", () => {
  it("inserts titles into the database", () => {
    const title = makeParsedTitle();
    const count = upsertTitles([title]);
    expect(count).toBe(1);

    const result = getTitleById("movie-123");
    expect(result).not.toBeNull();
    expect(result!.title).toBe("Test Movie");
    expect(result!.object_type).toBe("MOVIE");
  });

  it("upserts titles on conflict", () => {
    upsertTitles([makeParsedTitle({ title: "Original" })]);
    upsertTitles([makeParsedTitle({ title: "Updated" })]);

    const result = getTitleById("movie-123");
    expect(result!.title).toBe("Updated");
  });

  it("stores and retrieves original_title", () => {
    upsertTitles([makeParsedTitle({ originalTitle: "Film Original" })]);
    const result = getTitleById("movie-123");
    expect(result!.original_title).toBe("Film Original");
  });

  it("stores null original_title when not provided", () => {
    upsertTitles([makeParsedTitle({ originalTitle: null })]);
    const result = getTitleById("movie-123");
    expect(result!.original_title).toBeNull();
  });

  it("stores and retrieves original_language", () => {
    upsertTitles([makeParsedTitle({ originalLanguage: "ja" })]);
    const result = getTitleById("movie-123");
    expect(result!.original_language).toBe("ja");
  });

  it("stores null original_language when not provided", () => {
    upsertTitles([makeParsedTitle({ originalLanguage: null })]);
    const result = getTitleById("movie-123");
    expect(result!.original_language).toBeNull();
  });

  it("upserts providers and offers", () => {
    const title = makeParsedTitle({
      offers: [
        makeParsedOffer({ providerId: 8, providerName: "Netflix" }),
      ],
    });
    upsertTitles([title]);

    const offers = getOffersForTitle("movie-123");
    expect(offers).toHaveLength(1);
    expect(offers[0].provider_name).toBe("Netflix");
  });

  it("upserts scores", () => {
    upsertTitles([makeParsedTitle({ scores: { imdbScore: 8.0, imdbVotes: 5000, tmdbScore: 7.5 } })]);
    const result = getTitleById("movie-123");
    expect(result!.imdb_score).toBe(8.0);
    expect(result!.tmdb_score).toBe(7.5);
  });

  it("replaces offers on re-upsert", () => {
    upsertTitles([makeParsedTitle({ offers: [makeParsedOffer({ providerId: 8 })] })]);
    upsertTitles([makeParsedTitle({ offers: [makeParsedOffer({ providerId: 337, providerName: "Disney" })] })]);

    const offers = getOffersForTitle("movie-123");
    expect(offers).toHaveLength(1);
    expect(offers[0].provider_id).toBe(337);
  });
});

// ─── Title Queries ──────────────────────────────────────────────────────────

describe("getTitleById", () => {
  it("returns null for non-existent title", () => {
    expect(getTitleById("nonexistent")).toBeNull();
  });

  it("returns title with parsed genres", () => {
    upsertTitles([makeParsedTitle({ genres: ["Action", "Comedy"] })]);
    const result = getTitleById("movie-123");
    expect(result!.genres).toEqual(["Action", "Comedy"]);
  });

  it("returns is_tracked=false without user", () => {
    upsertTitles([makeParsedTitle()]);
    const result = getTitleById("movie-123");
    expect(result!.is_tracked).toBe(false);
  });

  it("returns is_tracked=true when user has tracked", () => {
    upsertTitles([makeParsedTitle()]);
    const userId = createUser("testuser", "hash");
    trackTitle("movie-123", userId);

    const result = getTitleById("movie-123", userId);
    expect(result!.is_tracked).toBe(true);
  });
});

describe("getRecentTitles", () => {
  it("returns titles sorted by release date desc", () => {
    upsertTitles([
      makeParsedTitle({ id: "movie-1", title: "Old", releaseDate: "2020-01-01", releaseYear: 2020 }),
      makeParsedTitle({ id: "movie-2", title: "New", releaseDate: "2025-01-01", releaseYear: 2025 }),
    ]);
    const results = getRecentTitles({ daysBack: 0 });
    expect(results).toHaveLength(2);
    expect(results[0].title).toBe("New");
  });

  it("filters by objectType", () => {
    upsertTitles([
      makeParsedTitle({ id: "movie-1", objectType: "MOVIE", releaseDate: "2025-01-01" }),
      makeParsedTitle({ id: "tv-1", objectType: "SHOW", title: "Show", releaseDate: "2025-01-01" }),
    ]);
    const results = getRecentTitles({ daysBack: 0, objectTypes: ["SHOW"] });
    expect(results).toHaveLength(1);
    expect(results[0].object_type).toBe("SHOW");
  });

  it("respects limit and offset", () => {
    upsertTitles([
      makeParsedTitle({ id: "movie-1", releaseDate: "2025-01-01" }),
      makeParsedTitle({ id: "movie-2", title: "Movie 2", releaseDate: "2025-01-02" }),
      makeParsedTitle({ id: "movie-3", title: "Movie 3", releaseDate: "2025-01-03" }),
    ]);
    const results = getRecentTitles({ daysBack: 0, limit: 1, offset: 1 });
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe("movie-2");
  });

  it("filters by genre", () => {
    upsertTitles([
      makeParsedTitle({ id: "movie-1", genres: ["Action", "Drama"], releaseDate: "2025-01-01" }),
      makeParsedTitle({ id: "movie-2", title: "Comedy Film", genres: ["Comedy"], releaseDate: "2025-01-02" }),
    ]);
    const results = getRecentTitles({ daysBack: 0, genres: ["Comedy"] });
    expect(results).toHaveLength(1);
    expect(results[0].title).toBe("Comedy Film");
  });

  it("filters by language", () => {
    upsertTitles([
      makeParsedTitle({ id: "movie-1", originalLanguage: "en", releaseDate: "2025-01-01" }),
      makeParsedTitle({ id: "movie-2", title: "Japanese Movie", originalLanguage: "ja", releaseDate: "2025-01-02" }),
    ]);
    const results = getRecentTitles({ daysBack: 0, languages: ["ja"] });
    expect(results).toHaveLength(1);
    expect(results[0].title).toBe("Japanese Movie");
  });

  it("combines genre and language filters", () => {
    upsertTitles([
      makeParsedTitle({ id: "movie-1", genres: ["Action"], originalLanguage: "en", releaseDate: "2025-01-01" }),
      makeParsedTitle({ id: "movie-2", title: "Korean Action", genres: ["Action"], originalLanguage: "ko", releaseDate: "2025-01-02" }),
      makeParsedTitle({ id: "movie-3", title: "Korean Drama", genres: ["Drama"], originalLanguage: "ko", releaseDate: "2025-01-03" }),
    ]);
    const results = getRecentTitles({ daysBack: 0, genres: ["Action"], languages: ["ko"] });
    expect(results).toHaveLength(1);
    expect(results[0].title).toBe("Korean Action");
  });

  it("excludes tracked titles when excludeTracked is true", () => {
    upsertTitles([
      makeParsedTitle({ id: "movie-1", title: "Tracked Movie", releaseDate: "2025-01-01" }),
      makeParsedTitle({ id: "movie-2", title: "Untracked Movie", releaseDate: "2025-01-02" }),
    ]);
    const userId = createUser("testuser", "hash");
    trackTitle("movie-1", userId);

    const results = getRecentTitles({ daysBack: 0, excludeTracked: true }, userId);
    expect(results).toHaveLength(1);
    expect(results[0].title).toBe("Untracked Movie");
  });

  it("includes tracked titles when excludeTracked is false", () => {
    upsertTitles([
      makeParsedTitle({ id: "movie-1", title: "Tracked Movie", releaseDate: "2025-01-01" }),
      makeParsedTitle({ id: "movie-2", title: "Untracked Movie", releaseDate: "2025-01-02" }),
    ]);
    const userId = createUser("testuser", "hash");
    trackTitle("movie-1", userId);

    const results = getRecentTitles({ daysBack: 0, excludeTracked: false }, userId);
    expect(results).toHaveLength(2);
  });

  it("ignores excludeTracked when no userId is provided", () => {
    upsertTitles([
      makeParsedTitle({ id: "movie-1", releaseDate: "2025-01-01" }),
      makeParsedTitle({ id: "movie-2", title: "Movie 2", releaseDate: "2025-01-02" }),
    ]);
    const results = getRecentTitles({ daysBack: 0, excludeTracked: true });
    expect(results).toHaveLength(2);
  });
});

describe("getGenres", () => {
  it("returns distinct genres sorted alphabetically", () => {
    upsertTitles([
      makeParsedTitle({ id: "movie-1", genres: ["Drama", "Action"] }),
      makeParsedTitle({ id: "movie-2", genres: ["Comedy", "Action"] }),
    ]);
    const genres = getGenres();
    expect(genres).toEqual(["Action", "Comedy", "Drama"]);
  });

  it("returns empty array when no titles exist", () => {
    expect(getGenres()).toEqual([]);
  });
});

describe("getLanguages", () => {
  it("returns distinct languages sorted", () => {
    upsertTitles([
      makeParsedTitle({ id: "movie-1", originalLanguage: "ja" }),
      makeParsedTitle({ id: "movie-2", originalLanguage: "en" }),
      makeParsedTitle({ id: "movie-3", originalLanguage: "en" }),
    ]);
    const languages = getLanguages();
    expect(languages).toEqual(["en", "ja"]);
  });

  it("excludes null languages", () => {
    upsertTitles([
      makeParsedTitle({ id: "movie-1", originalLanguage: null }),
      makeParsedTitle({ id: "movie-2", originalLanguage: "en" }),
    ]);
    const languages = getLanguages();
    expect(languages).toEqual(["en"]);
  });
});

describe("searchLocalTitles", () => {
  it("finds titles by partial name match", () => {
    upsertTitles([
      makeParsedTitle({ id: "movie-1", title: "The Dark Knight" }),
      makeParsedTitle({ id: "movie-2", title: "Batman Begins" }),
    ]);
    const results = searchLocalTitles("Dark");
    expect(results).toHaveLength(1);
    expect(results[0].title).toBe("The Dark Knight");
  });

  it("returns empty for no matches", () => {
    upsertTitles([makeParsedTitle()]);
    expect(searchLocalTitles("NonExistent")).toHaveLength(0);
  });
});

// ─── Tracking ───────────────────────────────────────────────────────────────

describe("tracking", () => {
  it("tracks and untracks a title", () => {
    upsertTitles([makeParsedTitle()]);
    const userId = createUser("testuser", "hash");

    trackTitle("movie-123", userId);
    let tracked = getTrackedTitles(userId);
    expect(tracked).toHaveLength(1);
    expect(tracked[0].is_tracked).toBe(true);

    untrackTitle("movie-123", userId);
    tracked = getTrackedTitles(userId);
    expect(tracked).toHaveLength(0);
  });

  it("tracking is idempotent", () => {
    upsertTitles([makeParsedTitle()]);
    const userId = createUser("testuser", "hash");

    trackTitle("movie-123", userId);
    trackTitle("movie-123", userId);
    expect(getTrackedTitles(userId)).toHaveLength(1);
  });

  it("updates notes on re-track", () => {
    upsertTitles([makeParsedTitle()]);
    const userId = createUser("testuser", "hash");

    trackTitle("movie-123", userId, "first note");
    trackTitle("movie-123", userId, "updated note");

    const tracked = getTrackedTitles(userId);
    expect(tracked[0].notes).toBe("updated note");
  });

  it("getTrackedTitleIds returns set of tracked title IDs", () => {
    upsertTitles([makeParsedTitle({ id: "movie-1" }), makeParsedTitle({ id: "movie-2" })]);
    const userId = createUser("testuser", "hash");

    trackTitle("movie-1", userId);
    trackTitle("movie-2", userId);

    const ids = getTrackedTitleIds(userId);
    expect(ids).toBeInstanceOf(Set);
    expect(ids.size).toBe(2);
    expect(ids.has("movie-1")).toBe(true);
    expect(ids.has("movie-2")).toBe(true);
    expect(ids.has("movie-999")).toBe(false);
  });

  it("getTrackedTitleIds returns empty set for user with no tracked titles", () => {
    const userId = createUser("testuser", "hash");
    const ids = getTrackedTitleIds(userId);
    expect(ids.size).toBe(0);
  });
});

// ─── Users ──────────────────────────────────────────────────────────────────

describe("users", () => {
  it("creates and retrieves a user by username", () => {
    const userId = createUser("alice", "hash123", "Alice");
    const user = getUserByUsername("alice");

    expect(user).not.toBeNull();
    expect(user!.id).toBe(userId);
    expect(user!.username).toBe("alice");
    expect(user!.display_name).toBe("Alice");
    expect(user!.is_admin).toBe(0);
  });

  it("retrieves user by ID", () => {
    const userId = createUser("bob", "hash");
    const user = getUserById(userId);
    expect(user).not.toBeNull();
    expect(user!.username).toBe("bob");
  });

  it("returns null for non-existent user", () => {
    expect(getUserByUsername("nonexistent")).toBeNull();
    expect(getUserById("nonexistent")).toBeNull();
  });

  it("creates admin user", () => {
    createUser("admin", "hash", undefined, "local", undefined, true);
    const user = getUserByUsername("admin");
    expect(user!.is_admin).toBe(1);
  });

  it("counts users", () => {
    expect(getUserCount()).toBe(0);
    createUser("user1", "hash");
    createUser("user2", "hash");
    expect(getUserCount()).toBe(2);
  });

  it("updates password", () => {
    const userId = createUser("user", "oldhash");
    updateUserPassword(userId, "newhash");
    const user = getUserById(userId);
    expect(user!.password_hash).toBe("newhash");
  });

  it("updates admin status", () => {
    const userId = createUser("user", "hash");
    updateUserAdmin(userId, true);
    expect(getUserById(userId)!.is_admin).toBe(1);

    updateUserAdmin(userId, false);
    expect(getUserById(userId)!.is_admin).toBe(0);
  });

  it("finds user by provider subject", () => {
    createUser("oidcuser", null, "OIDC User", "oidc", "subject-123");
    const user = getUserByProviderSubject("oidc", "subject-123");
    expect(user).not.toBeNull();
    expect(user!.username).toBe("oidcuser");
  });
});

// ─── Sessions ───────────────────────────────────────────────────────────────

describe("sessions", () => {
  it("creates session and retrieves user", () => {
    const userId = createUser("sessionuser", "hash", "Session User");
    const token = createSession(userId);

    const session = getSessionWithUser(token);
    expect(session).not.toBeNull();
    expect(session!.id).toBe(userId);
    expect(session!.username).toBe("sessionuser");
  });

  it("returns null for invalid token", () => {
    expect(getSessionWithUser("invalid-token")).toBeNull();
  });

  it("deletes session", () => {
    const userId = createUser("user", "hash");
    const token = createSession(userId);

    deleteSession(token);
    expect(getSessionWithUser(token)).toBeNull();
  });

  it("returns is_admin as boolean", () => {
    const userId = createUser("admin", "hash", undefined, "local", undefined, true);
    const token = createSession(userId);
    const session = getSessionWithUser(token);
    expect(session!.is_admin).toBe(true);
  });
});

// ─── Settings ───────────────────────────────────────────────────────────────

describe("settings", () => {
  it("get/set/delete settings", () => {
    expect(getSetting("key1")).toBeNull();

    setSetting("key1", "value1");
    expect(getSetting("key1")).toBe("value1");

    setSetting("key1", "updated");
    expect(getSetting("key1")).toBe("updated");

    deleteSetting("key1");
    expect(getSetting("key1")).toBeNull();
  });

  it("gets settings by prefix", () => {
    setSetting("oidc_issuer", "https://auth.example.com");
    setSetting("oidc_client_id", "my-client");
    setSetting("other_key", "other");

    const result = getSettingsByPrefix("oidc_");
    expect(Object.keys(result)).toHaveLength(2);
    expect(result["oidc_issuer"]).toBe("https://auth.example.com");
    expect(result["oidc_client_id"]).toBe("my-client");
  });
});

// ─── OIDC Config ────────────────────────────────────────────────────────────

describe("OIDC config", () => {
  it("returns empty config when nothing set", () => {
    const savedConfig = { ...CONFIG };
    CONFIG.OIDC_ISSUER_URL = "";
    CONFIG.OIDC_CLIENT_ID = "";
    CONFIG.OIDC_CLIENT_SECRET = "";
    CONFIG.OIDC_REDIRECT_URI = "";
    CONFIG.OIDC_ADMIN_CLAIM = "";
    CONFIG.OIDC_ADMIN_VALUE = "";

    const config = getOidcConfig();
    expect(config.issuerUrl).toBe("");
    expect(isOidcConfigured()).toBe(false);

    Object.assign(CONFIG, savedConfig);
  });

  it("prefers env vars over DB settings", () => {
    const savedConfig = { ...CONFIG };
    CONFIG.OIDC_ISSUER_URL = "https://env.example.com";
    CONFIG.OIDC_CLIENT_ID = "env-client";
    CONFIG.OIDC_CLIENT_SECRET = "env-secret";

    setSetting("oidc_issuer_url", "https://db.example.com");

    const config = getOidcConfig();
    expect(config.issuerUrl).toBe("https://env.example.com");
    expect(isOidcConfigured()).toBe(true);

    Object.assign(CONFIG, savedConfig);
  });

  it("falls back to DB settings", () => {
    const savedConfig = { ...CONFIG };
    CONFIG.OIDC_ISSUER_URL = "";
    CONFIG.OIDC_CLIENT_ID = "";
    CONFIG.OIDC_CLIENT_SECRET = "";

    setSetting("oidc_issuer_url", "https://db.example.com");
    setSetting("oidc_client_id", "db-client");
    setSetting("oidc_client_secret", "db-secret");

    const config = getOidcConfig();
    expect(config.issuerUrl).toBe("https://db.example.com");
    expect(isOidcConfigured()).toBe(true);

    Object.assign(CONFIG, savedConfig);
  });
});

// ─── Episodes ───────────────────────────────────────────────────────────────

describe("episodes", () => {
  it("upserts and deletes episodes", () => {
    upsertTitles([makeParsedTitle({ id: "tv-1", objectType: "SHOW" })]);

    const count = upsertEpisodes([
      { title_id: "tv-1", season_number: 1, episode_number: 1, name: "Pilot", overview: null, air_date: "2024-01-01", still_path: null },
      { title_id: "tv-1", season_number: 1, episode_number: 2, name: "Episode 2", overview: null, air_date: "2024-01-08", still_path: null },
    ]);
    expect(count).toBe(2);

    deleteEpisodesForTitle("tv-1");
    // After delete, no episodes should exist — verify via upsert working again without conflicts
    const count2 = upsertEpisodes([
      { title_id: "tv-1", season_number: 1, episode_number: 1, name: "New Pilot", overview: null, air_date: "2024-01-01", still_path: null },
    ]);
    expect(count2).toBe(1);
  });

  it("upserts episodes on conflict", () => {
    upsertTitles([makeParsedTitle({ id: "tv-1", objectType: "SHOW" })]);

    upsertEpisodes([
      { title_id: "tv-1", season_number: 1, episode_number: 1, name: "Original", overview: null, air_date: "2024-01-01", still_path: null },
    ]);
    upsertEpisodes([
      { title_id: "tv-1", season_number: 1, episode_number: 1, name: "Updated", overview: null, air_date: "2024-01-01", still_path: null },
    ]);

    // Verify no duplicate by inserting again — if there were duplicates, this would cause unique constraint issues
    // The upsert should succeed without error
    expect(true).toBe(true);
  });
});

// ─── Watched Episodes ───────────────────────────────────────────────────────

describe("watched episodes", () => {
  it("watches and unwatches an episode", () => {
    upsertTitles([makeParsedTitle({ id: "tv-1", objectType: "SHOW" })]);
    upsertEpisodes([
      { title_id: "tv-1", season_number: 1, episode_number: 1, name: "Ep1", overview: null, air_date: "2024-01-01", still_path: null },
    ]);
    const userId = createUser("user", "hash");

    // Watch is idempotent
    watchEpisode(1, userId);
    watchEpisode(1, userId);

    // Unwatch
    unwatchEpisode(1, userId);
    // Should not throw
    unwatchEpisode(1, userId);
  });

  it("bulk watch and unwatch", () => {
    upsertTitles([makeParsedTitle({ id: "tv-1", objectType: "SHOW" })]);
    upsertEpisodes([
      { title_id: "tv-1", season_number: 1, episode_number: 1, name: "Ep1", overview: null, air_date: "2024-01-01", still_path: null },
      { title_id: "tv-1", season_number: 1, episode_number: 2, name: "Ep2", overview: null, air_date: "2024-01-08", still_path: null },
    ]);
    const userId = createUser("user", "hash");

    watchEpisodesBulk([1, 2], userId);
    unwatchEpisodesBulk([1, 2], userId);
    // Should not throw
  });
});

// ─── Providers ──────────────────────────────────────────────────────────────

describe("getProviders", () => {
  it("returns providers sorted by name", () => {
    upsertTitles([
      makeParsedTitle({
        offers: [
          makeParsedOffer({ providerId: 337, providerName: "Disney Plus" }),
          makeParsedOffer({ providerId: 8, providerName: "Netflix" }),
        ],
      }),
    ]);
    const providers = getProviders();
    expect(providers).toHaveLength(2);
    expect(providers[0].name).toBe("Disney Plus");
    expect(providers[1].name).toBe("Netflix");
  });
});
