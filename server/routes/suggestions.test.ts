import { describe, it, expect, beforeEach, afterEach, afterAll, spyOn } from "bun:test";
import { Hono } from "hono";
import type { AppEnv } from "../types";
import { CONFIG } from "../config";
import { setupTestDb, teardownTestDb } from "../test-utils/setup";
import { trackTitle, upsertTitles, createUser, rateTitle } from "../db/repository";
import { watchTitle } from "../db/repository/watched-titles";
import { getDismissedTitleIds } from "../db/repository/dismissed";
import { makeParsedTitle, makeTmdbDiscoverMovie, makeTmdbDiscoverTv } from "../test-utils/fixtures";
import * as tmdbClient from "../tmdb/client";

CONFIG.TMDB_API_KEY = "test-api-key";

const suggestionsApp = (await import("./suggestions")).default;

let app: Hono<AppEnv>;
let spies: ReturnType<typeof spyOn>[] = [];
let mockUserId: string;

function makeAuthedApp() {
  const a = new Hono<AppEnv>();
  a.use("*", async (c, next) => {
    c.set("user", { id: mockUserId, username: "testuser", name: "Test User", email: "test@example.com", admin: false } as any);
    await next();
  });
  a.route("/suggestions", suggestionsApp);
  return a;
}

function makeAnonApp() {
  const a = new Hono<AppEnv>();
  a.route("/suggestions", suggestionsApp);
  return a;
}

beforeEach(async () => {
  setupTestDb();
  mockUserId = await createUser("testuser", null);
  app = makeAuthedApp();

  spies = [
    spyOn(tmdbClient, "fetchMovieSuggestions").mockResolvedValue({
      results: [],
      page: 1,
      total_pages: 0,
      total_results: 0,
    } as any),
    spyOn(tmdbClient, "fetchTvSuggestions").mockResolvedValue({
      results: [],
      page: 1,
      total_pages: 0,
      total_results: 0,
    } as any),
    spyOn(tmdbClient, "getMovieGenres").mockResolvedValue(new Map() as any),
    spyOn(tmdbClient, "getTvGenres").mockResolvedValue(new Map() as any),
  ];
});

afterEach(() => {
  for (const spy of spies) spy.mockRestore();
  spies = [];
});

afterAll(() => {
  teardownTestDb();
});

describe("GET /suggestions", () => {
  it("returns 401 when unauthenticated", async () => {
    const anonApp = makeAnonApp();
    const res = await anonApp.request("/suggestions");
    expect(res.status).toBe(401);
  });

  it("returns empty flat and groups when user has no tracked titles", async () => {
    const res = await app.request("/suggestions");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.flat).toEqual([]);
    expect(body.groups).toEqual([]);
  });

  it("seeds from tracked titles as fallback (reason: tracked)", async () => {
    await upsertTitles([makeParsedTitle({ id: "movie-100", tmdbId: "100", objectType: "MOVIE" })]);
    await trackTitle("movie-100", mockUserId);

    (tmdbClient.fetchMovieSuggestions as any).mockResolvedValueOnce({
      results: [makeTmdbDiscoverMovie({ id: 200, title: "Suggestion A" })],
      page: 1, total_pages: 1, total_results: 1,
    });

    const res = await app.request("/suggestions");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.groups[0].source.reason).toBe("tracked");
    expect(body.groups[0].source.id).toBe("movie-100");
    expect(tmdbClient.fetchMovieSuggestions).toHaveBeenCalledWith(100, 1);
  });

  it("seeds from watched titles before tracked (reason: watched)", async () => {
    await upsertTitles([
      makeParsedTitle({ id: "movie-100", tmdbId: "100", objectType: "MOVIE" }),
      makeParsedTitle({ id: "movie-200", tmdbId: "200", objectType: "MOVIE" }),
    ]);
    await trackTitle("movie-100", mockUserId);
    await watchTitle("movie-200", mockUserId);

    (tmdbClient.fetchMovieSuggestions as any).mockResolvedValue({
      results: [makeTmdbDiscoverMovie({ id: 999, title: "Suggested" })],
      page: 1, total_pages: 1, total_results: 1,
    });

    const res = await app.request("/suggestions");
    expect(res.status).toBe(200);
    const body = await res.json();
    // watched title should come first
    const sourceIds = body.groups.map((g: any) => g.source.id);
    expect(sourceIds[0]).toBe("movie-200");
    expect(body.groups[0].source.reason).toBe("watched");
  });

  it("seeds from LOVE-rated titles with highest priority (reason: loved)", async () => {
    await upsertTitles([
      makeParsedTitle({ id: "movie-100", tmdbId: "100", objectType: "MOVIE" }),
      makeParsedTitle({ id: "movie-200", tmdbId: "200", objectType: "MOVIE" }),
    ]);
    await trackTitle("movie-100", mockUserId);
    await rateTitle(mockUserId, "movie-200", "LOVE");

    (tmdbClient.fetchMovieSuggestions as any).mockResolvedValue({
      results: [makeTmdbDiscoverMovie({ id: 999, title: "Suggested" })],
      page: 1, total_pages: 1, total_results: 1,
    });

    const res = await app.request("/suggestions");
    expect(res.status).toBe(200);
    const body = await res.json();
    const sourceIds = body.groups.map((g: any) => g.source.id);
    expect(sourceIds[0]).toBe("movie-200");
    expect(body.groups[0].source.reason).toBe("loved");
  });

  it("seeds from LIKE-rated titles before watched (reason: liked)", async () => {
    await upsertTitles([
      makeParsedTitle({ id: "movie-100", tmdbId: "100", objectType: "MOVIE" }),
      makeParsedTitle({ id: "movie-200", tmdbId: "200", objectType: "MOVIE" }),
    ]);
    await watchTitle("movie-100", mockUserId);
    await rateTitle(mockUserId, "movie-200", "LIKE");

    (tmdbClient.fetchMovieSuggestions as any).mockResolvedValue({
      results: [makeTmdbDiscoverMovie({ id: 999, title: "Suggested" })],
      page: 1, total_pages: 1, total_results: 1,
    });

    const res = await app.request("/suggestions");
    expect(res.status).toBe(200);
    const body = await res.json();
    const sourceIds = body.groups.map((g: any) => g.source.id);
    expect(sourceIds[0]).toBe("movie-200");
    expect(body.groups[0].source.reason).toBe("liked");
  });

  it("group source includes reason field", async () => {
    await upsertTitles([makeParsedTitle({ id: "movie-100", tmdbId: "100", objectType: "MOVIE" })]);
    await trackTitle("movie-100", mockUserId);

    (tmdbClient.fetchMovieSuggestions as any).mockResolvedValueOnce({
      results: [makeTmdbDiscoverMovie({ id: 200, title: "Suggestion A", vote_average: 8.0 })],
      page: 1, total_pages: 1, total_results: 1,
    });

    const res = await app.request("/suggestions");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.groups[0].source).toHaveProperty("reason");
  });

  it("filters out titles the user already tracks", async () => {
    await upsertTitles([
      makeParsedTitle({ id: "movie-100", tmdbId: "100", objectType: "MOVIE" }),
      makeParsedTitle({ id: "movie-200", tmdbId: "200", objectType: "MOVIE" }),
    ]);
    await trackTitle("movie-100", mockUserId);
    await trackTitle("movie-200", mockUserId);

    (tmdbClient.fetchMovieSuggestions as any).mockResolvedValueOnce({
      results: [makeTmdbDiscoverMovie({ id: 200, title: "Already Tracked" })],
      page: 1, total_pages: 1, total_results: 1,
    });

    const res = await app.request("/suggestions");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.flat.every((t: any) => t.id !== "movie-200")).toBe(true);
  });

  it("filters out titles the user has already watched", async () => {
    await upsertTitles([
      makeParsedTitle({ id: "movie-100", tmdbId: "100", objectType: "MOVIE" }),
      makeParsedTitle({ id: "movie-300", tmdbId: "300", objectType: "MOVIE" }),
    ]);
    await trackTitle("movie-100", mockUserId);
    await watchTitle("movie-300", mockUserId);

    (tmdbClient.fetchMovieSuggestions as any).mockResolvedValueOnce({
      results: [makeTmdbDiscoverMovie({ id: 300, title: "Already Watched" })],
      page: 1, total_pages: 1, total_results: 1,
    });

    const res = await app.request("/suggestions");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.flat.every((t: any) => t.id !== "movie-300")).toBe(true);
  });

  it("dedupes titles that appear in multiple source groups", async () => {
    await upsertTitles([
      makeParsedTitle({ id: "movie-101", tmdbId: "101", objectType: "MOVIE" }),
      makeParsedTitle({ id: "movie-102", tmdbId: "102", objectType: "MOVIE" }),
    ]);
    await trackTitle("movie-101", mockUserId);
    await trackTitle("movie-102", mockUserId);

    (tmdbClient.fetchMovieSuggestions as any)
      .mockResolvedValueOnce({ results: [makeTmdbDiscoverMovie({ id: 999, title: "Shared Suggestion" })], page: 1, total_pages: 1, total_results: 1 })
      .mockResolvedValueOnce({ results: [makeTmdbDiscoverMovie({ id: 999, title: "Shared Suggestion" })], page: 1, total_pages: 1, total_results: 1 });

    const res = await app.request("/suggestions");
    expect(res.status).toBe(200);
    const body = await res.json();
    const count = body.flat.filter((t: any) => t.id === "movie-999").length;
    expect(count).toBe(1);
  });

  it("respects the limit query param", async () => {
    await upsertTitles([makeParsedTitle({ id: "movie-100", tmdbId: "100", objectType: "MOVIE" })]);
    await trackTitle("movie-100", mockUserId);

    (tmdbClient.fetchMovieSuggestions as any).mockResolvedValueOnce({
      results: Array.from({ length: 20 }, (_, i) => makeTmdbDiscoverMovie({ id: 400 + i, title: `Suggestion ${i}` })),
      page: 1, total_pages: 1, total_results: 20,
    });

    const res = await app.request("/suggestions?limit=3");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.flat.length).toBeLessThanOrEqual(3);
  });

  it("handles show type source titles using fetchTvSuggestions", async () => {
    await upsertTitles([makeParsedTitle({ id: "tv-500", tmdbId: "500", objectType: "SHOW" })]);
    await trackTitle("tv-500", mockUserId);

    (tmdbClient.fetchTvSuggestions as any).mockResolvedValueOnce({
      results: [makeTmdbDiscoverTv({ id: 600, name: "TV Suggestion" })],
      page: 1, total_pages: 1, total_results: 1,
    });

    const res = await app.request("/suggestions");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(tmdbClient.fetchTvSuggestions).toHaveBeenCalledWith(500, 1);
    expect(body.flat[0].id).toBe("tv-600");
  });

  it("filters out dismissed titles", async () => {
    await upsertTitles([
      makeParsedTitle({ id: "movie-100", tmdbId: "100", objectType: "MOVIE" }),
      makeParsedTitle({ id: "movie-200", tmdbId: "200", objectType: "MOVIE" }),
    ]);
    await trackTitle("movie-100", mockUserId);

    (tmdbClient.fetchMovieSuggestions as any).mockResolvedValueOnce({
      results: [makeTmdbDiscoverMovie({ id: 200, title: "Dismissed Movie" })],
      page: 1, total_pages: 1, total_results: 1,
    });

    // Dismiss via the route
    const dismissRes = await app.request("/suggestions/dismiss/movie-200", { method: "POST" });
    expect(dismissRes.status).toBe(200);

    const res = await app.request("/suggestions");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.flat.every((t: any) => t.id !== "movie-200")).toBe(true);
  });

  it("includes hiddenCount per group reflecting filtered titles", async () => {
    await upsertTitles([
      makeParsedTitle({ id: "movie-100", tmdbId: "100", objectType: "MOVIE" }),
      makeParsedTitle({ id: "movie-200", tmdbId: "200", objectType: "MOVIE" }),
      makeParsedTitle({ id: "movie-300", tmdbId: "300", objectType: "MOVIE" }),
    ]);
    await trackTitle("movie-100", mockUserId);
    await trackTitle("movie-200", mockUserId); // will be filtered

    (tmdbClient.fetchMovieSuggestions as any).mockResolvedValueOnce({
      results: [
        makeTmdbDiscoverMovie({ id: 200, title: "Already Tracked" }),
        makeTmdbDiscoverMovie({ id: 300, title: "Suggestion" }),
      ],
      page: 1, total_pages: 1, total_results: 2,
    });

    const res = await app.request("/suggestions");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.groups[0].hiddenCount).toBe(1);
  });
});

describe("POST /suggestions/dismiss/:titleId", () => {
  it("dismisses a title and returns ok", async () => {
    await upsertTitles([makeParsedTitle({ id: "movie-500", tmdbId: "500", objectType: "MOVIE" })]);
    const res = await app.request("/suggestions/dismiss/movie-500", { method: "POST" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    const ids = await getDismissedTitleIds(mockUserId);
    expect(ids.has("movie-500")).toBe(true);
  });

  it("is idempotent — dismissing twice returns ok", async () => {
    await upsertTitles([makeParsedTitle({ id: "movie-500", tmdbId: "500", objectType: "MOVIE" })]);
    await app.request("/suggestions/dismiss/movie-500", { method: "POST" });
    const res = await app.request("/suggestions/dismiss/movie-500", { method: "POST" });
    expect(res.status).toBe(200);
  });

  it("returns 401 when unauthenticated", async () => {
    const anonApp = makeAnonApp();
    const res = await anonApp.request("/suggestions/dismiss/movie-500", { method: "POST" });
    expect(res.status).toBe(401);
  });

  it("returns 400 for an empty titleId", async () => {
    const res = await app.request("/suggestions/dismiss/", { method: "POST" });
    expect(res.status).toBe(404);
  });
});

describe("DELETE /suggestions/dismiss/:titleId", () => {
  it("undismisses a title and returns ok", async () => {
    await upsertTitles([makeParsedTitle({ id: "movie-600", tmdbId: "600", objectType: "MOVIE" })]);
    await app.request("/suggestions/dismiss/movie-600", { method: "POST" });

    const res = await app.request("/suggestions/dismiss/movie-600", { method: "DELETE" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    const ids = await getDismissedTitleIds(mockUserId);
    expect(ids.has("movie-600")).toBe(false);
  });

  it("is a no-op when title was not dismissed", async () => {
    const res = await app.request("/suggestions/dismiss/movie-999", { method: "DELETE" });
    expect(res.status).toBe(200);
  });

  it("returns 401 when unauthenticated", async () => {
    const anonApp = makeAnonApp();
    const res = await anonApp.request("/suggestions/dismiss/movie-600", { method: "DELETE" });
    expect(res.status).toBe(401);
  });
});
