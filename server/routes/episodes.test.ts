import { describe, it, expect, beforeEach, afterEach, afterAll, spyOn } from "bun:test";
import { Hono } from "hono";
import { setupTestDb, teardownTestDb } from "../test-utils/setup";
import { makeParsedTitle } from "../test-utils/fixtures";
import { CONFIG } from "../config";
import * as sync from "../tmdb/sync";
import type { AppEnv } from "../types";

let app: Hono<AppEnv>;
let spies: ReturnType<typeof spyOn>[] = [];

beforeEach(async () => {
  setupTestDb();

  spies = [
    spyOn(sync, "syncEpisodes").mockResolvedValue({ synced: 5, shows: 2 }),
    spyOn(sync, "syncEpisodesForShow").mockResolvedValue({ synced: 0 } as any),
  ];

  // Import fresh route after spies are set up
  const episodesApp = (await import("./episodes")).default;
  app = new Hono<AppEnv>();
  app.route("/episodes", episodesApp);
});

afterEach(() => {
  for (const spy of spies) spy.mockRestore();
  spies = [];
});

afterAll(() => {
  teardownTestDb();
});

describe("GET /episodes/upcoming", () => {
  it("returns empty arrays when no user is logged in", async () => {
    const res = await app.request("/episodes/upcoming");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.today).toEqual([]);
    expect(body.upcoming).toEqual([]);
  });

  it("returns episodes for authenticated user", async () => {
    const { createUser } = await import("../db/repository");
    const userId = await createUser("testuser", "hash");

    const authedApp = new Hono<AppEnv>();
    authedApp.use("/episodes/*", async (c, next) => {
      c.set("user", {
        id: userId,
        username: "testuser",
        name: null,
        role: null,
        is_admin: false,
      });
      await next();
    });
    const episodesApp = (await import("./episodes")).default;
    authedApp.route("/episodes", episodesApp);

    const res = await authedApp.request("/episodes/upcoming");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.today).toBeDefined();
    expect(body.upcoming).toBeDefined();
    expect(body.unwatched).toBeDefined();
  });
});

describe("GET /episodes/status/:titleId/:season", () => {
  it("returns empty episodes when no user is logged in", async () => {
    const res = await app.request("/episodes/status/tv-123/1");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.episodes).toEqual([]);
  });

  it("returns empty episodes when title has no episodes in DB", async () => {
    const { createUser } = await import("../db/repository");
    const userId = await createUser("testuser", "hash");

    const authedApp = new Hono<AppEnv>();
    authedApp.use("/episodes/*", async (c, next) => {
      c.set("user", { id: userId, username: "testuser", name: null, role: null, is_admin: false });
      await next();
    });
    const episodesApp = (await import("./episodes")).default;
    authedApp.route("/episodes", episodesApp);

    const res = await authedApp.request("/episodes/status/tv-999/1");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.episodes).toEqual([]);
  });

  it("returns episode status with is_watched false for unwatched episodes", async () => {
    const { createUser, upsertTitles, upsertEpisodes } = await import("../db/repository");
    const userId = await createUser("testuser", "hash");

    await upsertTitles([makeParsedTitle({ id: "tv-100", objectType: "SHOW", title: "Test Show" })]);

    await upsertEpisodes([
      { title_id: "tv-100", season_number: 1, episode_number: 1, name: "Ep 1", overview: null, air_date: "2024-01-01", still_path: null },
      { title_id: "tv-100", season_number: 1, episode_number: 2, name: "Ep 2", overview: null, air_date: "2024-01-08", still_path: null },
      { title_id: "tv-100", season_number: 2, episode_number: 1, name: "S2 Ep 1", overview: null, air_date: "2024-06-01", still_path: null },
    ]);

    const authedApp = new Hono<AppEnv>();
    authedApp.use("/episodes/*", async (c, next) => {
      c.set("user", { id: userId, username: "testuser", name: null, role: null, is_admin: false });
      await next();
    });
    const episodesApp = (await import("./episodes")).default;
    authedApp.route("/episodes", episodesApp);

    const res = await authedApp.request("/episodes/status/tv-100/1");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.episodes).toHaveLength(2);
    expect(body.episodes[0].episode_number).toBe(1);
    expect(body.episodes[0].is_watched).toBe(false);
    expect(body.episodes[1].episode_number).toBe(2);
    expect(body.episodes[1].is_watched).toBe(false);
  });

  it("returns is_watched true after marking episode as watched", async () => {
    const { createUser, upsertTitles, upsertEpisodes, watchEpisode } = await import("../db/repository");
    const userId = await createUser("testuser2", "hash");

    await upsertTitles([makeParsedTitle({ id: "tv-101", objectType: "SHOW", title: "Test Show 2" })]);

    await upsertEpisodes([
      { title_id: "tv-101", season_number: 1, episode_number: 1, name: "Ep 1", overview: null, air_date: "2024-01-01", still_path: null },
    ]);

    const authedApp = new Hono<AppEnv>();
    authedApp.use("/episodes/*", async (c, next) => {
      c.set("user", { id: userId, username: "testuser2", name: null, role: null, is_admin: false });
      await next();
    });
    const episodesApp = (await import("./episodes")).default;
    authedApp.route("/episodes", episodesApp);

    // Get the episode ID from status
    const res1 = await authedApp.request("/episodes/status/tv-101/1");
    const body1 = await res1.json();
    const episodeId = body1.episodes[0].id;

    // Mark as watched
    await watchEpisode(episodeId, userId);

    // Check status again
    const res2 = await authedApp.request("/episodes/status/tv-101/1");
    const body2 = await res2.json();
    expect(body2.episodes[0].is_watched).toBe(true);
  });

  it("only returns episodes for the requested season", async () => {
    const { createUser, upsertTitles, upsertEpisodes } = await import("../db/repository");
    const userId = await createUser("testuser3", "hash");

    await upsertTitles([makeParsedTitle({ id: "tv-102", objectType: "SHOW", title: "Test Show 3" })]);

    await upsertEpisodes([
      { title_id: "tv-102", season_number: 1, episode_number: 1, name: "S1E1", overview: null, air_date: "2024-01-01", still_path: null },
      { title_id: "tv-102", season_number: 2, episode_number: 1, name: "S2E1", overview: null, air_date: "2024-06-01", still_path: null },
      { title_id: "tv-102", season_number: 2, episode_number: 2, name: "S2E2", overview: null, air_date: "2024-06-08", still_path: null },
    ]);

    const authedApp = new Hono<AppEnv>();
    authedApp.use("/episodes/*", async (c, next) => {
      c.set("user", { id: userId, username: "testuser3", name: null, role: null, is_admin: false });
      await next();
    });
    const episodesApp = (await import("./episodes")).default;
    authedApp.route("/episodes", episodesApp);

    const res = await authedApp.request("/episodes/status/tv-102/2");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.episodes).toHaveLength(2);
    expect(body.episodes.every((e: any) => e.episode_number <= 2)).toBe(true);
  });

  it("returns 400 for invalid season number", async () => {
    const res = await app.request("/episodes/status/tv-123/abc");
    // No user, so it returns empty before validation
    // Let's test with an authenticated user
    const { createUser } = await import("../db/repository");
    const userId = await createUser("testuser4", "hash");

    const authedApp = new Hono<AppEnv>();
    authedApp.use("/episodes/*", async (c, next) => {
      c.set("user", { id: userId, username: "testuser4", name: null, role: null, is_admin: false });
      await next();
    });
    const episodesApp = (await import("./episodes")).default;
    authedApp.route("/episodes", episodesApp);

    const res2 = await authedApp.request("/episodes/status/tv-123/abc");
    expect(res2.status).toBe(400);
  });
});

describe("POST /episodes/sync", () => {
  it("syncs episodes successfully", async () => {
    const origKey = CONFIG.TMDB_API_KEY;
    CONFIG.TMDB_API_KEY = "test-key";

    (sync.syncEpisodes as any).mockResolvedValueOnce({ synced: 5, shows: 2 });

    const res = await app.request("/episodes/sync", { method: "POST" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.synced).toBe(5);
    expect(body.shows).toBe(2);
    expect(body.message).toContain("Synced 5 episodes from 2 shows");

    CONFIG.TMDB_API_KEY = origKey;
  });

  it("returns 500 when TMDB_API_KEY is not configured", async () => {
    const origKey = CONFIG.TMDB_API_KEY;
    CONFIG.TMDB_API_KEY = "";

    const res = await app.request("/episodes/sync", { method: "POST" });
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toContain("TMDB_API_KEY");

    CONFIG.TMDB_API_KEY = origKey;
  });
});
