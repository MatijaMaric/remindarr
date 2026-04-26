import { describe, it, expect, beforeEach, afterAll, spyOn } from "bun:test";
import { setupTestDb, teardownTestDb } from "../test-utils/setup";
import { getRawDb } from "../db/bun-db";

// Mock Sentry to prevent noise in tests
import Sentry from "../sentry";
spyOn(Sentry, "startSpan").mockImplementation((_opts: any, fn: any) => fn({}));
spyOn(Sentry, "captureException").mockImplementation(() => "");

// Mock Plex client module so we never make real HTTP calls
import * as plexClient from "./client";
const mockGetLibrarySections = spyOn(plexClient, "getLibrarySections");
const mockGetWatchedMovies = spyOn(plexClient, "getWatchedMovies");
const mockGetWatchedEpisodes = spyOn(plexClient, "getWatchedEpisodes");
const mockGetShowsInSection = spyOn(plexClient, "getShowsInSection");

import { syncPlexWatched } from "./sync";
import { createUser } from "../db/repository";

function insertTitle(id: string, objectType: string, tmdbId: string) {
  getRawDb()
    .prepare(`INSERT INTO titles (id, object_type, tmdb_id, title, release_date) VALUES (?, ?, ?, ?, '2024-01-01')`)
    .run(id, objectType, tmdbId, `Title ${id}`);
}

function insertEpisode(id: number, titleId: string, season: number, episode: number) {
  getRawDb()
    .prepare(`INSERT INTO episodes (id, title_id, season_number, episode_number, air_date) VALUES (?, ?, ?, ?, '2024-01-01')`)
    .run(id, titleId, season, episode);
}

function isMovieWatched(titleId: string, userId: string): boolean {
  const row = getRawDb()
    .prepare(`SELECT 1 FROM watched_titles WHERE title_id = ? AND user_id = ?`)
    .get(titleId, userId);
  return !!row;
}

function isEpisodeWatched(episodeId: number, userId: string): boolean {
  const row = getRawDb()
    .prepare(`SELECT 1 FROM watched_episodes WHERE episode_id = ? AND user_id = ?`)
    .get(episodeId, userId);
  return !!row;
}

function getIntegration(id: string) {
  return getRawDb()
    .prepare(`SELECT last_sync_at, last_sync_error, enabled FROM integrations WHERE id = ?`)
    .get(id) as { last_sync_at: string | null; last_sync_error: string | null; enabled: number } | null;
}

let userId: string;
let integrationId: string;

beforeEach(async () => {
  setupTestDb();
  userId = await createUser("plexuser", "hash");

  getRawDb()
    .prepare(`INSERT INTO integrations (id, user_id, provider, name, config, enabled) VALUES (?, ?, 'plex', 'My Plex', '{}', 1)`)
    .run("int-1", userId);
  integrationId = "int-1";

  // Reset mocks between tests
  mockGetLibrarySections.mockReset();
  mockGetWatchedMovies.mockReset();
  mockGetWatchedEpisodes.mockReset();
  mockGetShowsInSection.mockReset();
});

afterAll(() => {
  teardownTestDb();
});

const baseConfig = {
  plexToken: "test-token",
  serverUrl: "http://plex:32400",
  serverId: "server-id",
  serverName: "My Plex",
  plexUsername: "user",
  syncMovies: true,
  syncEpisodes: true,
};

const integration = (overrides = {}) => ({
  id: integrationId,
  user_id: userId,
  config: { ...baseConfig, ...overrides },
});

describe("syncPlexWatched — movies", () => {
  it("marks a watched movie as watched in Remindarr", async () => {
    insertTitle("movie-100", "MOVIE", "100");
    mockGetLibrarySections.mockResolvedValue([{ key: "1", type: "movie", title: "Movies" }]);
    mockGetWatchedMovies.mockResolvedValue([
      { ratingKey: "1", title: "Movie A", viewCount: 2, Guid: [{ id: "tmdb://100" }] },
    ]);
    mockGetWatchedEpisodes.mockResolvedValue([]);

    await syncPlexWatched(integration());

    expect(isMovieWatched("movie-100", userId)).toBe(true);
  });

  it("skips movies without TMDB GUID", async () => {
    insertTitle("movie-200", "MOVIE", "200");
    mockGetLibrarySections.mockResolvedValue([{ key: "1", type: "movie", title: "Movies" }]);
    mockGetWatchedMovies.mockResolvedValue([
      { ratingKey: "2", title: "Unknown Movie", viewCount: 1, Guid: [{ id: "imdb://tt9999999" }] },
    ]);
    mockGetWatchedEpisodes.mockResolvedValue([]);

    await syncPlexWatched(integration());

    expect(isMovieWatched("movie-200", userId)).toBe(false);
  });

  it("skips movies not in Remindarr DB", async () => {
    // title movie-999 doesn't exist in DB
    mockGetLibrarySections.mockResolvedValue([{ key: "1", type: "movie", title: "Movies" }]);
    mockGetWatchedMovies.mockResolvedValue([
      { ratingKey: "3", title: "Unknown", viewCount: 1, Guid: [{ id: "tmdb://999" }] },
    ]);
    mockGetWatchedEpisodes.mockResolvedValue([]);

    // Should not throw
    await expect(syncPlexWatched(integration())).resolves.toBeDefined();
  });

  it("respects syncMovies: false", async () => {
    insertTitle("movie-100", "MOVIE", "100");
    mockGetLibrarySections.mockResolvedValue([{ key: "1", type: "movie", title: "Movies" }]);
    mockGetWatchedMovies.mockResolvedValue([
      { ratingKey: "1", title: "Movie A", viewCount: 1, Guid: [{ id: "tmdb://100" }] },
    ]);
    mockGetWatchedEpisodes.mockResolvedValue([]);

    await syncPlexWatched(integration({ syncMovies: false }));

    expect(isMovieWatched("movie-100", userId)).toBe(false);
    expect(mockGetWatchedMovies).not.toHaveBeenCalled();
  });

  it("updates lastSyncAt on success", async () => {
    mockGetLibrarySections.mockResolvedValue([]);
    await syncPlexWatched(integration());

    const row = getIntegration(integrationId);
    expect(row?.last_sync_at).not.toBeNull();
    expect(row?.last_sync_error).toBeNull();
  });
});

describe("syncPlexWatched — episodes", () => {
  it("marks watched episodes as watched in Remindarr", async () => {
    insertTitle("tv-50", "SHOW", "50");
    insertEpisode(10, "tv-50", 1, 1);
    insertEpisode(11, "tv-50", 1, 2);

    mockGetLibrarySections.mockResolvedValue([{ key: "2", type: "show", title: "TV" }]);
    mockGetShowsInSection.mockResolvedValue([
      { ratingKey: "show-1", title: "Show A", Guid: [{ id: "tmdb://50" }] },
    ]);
    mockGetWatchedEpisodes.mockResolvedValue([
      {
        ratingKey: "ep-10", title: "Ep 1", parentTitle: "S1", grandparentTitle: "Show A",
        seasonNumber: 1, index: 1, viewCount: 1, grandparentRatingKey: "show-1",
      },
      {
        ratingKey: "ep-11", title: "Ep 2", parentTitle: "S1", grandparentTitle: "Show A",
        seasonNumber: 1, index: 2, viewCount: 2, grandparentRatingKey: "show-1",
      },
    ]);
    mockGetWatchedMovies.mockResolvedValue([]);

    await syncPlexWatched(integration());

    expect(isEpisodeWatched(10, userId)).toBe(true);
    expect(isEpisodeWatched(11, userId)).toBe(true);
  });

  it("skips shows whose TMDB ID is not in Remindarr DB", async () => {
    mockGetLibrarySections.mockResolvedValue([{ key: "2", type: "show", title: "TV" }]);
    mockGetShowsInSection.mockResolvedValue([
      { ratingKey: "show-x", title: "Unknown Show", Guid: [{ id: "tmdb://9999" }] },
    ]);
    mockGetWatchedEpisodes.mockResolvedValue([
      {
        ratingKey: "ep-x", title: "Ep", parentTitle: "S1", grandparentTitle: "Unknown",
        seasonNumber: 1, index: 1, viewCount: 1, grandparentRatingKey: "show-x",
      },
    ]);
    mockGetWatchedMovies.mockResolvedValue([]);

    await expect(syncPlexWatched(integration())).resolves.toBeDefined();
  });
});

describe("syncPlexWatched — error handling", () => {
  it("disables integration on PlexAuthError and records error", async () => {
    mockGetLibrarySections.mockRejectedValue(new plexClient.PlexAuthError("Token revoked"));

    await expect(syncPlexWatched(integration())).rejects.toThrow("Token revoked");

    const row = getIntegration(integrationId);
    expect(row?.enabled).toBe(0);
    expect(row?.last_sync_error).toContain("Token revoked");
  });

  it("records error without disabling on non-auth errors", async () => {
    mockGetLibrarySections.mockRejectedValue(new Error("Network error"));

    await expect(syncPlexWatched(integration())).rejects.toThrow("Network error");

    const row = getIntegration(integrationId);
    expect(row?.enabled).toBe(1);
    expect(row?.last_sync_error).toBe("Network error");
  });
});

describe("syncPlexWatched — per-title failure summary", () => {
  it("returns correct { succeeded, failed } shape when all titles succeed", async () => {
    insertTitle("movie-101", "MOVIE", "101");
    mockGetLibrarySections.mockResolvedValue([{ key: "1", type: "movie", title: "Movies" }]);
    mockGetWatchedMovies.mockResolvedValue([
      { ratingKey: "1", title: "Movie A", viewCount: 1, Guid: [{ id: "tmdb://101" }] },
    ]);
    mockGetWatchedEpisodes.mockResolvedValue([]);

    const result = await syncPlexWatched(integration());

    expect(result.succeeded).toBe(1);
    expect(result.failed).toEqual([]);
    expect(result.moviesMarked).toBe(1);
  });

  it("does not throw and returns { succeeded, failed } shape when a title is not in DB", async () => {
    // movie-9999 does not exist in DB — watchTitle will throw a FK constraint error
    mockGetLibrarySections.mockResolvedValue([{ key: "1", type: "movie", title: "Movies" }]);
    mockGetWatchedMovies.mockResolvedValue([
      { ratingKey: "3", title: "Unknown", viewCount: 1, Guid: [{ id: "tmdb://9999" }] },
    ]);
    mockGetWatchedEpisodes.mockResolvedValue([]);

    const result = await syncPlexWatched(integration());

    // Must not throw; the title is not in DB so it ends up in failed[]
    expect(result.succeeded).toBe(0);
    expect(result.failed.length).toBe(1);
    expect(result.failed[0].id).toBe("movie-9999");
  });
});
