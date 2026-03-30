import { describe, it, expect, beforeEach, afterEach, afterAll, spyOn } from "bun:test";
import { Hono } from "hono";
import type { TmdbDiscoverMovieResult, TmdbDiscoverTvResult } from "../tmdb/types";
import type { AppEnv } from "../types";
import { CONFIG } from "../config";
import { setupTestDb, teardownTestDb } from "../test-utils/setup";
import { upsertTitles, trackTitle, createUser, getOffersForTitle } from "../db/repository";
import { makeParsedTitle, makeTmdbDiscoverMovie, makeTmdbDiscoverTv, makeTmdbMovieDetails, makeTmdbTvDetails } from "../test-utils/fixtures";
import * as tmdbClient from "../tmdb/client";

const browseApp = (await import("./browse")).default;

let app: Hono<AppEnv>;
let spies: ReturnType<typeof spyOn>[] = [];

beforeEach(() => {
  setupTestDb();

  app = new Hono<AppEnv>();
  app.route("/browse", browseApp);

  spies = [
    spyOn(tmdbClient, "discoverMovies").mockResolvedValue({ results: [] as TmdbDiscoverMovieResult[], total_pages: 1, total_results: 0, page: 1 }),
    spyOn(tmdbClient, "discoverTv").mockResolvedValue({ results: [] as TmdbDiscoverTvResult[], total_pages: 1, total_results: 0, page: 1 }),
    spyOn(tmdbClient, "fetchMovieDetails").mockResolvedValue({} as any),
    spyOn(tmdbClient, "fetchTvDetails").mockResolvedValue({} as any),
    spyOn(tmdbClient, "getMovieGenres").mockResolvedValue(new Map([[28, "Action"], [878, "Science Fiction"]])),
    spyOn(tmdbClient, "getTvGenres").mockResolvedValue(new Map([[18, "Drama"], [10765, "Sci-Fi & Fantasy"]])),
    spyOn(tmdbClient, "getMovieWatchProviders").mockResolvedValue([
      { id: 8, name: "Netflix", iconUrl: "https://image.tmdb.org/t/p/w92/nf.jpg" },
      { id: 337, name: "Disney Plus", iconUrl: "https://image.tmdb.org/t/p/w92/dp.jpg" },
    ]),
    spyOn(tmdbClient, "getTvWatchProviders").mockResolvedValue([
      { id: 8, name: "Netflix", iconUrl: "https://image.tmdb.org/t/p/w92/nf.jpg" },
      { id: 1899, name: "Max", iconUrl: "https://image.tmdb.org/t/p/w92/max.jpg" },
    ]),
    spyOn(tmdbClient, "getLanguages").mockResolvedValue([
      { code: "en", name: "English" },
      { code: "ja", name: "Japanese" },
      { code: "fr", name: "French" },
    ]),
    spyOn(tmdbClient, "searchMulti").mockResolvedValue({ results: [], total_pages: 1, total_results: 0, page: 1 } as any),
  ];
});

afterEach(() => {
  for (const spy of spies) spy.mockRestore();
  spies = [];
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
    (tmdbClient.discoverMovies as any).mockResolvedValueOnce({
      results: [movie], total_pages: 5, total_results: 100, page: 1,
    });
    (tmdbClient.fetchMovieDetails as any).mockResolvedValueOnce(makeTmdbMovieDetails({ id: movie.id }));

    const res = await app.request("/browse?category=popular&type=MOVIE");
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.titles).toHaveLength(1);
    expect(body.page).toBe(1);
    expect(body.totalPages).toBe(5);
    expect(body.totalResults).toBe(100);
    expect(tmdbClient.discoverMovies).toHaveBeenCalledTimes(1);
    const callArgs = ((tmdbClient.discoverMovies as any).mock.calls[0] as unknown[])[0] as Record<string, unknown>;
    expect(callArgs.sortBy).toBe("popularity.desc");
    expect(tmdbClient.discoverTv).not.toHaveBeenCalled();
  });

  it("fetches popular TV when type=SHOW", async () => {
    const tv = makeTmdbDiscoverTv();
    (tmdbClient.discoverTv as any).mockResolvedValueOnce({
      results: [tv], total_pages: 3, total_results: 60, page: 1,
    });
    (tmdbClient.fetchTvDetails as any).mockResolvedValueOnce(makeTmdbTvDetails({ id: tv.id }));

    const res = await app.request("/browse?category=popular&type=SHOW");
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.titles).toHaveLength(1);
    expect(tmdbClient.discoverTv).toHaveBeenCalledTimes(1);
    const callArgs = ((tmdbClient.discoverTv as any).mock.calls[0] as unknown[])[0] as Record<string, unknown>;
    expect(callArgs.sortBy).toBe("popularity.desc");
    expect(tmdbClient.discoverMovies).not.toHaveBeenCalled();
  });

  it("fetches both types when type is omitted", async () => {
    const movie = makeTmdbDiscoverMovie();
    const tv = makeTmdbDiscoverTv();
    (tmdbClient.discoverMovies as any).mockResolvedValueOnce({
      results: [movie], total_pages: 2, total_results: 40, page: 1,
    });
    (tmdbClient.discoverTv as any).mockResolvedValueOnce({
      results: [tv], total_pages: 3, total_results: 60, page: 1,
    });
    (tmdbClient.fetchMovieDetails as any).mockResolvedValueOnce(makeTmdbMovieDetails({ id: movie.id }));
    (tmdbClient.fetchTvDetails as any).mockResolvedValueOnce(makeTmdbTvDetails({ id: tv.id }));

    const res = await app.request("/browse?category=popular");
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.titles).toHaveLength(2);
    expect(body.totalPages).toBe(3); // max of 2 and 3
    expect(body.totalResults).toBe(100); // 40 + 60
    expect(tmdbClient.discoverMovies).toHaveBeenCalled();
    expect(tmdbClient.discoverTv).toHaveBeenCalled();
  });

  it("uses discover endpoint for upcoming movies with date range", async () => {
    (tmdbClient.discoverMovies as any).mockResolvedValueOnce({
      results: [], total_pages: 1, total_results: 0, page: 1,
    });

    const res = await app.request("/browse?category=upcoming&type=MOVIE");
    expect(res.status).toBe(200);
    expect(tmdbClient.discoverMovies).toHaveBeenCalledTimes(1);
    const callArgs = ((tmdbClient.discoverMovies as any).mock.calls[0] as unknown[])[0] as Record<string, unknown>;
    expect(callArgs.releaseDateGte).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(callArgs.releaseDateLte).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(callArgs.sortBy).toBe("release_date.asc");
    expect(callArgs.page).toBe(1);
  });

  it("uses discover endpoint for upcoming TV shows with date range", async () => {
    (tmdbClient.discoverTv as any).mockResolvedValueOnce({
      results: [], total_pages: 1, total_results: 0, page: 1,
    });

    const res = await app.request("/browse?category=upcoming&type=SHOW");
    expect(res.status).toBe(200);
    expect(tmdbClient.discoverTv).toHaveBeenCalledTimes(1);
    const callArgs = ((tmdbClient.discoverTv as any).mock.calls[0] as unknown[])[0] as Record<string, unknown>;
    expect(callArgs.firstAirDateGte).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(callArgs.firstAirDateLte).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(callArgs.sortBy).toBe("first_air_date.asc");
  });

  it("uses top_rated discover for top_rated category", async () => {
    (tmdbClient.discoverMovies as any).mockResolvedValueOnce({
      results: [], total_pages: 1, total_results: 0, page: 1,
    });

    const res = await app.request("/browse?category=top_rated&type=MOVIE");
    expect(res.status).toBe(200);
    expect(tmdbClient.discoverMovies).toHaveBeenCalledTimes(1);
    const callArgs = ((tmdbClient.discoverMovies as any).mock.calls[0] as unknown[])[0] as Record<string, unknown>;
    expect(callArgs.sortBy).toBe("vote_average.desc");
    expect(callArgs.voteCountGte).toBe("200");
  });

  it("clamps negative page to 1", async () => {
    (tmdbClient.discoverMovies as any).mockResolvedValueOnce({
      results: [], total_pages: 10, total_results: 200, page: 1,
    });

    const res = await app.request("/browse?category=popular&type=MOVIE&page=-5");
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.page).toBe(1);
    const callArgs = ((tmdbClient.discoverMovies as any).mock.calls[0] as unknown[])[0] as Record<string, unknown>;
    expect(callArgs.page).toBe(1);
  });

  it("clamps NaN page to 1", async () => {
    (tmdbClient.discoverMovies as any).mockResolvedValueOnce({
      results: [], total_pages: 10, total_results: 200, page: 1,
    });

    const res = await app.request("/browse?category=popular&type=MOVIE&page=abc");
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.page).toBe(1);
    const callArgs = ((tmdbClient.discoverMovies as any).mock.calls[0] as unknown[])[0] as Record<string, unknown>;
    expect(callArgs.page).toBe(1);
  });

  it("passes page parameter correctly", async () => {
    (tmdbClient.discoverMovies as any).mockResolvedValueOnce({
      results: [], total_pages: 10, total_results: 200, page: 3,
    });

    const res = await app.request("/browse?category=popular&type=MOVIE&page=3");
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.page).toBe(3);
    const callArgs = ((tmdbClient.discoverMovies as any).mock.calls[0] as unknown[])[0] as Record<string, unknown>;
    expect(callArgs.page).toBe(3);
  });

  it("falls back to basic data when detail fetch fails", async () => {
    const movie = makeTmdbDiscoverMovie();
    (tmdbClient.discoverMovies as any).mockResolvedValueOnce({
      results: [movie], total_pages: 1, total_results: 1, page: 1,
    });
    (tmdbClient.fetchMovieDetails as any).mockRejectedValueOnce(new Error("API error"));

    const res = await app.request("/browse?category=popular&type=MOVIE");
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.titles).toHaveLength(1);
    expect(body.titles[0].title).toBe("Discover Movie");
  });

  it("returns isTracked=false when no user is authenticated", async () => {
    const movie = makeTmdbDiscoverMovie();
    (tmdbClient.discoverMovies as any).mockResolvedValueOnce({
      results: [movie], total_pages: 1, total_results: 1, page: 1,
    });
    (tmdbClient.fetchMovieDetails as any).mockResolvedValueOnce(makeTmdbMovieDetails({ id: movie.id }));

    const res = await app.request("/browse?category=popular&type=MOVIE");
    const body = await res.json();

    expect(body.titles[0].isTracked).toBe(false);
  });

  it("returns genres and offers in response for filtering", async () => {
    const movie = makeTmdbDiscoverMovie({ id: 900 });
    (tmdbClient.discoverMovies as any).mockResolvedValueOnce({
      results: [movie], total_pages: 1, total_results: 1, page: 1,
    });
    (tmdbClient.fetchMovieDetails as any).mockResolvedValueOnce(makeTmdbMovieDetails({
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

  it("returns availableGenres with grouped canonical names from TMDB genre maps", async () => {
    (tmdbClient.discoverMovies as any).mockResolvedValueOnce({
      results: [], total_pages: 1, total_results: 0, page: 1,
    });

    const res = await app.request("/browse?category=popular&type=MOVIE");
    const body = await res.json();

    expect(body.availableGenres).toBeDefined();
    // "Action" should be grouped into "Action & Adventure"
    expect(body.availableGenres).toContain("Action & Adventure");
    expect(body.availableGenres).not.toContain("Action");
    // "Science Fiction" and "Sci-Fi & Fantasy" should both map to "Sci-Fi & Fantasy"
    expect(body.availableGenres).toContain("Sci-Fi & Fantasy");
    expect(body.availableGenres).not.toContain("Science Fiction");
    expect(body.availableGenres).toContain("Drama");
  });

  it("returns availableProviders and availableLanguages from TMDB", async () => {
    (tmdbClient.discoverMovies as any).mockResolvedValueOnce({
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
    await upsertTitles([makeParsedTitle({ id: "movie-555" })]);
    const userId = await createUser("testuser", "hash");
    await trackTitle("movie-555", userId);

    const movie = makeTmdbDiscoverMovie({ id: 555 });
    (tmdbClient.discoverMovies as any).mockResolvedValueOnce({
      results: [movie], total_pages: 1, total_results: 1, page: 1,
    });
    (tmdbClient.fetchMovieDetails as any).mockResolvedValueOnce(makeTmdbMovieDetails({ id: 555 }));

    const authedApp = new Hono<AppEnv>();
    authedApp.use("/browse/*", async (c, next) => {
      c.set("user", { id: userId, username: "testuser", name: null, role: null, is_admin: false });
      await next();
    });
    authedApp.route("/browse", browseApp);

    const res = await authedApp.request("/browse?category=popular&type=MOVIE");
    const body = await res.json();

    expect(body.titles[0].isTracked).toBe(true);
  });

  it("persists titles with offers to database", async () => {
    const movie = makeTmdbDiscoverMovie({ id: 900 });
    (tmdbClient.discoverMovies as any).mockResolvedValueOnce({
      results: [movie], total_pages: 1, total_results: 1, page: 1,
    });
    (tmdbClient.fetchMovieDetails as any).mockResolvedValueOnce(makeTmdbMovieDetails({
      id: 900,
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
    expect(res.status).toBe(200);

    // Wait for fire-and-forget upsert to complete
    await new Promise((r) => setTimeout(r, 100));

    const offers = await getOffersForTitle("movie-900");
    expect(offers.length).toBeGreaterThan(0);
    expect(offers[0].provider_name).toBe("Netflix");
  });

  describe("genre filtering", () => {
    it("expands grouped genre to all constituent TMDB IDs", async () => {
      (tmdbClient.discoverMovies as any).mockResolvedValueOnce({
        results: [], total_pages: 1, total_results: 0, page: 1,
      });

      // "Action & Adventure" should expand to Action (28) from movies + Action & Adventure TV genres
      const res = await app.request("/browse?category=popular&type=MOVIE&genre=Action%20%26%20Adventure");
      expect(res.status).toBe(200);

      const callArgs = ((tmdbClient.discoverMovies as any).mock.calls[0] as unknown[])[0] as Record<string, unknown>;
      const filters = callArgs.filters as Record<string, string>;
      // Should contain movie Action ID (28)
      expect(filters.withGenres).toBeDefined();
      expect(filters.withGenres!.split("|")).toContain("28");
    });

    it("passes TV genre filter correctly for grouped genres", async () => {
      (tmdbClient.discoverTv as any).mockResolvedValueOnce({
        results: [], total_pages: 1, total_results: 0, page: 1,
      });

      const res = await app.request("/browse?category=upcoming&type=SHOW&genre=Sci-Fi%20%26%20Fantasy");
      expect(res.status).toBe(200);

      const callArgs = ((tmdbClient.discoverTv as any).mock.calls[0] as unknown[])[0] as Record<string, unknown>;
      const filters = callArgs.filters as Record<string, string>;
      expect(filters.withGenres).toBeDefined();
      // Should contain both Science Fiction (878) and Sci-Fi & Fantasy (10765)
      const ids = filters.withGenres!.split("|");
      expect(ids).toContain("878");
      expect(ids).toContain("10765");
    });

    it("does not pass genre filter when genre name is not found", async () => {
      (tmdbClient.discoverMovies as any).mockResolvedValueOnce({
        results: [], total_pages: 1, total_results: 0, page: 1,
      });

      const res = await app.request("/browse?category=popular&type=MOVIE&genre=Nonexistent");
      expect(res.status).toBe(200);

      const callArgs = ((tmdbClient.discoverMovies as any).mock.calls[0] as unknown[])[0] as Record<string, unknown>;
      const filters = callArgs.filters as Record<string, string>;
      expect(filters.withGenres).toBeUndefined();
    });
  });

  describe("provider filtering", () => {
    it("passes provider ID to discover filters", async () => {
      (tmdbClient.discoverMovies as any).mockResolvedValueOnce({
        results: [], total_pages: 1, total_results: 0, page: 1,
      });

      const res = await app.request("/browse?category=popular&type=MOVIE&provider=8");
      expect(res.status).toBe(200);

      const callArgs = ((tmdbClient.discoverMovies as any).mock.calls[0] as unknown[])[0] as Record<string, unknown>;
      const filters = callArgs.filters as Record<string, string>;
      expect(filters.withProviders).toBe("8");
    });
  });

  describe("language filtering", () => {
    it("passes language code to discover filters", async () => {
      (tmdbClient.discoverTv as any).mockResolvedValueOnce({
        results: [], total_pages: 1, total_results: 0, page: 1,
      });

      const res = await app.request("/browse?category=popular&type=SHOW&language=ja");
      expect(res.status).toBe(200);

      const callArgs = ((tmdbClient.discoverTv as any).mock.calls[0] as unknown[])[0] as Record<string, unknown>;
      const filters = callArgs.filters as Record<string, string>;
      expect(filters.withOriginalLanguage).toBe("ja");
    });
  });

  describe("combined filters", () => {
    it("passes all filters together", async () => {
      (tmdbClient.discoverMovies as any).mockResolvedValueOnce({
        results: [], total_pages: 1, total_results: 0, page: 1,
      });

      const res = await app.request("/browse?category=top_rated&type=MOVIE&genre=Drama&provider=8&language=en");
      expect(res.status).toBe(200);

      const callArgs = ((tmdbClient.discoverMovies as any).mock.calls[0] as unknown[])[0] as Record<string, unknown>;
      const filters = callArgs.filters as Record<string, string>;
      // Drama is not grouped, so it maps to a single ID
      expect(filters.withGenres).toBeDefined();
      expect(filters.withProviders).toBe("8");
      expect(filters.withOriginalLanguage).toBe("en");
      expect(callArgs.sortBy).toBe("vote_average.desc");
    });
  });

  describe("regionProviderIds and priorityLanguageCodes", () => {
    it("returns regionProviderIds in the response", async () => {
      (tmdbClient.discoverMovies as any).mockResolvedValueOnce({
        results: [], total_pages: 1, total_results: 0, page: 1,
      });

      const res = await app.request("/browse?category=popular&type=MOVIE");
      const body = await res.json();

      expect(body.regionProviderIds).toBeDefined();
      expect(body.regionProviderIds).toContain(8);   // Netflix
      expect(body.regionProviderIds).toContain(337);  // Disney Plus
      expect(body.regionProviderIds).toContain(1899); // Max
    });

    it("returns priorityLanguageCodes in the response", async () => {
      (tmdbClient.discoverMovies as any).mockResolvedValueOnce({
        results: [], total_pages: 1, total_results: 0, page: 1,
      });

      const res = await app.request("/browse?category=popular&type=MOVIE");
      const body = await res.json();

      expect(body.priorityLanguageCodes).toBeDefined();
      expect(body.priorityLanguageCodes).toContain("en");
      expect(body.priorityLanguageCodes).toContain("fr");
      expect(body.priorityLanguageCodes).toContain("ja");
    });
  });
});
