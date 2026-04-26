import { describe, it, expect, beforeEach, afterEach, afterAll, spyOn } from "bun:test";
import { Hono } from "hono";
import { setupTestDb, teardownTestDb } from "../test-utils/setup";
import { makeParsedTitle, makeParsedOffer } from "../test-utils/fixtures";
import { upsertTitles, trackTitle, createUser } from "../db/repository";
import titlesApp from "./titles";
import type { AppEnv } from "../types";
import * as tmdbClient from "../tmdb/client";

let app: Hono<AppEnv>;
let spies: ReturnType<typeof spyOn>[] = [];

beforeEach(() => {
  setupTestDb();
  app = new Hono<AppEnv>();
  app.route("/titles", titlesApp);

  spies = [
    spyOn(tmdbClient, "getMovieWatchProviders").mockResolvedValue([
      { id: 8, name: "Netflix", iconUrl: "https://image.tmdb.org/t/p/w92/nf.jpg" },
    ]),
    spyOn(tmdbClient, "getTvWatchProviders").mockResolvedValue([
      { id: 8, name: "Netflix", iconUrl: "https://image.tmdb.org/t/p/w92/nf.jpg" },
    ]),
  ];
});

afterEach(() => {
  for (const spy of spies) spy.mockRestore();
  spies = [];
});

afterAll(() => {
  teardownTestDb();
});

describe("GET /titles", () => {
  it("returns titles", async () => {
    // Use today's date so titles appear within default daysBack window
    const today = new Date().toISOString().slice(0, 10);
    await upsertTitles([makeParsedTitle({ releaseDate: today })]);

    const res = await app.request("/titles?daysBack=9999");
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.titles).toHaveLength(1);
    expect(body.titles[0].title).toBe("Test Movie");
    expect(body.count).toBe(1);
  });

  it("filters by type", async () => {
    const today = new Date().toISOString().slice(0, 10);
    await upsertTitles([
      makeParsedTitle({ id: "movie-1", objectType: "MOVIE", releaseDate: today }),
      makeParsedTitle({ id: "tv-1", objectType: "SHOW", title: "Show", releaseDate: today }),
    ]);

    const res = await app.request("/titles?daysBack=9999&type=SHOW");
    const body = await res.json();
    expect(body.titles).toHaveLength(1);
    expect(body.titles[0].object_type).toBe("SHOW");
  });

  it("returns empty when no titles match", async () => {
    const res = await app.request("/titles");
    const body = await res.json();
    expect(body.titles).toHaveLength(0);
    expect(body.count).toBe(0);
  });

  it("filters by genre", async () => {
    const today = new Date().toISOString().slice(0, 10);
    await upsertTitles([
      makeParsedTitle({ id: "movie-1", genres: ["Action"], releaseDate: today }),
      makeParsedTitle({ id: "movie-2", title: "Comedy Film", genres: ["Comedy"], releaseDate: today }),
    ]);

    const res = await app.request("/titles?daysBack=9999&genre=Comedy");
    const body = await res.json();
    expect(body.titles).toHaveLength(1);
    expect(body.titles[0].title).toBe("Comedy Film");
  });

  it("filters by language", async () => {
    const today = new Date().toISOString().slice(0, 10);
    await upsertTitles([
      makeParsedTitle({ id: "movie-1", originalLanguage: "en", releaseDate: today }),
      makeParsedTitle({ id: "movie-2", title: "Japanese Movie", originalLanguage: "ja", releaseDate: today }),
    ]);

    const res = await app.request("/titles?daysBack=9999&language=ja");
    const body = await res.json();
    expect(body.titles).toHaveLength(1);
    expect(body.titles[0].title).toBe("Japanese Movie");
  });

  it("filters by multiple types (comma-separated)", async () => {
    const today = new Date().toISOString().slice(0, 10);
    await upsertTitles([
      makeParsedTitle({ id: "movie-1", objectType: "MOVIE", releaseDate: today }),
      makeParsedTitle({ id: "tv-1", objectType: "SHOW", title: "Show", releaseDate: today }),
    ]);

    const res = await app.request("/titles?daysBack=9999&type=MOVIE,SHOW");
    const body = await res.json();
    expect(body.titles).toHaveLength(2);
  });

  it("filters by multiple genres (comma-separated)", async () => {
    const today = new Date().toISOString().slice(0, 10);
    await upsertTitles([
      makeParsedTitle({ id: "movie-1", genres: ["Action"], releaseDate: today }),
      makeParsedTitle({ id: "movie-2", title: "Comedy Film", genres: ["Comedy"], releaseDate: today }),
      makeParsedTitle({ id: "movie-3", title: "Drama Film", genres: ["Drama"], releaseDate: today }),
    ]);

    const res = await app.request("/titles?daysBack=9999&genre=Action,Comedy");
    const body = await res.json();
    expect(body.titles).toHaveLength(2);
    const titles = body.titles.map((t: any) => t.title).sort();
    expect(titles).toEqual(["Comedy Film", "Test Movie"]);
  });

  it("filters by multiple languages (comma-separated)", async () => {
    const today = new Date().toISOString().slice(0, 10);
    await upsertTitles([
      makeParsedTitle({ id: "movie-1", originalLanguage: "en", releaseDate: today }),
      makeParsedTitle({ id: "movie-2", title: "Japanese Movie", originalLanguage: "ja", releaseDate: today }),
      makeParsedTitle({ id: "movie-3", title: "French Movie", originalLanguage: "fr", releaseDate: today }),
    ]);

    const res = await app.request("/titles?daysBack=9999&language=en,ja");
    const body = await res.json();
    expect(body.titles).toHaveLength(2);
  });

  it("clamps daysBack to max 365", async () => {
    const today = new Date().toISOString().slice(0, 10);
    await upsertTitles([makeParsedTitle({ releaseDate: today })]);

    const res = await app.request("/titles?daysBack=9999");
    expect(res.status).toBe(200);
    // Should still work — titles within 365 days are returned
    const body = await res.json();
    expect(body.titles).toHaveLength(1);
  });

  it("clamps limit to max 1000 and min 1", async () => {
    const today = new Date().toISOString().slice(0, 10);
    await upsertTitles([makeParsedTitle({ releaseDate: today })]);

    const res = await app.request("/titles?daysBack=365&limit=999999999");
    expect(res.status).toBe(200);
    const body = await res.json();
    // Should still return results (clamped to 1000)
    expect(body.titles).toHaveLength(1);
  });

  it("clamps negative offset to 0", async () => {
    const today = new Date().toISOString().slice(0, 10);
    await upsertTitles([makeParsedTitle({ releaseDate: today })]);

    const res = await app.request("/titles?daysBack=365&offset=-1");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.titles).toHaveLength(1);
  });

  it("clamps negative daysBack to 1", async () => {
    const res = await app.request("/titles?daysBack=-5");
    expect(res.status).toBe(200);
    const body = await res.json();
    // With daysBack=1, may or may not have titles, but should not error
    expect(body.titles).toBeDefined();
  });

  it("filters titles by daysBack date range", async () => {
    const recentDate = new Date();
    recentDate.setDate(recentDate.getDate() - 10);
    const recentStr = recentDate.toISOString().slice(0, 10);

    const oldDate = new Date();
    oldDate.setDate(oldDate.getDate() - 60);
    const oldStr = oldDate.toISOString().slice(0, 10);

    await upsertTitles([
      makeParsedTitle({ id: "recent-1", title: "Recent Movie", releaseDate: recentStr }),
      makeParsedTitle({ id: "old-1", title: "Old Movie", releaseDate: oldStr }),
    ]);

    const res = await app.request("/titles?daysBack=30");
    const body = await res.json();
    expect(body.titles).toHaveLength(1);
    expect(body.titles[0].title).toBe("Recent Movie");
  });

  it("excludes tracked titles when excludeTracked=1 and user is present", async () => {
    const today = new Date().toISOString().slice(0, 10);
    await upsertTitles([
      makeParsedTitle({ id: "movie-1", title: "Tracked", releaseDate: today }),
      makeParsedTitle({ id: "movie-2", title: "Untracked", releaseDate: today }),
    ]);
    const userId = await createUser("testuser", "hash");
    await trackTitle("movie-1", userId);

    // Create app with user middleware
    const authedApp = new Hono<AppEnv>();
    authedApp.use("*", async (c, next) => {
      c.set("user", { id: userId, username: "testuser", name: null, role: null, is_admin: false });
      await next();
    });
    authedApp.route("/titles", titlesApp);

    const res = await authedApp.request("/titles?daysBack=9999&excludeTracked=1");
    const body = await res.json();
    expect(body.titles).toHaveLength(1);
    expect(body.titles[0].title).toBe("Untracked");
  });
});

describe("GET /titles/genres", () => {
  it("returns available genres with canonical grouping", async () => {
    await upsertTitles([
      makeParsedTitle({ genres: ["Action", "Drama"] }),
    ]);

    const res = await app.request("/titles/genres");
    expect(res.status).toBe(200);

    const body = await res.json();
    // "Action" should be grouped into "Action & Adventure"
    expect(body.genres).toContain("Action & Adventure");
    expect(body.genres).not.toContain("Action");
    expect(body.genres).toContain("Drama");
  });

  it("sets Cache-Control header", async () => {
    const res = await app.request("/titles/genres");
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toContain("max-age=86400");
  });
});

describe("GET /titles/languages", () => {
  it("returns available languages", async () => {
    await upsertTitles([
      makeParsedTitle({ originalLanguage: "en" }),
    ]);

    const res = await app.request("/titles/languages");
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.languages).toContain("en");
  });

  it("sets Cache-Control header", async () => {
    const res = await app.request("/titles/languages");
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toContain("max-age=86400");
  });
});

describe("GET /titles/providers", () => {
  it("returns available providers with regionProviderIds", async () => {
    await upsertTitles([
      makeParsedTitle({
        offers: [makeParsedOffer({ providerId: 8, providerName: "Netflix" })],
      }),
    ]);

    const res = await app.request("/titles/providers");
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.providers).toHaveLength(1);
    expect(body.providers[0].name).toBe("Netflix");
    expect(body.regionProviderIds).toBeDefined();
    expect(body.regionProviderIds).toContain(8);
  });

  it("sets Cache-Control header", async () => {
    const res = await app.request("/titles/providers");
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toContain("max-age=86400");
  });
});
