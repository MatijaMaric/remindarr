import { describe, it, expect, beforeEach, afterEach, afterAll, spyOn } from "bun:test";
import { Hono } from "hono";
import type { AppEnv } from "../types";
import { CONFIG } from "../config";
import { setupTestDb, teardownTestDb } from "../test-utils/setup";
import { trackTitle, upsertTitles, createUser } from "../db/repository";
import { watchTitle } from "../db/repository/watched-titles";
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

  it("returns suggestions grouped by source title", async () => {
    await upsertTitles([makeParsedTitle({ id: "movie-100", tmdbId: "100", objectType: "MOVIE" })]);
    await trackTitle("movie-100", mockUserId);

    (tmdbClient.fetchMovieSuggestions as any).mockResolvedValueOnce({
      results: [
        makeTmdbDiscoverMovie({ id: 200, title: "Suggestion A", vote_average: 8.0 }),
        makeTmdbDiscoverMovie({ id: 201, title: "Suggestion B", vote_average: 7.0 }),
      ],
      page: 1,
      total_pages: 1,
      total_results: 2,
    });

    const res = await app.request("/suggestions");
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(Array.isArray(body.flat)).toBe(true);
    expect(body.flat.length).toBeGreaterThan(0);
    expect(Array.isArray(body.groups)).toBe(true);
    expect(body.groups[0].source.id).toBe("movie-100");
    expect(body.groups[0].suggestions.length).toBe(2);
    expect(tmdbClient.fetchMovieSuggestions).toHaveBeenCalledWith(100, 1);
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
      page: 1,
      total_pages: 1,
      total_results: 1,
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
      page: 1,
      total_pages: 1,
      total_results: 1,
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
      .mockResolvedValueOnce({
        results: [makeTmdbDiscoverMovie({ id: 999, title: "Shared Suggestion" })],
        page: 1, total_pages: 1, total_results: 1,
      })
      .mockResolvedValueOnce({
        results: [makeTmdbDiscoverMovie({ id: 999, title: "Shared Suggestion" })],
        page: 1, total_pages: 1, total_results: 1,
      });

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
      results: Array.from({ length: 20 }, (_, i) =>
        makeTmdbDiscoverMovie({ id: 400 + i, title: `Suggestion ${i}` })
      ),
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
});
