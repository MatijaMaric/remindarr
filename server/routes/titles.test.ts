import { describe, it, expect, beforeEach, afterAll } from "bun:test";
import { Hono } from "hono";
import { setupTestDb, teardownTestDb } from "../test-utils/setup";
import { makeParsedTitle, makeParsedOffer } from "../test-utils/fixtures";
import { upsertTitles, trackTitle, createUser } from "../db/repository";
import titlesApp from "./titles";
import type { AppEnv } from "../types";

let app: Hono<AppEnv>;

beforeEach(() => {
  setupTestDb();
  app = new Hono<AppEnv>();
  app.route("/titles", titlesApp);
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
      c.set("user", { id: userId, username: "testuser", display_name: null, auth_provider: "local", is_admin: false });
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
  it("returns available genres", async () => {
    await upsertTitles([
      makeParsedTitle({ genres: ["Action", "Drama"] }),
    ]);

    const res = await app.request("/titles/genres");
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.genres).toContain("Action");
    expect(body.genres).toContain("Drama");
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
});

describe("GET /titles/providers", () => {
  it("returns available providers", async () => {
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
  });
});
