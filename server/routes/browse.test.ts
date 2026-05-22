import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  afterAll,
  spyOn,
} from "bun:test";
import { Hono } from "hono";
import type {
  TmdbDiscoverMovieResult,
  TmdbDiscoverTvResult,
} from "../tmdb/types";
import type { AppEnv } from "../types";
import { CONFIG } from "../config";
import { setupTestDb, teardownTestDb } from "../test-utils/setup";
import {
  upsertTitles,
  trackTitle,
  createUser,
  getOffersForTitle,
} from "../db/repository";
import {
  makeParsedTitle,
  makeTmdbDiscoverMovie,
  makeTmdbDiscoverTv,
  makeTmdbMovieDetails,
  makeTmdbTvDetails,
} from "../test-utils/fixtures";
import * as tmdbClient from "../tmdb/client";
import * as repository from "../db/repository";
import { initCache } from "../cache";
import { MemoryCache } from "../cache/memory";

// Verify cached wrappers are exported with correct signatures
import { cachedFetchMovieDetails, cachedFetchTvDetails } from "../tmdb/client";

const browseApp = (await import("./browse")).default;

let app: Hono<AppEnv>;
let spies: ReturnType<typeof spyOn>[] = [];

beforeEach(() => {
  setupTestDb();
  initCache(new MemoryCache(1000));

  app = new Hono<AppEnv>();
  app.route("/browse", browseApp);

  spies = [
    spyOn(tmdbClient, "discoverMovies").mockResolvedValue({
      results: [] as TmdbDiscoverMovieResult[],
      total_pages: 1,
      total_results: 0,
      page: 1,
    }),
    spyOn(tmdbClient, "discoverTv").mockResolvedValue({
      results: [] as TmdbDiscoverTvResult[],
      total_pages: 1,
      total_results: 0,
      page: 1,
    }),
    spyOn(tmdbClient, "cachedFetchMovieDetails").mockResolvedValue({} as any),
    spyOn(tmdbClient, "cachedFetchTvDetails").mockResolvedValue({} as any),
    spyOn(tmdbClient, "getMovieGenres").mockResolvedValue(
      new Map([
        [28, "Action"],
        [878, "Science Fiction"],
      ]),
    ),
    spyOn(tmdbClient, "getTvGenres").mockResolvedValue(
      new Map([
        [18, "Drama"],
        [10765, "Sci-Fi & Fantasy"],
      ]),
    ),
    spyOn(tmdbClient, "searchMulti").mockResolvedValue({
      results: [],
      total_pages: 1,
      total_results: 0,
      page: 1,
    } as any),
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
    expect(body.error).toBe("Validation failed");
    expect(Array.isArray(body.issues)).toBe(true);
  });

  it("returns 400 for invalid category", async () => {
    const res = await app.request("/browse?category=invalid");
    expect(res.status).toBe(400);
  });

  it("fetches popular movies when type=MOVIE", async () => {
    const movie = makeTmdbDiscoverMovie();
    (tmdbClient.discoverMovies as any).mockResolvedValueOnce({
      results: [movie],
      total_pages: 5,
      total_results: 100,
      page: 1,
    });
    (tmdbClient.cachedFetchMovieDetails as any).mockResolvedValueOnce(
      makeTmdbMovieDetails({ id: movie.id }),
    );

    const res = await app.request("/browse?category=popular&type=MOVIE");
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.titles).toHaveLength(1);
    expect(body.page).toBe(1);
    expect(body.totalPages).toBe(5);
    expect(body.totalResults).toBe(100);
    expect(tmdbClient.discoverMovies).toHaveBeenCalledTimes(1);
    const callArgs = (
      (tmdbClient.discoverMovies as any).mock.calls[0] as unknown[]
    )[0] as Record<string, unknown>;
    expect(callArgs.sortBy).toBe("popularity.desc");
    expect(tmdbClient.discoverTv).not.toHaveBeenCalled();
  });

  it("fetches popular TV when type=SHOW", async () => {
    const tv = makeTmdbDiscoverTv();
    (tmdbClient.discoverTv as any).mockResolvedValueOnce({
      results: [tv],
      total_pages: 3,
      total_results: 60,
      page: 1,
    });
    (tmdbClient.cachedFetchTvDetails as any).mockResolvedValueOnce(
      makeTmdbTvDetails({ id: tv.id }),
    );

    const res = await app.request("/browse?category=popular&type=SHOW");
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.titles).toHaveLength(1);
    expect(tmdbClient.discoverTv).toHaveBeenCalledTimes(1);
    const callArgs = (
      (tmdbClient.discoverTv as any).mock.calls[0] as unknown[]
    )[0] as Record<string, unknown>;
    expect(callArgs.sortBy).toBe("popularity.desc");
    expect(tmdbClient.discoverMovies).not.toHaveBeenCalled();
  });

  it("fetches both types when type is omitted", async () => {
    const movie = makeTmdbDiscoverMovie();
    const tv = makeTmdbDiscoverTv();
    (tmdbClient.discoverMovies as any).mockResolvedValueOnce({
      results: [movie],
      total_pages: 2,
      total_results: 40,
      page: 1,
    });
    (tmdbClient.discoverTv as any).mockResolvedValueOnce({
      results: [tv],
      total_pages: 3,
      total_results: 60,
      page: 1,
    });
    (tmdbClient.cachedFetchMovieDetails as any).mockResolvedValueOnce(
      makeTmdbMovieDetails({ id: movie.id }),
    );
    (tmdbClient.cachedFetchTvDetails as any).mockResolvedValueOnce(
      makeTmdbTvDetails({ id: tv.id }),
    );

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
      results: [],
      total_pages: 1,
      total_results: 0,
      page: 1,
    });

    const res = await app.request("/browse?category=upcoming&type=MOVIE");
    expect(res.status).toBe(200);
    expect(tmdbClient.discoverMovies).toHaveBeenCalledTimes(1);
    const callArgs = (
      (tmdbClient.discoverMovies as any).mock.calls[0] as unknown[]
    )[0] as Record<string, unknown>;
    expect(callArgs.releaseDateGte).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(callArgs.releaseDateLte).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(callArgs.sortBy).toBe("release_date.asc");
    expect(callArgs.page).toBe(1);
  });

  it("uses discover endpoint for upcoming TV shows with date range", async () => {
    (tmdbClient.discoverTv as any).mockResolvedValueOnce({
      results: [],
      total_pages: 1,
      total_results: 0,
      page: 1,
    });

    const res = await app.request("/browse?category=upcoming&type=SHOW");
    expect(res.status).toBe(200);
    expect(tmdbClient.discoverTv).toHaveBeenCalledTimes(1);
    const callArgs = (
      (tmdbClient.discoverTv as any).mock.calls[0] as unknown[]
    )[0] as Record<string, unknown>;
    expect(callArgs.firstAirDateGte).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(callArgs.firstAirDateLte).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(callArgs.sortBy).toBe("first_air_date.asc");
  });

  it("uses top_rated discover for top_rated category", async () => {
    (tmdbClient.discoverMovies as any).mockResolvedValueOnce({
      results: [],
      total_pages: 1,
      total_results: 0,
      page: 1,
    });

    const res = await app.request("/browse?category=top_rated&type=MOVIE");
    expect(res.status).toBe(200);
    expect(tmdbClient.discoverMovies).toHaveBeenCalledTimes(1);
    const callArgs = (
      (tmdbClient.discoverMovies as any).mock.calls[0] as unknown[]
    )[0] as Record<string, unknown>;
    expect(callArgs.sortBy).toBe("vote_average.desc");
    expect(callArgs.voteCountGte).toBe("200");
  });

  it("rejects negative page", async () => {
    const res = await app.request(
      "/browse?category=popular&type=MOVIE&page=-5",
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Validation failed");
    expect(Array.isArray(body.issues)).toBe(true);
  });

  it("rejects non-numeric page", async () => {
    const res = await app.request(
      "/browse?category=popular&type=MOVIE&page=abc",
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Validation failed");
    expect(Array.isArray(body.issues)).toBe(true);
  });

  it("passes page parameter correctly", async () => {
    (tmdbClient.discoverMovies as any).mockResolvedValueOnce({
      results: [],
      total_pages: 10,
      total_results: 200,
      page: 3,
    });

    const res = await app.request("/browse?category=popular&type=MOVIE&page=3");
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.page).toBe(3);
    const callArgs = (
      (tmdbClient.discoverMovies as any).mock.calls[0] as unknown[]
    )[0] as Record<string, unknown>;
    expect(callArgs.page).toBe(3);
  });

  it("falls back to basic data when detail fetch fails", async () => {
    const movie = makeTmdbDiscoverMovie();
    (tmdbClient.discoverMovies as any).mockResolvedValueOnce({
      results: [movie],
      total_pages: 1,
      total_results: 1,
      page: 1,
    });
    (tmdbClient.cachedFetchMovieDetails as any).mockRejectedValueOnce(
      new Error("API error"),
    );

    const res = await app.request("/browse?category=popular&type=MOVIE");
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.titles).toHaveLength(1);
    expect(body.titles[0].title).toBe("Discover Movie");
  });

  it("returns isTracked=false when no user is authenticated", async () => {
    const movie = makeTmdbDiscoverMovie();
    (tmdbClient.discoverMovies as any).mockResolvedValueOnce({
      results: [movie],
      total_pages: 1,
      total_results: 1,
      page: 1,
    });
    (tmdbClient.cachedFetchMovieDetails as any).mockResolvedValueOnce(
      makeTmdbMovieDetails({ id: movie.id }),
    );

    const res = await app.request("/browse?category=popular&type=MOVIE");
    const body = await res.json();

    expect(body.titles[0].isTracked).toBe(false);
  });

  it("returns genres and offers in response for filtering", async () => {
    const movie = makeTmdbDiscoverMovie({ id: 900 });
    (tmdbClient.discoverMovies as any).mockResolvedValueOnce({
      results: [movie],
      total_pages: 1,
      total_results: 1,
      page: 1,
    });
    (tmdbClient.cachedFetchMovieDetails as any).mockResolvedValueOnce(
      makeTmdbMovieDetails({
        id: 900,
        genres: [
          { id: 28, name: "Action" },
          { id: 35, name: "Comedy" },
        ],
        "watch/providers": {
          id: 900,
          results: {
            [CONFIG.COUNTRY]: {
              link: "https://tmdb.org",
              flatrate: [
                {
                  logo_path: "/nf.jpg",
                  provider_id: 8,
                  provider_name: "Netflix",
                  display_priority: 1,
                },
              ],
            },
          },
        },
      }),
    );

    const res = await app.request("/browse?category=popular&type=MOVIE");
    const body = await res.json();

    expect(body.titles).toHaveLength(1);
    expect(body.titles[0].genres).toEqual(["Action", "Comedy"]);
    expect(body.titles[0].offers.length).toBeGreaterThan(0);
    expect(body.titles[0].offers[0].providerName).toBe("Netflix");
  });

  it("response contains exactly the slim shape (no catalogue fields)", async () => {
    (tmdbClient.discoverMovies as any).mockResolvedValueOnce({
      results: [],
      total_pages: 1,
      total_results: 0,
      page: 1,
    });

    const res = await app.request("/browse?category=popular&type=MOVIE");
    expect(res.status).toBe(200);
    const body = await res.json();

    // Required fields present
    expect(Object.keys(body)).toContain("titles");
    expect(Object.keys(body)).toContain("page");
    expect(Object.keys(body)).toContain("totalPages");
    expect(Object.keys(body)).toContain("totalResults");
    // Catalogue fields must be absent
    expect(body.availableGenres).toBeUndefined();
    expect(body.availableProviders).toBeUndefined();
    expect(body.availableLanguages).toBeUndefined();
    expect(body.regionProviderIds).toBeUndefined();
    expect(body.priorityLanguageCodes).toBeUndefined();
  });

  it("returns isTracked=true for tracked titles when user is authenticated", async () => {
    // Set up real DB data for tracking
    await upsertTitles([makeParsedTitle({ id: "movie-555" })]);
    const userId = await createUser("testuser", "hash");
    await trackTitle("movie-555", userId);

    const movie = makeTmdbDiscoverMovie({ id: 555 });
    (tmdbClient.discoverMovies as any).mockResolvedValueOnce({
      results: [movie],
      total_pages: 1,
      total_results: 1,
      page: 1,
    });
    (tmdbClient.cachedFetchMovieDetails as any).mockResolvedValueOnce(
      makeTmdbMovieDetails({ id: 555 }),
    );

    const authedApp = new Hono<AppEnv>();
    authedApp.use("/browse/*", async (c, next) => {
      c.set("user", {
        id: userId,
        username: "testuser",
        name: null,
        role: null,
        is_admin: false,
      });
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
      results: [movie],
      total_pages: 1,
      total_results: 1,
      page: 1,
    });
    (tmdbClient.cachedFetchMovieDetails as any).mockResolvedValueOnce(
      makeTmdbMovieDetails({
        id: 900,
        "watch/providers": {
          id: 900,
          results: {
            [CONFIG.COUNTRY]: {
              link: "https://tmdb.org",
              flatrate: [
                {
                  logo_path: "/nf.jpg",
                  provider_id: 8,
                  provider_name: "Netflix",
                  display_priority: 1,
                },
              ],
            },
          },
        },
      }),
    );

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
        results: [],
        total_pages: 1,
        total_results: 0,
        page: 1,
      });

      // "Action & Adventure" should expand to Action (28) from movies + Action & Adventure TV genres
      const res = await app.request(
        "/browse?category=popular&type=MOVIE&genre=Action%20%26%20Adventure",
      );
      expect(res.status).toBe(200);

      const callArgs = (
        (tmdbClient.discoverMovies as any).mock.calls[0] as unknown[]
      )[0] as Record<string, unknown>;
      const filters = callArgs.filters as Record<string, string>;
      // Should contain movie Action ID (28)
      expect(filters.withGenres).toBeDefined();
      expect(filters.withGenres!.split("|")).toContain("28");
    });

    it("passes TV genre filter correctly for grouped genres", async () => {
      (tmdbClient.discoverTv as any).mockResolvedValueOnce({
        results: [],
        total_pages: 1,
        total_results: 0,
        page: 1,
      });

      const res = await app.request(
        "/browse?category=upcoming&type=SHOW&genre=Sci-Fi%20%26%20Fantasy",
      );
      expect(res.status).toBe(200);

      const callArgs = (
        (tmdbClient.discoverTv as any).mock.calls[0] as unknown[]
      )[0] as Record<string, unknown>;
      const filters = callArgs.filters as Record<string, string>;
      expect(filters.withGenres).toBeDefined();
      // Should contain both Science Fiction (878) and Sci-Fi & Fantasy (10765)
      const ids = filters.withGenres!.split("|");
      expect(ids).toContain("878");
      expect(ids).toContain("10765");
    });

    it("does not pass genre filter when genre name is not found", async () => {
      (tmdbClient.discoverMovies as any).mockResolvedValueOnce({
        results: [],
        total_pages: 1,
        total_results: 0,
        page: 1,
      });

      const res = await app.request(
        "/browse?category=popular&type=MOVIE&genre=Nonexistent",
      );
      expect(res.status).toBe(200);

      const callArgs = (
        (tmdbClient.discoverMovies as any).mock.calls[0] as unknown[]
      )[0] as Record<string, unknown>;
      const filters = callArgs.filters as Record<string, string>;
      expect(filters.withGenres).toBeUndefined();
    });
  });

  describe("provider filtering", () => {
    it("passes provider ID to discover filters", async () => {
      (tmdbClient.discoverMovies as any).mockResolvedValueOnce({
        results: [],
        total_pages: 1,
        total_results: 0,
        page: 1,
      });

      const res = await app.request(
        "/browse?category=popular&type=MOVIE&provider=8",
      );
      expect(res.status).toBe(200);

      const callArgs = (
        (tmdbClient.discoverMovies as any).mock.calls[0] as unknown[]
      )[0] as Record<string, unknown>;
      const filters = callArgs.filters as Record<string, string>;
      expect(filters.withProviders).toBe("8");
    });
  });

  describe("language filtering", () => {
    it("passes language code to discover filters", async () => {
      (tmdbClient.discoverTv as any).mockResolvedValueOnce({
        results: [],
        total_pages: 1,
        total_results: 0,
        page: 1,
      });

      const res = await app.request(
        "/browse?category=popular&type=SHOW&language=ja",
      );
      expect(res.status).toBe(200);

      const callArgs = (
        (tmdbClient.discoverTv as any).mock.calls[0] as unknown[]
      )[0] as Record<string, unknown>;
      const filters = callArgs.filters as Record<string, string>;
      expect(filters.withOriginalLanguage).toBe("ja");
    });
  });

  describe("combined filters", () => {
    it("passes all filters together", async () => {
      (tmdbClient.discoverMovies as any).mockResolvedValueOnce({
        results: [],
        total_pages: 1,
        total_results: 0,
        page: 1,
      });

      const res = await app.request(
        "/browse?category=top_rated&type=MOVIE&genre=Drama&provider=8&language=en",
      );
      expect(res.status).toBe(200);

      const callArgs = (
        (tmdbClient.discoverMovies as any).mock.calls[0] as unknown[]
      )[0] as Record<string, unknown>;
      const filters = callArgs.filters as Record<string, string>;
      // Drama is not grouped, so it maps to a single ID
      expect(filters.withGenres).toBeDefined();
      expect(filters.withProviders).toBe("8");
      expect(filters.withOriginalLanguage).toBe("en");
      expect(callArgs.sortBy).toBe("vote_average.desc");
    });
  });

  describe("year and rating filtering", () => {
    it("passes yearMin/yearMax to discover filters", async () => {
      (tmdbClient.discoverMovies as any).mockResolvedValueOnce({
        results: [],
        total_pages: 1,
        total_results: 0,
        page: 1,
      });

      const res = await app.request(
        "/browse?category=popular&type=MOVIE&year_min=2020&year_max=2024",
      );
      expect(res.status).toBe(200);

      const callArgs = (
        (tmdbClient.discoverMovies as any).mock.calls[0] as unknown[]
      )[0] as Record<string, unknown>;
      const filters = callArgs.filters as Record<string, unknown>;
      expect(filters.yearMin).toBe(2020);
      expect(filters.yearMax).toBe(2024);
    });

    it("passes minRating as voteAverageGte", async () => {
      (tmdbClient.discoverTv as any).mockResolvedValueOnce({
        results: [],
        total_pages: 1,
        total_results: 0,
        page: 1,
      });

      const res = await app.request(
        "/browse?category=popular&type=SHOW&min_rating=7.5",
      );
      expect(res.status).toBe(200);

      const callArgs = (
        (tmdbClient.discoverTv as any).mock.calls[0] as unknown[]
      )[0] as Record<string, unknown>;
      const filters = callArgs.filters as Record<string, unknown>;
      expect(filters.voteAverageGte).toBe(7.5);
    });

    it("rejects non-numeric year/rating values", async () => {
      const res = await app.request(
        "/browse?category=popular&type=MOVIE&year_min=abc&min_rating=xyz",
      );
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe("Validation failed");
      expect(Array.isArray(body.issues)).toBe(true);
    });
  });

  describe("detail caching", () => {
    it("cachedFetchMovieDetails and cachedFetchTvDetails are exported with correct signatures", () => {
      expect(typeof cachedFetchMovieDetails).toBe("function");
      expect(typeof cachedFetchTvDetails).toBe("function");
    });

    it("browse route calls cachedFetchMovieDetails (not the uncached variant) for movie fan-out", async () => {
      const movie = makeTmdbDiscoverMovie({ id: 42 });
      (tmdbClient.discoverMovies as any).mockResolvedValueOnce({
        results: [movie],
        total_pages: 1,
        total_results: 1,
        page: 1,
      });
      (tmdbClient.cachedFetchMovieDetails as any).mockResolvedValueOnce(
        makeTmdbMovieDetails({ id: 42 }),
      );

      const res = await app.request("/browse?category=popular&type=MOVIE");
      expect(res.status).toBe(200);
      expect(tmdbClient.cachedFetchMovieDetails).toHaveBeenCalledTimes(1);
    });

    it("browse route calls cachedFetchTvDetails (not the uncached variant) for TV fan-out", async () => {
      const tv = makeTmdbDiscoverTv({ id: 43 });
      (tmdbClient.discoverTv as any).mockResolvedValueOnce({
        results: [tv],
        total_pages: 1,
        total_results: 1,
        page: 1,
      });
      (tmdbClient.cachedFetchTvDetails as any).mockResolvedValueOnce(
        makeTmdbTvDetails({ id: 43 }),
      );

      const res = await app.request("/browse?category=popular&type=SHOW");
      expect(res.status).toBe(200);
      expect(tmdbClient.cachedFetchTvDetails).toHaveBeenCalledTimes(1);
    });
  });

  describe("validation", () => {
    it("rejects missing category", async () => {
      const res = await app.request("/browse");
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe("Validation failed");
      expect(Array.isArray(body.issues)).toBe(true);
    });

    it("rejects unknown category value", async () => {
      const res = await app.request("/browse?category=trending");
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe("Validation failed");
      expect(Array.isArray(body.issues)).toBe(true);
    });

    it("rejects page=0", async () => {
      const res = await app.request("/browse?category=popular&page=0");
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe("Validation failed");
      expect(Array.isArray(body.issues)).toBe(true);
    });

    it("rejects min_rating above 10", async () => {
      const res = await app.request("/browse?category=popular&min_rating=11");
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe("Validation failed");
      expect(Array.isArray(body.issues)).toBe(true);
    });

    it("rejects min_rating below 0", async () => {
      const res = await app.request("/browse?category=popular&min_rating=-1");
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe("Validation failed");
      expect(Array.isArray(body.issues)).toBe(true);
    });

    it("rejects non-numeric year_min", async () => {
      const res = await app.request(
        "/browse?category=popular&year_min=notanumber",
      );
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe("Validation failed");
      expect(Array.isArray(body.issues)).toBe(true);
    });

    it("rejects onlyMine=false (only literal 'true' is accepted)", async () => {
      const res = await app.request("/browse?category=popular&onlyMine=false");
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe("Validation failed");
      expect(Array.isArray(body.issues)).toBe(true);
    });

    it("happy-path: minimal request with category only — response keys are exactly { titles, page, totalPages, totalResults }", async () => {
      const res = await app.request("/browse?category=popular");
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(Object.keys(body).sort()).toEqual([
        "page",
        "titles",
        "totalPages",
        "totalResults",
      ]);
    });

    it("happy-path: category + year filters + min_rating", async () => {
      const res = await app.request(
        "/browse?category=popular&year_min=2000&min_rating=7.5",
      );
      expect(res.status).toBe(200);
    });
  });

  describe("onlyMine filtering", () => {
    it("returns 500 via route catch when getSubscribedProviderIds throws", async () => {
      spies.push(
        spyOn(repository, "getSubscribedProviderIds").mockRejectedValueOnce(
          new Error("D1 connection lost"),
        ),
      );

      const userId = await createUser("onlymine-err-user", "hash");
      const authedApp = new Hono<AppEnv>();
      authedApp.use("/browse/*", async (c, next) => {
        c.set("user", {
          id: userId,
          username: "onlymine-err-user",
          name: null,
          role: null,
          is_admin: false,
        });
        await next();
      });
      authedApp.route("/browse", browseApp);

      const res = await authedApp.request(
        "/browse?category=popular&onlyMine=true",
      );
      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.error).toBeDefined();
    });

    it("happy-path: onlyMine=true passes subscribed providers to discover filters", async () => {
      spies.push(
        spyOn(repository, "getSubscribedProviderIds").mockResolvedValueOnce([
          8,
        ]),
      );

      const userId = await createUser("onlymine-ok-user", "hash");
      const authedApp = new Hono<AppEnv>();
      authedApp.use("/browse/*", async (c, next) => {
        c.set("user", {
          id: userId,
          username: "onlymine-ok-user",
          name: null,
          role: null,
          is_admin: false,
        });
        await next();
      });
      authedApp.route("/browse", browseApp);

      const res = await authedApp.request(
        "/browse?category=popular&onlyMine=true",
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.titles).toBeDefined();
      expect(tmdbClient.discoverMovies).toHaveBeenCalled();
      const movieCallFilters = (
        (tmdbClient.discoverMovies as any).mock.calls[0] as unknown[]
      )[0] as Record<string, unknown>;
      const filters = movieCallFilters.filters as Record<string, string>;
      expect(filters.withProviders).toBe("8");
    });
  });

  describe("browse response cache", () => {
    it("cache hit: second identical request does not call TMDB discover/detail again", async () => {
      const movie = makeTmdbDiscoverMovie({ id: 111 });
      (tmdbClient.discoverMovies as any).mockResolvedValue({
        results: [movie],
        total_pages: 1,
        total_results: 1,
        page: 1,
      });
      (tmdbClient.cachedFetchMovieDetails as any).mockResolvedValue(
        makeTmdbMovieDetails({ id: 111 }),
      );

      // First request — should populate cache
      const res1 = await app.request(
        "/browse?category=popular&type=MOVIE&page=1",
      );
      expect(res1.status).toBe(200);
      const body1 = await res1.json();
      expect(body1.titles).toHaveLength(1);
      expect(body1.page).toBe(1);
      expect(body1.totalPages).toBe(1);
      expect(body1.totalResults).toBe(1);

      // Second request — same params → cache hit, no extra TMDB calls
      const res2 = await app.request(
        "/browse?category=popular&type=MOVIE&page=1",
      );
      expect(res2.status).toBe(200);
      const body2 = await res2.json();
      expect(body2.titles).toHaveLength(1);

      // discoverMovies and cachedFetchMovieDetails should have been called only once total
      expect(tmdbClient.discoverMovies).toHaveBeenCalledTimes(1);
      expect(tmdbClient.cachedFetchMovieDetails).toHaveBeenCalledTimes(1);
    });

    it("cache hit with authed user: isTracked is correctly applied per user, not cached", async () => {
      await upsertTitles([makeParsedTitle({ id: "movie-222" })]);
      const userId = await createUser("cache-tracked-user", "hash");
      await trackTitle("movie-222", userId);

      const movie = makeTmdbDiscoverMovie({ id: 222 });
      (tmdbClient.discoverMovies as any).mockResolvedValue({
        results: [movie],
        total_pages: 1,
        total_results: 1,
        page: 1,
      });
      (tmdbClient.cachedFetchMovieDetails as any).mockResolvedValue(
        makeTmdbMovieDetails({ id: 222 }),
      );

      // First request — anon user, populates cache, isTracked=false
      const res1 = await app.request(
        "/browse?category=popular&type=MOVIE&page=2",
      );
      expect(res1.status).toBe(200);
      const body1 = await res1.json();
      expect(body1.titles[0].isTracked).toBe(false);

      // Second request — authed user with tracked title, hits cache but isTracked should be true
      const authedApp = new Hono<AppEnv>();
      authedApp.use("/browse/*", async (c, next) => {
        c.set("user", {
          id: userId,
          username: "cache-tracked-user",
          name: null,
          role: null,
          is_admin: false,
        });
        await next();
      });
      authedApp.route("/browse", browseApp);

      const res2 = await authedApp.request(
        "/browse?category=popular&type=MOVIE&page=2",
      );
      expect(res2.status).toBe(200);
      const body2 = await res2.json();
      expect(body2.titles[0].isTracked).toBe(true);

      // Cache was hit on second request (no extra TMDB calls)
      expect(tmdbClient.discoverMovies).toHaveBeenCalledTimes(1);
    });

    it("cache key variation: different page params produce different cache entries", async () => {
      const movie1 = makeTmdbDiscoverMovie({ id: 331 });
      const movie2 = makeTmdbDiscoverMovie({ id: 332 });

      // Page 1 returns movie1
      (tmdbClient.discoverMovies as any)
        .mockResolvedValueOnce({
          results: [movie1],
          total_pages: 5,
          total_results: 100,
          page: 1,
        })
        // Page 2 returns movie2
        .mockResolvedValueOnce({
          results: [movie2],
          total_pages: 5,
          total_results: 100,
          page: 2,
        });
      (tmdbClient.cachedFetchMovieDetails as any)
        .mockResolvedValueOnce(makeTmdbMovieDetails({ id: 331 }))
        .mockResolvedValueOnce(makeTmdbMovieDetails({ id: 332 }));

      const res1 = await app.request(
        "/browse?category=popular&type=MOVIE&page=1",
      );
      const body1 = await res1.json();

      const res2 = await app.request(
        "/browse?category=popular&type=MOVIE&page=2",
      );
      const body2 = await res2.json();

      expect(body1.titles[0].tmdbId).toBe("331");
      expect(body2.titles[0].tmdbId).toBe("332");
      // Both pages called TMDB (different cache entries)
      expect(tmdbClient.discoverMovies).toHaveBeenCalledTimes(2);
    });

    it("onlyMine=true with empty subscriptions does NOT write to cache", async () => {
      spies.push(
        spyOn(repository, "getSubscribedProviderIds").mockResolvedValueOnce([]),
      );

      const userId = await createUser("onlymine-nocache-user", "hash");
      const authedApp = new Hono<AppEnv>();
      authedApp.use("/browse/*", async (c, next) => {
        c.set("user", {
          id: userId,
          username: "onlymine-nocache-user",
          name: null,
          role: null,
          is_admin: false,
        });
        await next();
      });
      authedApp.route("/browse", browseApp);

      // Spy on the cache to verify no set() is called with an empty-title result
      const cache = (await import("../cache")).getCache();
      const cacheSpy = spyOn(cache, "set");
      spies.push(cacheSpy);

      const res = await authedApp.request(
        "/browse?category=popular&onlyMine=true",
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.titles).toHaveLength(0);

      // No cache writes should have occurred (early return before cache logic)
      expect(cacheSpy).not.toHaveBeenCalled();
    });
  });
});
