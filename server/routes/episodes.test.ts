import { describe, it, expect, beforeEach, afterEach, afterAll, spyOn } from "bun:test";
import { Hono } from "hono";
import { setupTestDb, teardownTestDb } from "../test-utils/setup";
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
    const userId = createUser("testuser", "hash");

    const authedApp = new Hono<AppEnv>();
    authedApp.use("/episodes/*", async (c, next) => {
      c.set("user", {
        id: userId,
        username: "testuser",
        display_name: null,
        auth_provider: "local",
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

describe("POST /episodes/sync", () => {
  it("syncs episodes successfully", async () => {
    const origKey = CONFIG.TMDB_API_KEY;
    CONFIG.TMDB_API_KEY = "test-key";

    (sync.syncEpisodes as any).mockResolvedValueOnce({ synced: 5, shows: 2 });

    const res = await app.request("/episodes/sync", { method: "POST" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
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
