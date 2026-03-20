import { describe, it, expect, beforeEach, afterAll } from "bun:test";
import { setupTestDb, teardownTestDb } from "../test-utils/setup";
import { getRawDb } from "./bun-db";
import { makeParsedTitle, makeParsedOffer } from "../test-utils/fixtures";
import {
  upsertTitles,
  getTitleById,
  getRecentTitles,
  getOffersForTitle,
  getOffersForTitles,
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
  createNotifier,
  getNotifiersByUser,
  getNotifierById,
  getDueNotifiers,
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
  it("inserts titles into the database", async () => {
    const title = makeParsedTitle();
    const count = await upsertTitles([title]);
    expect(count).toBe(1);

    const result = await getTitleById("movie-123");
    expect(result).not.toBeNull();
    expect(result!.title).toBe("Test Movie");
    expect(result!.object_type).toBe("MOVIE");
  });

  it("upserts titles on conflict", async () => {
    await upsertTitles([makeParsedTitle({ title: "Original" })]);
    await upsertTitles([makeParsedTitle({ title: "Updated" })]);

    const result = await getTitleById("movie-123");
    expect(result!.title).toBe("Updated");
  });

  it("stores and retrieves original_title", async () => {
    await upsertTitles([makeParsedTitle({ originalTitle: "Film Original" })]);
    const result = await getTitleById("movie-123");
    expect(result!.original_title).toBe("Film Original");
  });

  it("stores null original_title when not provided", async () => {
    await upsertTitles([makeParsedTitle({ originalTitle: null })]);
    const result = await getTitleById("movie-123");
    expect(result!.original_title).toBeNull();
  });

  it("stores and retrieves original_language", async () => {
    await upsertTitles([makeParsedTitle({ originalLanguage: "ja" })]);
    const result = await getTitleById("movie-123");
    expect(result!.original_language).toBe("ja");
  });

  it("stores null original_language when not provided", async () => {
    await upsertTitles([makeParsedTitle({ originalLanguage: null })]);
    const result = await getTitleById("movie-123");
    expect(result!.original_language).toBeNull();
  });

  it("upserts providers and offers", async () => {
    const title = makeParsedTitle({
      offers: [
        makeParsedOffer({ providerId: 8, providerName: "Netflix" }),
      ],
    });
    await upsertTitles([title]);

    const offers = await getOffersForTitle("movie-123");
    expect(offers).toHaveLength(1);
    expect(offers[0].provider_name).toBe("Netflix");
  });

  it("batch-fetches offers for multiple titles", async () => {
    await upsertTitles([
      makeParsedTitle({
        id: "movie-1",
        title: "Movie One",
        offers: [makeParsedOffer({ titleId: "movie-1", providerId: 8, providerName: "Netflix" })],
      }),
      makeParsedTitle({
        id: "movie-2",
        title: "Movie Two",
        offers: [makeParsedOffer({ titleId: "movie-2", providerId: 337, providerName: "Disney Plus" })],
      }),
      makeParsedTitle({
        id: "movie-3",
        title: "Movie Three",
        offers: [],
      }),
    ]);

    const offerMap = await getOffersForTitles(["movie-1", "movie-2", "movie-3"]);
    expect(offerMap.get("movie-1")).toHaveLength(1);
    expect(offerMap.get("movie-1")![0].provider_name).toBe("Netflix");
    expect(offerMap.get("movie-2")).toHaveLength(1);
    expect(offerMap.get("movie-2")![0].provider_name).toBe("Disney Plus");
    expect(offerMap.get("movie-3")).toBeUndefined();
  });

  it("returns empty map for empty titleIds", async () => {
    const offerMap = await getOffersForTitles([]);
    expect(offerMap.size).toBe(0);
  });

  it("upserts scores", async () => {
    await upsertTitles([makeParsedTitle({ scores: { imdbScore: 8.0, imdbVotes: 5000, tmdbScore: 7.5 } })]);
    const result = await getTitleById("movie-123");
    expect(result!.imdb_score).toBe(8.0);
    expect(result!.tmdb_score).toBe(7.5);
  });

  it("replaces offers on re-upsert", async () => {
    await upsertTitles([makeParsedTitle({ offers: [makeParsedOffer({ providerId: 8 })] })]);
    await upsertTitles([makeParsedTitle({ offers: [makeParsedOffer({ providerId: 337, providerName: "Disney" })] })]);

    const offers = await getOffersForTitle("movie-123");
    expect(offers).toHaveLength(1);
    expect(offers[0].provider_id).toBe(337);
  });
});

// ─── Title Queries ──────────────────────────────────────────────────────────

describe("getTitleById", () => {
  it("returns null for non-existent title", async () => {
    expect(await getTitleById("nonexistent")).toBeNull();
  });

  it("returns title with parsed genres", async () => {
    await upsertTitles([makeParsedTitle({ genres: ["Action", "Comedy"] })]);
    const result = await getTitleById("movie-123");
    expect(result!.genres).toEqual(["Action", "Comedy"]);
  });

  it("returns is_tracked=false without user", async () => {
    await upsertTitles([makeParsedTitle()]);
    const result = await getTitleById("movie-123");
    expect(result!.is_tracked).toBe(false);
  });

  it("returns is_tracked=true when user has tracked", async () => {
    await upsertTitles([makeParsedTitle()]);
    const userId = await createUser("testuser", "hash");
    await trackTitle("movie-123", userId);

    const result = await getTitleById("movie-123", userId);
    expect(result!.is_tracked).toBe(true);
  });
});

describe("getRecentTitles", () => {
  it("returns titles sorted by release date desc", async () => {
    await upsertTitles([
      makeParsedTitle({ id: "movie-1", title: "Old", releaseDate: "2020-01-01", releaseYear: 2020 }),
      makeParsedTitle({ id: "movie-2", title: "New", releaseDate: "2025-01-01", releaseYear: 2025 }),
    ]);
    const results = await getRecentTitles({ daysBack: 0 });
    expect(results).toHaveLength(2);
    expect(results[0].title).toBe("New");
  });

  it("includes offers via batch fetch", async () => {
    await upsertTitles([
      makeParsedTitle({
        id: "movie-1",
        releaseDate: "2025-01-01",
        offers: [makeParsedOffer({ titleId: "movie-1", providerId: 8, providerName: "Netflix" })],
      }),
      makeParsedTitle({
        id: "movie-2",
        title: "No Offers",
        releaseDate: "2025-01-02",
        offers: [],
      }),
    ]);
    const results = await getRecentTitles({ daysBack: 0 });
    expect(results).toHaveLength(2);
    const withOffers = results.find((r) => r.id === "movie-1")!;
    const withoutOffers = results.find((r) => r.id === "movie-2")!;
    expect(withOffers.offers).toHaveLength(1);
    expect(withOffers.offers[0].provider_name).toBe("Netflix");
    expect(withoutOffers.offers).toEqual([]);
  });

  it("filters by objectType", async () => {
    await upsertTitles([
      makeParsedTitle({ id: "movie-1", objectType: "MOVIE", releaseDate: "2025-01-01" }),
      makeParsedTitle({ id: "tv-1", objectType: "SHOW", title: "Show", releaseDate: "2025-01-01" }),
    ]);
    const results = await getRecentTitles({ daysBack: 0, objectTypes: ["SHOW"] });
    expect(results).toHaveLength(1);
    expect(results[0].object_type).toBe("SHOW");
  });

  it("respects limit and offset", async () => {
    await upsertTitles([
      makeParsedTitle({ id: "movie-1", releaseDate: "2025-01-01" }),
      makeParsedTitle({ id: "movie-2", title: "Movie 2", releaseDate: "2025-01-02" }),
      makeParsedTitle({ id: "movie-3", title: "Movie 3", releaseDate: "2025-01-03" }),
    ]);
    const results = await getRecentTitles({ daysBack: 0, limit: 1, offset: 1 });
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe("movie-2");
  });

  it("filters by genre", async () => {
    await upsertTitles([
      makeParsedTitle({ id: "movie-1", genres: ["Action", "Drama"], releaseDate: "2025-01-01" }),
      makeParsedTitle({ id: "movie-2", title: "Comedy Film", genres: ["Comedy"], releaseDate: "2025-01-02" }),
    ]);
    const results = await getRecentTitles({ daysBack: 0, genres: ["Comedy"] });
    expect(results).toHaveLength(1);
    expect(results[0].title).toBe("Comedy Film");
  });

  it("filters by language", async () => {
    await upsertTitles([
      makeParsedTitle({ id: "movie-1", originalLanguage: "en", releaseDate: "2025-01-01" }),
      makeParsedTitle({ id: "movie-2", title: "Japanese Movie", originalLanguage: "ja", releaseDate: "2025-01-02" }),
    ]);
    const results = await getRecentTitles({ daysBack: 0, languages: ["ja"] });
    expect(results).toHaveLength(1);
    expect(results[0].title).toBe("Japanese Movie");
  });

  it("combines genre and language filters", async () => {
    await upsertTitles([
      makeParsedTitle({ id: "movie-1", genres: ["Action"], originalLanguage: "en", releaseDate: "2025-01-01" }),
      makeParsedTitle({ id: "movie-2", title: "Korean Action", genres: ["Action"], originalLanguage: "ko", releaseDate: "2025-01-02" }),
      makeParsedTitle({ id: "movie-3", title: "Korean Drama", genres: ["Drama"], originalLanguage: "ko", releaseDate: "2025-01-03" }),
    ]);
    const results = await getRecentTitles({ daysBack: 0, genres: ["Action"], languages: ["ko"] });
    expect(results).toHaveLength(1);
    expect(results[0].title).toBe("Korean Action");
  });

  it("excludes tracked titles when excludeTracked is true", async () => {
    await upsertTitles([
      makeParsedTitle({ id: "movie-1", title: "Tracked Movie", releaseDate: "2025-01-01" }),
      makeParsedTitle({ id: "movie-2", title: "Untracked Movie", releaseDate: "2025-01-02" }),
    ]);
    const userId = await createUser("testuser", "hash");
    await trackTitle("movie-1", userId);

    const results = await getRecentTitles({ daysBack: 0, excludeTracked: true }, userId);
    expect(results).toHaveLength(1);
    expect(results[0].title).toBe("Untracked Movie");
  });

  it("includes tracked titles when excludeTracked is false", async () => {
    await upsertTitles([
      makeParsedTitle({ id: "movie-1", title: "Tracked Movie", releaseDate: "2025-01-01" }),
      makeParsedTitle({ id: "movie-2", title: "Untracked Movie", releaseDate: "2025-01-02" }),
    ]);
    const userId = await createUser("testuser", "hash");
    await trackTitle("movie-1", userId);

    const results = await getRecentTitles({ daysBack: 0, excludeTracked: false }, userId);
    expect(results).toHaveLength(2);
  });

  it("ignores excludeTracked when no userId is provided", async () => {
    await upsertTitles([
      makeParsedTitle({ id: "movie-1", releaseDate: "2025-01-01" }),
      makeParsedTitle({ id: "movie-2", title: "Movie 2", releaseDate: "2025-01-02" }),
    ]);
    const results = await getRecentTitles({ daysBack: 0, excludeTracked: true });
    expect(results).toHaveLength(2);
  });
});

describe("getGenres", () => {
  it("returns distinct genres sorted alphabetically", async () => {
    await upsertTitles([
      makeParsedTitle({ id: "movie-1", genres: ["Drama", "Action"] }),
      makeParsedTitle({ id: "movie-2", genres: ["Comedy", "Action"] }),
    ]);
    const genres = await getGenres();
    expect(genres).toEqual(["Action", "Comedy", "Drama"]);
  });

  it("returns empty array when no titles exist", async () => {
    expect(await getGenres()).toEqual([]);
  });
});

describe("getLanguages", () => {
  it("returns distinct languages sorted", async () => {
    await upsertTitles([
      makeParsedTitle({ id: "movie-1", originalLanguage: "ja" }),
      makeParsedTitle({ id: "movie-2", originalLanguage: "en" }),
      makeParsedTitle({ id: "movie-3", originalLanguage: "en" }),
    ]);
    const languages = await getLanguages();
    expect(languages).toEqual(["en", "ja"]);
  });

  it("excludes null languages", async () => {
    await upsertTitles([
      makeParsedTitle({ id: "movie-1", originalLanguage: null }),
      makeParsedTitle({ id: "movie-2", originalLanguage: "en" }),
    ]);
    const languages = await getLanguages();
    expect(languages).toEqual(["en"]);
  });
});

describe("searchLocalTitles", () => {
  it("finds titles by partial name match", async () => {
    await upsertTitles([
      makeParsedTitle({ id: "movie-1", title: "The Dark Knight" }),
      makeParsedTitle({ id: "movie-2", title: "Batman Begins" }),
    ]);
    const results = await searchLocalTitles("Dark");
    expect(results).toHaveLength(1);
    expect(results[0].title).toBe("The Dark Knight");
  });

  it("returns empty for no matches", async () => {
    await upsertTitles([makeParsedTitle()]);
    expect(await searchLocalTitles("NonExistent")).toHaveLength(0);
  });
});

// ─── Tracking ───────────────────────────────────────────────────────────────

describe("tracking", () => {
  it("tracks and untracks a title", async () => {
    await upsertTitles([makeParsedTitle()]);
    const userId = await createUser("testuser", "hash");

    await trackTitle("movie-123", userId);
    let tracked = await getTrackedTitles(userId);
    expect(tracked).toHaveLength(1);
    expect(tracked[0].is_tracked).toBe(true);

    await untrackTitle("movie-123", userId);
    tracked = await getTrackedTitles(userId);
    expect(tracked).toHaveLength(0);
  });

  it("tracking is idempotent", async () => {
    await upsertTitles([makeParsedTitle()]);
    const userId = await createUser("testuser", "hash");

    await trackTitle("movie-123", userId);
    await trackTitle("movie-123", userId);
    expect(await getTrackedTitles(userId)).toHaveLength(1);
  });

  it("updates notes on re-track", async () => {
    await upsertTitles([makeParsedTitle()]);
    const userId = await createUser("testuser", "hash");

    await trackTitle("movie-123", userId, "first note");
    await trackTitle("movie-123", userId, "updated note");

    const tracked = await getTrackedTitles(userId);
    expect(tracked[0].notes).toBe("updated note");
  });

  it("getTrackedTitleIds returns set of tracked title IDs", async () => {
    await upsertTitles([makeParsedTitle({ id: "movie-1" }), makeParsedTitle({ id: "movie-2" })]);
    const userId = await createUser("testuser", "hash");

    await trackTitle("movie-1", userId);
    await trackTitle("movie-2", userId);

    const ids = await getTrackedTitleIds(userId);
    expect(ids).toBeInstanceOf(Set);
    expect(ids.size).toBe(2);
    expect(ids.has("movie-1")).toBe(true);
    expect(ids.has("movie-2")).toBe(true);
    expect(ids.has("movie-999")).toBe(false);
  });

  it("getTrackedTitleIds returns empty set for user with no tracked titles", async () => {
    const userId = await createUser("testuser", "hash");
    const ids = await getTrackedTitleIds(userId);
    expect(ids.size).toBe(0);
  });
});

// ─── Users ──────────────────────────────────────────────────────────────────

describe("users", () => {
  it("creates and retrieves a user by username", async () => {
    const userId = await createUser("alice", "hash123", "Alice");
    const user = await getUserByUsername("alice");

    expect(user).not.toBeNull();
    expect(user!.id).toBe(userId);
    expect(user!.username).toBe("alice");
    expect(user!.display_name).toBe("Alice");
    expect(user!.is_admin).toBe(0);
  });

  it("retrieves user by ID", async () => {
    const userId = await createUser("bob", "hash");
    const user = await getUserById(userId);
    expect(user).not.toBeNull();
    expect(user!.username).toBe("bob");
  });

  it("returns null for non-existent user", async () => {
    expect(await getUserByUsername("nonexistent")).toBeNull();
    expect(await getUserById("nonexistent")).toBeNull();
  });

  it("creates admin user", async () => {
    await createUser("admin", "hash", undefined, "local", undefined, true);
    const user = await getUserByUsername("admin");
    expect(user!.is_admin).toBe(1);
  });

  it("counts users", async () => {
    expect(await getUserCount()).toBe(0);
    await createUser("user1", "hash");
    await createUser("user2", "hash");
    expect(await getUserCount()).toBe(2);
  });

  it("updates password", async () => {
    const userId = await createUser("user", "oldhash");
    await updateUserPassword(userId, "newhash");
    const user = await getUserById(userId);
    expect(user!.password_hash).toBe("newhash");
  });

  it("updates admin status", async () => {
    const userId = await createUser("user", "hash");
    await updateUserAdmin(userId, true);
    expect((await getUserById(userId))!.is_admin).toBe(1);

    await updateUserAdmin(userId, false);
    expect((await getUserById(userId))!.is_admin).toBe(0);
  });

  it("finds user by provider subject", async () => {
    await createUser("oidcuser", null, "OIDC User", "oidc", "subject-123");
    const user = await getUserByProviderSubject("oidc", "subject-123");
    expect(user).not.toBeNull();
    expect(user!.username).toBe("oidcuser");
  });
});

// ─── Sessions ───────────────────────────────────────────────────────────────

describe("sessions", () => {
  it("creates session and retrieves user", async () => {
    const userId = await createUser("sessionuser", "hash", "Session User");
    const token = await createSession(userId);

    const session = await getSessionWithUser(token);
    expect(session).not.toBeNull();
    expect(session!.id).toBe(userId);
    expect(session!.username).toBe("sessionuser");
  });

  it("returns null for invalid token", async () => {
    expect(await getSessionWithUser("invalid-token")).toBeNull();
  });

  it("deletes session", async () => {
    const userId = await createUser("user", "hash");
    const token = await createSession(userId);

    await deleteSession(token);
    expect(await getSessionWithUser(token)).toBeNull();
  });

  it("returns is_admin as boolean", async () => {
    const userId = await createUser("admin", "hash", undefined, "local", undefined, true);
    const token = await createSession(userId);
    const session = await getSessionWithUser(token);
    expect(session!.is_admin).toBe(true);
  });
});

// ─── Settings ───────────────────────────────────────────────────────────────

describe("settings", () => {
  it("get/set/delete settings", async () => {
    expect(await getSetting("key1")).toBeNull();

    await setSetting("key1", "value1");
    expect(await getSetting("key1")).toBe("value1");

    await setSetting("key1", "updated");
    expect(await getSetting("key1")).toBe("updated");

    await deleteSetting("key1");
    expect(await getSetting("key1")).toBeNull();
  });

  it("gets settings by prefix", async () => {
    await setSetting("oidc_issuer", "https://auth.example.com");
    await setSetting("oidc_client_id", "my-client");
    await setSetting("other_key", "other");

    const result = await getSettingsByPrefix("oidc_");
    expect(Object.keys(result)).toHaveLength(2);
    expect(result["oidc_issuer"]).toBe("https://auth.example.com");
    expect(result["oidc_client_id"]).toBe("my-client");
  });
});

// ─── OIDC Config ────────────────────────────────────────────────────────────

describe("OIDC config", () => {
  it("returns empty config when nothing set", async () => {
    const savedConfig = { ...CONFIG };
    CONFIG.OIDC_ISSUER_URL = "";
    CONFIG.OIDC_CLIENT_ID = "";
    CONFIG.OIDC_CLIENT_SECRET = "";
    CONFIG.OIDC_REDIRECT_URI = "";
    CONFIG.OIDC_ADMIN_CLAIM = "";
    CONFIG.OIDC_ADMIN_VALUE = "";

    const config = await getOidcConfig();
    expect(config.issuerUrl).toBe("");
    expect(await isOidcConfigured()).toBe(false);

    Object.assign(CONFIG, savedConfig);
  });

  it("prefers env vars over DB settings", async () => {
    const savedConfig = { ...CONFIG };
    CONFIG.OIDC_ISSUER_URL = "https://env.example.com";
    CONFIG.OIDC_CLIENT_ID = "env-client";
    CONFIG.OIDC_CLIENT_SECRET = "env-secret";

    await setSetting("oidc_issuer_url", "https://db.example.com");

    const config = await getOidcConfig();
    expect(config.issuerUrl).toBe("https://env.example.com");
    expect(await isOidcConfigured()).toBe(true);

    Object.assign(CONFIG, savedConfig);
  });

  it("falls back to DB settings", async () => {
    const savedConfig = { ...CONFIG };
    CONFIG.OIDC_ISSUER_URL = "";
    CONFIG.OIDC_CLIENT_ID = "";
    CONFIG.OIDC_CLIENT_SECRET = "";

    await setSetting("oidc_issuer_url", "https://db.example.com");
    await setSetting("oidc_client_id", "db-client");
    await setSetting("oidc_client_secret", "db-secret");

    const config = await getOidcConfig();
    expect(config.issuerUrl).toBe("https://db.example.com");
    expect(await isOidcConfigured()).toBe(true);

    Object.assign(CONFIG, savedConfig);
  });
});

// ─── Episodes ───────────────────────────────────────────────────────────────

describe("episodes", () => {
  it("upserts and deletes episodes", async () => {
    await upsertTitles([makeParsedTitle({ id: "tv-1", objectType: "SHOW" })]);

    const count = await upsertEpisodes([
      { title_id: "tv-1", season_number: 1, episode_number: 1, name: "Pilot", overview: null, air_date: "2024-01-01", still_path: null },
      { title_id: "tv-1", season_number: 1, episode_number: 2, name: "Episode 2", overview: null, air_date: "2024-01-08", still_path: null },
    ]);
    expect(count).toBe(2);

    await deleteEpisodesForTitle("tv-1");
    // After delete, no episodes should exist — verify via upsert working again without conflicts
    const count2 = await upsertEpisodes([
      { title_id: "tv-1", season_number: 1, episode_number: 1, name: "New Pilot", overview: null, air_date: "2024-01-01", still_path: null },
    ]);
    expect(count2).toBe(1);
  });

  it("upserts episodes on conflict", async () => {
    await upsertTitles([makeParsedTitle({ id: "tv-1", objectType: "SHOW" })]);

    await upsertEpisodes([
      { title_id: "tv-1", season_number: 1, episode_number: 1, name: "Original", overview: null, air_date: "2024-01-01", still_path: null },
    ]);
    await upsertEpisodes([
      { title_id: "tv-1", season_number: 1, episode_number: 1, name: "Updated", overview: null, air_date: "2024-01-01", still_path: null },
    ]);

    const row = getRawDb().prepare(
      "SELECT count(*) as cnt FROM episodes WHERE title_id = 'tv-1' AND season_number = 1 AND episode_number = 1"
    ).get() as { cnt: number };
    expect(row.cnt).toBe(1);

    // Also verify the upsert updated the name
    const ep = getRawDb().prepare(
      "SELECT name FROM episodes WHERE title_id = 'tv-1' AND season_number = 1 AND episode_number = 1"
    ).get() as { name: string };
    expect(ep.name).toBe("Updated");
  });
});

// ─── Watched Episodes ───────────────────────────────────────────────────────

describe("watched episodes", () => {
  it("watches and unwatches an episode", async () => {
    await upsertTitles([makeParsedTitle({ id: "tv-1", objectType: "SHOW" })]);
    await upsertEpisodes([
      { title_id: "tv-1", season_number: 1, episode_number: 1, name: "Ep1", overview: null, air_date: "2024-01-01", still_path: null },
    ]);
    const userId = await createUser("user", "hash");

    // Watch is idempotent
    await watchEpisode(1, userId);
    await watchEpisode(1, userId);

    // Unwatch
    await unwatchEpisode(1, userId);
    // Should not throw
    await unwatchEpisode(1, userId);
  });

  it("bulk watch and unwatch", async () => {
    await upsertTitles([makeParsedTitle({ id: "tv-1", objectType: "SHOW" })]);
    await upsertEpisodes([
      { title_id: "tv-1", season_number: 1, episode_number: 1, name: "Ep1", overview: null, air_date: "2024-01-01", still_path: null },
      { title_id: "tv-1", season_number: 1, episode_number: 2, name: "Ep2", overview: null, air_date: "2024-01-08", still_path: null },
    ]);
    const userId = await createUser("user", "hash");

    await watchEpisodesBulk([1, 2], userId);
    await unwatchEpisodesBulk([1, 2], userId);
    // Should not throw
  });
});

// ─── Providers ──────────────────────────────────────────────────────────────

describe("getProviders", () => {
  it("returns providers sorted by name", async () => {
    await upsertTitles([
      makeParsedTitle({
        offers: [
          makeParsedOffer({ providerId: 337, providerName: "Disney Plus" }),
          makeParsedOffer({ providerId: 8, providerName: "Netflix" }),
        ],
      }),
    ]);
    const providers = await getProviders();
    expect(providers).toHaveLength(2);
    expect(providers[0].name).toBe("Disney Plus");
    expect(providers[1].name).toBe("Netflix");
  });
});

// ─── Notifier JSON.parse error handling ─────────────────────────────────────

describe("notifier config parsing", () => {
  async function createTestUser() {
    return await createUser("testuser", "hash123");
  }

  function corruptNotifierConfig(notifierId: string) {
    const raw = getRawDb();
    raw.prepare("UPDATE notifiers SET config = '{invalid json' WHERE id = ?").run(notifierId);
  }

  it("getNotifiersByUser returns empty config for corrupted JSON", async () => {
    const userId = await createTestUser();
    const id = await createNotifier(userId, "email", "Test", { url: "http://example.com" }, "09:00", "UTC");
    corruptNotifierConfig(id);

    const notifiers = await getNotifiersByUser(userId);
    expect(notifiers).toHaveLength(1);
    expect(notifiers[0].config).toEqual({});
  });

  it("getNotifierById returns empty config for corrupted JSON", async () => {
    const userId = await createTestUser();
    const id = await createNotifier(userId, "email", "Test", { url: "http://example.com" }, "09:00", "UTC");
    corruptNotifierConfig(id);

    const notifier = await getNotifierById(id, userId);
    expect(notifier).not.toBeNull();
    expect(notifier!.config).toEqual({});
  });

  it("getDueNotifiers returns empty config for corrupted JSON", async () => {
    const userId = await createTestUser();
    const id = await createNotifier(userId, "email", "Test", { url: "http://example.com" }, "09:00", "UTC");
    corruptNotifierConfig(id);

    const timesByTimezone = new Map([
      ["UTC", { time: "09:00", date: "2026-03-15" }],
    ]);
    const due = await getDueNotifiers(timesByTimezone);
    expect(due).toHaveLength(1);
    expect(due[0].config).toEqual({});
  });

  it("getNotifiersByUser parses valid config correctly", async () => {
    const userId = await createTestUser();
    await createNotifier(userId, "email", "Test", { url: "http://example.com" }, "09:00", "UTC");

    const notifiers = await getNotifiersByUser(userId);
    expect(notifiers).toHaveLength(1);
    expect(notifiers[0].config).toEqual({ url: "http://example.com" });
  });
});
