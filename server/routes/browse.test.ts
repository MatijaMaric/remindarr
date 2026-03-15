import { describe, it, expect, beforeEach, afterAll, mock } from "bun:test";
import { Hono } from "hono";
import type { TmdbDiscoverMovieResult, TmdbDiscoverTvResult } from "../tmdb/types";
import type { AppEnv } from "../types";
import { CONFIG } from "../config";
import { setupTestDb, teardownTestDb } from "../test-utils/setup";
import { upsertTitles, trackTitle, createUser } from "../db/repository";
import { makeParsedTitle } from "../test-utils/fixtures";

const mockDiscoverMovies = mock(() => Promise.resolve({ results: [] as TmdbDiscoverMovieResult[], total_pages: 1, total_results: 0, page: 1 }));
const mockDiscoverTv = mock(() => Promise.resolve({ results: [] as TmdbDiscoverTvResult[], total_pages: 1, total_results: 0, page: 1 }));
const mockFetchMovieDetails = mock(() => Promise.resolve({}));
const mockFetchTvDetails = mock(() => Promise.resolve({}));
const mockGetMovieGenres = mock(() => Promise.resolve(new Map([[28, "Action"], [878, "Science Fiction"]])));
const mockGetTvGenres = mock(() => Promise.resolve(new Map([[18, "Drama"], [10765, "Sci-Fi & Fantasy"]])));
const mockGetMovieWatchProviders = mock(() => Promise.resolve([
  { id: 8, name: "Netflix", iconUrl: "https://image.tmdb.org/t/p/w92/nf.jpg" },
  { id: 337, name: "Disney Plus", iconUrl: "https://image.tmdb.org/t/p/w92/dp.jpg" },
]));
const mockGetTvWatchProviders = mock(() => Promise.resolve([
  { id: 8, name: "Netflix", iconUrl: "https://image.tmdb.org/t/p/w92/nf.jpg" },
  { id: 1899, name: "Max", iconUrl: "https://image.tmdb.org/t/p/w92/max.jpg" },
]));
const mockGetLanguages = mock(() => Promise.resolve([
  { code: "en", name: "English" },
  { code: "ja", name: "Japanese" },
  { code: "fr", name: "French" },
]));

const realClient = await import("../tmdb/client");

mock.module("../tmdb/client", () => ({
  ...realClient,
  discoverMovies: mockDiscoverMovies,
  discoverTv: mockDiscoverTv,
  fetchMovieDetails: mockFetchMovieDetails,
  fetchTvDetails: mockFetchTvDetails,
  getMovieGenres: mockGetMovieGenres,
  getTvGenres: mockGetTvGenres,
  getMovieWatchProviders: mockGetMovieWatchProviders,
  getTvWatchProviders: mockGetTvWatchProviders,
  getLanguages: mockGetLanguages,
  searchMulti: mock(() => Promise.resolve({ results: [], total_pages: 1, total_results: 0, page: 1 })),
}));

const { makeTmdbDiscoverMovie, makeTmdbDiscoverTv, makeTmdbMovieDetails, makeTmdbTvDetails } = await import("../test-utils/fixtures");
const browseApp = (await import("./browse")).default;

let app: Hono<AppEnv>;

beforeEach(() => {
  setupTestDb();

  app = new Hono<AppEnv>();
  app.route("/browse", browseApp);

  mockDiscoverMovies.mockClear();
  mockDiscoverTv.mockClear();
  mockFetchMovieDetails.mockClear();
  mockFetchTvDetails.mockClear();
  mockGetMovieWatchProviders.mockClear();
  mockGetTvWatchProviders.mockClear();
  mockGetLanguages.mockClear();
});

afterAll(() => {
  teardownTestDb();
});

describe("GET /browse", () => {
  it("returns 400 when category is missing", async () => {
    const res = await app.request("/browse");
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("Invalid category");
  });

  it("returns 400 for invalid category", async () => {
    const res = await app.request("/browse?category=invalid");
    expect(res.status).toBe(400);
  });

  it("fetches popular movies when type=MOVIE", async () => {
    const movie = makeTmdbDiscoverMovie();
    mockDiscoverMovies.mockResolvedValueOnce({
      results: [movie], total_pages: 5, total_results: 100, page: 1,
    });
    mockFetchMovieDetails.mockResolvedValueOnce(makeTmdbMovieDetails({ id: movie.id }));

    const res = await app.request("/browse?category=popular&type=MOVIE");
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.titles).toHaveLength(1);
    expect(body.page).toBe(1);
    expect(body.totalPages).toBe(5);
    expect(body.totalResults).toBe(100);
    expect(mockDiscoverMovies).toHaveBeenCalledTimes(1);
    const callArgs = (mockDiscoverMovies.mock.calls[0] as unknown[])[0] as Record<string, unknown>;
    expect(callArgs.sortBy).toBe("popularity.desc");
    expect(mockDiscoverTv).not.toHaveBeenCalled();
  });

  it("fetches popular TV when type=SHOW", async () => {
    const tv = makeTmdbDiscoverTv();
    mockDiscoverTv.mockResolvedValueOnce({
      results: [tv], total_pages: 3, total_results: 60, page: 1,
    });
    mockFetchTvDetails.mockResolvedValueOnce(makeTmdbTvDetails({ id: tv.id }));

    const res = await app.request("/browse?category=popular&type=SHOW");
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.titles).toHaveLength(1);
    expect(mockDiscoverTv).toHaveBeenCalledTimes(1);
    const callArgs = (mockDiscoverTv.mock.calls[0] as unknown[])[0] as Record<string, unknown>;
    expect(callArgs.sortBy).toBe("popularity.desc");
    expect(mockDiscoverMovies).not.toHaveBeenCalled();
  });

  it("fetches both types when type is omitted", async () => {
    const movie = makeTmdbDiscoverMovie();
    const tv = makeTmdbDiscoverTv();
    mockDiscoverMovies.mockResolvedValueOnce({
      results: [movie], total_pages: 2, total_results: 40, page: 1,
    });
    mockDiscoverTv.mockResolvedValueOnce({
      results: [tv], total_pages: 3, total_results: 60, page: 1,
    });
    mockFetchMovieDetails.mockResolvedValueOnce(makeTmdbMovieDetails({ id: movie.id }));
    mockFetchTvDetails.mockResolvedValueOnce(makeTmdbTvDetails({ id: tv.id }));

    const res = await app.request("/browse?category=popular");
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.titles).toHaveLength(2);
    expect(body.totalPages).toBe(3); // max of 2 and 3
    expect(body.totalResults).toBe(100); // 40 + 60
    expect(mockDiscoverMovies).toHaveBeenCalled();
    expect(mockDiscoverTv).toHaveBeenCalled();
  });

  it("uses discover endpoint for upcoming movies with date range", async () => {
    mockDiscoverMovies.mockResolvedValueOnce({
      results: [], total_pages: 1, total_results: 0, page: 1,
    });

    const res = await app.request("/browse?category=upcoming&type=MOVIE");
    expect(res.status).toBe(200);
    expect(mockDiscoverMovies).toHaveBeenCalledTimes(1);
    const callArgs = (mockDiscoverMovies.mock.calls[0] as unknown[])[0] as Record<string, unknown>;
    expect(callArgs.releaseDateGte).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(callArgs.releaseDateLte).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(callArgs.sortBy).toBe("release_date.asc");
    expect(callArgs.page).toBe(1);
  });

  it("uses discover endpoint for upcoming TV shows with date range", async () => {
    mockDiscoverTv.mockResolvedValueOnce({
      results: [], total_pages: 1, total_results: 0, page: 1,
    });

    const res = await app.request("/browse?category=upcoming&type=SHOW");
    expect(res.status).toBe(200);
    expect(mockDiscoverTv).toHaveBeenCalledTimes(1);
    const callArgs = (mockDiscoverTv.mock.calls[0] as unknown[])[0] as Record<string, unknown>;
    expect(callArgs.firstAirDateGte).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(callArgs.firstAirDateLte).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(callArgs.sortBy).toBe("first_air_date.asc");
  });

  it("uses top_rated discover for top_rated category", async () => {
    mockDiscoverMovies.mockResolvedValueOnce({
      results: [], total_pages: 1, total_results: 0, page: 1,
    });

    const res = await app.request("/browse?category=top_rated&type=MOVIE");
    expect(res.status).toBe(200);
    expect(mockDiscoverMovies).toHaveBeenCalledTimes(1);
    const callArgs = (mockDiscoverMovies.mock.calls[0] as unknown[])[0] as Record<string, unknown>;
    expect(callArgs.sortBy).toBe("vote_average.desc");
    expect(callArgs.voteCountGte).toBe("200");
  });

  it("clamps negative page to 1", async () => {
    mockDiscoverMovies.mockResolvedValueOnce({
      results: [], total_pages: 10, total_results: 200, page: 1,
    });

    const res = await app.request("/browse?category=popular&type=MOVIE&page=-5");
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.page).toBe(1);
    const callArgs = (mockDiscoverMovies.mock.calls[0] as unknown[])[0] as Record<string, unknown>;
    expect(callArgs.page).toBe(1);
  });

  it("clamps NaN page to 1", async () => {
    mockDiscoverMovies.mockResolvedValueOnce({
      results: [], total_pages: 10, total_results: 200, page: 1,
    });

    const res = await app.request("/browse?category=popular&type=MOVIE&page=abc");
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.page).toBe(1);
    const callArgs = (mockDiscoverMovies.mock.calls[0] as unknown[])[0] as Record<string, unknown>;
    expect(callArgs.page).toBe(1);
  });

  it("passes page parameter correctly", async () => {
    mockDiscoverMovies.mockResolvedValueOnce({
      results: [], total_pages: 10, total_results: 200, page: 3,
    });

    const res = await app.request("/browse?category=popular&type=MOVIE&page=3");
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.page).toBe(3);
    const callArgs = (mockDiscoverMovies.mock.calls[0] as unknown[])[0] as Record<string, unknown>;
    expect(callArgs.page).toBe(3);
  });

  it("falls back to basic data when detail fetch fails", async () => {
    const movie = makeTmdbDiscoverMovie();
    mockDiscoverMovies.mockResolvedValueOnce({
      results: [movie], total_pages: 1, total_results: 1, page: 1,
    });
    mockFetchMovieDetails.mockRejectedValueOnce(new Error("API error"));

    const res = await app.request("/browse?category=popular&type=MOVIE");
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.titles).toHaveLength(1);
    expect(body.titles[0].title).toBe("Discover Movie");
  });

  it("returns isTracked=false when no user is authenticated", async () => {
    const movie = makeTmdbDiscoverMovie();
    mockDiscoverMovies.mockResolvedValueOnce({
      results: [movie], total_pages: 1, total_results: 1, page: 1,
    });
    mockFetchMovieDetails.mockResolvedValueOnce(makeTmdbMovieDetails({ id: movie.id }));

    const res = await app.request("/browse?category=popular&type=MOVIE");
    const body = await res.json();

    expect(body.titles[0].isTracked).toBe(false);
  });

  it("returns genres and offers in response for filtering", async () => {
    const movie = makeTmdbDiscoverMovie({ id: 900 });
    mockDiscoverMovies.mockResolvedValueOnce({
      results: [movie], total_pages: 1, total_results: 1, page: 1,
    });
    mockFetchMovieDetails.mockResolvedValueOnce(makeTmdbMovieDetails({
      id: 900,
      genres: [{ id: 28, name: "Action" }, { id: 35, name: "Comedy" }],
      "watch/providers": {
        id: 900,
        results: {
          [CONFIG.COUNTRY]: {
            link: "https://tmdb.org",
            flatrate: [{ logo_path: "/nf.jpg", provider_id: 8, provider_name: "Netflix", display_priority: 1 }],
          },
        },
      },
    }));

    const res = await app.request("/browse?category=popular&type=MOVIE");
    const body = await res.json();

    expect(body.titles).toHaveLength(1);
    expect(body.titles[0].genres).toEqual(["Action", "Comedy"]);
    expect(body.titles[0].offers.length).toBeGreaterThan(0);
    expect(body.titles[0].offers[0].providerName).toBe("Netflix");
  });

  it("returns availableGenres from TMDB genre maps", async () => {
    mockDiscoverMovies.mockResolvedValueOnce({
      results: [], total_pages: 1, total_results: 0, page: 1,
    });

    const res = await app.request("/browse?category=popular&type=MOVIE");
    const body = await res.json();

    expect(body.availableGenres).toBeDefined();
    expect(body.availableGenres).toContain("Action");
    expect(body.availableGenres).toContain("Drama");
    expect(body.availableGenres).toContain("Science Fiction");
    expect(body.availableGenres).toContain("Sci-Fi & Fantasy");
  });

  it("returns availableProviders and availableLanguages from TMDB", async () => {
    mockDiscoverMovies.mockResolvedValueOnce({
      results: [], total_pages: 1, total_results: 0, page: 1,
    });

    const res = await app.request("/browse?category=popular&type=MOVIE");
    const body = await res.json();

    expect(body.availableProviders).toBeDefined();
    expect(body.availableProviders.length).toBeGreaterThan(0);
    expect(body.availableProviders.find((p: any) => p.name === "Netflix")).toBeDefined();
    expect(body.availableProviders.find((p: any) => p.name === "Max")).toBeDefined();

    expect(body.availableLanguages).toBeDefined();
    expect(body.availableLanguages.length).toBeGreaterThan(0);
    expect(body.availableLanguages.find((l: any) => l.code === "en")).toBeDefined();
  });

  it("returns isTracked=true for tracked titles when user is authenticated", async () => {
    // Set up real DB data for tracking
    upsertTitles([makeParsedTitle({ id: "movie-555" })]);
    const userId = createUser("testuser", "hash");
    trackTitle("movie-555", userId);

    const movie = makeTmdbDiscoverMovie({ id: 555 });
    mockDiscoverMovies.mockResolvedValueOnce({
      results: [movie], total_pages: 1, total_results: 1, page: 1,
    });
    mockFetchMovieDetails.mockResolvedValueOnce(makeTmdbMovieDetails({ id: 555 }));

    const authedApp = new Hono<AppEnv>();
    authedApp.use("/browse/*", async (c, next) => {
      c.set("user", { id: userId, username: "testuser", display_name: null, auth_provider: "test", is_admin: false });
      await next();
    });
    authedApp.route("/browse", browseApp);

    const res = await authedApp.request("/browse?category=popular&type=MOVIE");
    const body = await res.json();

    expect(body.titles[0].isTracked).toBe(true);
  });

  describe("genre filtering", () => {
    it("passes genre filter as TMDB genre ID to discover", async () => {
      mockDiscoverMovies.mockResolvedValueOnce({
        results: [], total_pages: 1, total_results: 0, page: 1,
      });

      const res = await app.request("/browse?category=popular&type=MOVIE&genre=Action");
      expect(res.status).toBe(200);

      const callArgs = (mockDiscoverMovies.mock.calls[0] as unknown[])[0] as Record<string, unknown>;
      const filters = callArgs.filters as Record<string, string>;
      expect(filters.withGenres).toBe("28"); // Action = genre ID 28
    });

    it("passes TV genre filter correctly", async () => {
      mockDiscoverTv.mockResolvedValueOnce({
        results: [], total_pages: 1, total_results: 0, page: 1,
      });

      const res = await app.request("/browse?category=upcoming&type=SHOW&genre=Sci-Fi%20%26%20Fantasy");
      expect(res.status).toBe(200);

      const callArgs = (mockDiscoverTv.mock.calls[0] as unknown[])[0] as Record<string, unknown>;
      const filters = callArgs.filters as Record<string, string>;
      expect(filters.withGenres).toBe("10765"); // Sci-Fi & Fantasy
    });

    it("does not pass genre filter when genre name is not found", async () => {
      mockDiscoverMovies.mockResolvedValueOnce({
        results: [], total_pages: 1, total_results: 0, page: 1,
      });

      const res = await app.request("/browse?category=popular&type=MOVIE&genre=Nonexistent");
      expect(res.status).toBe(200);

      const callArgs = (mockDiscoverMovies.mock.calls[0] as unknown[])[0] as Record<string, unknown>;
      const filters = callArgs.filters as Record<string, string>;
      expect(filters.withGenres).toBeUndefined();
    });
  });

  describe("provider filtering", () => {
    it("passes provider ID to discover filters", async () => {
      mockDiscoverMovies.mockResolvedValueOnce({
        results: [], total_pages: 1, total_results: 0, page: 1,
      });

      const res = await app.request("/browse?category=popular&type=MOVIE&provider=8");
      expect(res.status).toBe(200);

      const callArgs = (mockDiscoverMovies.mock.calls[0] as unknown[])[0] as Record<string, unknown>;
      const filters = callArgs.filters as Record<string, string>;
      expect(filters.withProviders).toBe("8");
    });
  });

  describe("language filtering", () => {
    it("passes language code to discover filters", async () => {
      mockDiscoverTv.mockResolvedValueOnce({
        results: [], total_pages: 1, total_results: 0, page: 1,
      });

      const res = await app.request("/browse?category=popular&type=SHOW&language=ja");
      expect(res.status).toBe(200);

      const callArgs = (mockDiscoverTv.mock.calls[0] as unknown[])[0] as Record<string, unknown>;
      const filters = callArgs.filters as Record<string, string>;
      expect(filters.withOriginalLanguage).toBe("ja");
    });
  });

  describe("combined filters", () => {
    it("passes all filters together", async () => {
      mockDiscoverMovies.mockResolvedValueOnce({
        results: [], total_pages: 1, total_results: 0, page: 1,
      });

      const res = await app.request("/browse?category=top_rated&type=MOVIE&genre=Action&provider=8&language=en");
      expect(res.status).toBe(200);

      const callArgs = (mockDiscoverMovies.mock.calls[0] as unknown[])[0] as Record<string, unknown>;
      const filters = callArgs.filters as Record<string, string>;
      expect(filters.withGenres).toBe("28");
      expect(filters.withProviders).toBe("8");
      expect(filters.withOriginalLanguage).toBe("en");
      expect(callArgs.sortBy).toBe("vote_average.desc");
    });
  });
});
