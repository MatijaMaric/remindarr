import { describe, it, expect, beforeEach, afterAll, spyOn } from "bun:test";
import { setupTestDb, teardownTestDb } from "../test-utils/setup";
import { getRawDb } from "../db/bun-db";

import Sentry from "../sentry";
spyOn(Sentry, "startSpan").mockImplementation((_opts: any, fn: any) => fn({}));
spyOn(Sentry, "captureException").mockImplementation(() => "");

import * as plexClient from "./client";
const mockGetLibrarySections = spyOn(plexClient, "getLibrarySections");
const mockGetAllMovies = spyOn(plexClient, "getAllMoviesInSection");
const mockGetShows = spyOn(plexClient, "getShowsInSection");

import { syncPlexLibrary } from "./library-sync";
import { createUser } from "../db/repository";

function insertTitle(id: string, objectType: string, tmdbId: string) {
  getRawDb()
    .prepare(`INSERT INTO titles (id, object_type, tmdb_id, title, release_date) VALUES (?, ?, ?, ?, '2024-01-01')`)
    .run(id, objectType, tmdbId, `Title ${id}`);
}

function getLibraryItem(userId: string, titleId: string) {
  return getRawDb()
    .prepare(`SELECT rating_key, media_type FROM plex_library_items WHERE user_id = ? AND title_id = ?`)
    .get(userId, titleId) as { rating_key: string; media_type: string } | null;
}

function countLibraryItems(integrationId: string) {
  const row = getRawDb()
    .prepare(`SELECT COUNT(*) as cnt FROM plex_library_items WHERE integration_id = ?`)
    .get(integrationId) as { cnt: number };
  return row.cnt;
}

let userId: string;
let integrationId: string;

const baseConfig = {
  plexToken: "test-token",
  serverUrl: "http://plex:32400",
  serverId: "server-abc",
  serverName: "My Plex",
  plexUsername: "user",
  syncMovies: true,
  syncEpisodes: true,
};

beforeEach(async () => {
  setupTestDb();
  userId = await createUser("plexuser", "hash");

  getRawDb()
    .prepare(`INSERT INTO integrations (id, user_id, provider, name, config, enabled) VALUES (?, ?, 'plex', 'My Plex', ?, 1)`)
    .run("int-1", userId, JSON.stringify(baseConfig));
  integrationId = "int-1";

  mockGetLibrarySections.mockReset();
  mockGetAllMovies.mockReset();
  mockGetShows.mockReset();
});

afterAll(() => {
  teardownTestDb();
});

const integration = (overrides = {}) => ({
  id: integrationId,
  user_id: userId,
  config: { ...baseConfig, ...overrides },
});

describe("syncPlexLibrary — movies", () => {
  it("stores a movie from the Plex library", async () => {
    insertTitle("movie-100", "MOVIE", "100");
    mockGetLibrarySections.mockResolvedValue([{ key: "1", type: "movie", title: "Movies" }]);
    mockGetAllMovies.mockResolvedValue([
      { ratingKey: "rk-1", title: "Movie A", viewCount: 0, Guid: [{ id: "tmdb://100" }] },
    ]);
    mockGetShows.mockResolvedValue([]);

    await syncPlexLibrary(integration());

    const item = getLibraryItem(userId, "movie-100");
    expect(item).not.toBeNull();
    expect(item?.rating_key).toBe("rk-1");
    expect(item?.media_type).toBe("movie");
  });

  it("skips movies without a TMDB GUID", async () => {
    insertTitle("movie-200", "MOVIE", "200");
    mockGetLibrarySections.mockResolvedValue([{ key: "1", type: "movie", title: "Movies" }]);
    mockGetAllMovies.mockResolvedValue([
      { ratingKey: "rk-2", title: "No TMDB", viewCount: 0, Guid: [{ id: "imdb://tt9999" }] },
    ]);
    mockGetShows.mockResolvedValue([]);

    await syncPlexLibrary(integration());

    expect(getLibraryItem(userId, "movie-200")).toBeNull();
  });

  it("stores unwatched movies (viewCount=0)", async () => {
    insertTitle("movie-300", "MOVIE", "300");
    mockGetLibrarySections.mockResolvedValue([{ key: "1", type: "movie", title: "Movies" }]);
    mockGetAllMovies.mockResolvedValue([
      { ratingKey: "rk-3", title: "Unwatched", viewCount: 0, Guid: [{ id: "tmdb://300" }] },
    ]);
    mockGetShows.mockResolvedValue([]);

    await syncPlexLibrary(integration());

    expect(getLibraryItem(userId, "movie-300")).not.toBeNull();
  });
});

describe("syncPlexLibrary — shows", () => {
  it("stores a show from the Plex library", async () => {
    insertTitle("tv-50", "SHOW", "50");
    mockGetLibrarySections.mockResolvedValue([{ key: "2", type: "show", title: "TV" }]);
    mockGetAllMovies.mockResolvedValue([]);
    mockGetShows.mockResolvedValue([
      { ratingKey: "show-rk-1", title: "Show A", Guid: [{ id: "tmdb://50" }] },
    ]);

    await syncPlexLibrary(integration());

    const item = getLibraryItem(userId, "tv-50");
    expect(item).not.toBeNull();
    expect(item?.rating_key).toBe("show-rk-1");
    expect(item?.media_type).toBe("show");
  });
});

describe("syncPlexLibrary — stale cleanup", () => {
  it("removes items no longer in the Plex library", async () => {
    insertTitle("movie-100", "MOVIE", "100");
    insertTitle("movie-200", "MOVIE", "200");

    // First sync: both movies present
    mockGetLibrarySections.mockResolvedValue([{ key: "1", type: "movie", title: "Movies" }]);
    mockGetAllMovies.mockResolvedValue([
      { ratingKey: "rk-1", title: "Movie A", viewCount: 0, Guid: [{ id: "tmdb://100" }] },
      { ratingKey: "rk-2", title: "Movie B", viewCount: 0, Guid: [{ id: "tmdb://200" }] },
    ]);
    mockGetShows.mockResolvedValue([]);
    await syncPlexLibrary(integration());
    expect(countLibraryItems(integrationId)).toBe(2);

    // Second sync: movie-200 removed from Plex
    mockGetAllMovies.mockResolvedValue([
      { ratingKey: "rk-1", title: "Movie A", viewCount: 0, Guid: [{ id: "tmdb://100" }] },
    ]);
    const result = await syncPlexLibrary(integration());
    expect(result.itemsRemoved).toBe(1);
    expect(countLibraryItems(integrationId)).toBe(1);
    expect(getLibraryItem(userId, "movie-100")).not.toBeNull();
    expect(getLibraryItem(userId, "movie-200")).toBeNull();
  });

  it("clears all items when library is empty", async () => {
    insertTitle("movie-100", "MOVIE", "100");
    getRawDb()
      .prepare(`INSERT INTO plex_library_items (integration_id, user_id, title_id, rating_key, media_type) VALUES (?, ?, ?, ?, ?)`)
      .run(integrationId, userId, "movie-100", "rk-1", "movie");

    mockGetLibrarySections.mockResolvedValue([{ key: "1", type: "movie", title: "Movies" }]);
    mockGetAllMovies.mockResolvedValue([]);
    mockGetShows.mockResolvedValue([]);

    const result = await syncPlexLibrary(integration());
    expect(result.itemsRemoved).toBe(1);
    expect(countLibraryItems(integrationId)).toBe(0);
  });
});

describe("syncPlexLibrary — error handling", () => {
  it("disables integration on PlexAuthError", async () => {
    mockGetLibrarySections.mockRejectedValue(new plexClient.PlexAuthError("Token revoked"));

    await expect(syncPlexLibrary(integration())).rejects.toThrow("Token revoked");

    const row = getRawDb()
      .prepare(`SELECT enabled FROM integrations WHERE id = ?`)
      .get(integrationId) as { enabled: number } | null;
    expect(row?.enabled).toBe(0);
  });

  it("does not disable integration on non-auth errors", async () => {
    mockGetLibrarySections.mockRejectedValue(new Error("Network error"));

    await expect(syncPlexLibrary(integration())).rejects.toThrow("Network error");

    const row = getRawDb()
      .prepare(`SELECT enabled FROM integrations WHERE id = ?`)
      .get(integrationId) as { enabled: number } | null;
    expect(row?.enabled).toBe(1);
  });
});
