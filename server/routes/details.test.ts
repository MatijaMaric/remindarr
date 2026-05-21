import { describe, it, expect, beforeEach, afterEach, afterAll, spyOn } from "bun:test";
import { Hono } from "hono";
import type { AppEnv } from "../types";
import { CONFIG } from "../config";
import { setupTestDb, teardownTestDb } from "../test-utils/setup";
import { upsertTitles } from "../db/repository";
import { makeParsedTitle, makeTmdbMovieDetails, makeTmdbTvDetails, makeTmdbDiscoverMovie, makeTmdbDiscoverTv } from "../test-utils/fixtures";
import * as tmdbClient from "../tmdb/client";

// Ensure TMDB API key is set so fallback logic is exercised
CONFIG.TMDB_API_KEY = "test-api-key";

const detailsApp = (await import("./details")).default;

let app: Hono<AppEnv>;
let spies: ReturnType<typeof spyOn>[] = [];

beforeEach(() => {
  setupTestDb();

  app = new Hono<AppEnv>();
  app.route("/details", detailsApp);

  // Set up spies for all TMDB client functions used by the details route
  spies = [
    spyOn(tmdbClient, "fetchMovieDetails").mockResolvedValue({} as any),
    spyOn(tmdbClient, "fetchTvDetails").mockResolvedValue({} as any),
    spyOn(tmdbClient, "fetchMovieFullDetails").mockResolvedValue(null as any),
    spyOn(tmdbClient, "fetchShowFullDetails").mockResolvedValue(null as any),
    spyOn(tmdbClient, "fetchSeasonDetails").mockResolvedValue(null as any),
    spyOn(tmdbClient, "fetchEpisodeDetails").mockResolvedValue(null as any),
    spyOn(tmdbClient, "fetchPersonDetails").mockResolvedValue(null as any),
    spyOn(tmdbClient, "fetchMovieSuggestions").mockResolvedValue({ results: [], page: 1, total_pages: 0, total_results: 0 } as any),
    spyOn(tmdbClient, "fetchTvSuggestions").mockResolvedValue({ results: [], page: 1, total_pages: 0, total_results: 0 } as any),
    spyOn(tmdbClient, "getMovieGenres").mockResolvedValue(new Map() as any),
    spyOn(tmdbClient, "getTvGenres").mockResolvedValue(new Map() as any),
    spyOn(tmdbClient, "fetchCollection").mockResolvedValue({ id: 119, name: "Test Collection", overview: "", poster_path: null, backdrop_path: null, parts: [] } as any),
  ];
});

afterEach(() => {
  for (const spy of spies) spy.mockRestore();
  spies = [];
});

afterAll(() => {
  teardownTestDb();
});

// Helper to get a spy by function name
function getSpy(name: keyof typeof tmdbClient) {
  return tmdbClient[name] as ReturnType<typeof spyOn>;
}

describe("GET /details/movie/:id", () => {
  it("returns title from DB without TMDB fallback", async () => {
    await upsertTitles([makeParsedTitle({ id: "movie-123", title: "DB Movie", tmdbId: "123" })]);

    const res = await app.request("/details/movie/movie-123");
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.title.title).toBe("DB Movie");
    expect(tmdbClient.fetchMovieDetails).not.toHaveBeenCalled();
  });

  it("fetches from TMDB and persists when title not in DB", async () => {
    (tmdbClient.fetchMovieDetails as any).mockResolvedValueOnce(
      makeTmdbMovieDetails({ id: 999, title: "TMDB Movie" })
    );

    const res = await app.request("/details/movie/movie-999");
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.title.title).toBe("TMDB Movie");
    expect(body.title.id).toBe("movie-999");
    expect(tmdbClient.fetchMovieDetails).toHaveBeenCalledWith(999);
  });

  it("returns 404 when TMDB fallback fails", async () => {
    (tmdbClient.fetchMovieDetails as any).mockRejectedValueOnce(new Error("TMDB API error"));

    const res = await app.request("/details/movie/movie-999");
    expect(res.status).toBe(404);
  });

  it("returns 400 for invalid title ID format", async () => {
    const res = await app.request("/details/movie/invalid-id");
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Validation failed");
    expect(Array.isArray(body.issues)).toBe(true);
  });
});

describe("GET /details/movie/:id — videos field", () => {
  it("passes videos.results through when TMDB returns them", async () => {
    await upsertTitles([makeParsedTitle({ id: "movie-123", title: "Movie With Trailer", tmdbId: "123" })]);

    (tmdbClient.fetchMovieFullDetails as any).mockResolvedValueOnce({
      id: 123,
      title: "Movie With Trailer",
      videos: {
        results: [
          {
            id: "vid1",
            key: "dQw4w9WgXcQ",
            site: "YouTube",
            type: "Trailer",
            official: true,
            size: 1080,
            published_at: "2024-01-01T00:00:00.000Z",
            name: "Official Trailer",
            iso_639_1: "en",
            iso_3166_1: "US",
          },
        ],
      },
    });

    const res = await app.request("/details/movie/movie-123");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.tmdb.videos.results)).toBe(true);
    expect(body.tmdb.videos.results[0].key).toBe("dQw4w9WgXcQ");
    expect(body.tmdb.videos.results[0].type).toBe("Trailer");
  });

  it("tmdb.videos is present as empty results when TMDB returns none", async () => {
    await upsertTitles([makeParsedTitle({ id: "movie-123", title: "Movie No Trailer", tmdbId: "123" })]);

    (tmdbClient.fetchMovieFullDetails as any).mockResolvedValueOnce({
      id: 123,
      title: "Movie No Trailer",
      videos: { results: [] },
    });

    const res = await app.request("/details/movie/movie-123");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.tmdb.videos.results)).toBe(true);
    expect(body.tmdb.videos.results).toHaveLength(0);
  });
});

describe("GET /details/show/:id", () => {
  it("returns title from DB without TMDB fallback", async () => {
    await upsertTitles([makeParsedTitle({ id: "tv-456", objectType: "SHOW", title: "DB Show", tmdbId: "456" })]);

    const res = await app.request("/details/show/tv-456");
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.title.title).toBe("DB Show");
    expect(tmdbClient.fetchTvDetails).not.toHaveBeenCalled();
  });

  it("fetches from TMDB and persists when show not in DB", async () => {
    (tmdbClient.fetchTvDetails as any).mockResolvedValueOnce(
      makeTmdbTvDetails({ id: 789, name: "TMDB Show" })
    );

    const res = await app.request("/details/show/tv-789");
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.title.title).toBe("TMDB Show");
    expect(body.title.id).toBe("tv-789");
    expect(tmdbClient.fetchTvDetails).toHaveBeenCalledWith(789);
  });

  it("returns 404 when TMDB fallback fails", async () => {
    (tmdbClient.fetchTvDetails as any).mockRejectedValueOnce(new Error("TMDB API error"));

    const res = await app.request("/details/show/tv-789");
    expect(res.status).toBe(404);
  });
});

describe("GET /details/show/:id/season/:season", () => {
  it("fetches show from TMDB when not in DB for season endpoint", async () => {
    (tmdbClient.fetchTvDetails as any).mockResolvedValueOnce(
      makeTmdbTvDetails({ id: 555, name: "Season Show" })
    );

    const res = await app.request("/details/show/tv-555/season/1");
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.title.title).toBe("Season Show");
    expect(body.seasonNumber).toBe(1);
    expect(tmdbClient.fetchTvDetails).toHaveBeenCalledWith(555);
  });

  it("returns 400 for non-numeric season param", async () => {
    const res = await app.request("/details/show/tv-555/season/abc");
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Validation failed");
    expect(Array.isArray(body.issues)).toBe(true);
  });

  it("includes seasons array from show details", async () => {
    await upsertTitles([makeParsedTitle({ id: "tv-555", objectType: "SHOW", title: "Season Show", tmdbId: "555" })]);

    (tmdbClient.fetchShowFullDetails as any).mockResolvedValueOnce({
      seasons: [
        { season_number: 0, name: "Specials", episode_count: 2, air_date: null, poster_path: null },
        { season_number: 1, name: "Season 1", episode_count: 10, air_date: "2024-01-01", poster_path: "/s1.jpg" },
        { season_number: 2, name: "Season 2", episode_count: 8, air_date: "2024-06-01", poster_path: "/s2.jpg" },
      ],
    });

    const res = await app.request("/details/show/tv-555/season/1");
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.seasons).toHaveLength(2);
    expect(body.seasons[0].season_number).toBe(1);
    expect(body.seasons[1].season_number).toBe(2);
    // Season 0 (Specials) should be filtered out
    expect(body.seasons.find((s: any) => s.season_number === 0)).toBeUndefined();
  });

  it("returns empty seasons array when show details fetch fails", async () => {
    await upsertTitles([makeParsedTitle({ id: "tv-555", objectType: "SHOW", title: "Season Show", tmdbId: "555" })]);

    (tmdbClient.fetchShowFullDetails as any).mockRejectedValueOnce(new Error("TMDB error"));

    const res = await app.request("/details/show/tv-555/season/1");
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.seasons).toEqual([]);
  });
});

describe("GET /details/show/:id/season/:season/episode/:episode", () => {
  it("returns 400 for non-numeric season param", async () => {
    const res = await app.request("/details/show/tv-555/season/abc/episode/1");
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Validation failed");
    expect(Array.isArray(body.issues)).toBe(true);
  });

  it("returns 400 for non-numeric episode param", async () => {
    const res = await app.request("/details/show/tv-555/season/1/episode/abc");
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Validation failed");
    expect(Array.isArray(body.issues)).toBe(true);
  });
});

describe("GET /details/movie/:id/suggestions", () => {
  it("returns suggestions for a valid movie id", async () => {
    (tmdbClient.fetchMovieSuggestions as any).mockResolvedValueOnce({
      results: [makeTmdbDiscoverMovie({ id: 999, title: "Suggested Movie" })],
      page: 1,
      total_pages: 1,
      total_results: 1,
    });

    const res = await app.request("/details/movie/movie-123/suggestions");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.titles)).toBe(true);
    expect(body.titles[0].id).toBe("movie-999");
    expect(body.page).toBe(1);
    expect(tmdbClient.fetchMovieSuggestions).toHaveBeenCalledWith(123, 1);
  });

  it("returns 400 for invalid title id format", async () => {
    const res = await app.request("/details/movie/invalid/suggestions");
    expect(res.status).toBe(400);
  });

  it("returns 400 when id is a show id", async () => {
    const res = await app.request("/details/movie/tv-456/suggestions");
    expect(res.status).toBe(400);
  });

  it("returns empty titles array when TMDB returns no results", async () => {
    const res = await app.request("/details/movie/movie-123/suggestions");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.titles).toHaveLength(0);
  });
});

describe("GET /details/show/:id/suggestions", () => {
  it("returns suggestions for a valid show id", async () => {
    (tmdbClient.fetchTvSuggestions as any).mockResolvedValueOnce({
      results: [makeTmdbDiscoverTv({ id: 888, name: "Suggested Show" })],
      page: 1,
      total_pages: 1,
      total_results: 1,
    });

    const res = await app.request("/details/show/tv-456/suggestions");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.titles)).toBe(true);
    expect(body.titles[0].id).toBe("tv-888");
    expect(body.page).toBe(1);
    expect(tmdbClient.fetchTvSuggestions).toHaveBeenCalledWith(456, 1);
  });

  it("returns 400 for invalid title id format", async () => {
    const res = await app.request("/details/show/invalid/suggestions");
    expect(res.status).toBe(400);
  });

  it("returns 400 when id is a movie id", async () => {
    const res = await app.request("/details/show/movie-123/suggestions");
    expect(res.status).toBe(400);
  });

  it("returns 503 when TMDB fetch fails", async () => {
    (tmdbClient.fetchTvSuggestions as any).mockRejectedValueOnce(new Error("TMDB error"));
    const res = await app.request("/details/show/tv-456/suggestions");
    expect(res.status).toBe(503);
  });
});

describe("GET /details — validation", () => {
  it("rejects invalid title ID format on /movie/:id", async () => {
    const res = await app.request("/details/movie/abc");
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Validation failed");
    expect(Array.isArray(body.issues)).toBe(true);
  });

  it("rejects non-prefixed numeric ID on /movie/:id", async () => {
    const res = await app.request("/details/movie/123");
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Validation failed");
    expect(Array.isArray(body.issues)).toBe(true);
  });

  it("rejects non-numeric season param", async () => {
    const res = await app.request("/details/show/tv-1/season/abc");
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Validation failed");
    expect(Array.isArray(body.issues)).toBe(true);
  });

  it("rejects episode=0 (min is 1)", async () => {
    const res = await app.request("/details/show/tv-1/season/1/episode/0");
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Validation failed");
    expect(Array.isArray(body.issues)).toBe(true);
  });

  it("rejects non-numeric episode param", async () => {
    const res = await app.request("/details/show/tv-1/season/1/episode/abc");
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Validation failed");
    expect(Array.isArray(body.issues)).toBe(true);
  });

  it("rejects non-numeric personId", async () => {
    const res = await app.request("/details/person/abc");
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Validation failed");
    expect(Array.isArray(body.issues)).toBe(true);
  });

  it("rejects personId=0 (min is 1)", async () => {
    const res = await app.request("/details/person/0");
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Validation failed");
    expect(Array.isArray(body.issues)).toBe(true);
  });

  it("rejects page=0 on suggestions", async () => {
    const res = await app.request("/details/movie/movie-1/suggestions?page=0");
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Validation failed");
    expect(Array.isArray(body.issues)).toBe(true);
  });

  it("rejects non-numeric page on suggestions", async () => {
    const res = await app.request("/details/movie/movie-1/suggestions?page=foo");
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Validation failed");
    expect(Array.isArray(body.issues)).toBe(true);
  });

  it("happy-path: GET /movie/:id with valid movie id", async () => {
    await upsertTitles([makeParsedTitle({ id: "movie-550", title: "Valid Movie", tmdbId: "550" })]);
    const res = await app.request("/details/movie/movie-550");
    expect(res.status).toBe(200);
  });

  it("happy-path: GET /movie/:id/suggestions?page=1", async () => {
    const res = await app.request("/details/movie/movie-123/suggestions?page=1");
    expect(res.status).toBe(200);
  });

  it("happy-path: GET /show/:id/season/:season/episode/:episode with valid params", async () => {
    await upsertTitles([makeParsedTitle({ id: "tv-555", objectType: "SHOW", title: "Season Show", tmdbId: "555" })]);
    const res = await app.request("/details/show/tv-555/season/1/episode/2");
    expect(res.status).toBe(200);
  });
});

describe("GET /details/person/:personId", () => {
  it("returns person details from TMDB", async () => {
    (tmdbClient.fetchPersonDetails as any).mockResolvedValueOnce({
      id: 123,
      name: "Test Actor",
      biography: "A test biography",
      birthday: "1990-01-15",
      deathday: null,
      place_of_birth: "Test City",
      known_for_department: "Acting",
      profile_path: "/test.jpg",
      also_known_as: [],
      popularity: 50,
      combined_credits: { cast: [], crew: [] },
    });

    const res = await app.request("/details/person/123");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.person.name).toBe("Test Actor");
    expect(body.person.biography).toBe("A test biography");
    expect(tmdbClient.fetchPersonDetails).toHaveBeenCalledWith(123);
  });

  it("returns 400 for invalid person ID", async () => {
    const res = await app.request("/details/person/abc");
    expect(res.status).toBe(400);
  });

  it("returns 404 when TMDB fetch fails", async () => {
    (tmdbClient.fetchPersonDetails as any).mockRejectedValueOnce(new Error("Not found"));
    const res = await app.request("/details/person/999");
    expect(res.status).toBe(404);
  });
});

describe("GET /details/collection/:id", () => {
  it("returns 400 for non-numeric id", async () => {
    const res = await app.request("/details/collection/abc");
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Validation failed");
    expect(Array.isArray(body.issues)).toBe(true);
  });

  it("returns 400 for id=0 (min is 1)", async () => {
    const res = await app.request("/details/collection/0");
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Validation failed");
    expect(Array.isArray(body.issues)).toBe(true);
  });

  it("returns collection with parts for valid id", async () => {
    (tmdbClient.fetchCollection as any).mockResolvedValueOnce({
      id: 119,
      name: "The Lord of the Rings Collection",
      overview: "Epic fantasy trilogy",
      poster_path: "/poster.jpg",
      backdrop_path: "/backdrop.jpg",
      parts: [
        { id: 120, title: "The Fellowship of the Ring", poster_path: "/f.jpg", backdrop_path: null, release_date: "2001-12-19", overview: "", vote_average: 8.4 },
        { id: 121, title: "The Two Towers", poster_path: "/t.jpg", backdrop_path: null, release_date: "2002-12-18", overview: "", vote_average: 8.4 },
      ],
    });

    const res = await app.request("/details/collection/119");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.name).toBe("The Lord of the Rings Collection");
    expect(Array.isArray(body.parts)).toBe(true);
    expect(body.parts).toHaveLength(2);
    expect(tmdbClient.fetchCollection).toHaveBeenCalledWith(119);
  });

  it("returns 404 when TMDB fetch fails", async () => {
    (tmdbClient.fetchCollection as any).mockRejectedValueOnce(new Error("Not found"));
    const res = await app.request("/details/collection/999");
    expect(res.status).toBe(404);
  });
});
