import { describe, it, test, expect, spyOn, afterEach, beforeEach } from "bun:test";
import Sentry from "../sentry";
import { MemoryCache } from "../cache/memory";
import { initCache } from "../cache";

// Initialize in-memory cache for tests
initCache(new MemoryCache(100, 60_000));

// ─── Mock tracing to pass through ───────────────────────────────────────────
let sentrySpy: ReturnType<typeof spyOn>;

// ─── Helpers ────────────────────────────────────────────────────────────────

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function textResponse(body: string, status: number): Response {
  return new Response(body, { status });
}

let fetchSpy: ReturnType<typeof spyOn>;

beforeEach(() => {
  sentrySpy = spyOn(Sentry, "startSpan").mockImplementation((_opts: any, fn: any) => fn({}));
  fetchSpy = spyOn(globalThis, "fetch");
});

afterEach(() => {
  sentrySpy?.mockRestore();
  fetchSpy?.mockRestore();
});

// ─── Import client functions ────────────────────────────────────────────────
import {
  fetchShowDetails,
  fetchSeasonEpisodes,
  fetchMovieDetails,
  fetchTvDetails,
  fetchMovieFullDetails,
  fetchShowFullDetails,
  fetchSeasonDetails,
  fetchEpisodeDetails,
  fetchPersonDetails,
  discoverMovies,
  discoverTv,
  fetchPopularMovies,
  fetchPopularTv,
  fetchUpcomingMovies,
  fetchOnTheAirTv,
  fetchTopRatedMovies,
  fetchTopRatedTv,
  searchMulti,
  findByImdbId,
  getMovieGenres,
  getTvGenres,
  getMovieWatchProviders,
  getTvWatchProviders,
  getLanguages,
} from "./client";

// ─── tmdbRequest (tested via exported functions) ────────────────────────────

describe("tmdbRequest error handling", () => {
  it("throws on 4xx response with body", async () => {
    fetchSpy.mockResolvedValueOnce(textResponse('{"status_message":"Invalid API key"}', 401));
    await expect(fetchShowDetails("123")).rejects.toThrow(
      'TMDB API error 401: {"status_message":"Invalid API key"}'
    );
  });

  it("throws on 5xx response", async () => {
    fetchSpy.mockResolvedValueOnce(textResponse("Internal Server Error", 500));
    await expect(fetchShowDetails("123")).rejects.toThrow("TMDB API error 500: Internal Server Error");
  });

  it("throws on 404 response", async () => {
    fetchSpy.mockResolvedValueOnce(textResponse("Not Found", 404));
    await expect(fetchMovieDetails(999)).rejects.toThrow("TMDB API error 404: Not Found");
  });

  it("throws on 429 rate limit response", async () => {
    fetchSpy.mockResolvedValueOnce(textResponse("Rate limit exceeded", 429));
    await expect(searchMulti("test")).rejects.toThrow("TMDB API error 429: Rate limit exceeded");
  });

  it("sends correct Authorization header", async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse({ id: 1, name: "Test", status: "Returning", number_of_seasons: 1, next_episode_to_air: null, last_episode_to_air: null }));
    await fetchShowDetails("1");
    const [url, options] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(options.headers).toEqual(
      expect.objectContaining({ Authorization: expect.stringContaining("Bearer ") })
    );
  });
});

// ─── fetchShowDetails ───────────────────────────────────────────────────────

describe("fetchShowDetails", () => {
  it("calls /tv/{id} and returns response", async () => {
    const mockShow = { id: 456, name: "Test Show", status: "Returning", number_of_seasons: 3, next_episode_to_air: null, last_episode_to_air: null };
    fetchSpy.mockResolvedValueOnce(jsonResponse(mockShow));
    const result = await fetchShowDetails("456");
    expect(result).toEqual(mockShow);
    const url = (fetchSpy.mock.calls[0] as [string])[0];
    expect(url).toContain("/tv/456");
  });
});

// ─── fetchSeasonEpisodes ────────────────────────────────────────────────────

describe("fetchSeasonEpisodes", () => {
  it("calls /tv/{id}/season/{num} and returns response", async () => {
    const mockSeason = { id: 1, season_number: 2, episodes: [{ id: 10, name: "Ep1", overview: "", air_date: "2024-01-01", episode_number: 1, season_number: 2, still_path: null }] };
    fetchSpy.mockResolvedValueOnce(jsonResponse(mockSeason));
    const result = await fetchSeasonEpisodes("100", 2);
    expect(result).toEqual(mockSeason);
    const url = (fetchSpy.mock.calls[0] as [string])[0];
    expect(url).toContain("/tv/100/season/2");
  });
});

// ─── fetchMovieDetails ──────────────────────────────────────────────────────

describe("fetchMovieDetails", () => {
  it("includes language and append_to_response params", async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse({ id: 1 }));
    await fetchMovieDetails(42);
    const url = new URL((fetchSpy.mock.calls[0] as [string])[0]);
    expect(url.pathname).toBe("/3/movie/42");
    expect(url.searchParams.get("append_to_response")).toBe("watch/providers,external_ids");
    expect(url.searchParams.get("language")).toBeTruthy();
  });
});

// ─── fetchTvDetails ─────────────────────────────────────────────────────────

describe("fetchTvDetails", () => {
  it("includes language and append_to_response params", async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse({ id: 1 }));
    await fetchTvDetails(99);
    const url = new URL((fetchSpy.mock.calls[0] as [string])[0]);
    expect(url.pathname).toBe("/3/tv/99");
    expect(url.searchParams.get("append_to_response")).toBe("watch/providers,external_ids");
  });
});

// ─── fetchMovieFullDetails ──────────────────────────────────────────────────

describe("fetchMovieFullDetails", () => {
  it("appends credits, release_dates, watch/providers", async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse({ id: 1 }));
    await fetchMovieFullDetails("55");
    const url = new URL((fetchSpy.mock.calls[0] as [string])[0]);
    expect(url.pathname).toBe("/3/movie/55");
    expect(url.searchParams.get("append_to_response")).toBe("credits,release_dates,watch/providers,external_ids");
  });
});

// ─── fetchShowFullDetails ───────────────────────────────────────────────────

describe("fetchShowFullDetails", () => {
  it("appends credits, content_ratings, watch/providers, external_ids", async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse({ id: 1 }));
    await fetchShowFullDetails("77");
    const url = new URL((fetchSpy.mock.calls[0] as [string])[0]);
    expect(url.pathname).toBe("/3/tv/77");
    expect(url.searchParams.get("append_to_response")).toBe("credits,content_ratings,watch/providers,external_ids");
  });
});

// ─── fetchSeasonDetails ─────────────────────────────────────────────────────

describe("fetchSeasonDetails", () => {
  it("calls correct path with credits appended", async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse({ id: 1 }));
    await fetchSeasonDetails("10", 3);
    const url = new URL((fetchSpy.mock.calls[0] as [string])[0]);
    expect(url.pathname).toBe("/3/tv/10/season/3");
    expect(url.searchParams.get("append_to_response")).toBe("credits");
  });
});

// ─── fetchEpisodeDetails ────────────────────────────────────────────────────

describe("fetchEpisodeDetails", () => {
  it("calls correct path for season/episode", async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse({ id: 1 }));
    await fetchEpisodeDetails("10", 2, 5);
    const url = new URL((fetchSpy.mock.calls[0] as [string])[0]);
    expect(url.pathname).toBe("/3/tv/10/season/2/episode/5");
    expect(url.searchParams.get("append_to_response")).toBe("credits");
  });
});

// ─── fetchPersonDetails ─────────────────────────────────────────────────────

describe("fetchPersonDetails", () => {
  it("calls /person/{id} with combined_credits appended", async () => {
    const mockPerson = { id: 200, name: "Actor Name", biography: "Bio", birthday: null, deathday: null, place_of_birth: null, known_for_department: "Acting", profile_path: null, also_known_as: [], popularity: 5, combined_credits: { cast: [], crew: [] } };
    fetchSpy.mockResolvedValueOnce(jsonResponse(mockPerson));
    const result = await fetchPersonDetails(200);
    expect(result.name).toBe("Actor Name");
    const url = new URL((fetchSpy.mock.calls[0] as [string])[0]);
    expect(url.pathname).toBe("/3/person/200");
    expect(url.searchParams.get("append_to_response")).toBe("combined_credits,external_ids");
  });
});

// ─── discoverMovies ─────────────────────────────────────────────────────────

describe("discoverMovies", () => {
  it("builds correct query params with defaults", async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse({ page: 1, total_pages: 1, total_results: 0, results: [] }));
    await discoverMovies({});
    const url = new URL((fetchSpy.mock.calls[0] as [string])[0]);
    expect(url.pathname).toBe("/3/discover/movie");
    expect(url.searchParams.get("sort_by")).toBe("release_date.desc");
    expect(url.searchParams.get("page")).toBe("1");
    expect(url.searchParams.get("vote_count.gte")).toBe("0");
    expect(url.searchParams.get("watch_region")).toBeTruthy();
  });

  it("applies date range filters", async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse({ page: 1, total_pages: 1, total_results: 0, results: [] }));
    await discoverMovies({ releaseDateGte: "2024-01-01", releaseDateLte: "2024-12-31" });
    const url = new URL((fetchSpy.mock.calls[0] as [string])[0]);
    expect(url.searchParams.get("release_date.gte")).toBe("2024-01-01");
    expect(url.searchParams.get("release_date.lte")).toBe("2024-12-31");
  });

  it("applies genre, provider, and language filters", async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse({ page: 1, total_pages: 1, total_results: 0, results: [] }));
    await discoverMovies({
      filters: { withGenres: "28,12", withProviders: "8", withOriginalLanguage: "en" },
    });
    const url = new URL((fetchSpy.mock.calls[0] as [string])[0]);
    expect(url.searchParams.get("with_genres")).toBe("28,12");
    expect(url.searchParams.get("with_watch_providers")).toBe("8");
    expect(url.searchParams.get("with_original_language")).toBe("en");
  });

  it("does not include optional filters when not specified", async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse({ page: 1, total_pages: 1, total_results: 0, results: [] }));
    await discoverMovies({});
    const url = new URL((fetchSpy.mock.calls[0] as [string])[0]);
    expect(url.searchParams.has("release_date.gte")).toBe(false);
    expect(url.searchParams.has("release_date.lte")).toBe(false);
    expect(url.searchParams.has("with_genres")).toBe(false);
    expect(url.searchParams.has("with_watch_providers")).toBe(false);
    expect(url.searchParams.has("with_original_language")).toBe(false);
  });

  it("uses custom sortBy and page", async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse({ page: 3, total_pages: 5, total_results: 100, results: [] }));
    await discoverMovies({ page: 3, sortBy: "popularity.desc", voteCountGte: "100" });
    const url = new URL((fetchSpy.mock.calls[0] as [string])[0]);
    expect(url.searchParams.get("page")).toBe("3");
    expect(url.searchParams.get("sort_by")).toBe("popularity.desc");
    expect(url.searchParams.get("vote_count.gte")).toBe("100");
  });

  it("returns discover response with results", async () => {
    const mockResponse = {
      page: 1,
      total_pages: 1,
      total_results: 1,
      results: [{ id: 1, title: "Movie", original_title: "Movie", overview: null, release_date: "2024-01-01", poster_path: null, genre_ids: [], vote_average: 7, vote_count: 100, popularity: 50, adult: false, original_language: "en" }],
    };
    fetchSpy.mockResolvedValueOnce(jsonResponse(mockResponse));
    const result = await discoverMovies({});
    expect(result.results).toHaveLength(1);
    expect(result.results[0].title).toBe("Movie");
  });

  it("translates yearMin/yearMax filters into release_date bounds", async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse({ page: 1, total_pages: 1, total_results: 0, results: [] }));
    await discoverMovies({ filters: { yearMin: 2020, yearMax: 2024 } });
    const url = new URL((fetchSpy.mock.calls[0] as [string])[0]);
    expect(url.searchParams.get("release_date.gte")).toBe("2020-01-01");
    expect(url.searchParams.get("release_date.lte")).toBe("2024-12-31");
  });

  it("intersects year filter with category-supplied date range (more restrictive wins)", async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse({ page: 1, total_pages: 1, total_results: 0, results: [] }));
    // category default: future window 2026-01-01 -> 2026-06-30; user wants <= 2024
    await discoverMovies({
      releaseDateGte: "2026-01-01",
      releaseDateLte: "2026-06-30",
      filters: { yearMin: 2020, yearMax: 2024 },
    });
    const url = new URL((fetchSpy.mock.calls[0] as [string])[0]);
    // gte: max(2026-01-01, 2020-01-01) = 2026-01-01
    expect(url.searchParams.get("release_date.gte")).toBe("2026-01-01");
    // lte: min(2026-06-30, 2024-12-31) = 2024-12-31
    expect(url.searchParams.get("release_date.lte")).toBe("2024-12-31");
  });

  it("translates voteAverageGte filter into vote_average.gte", async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse({ page: 1, total_pages: 1, total_results: 0, results: [] }));
    await discoverMovies({ filters: { voteAverageGte: 7.5 } });
    const url = new URL((fetchSpy.mock.calls[0] as [string])[0]);
    expect(url.searchParams.get("vote_average.gte")).toBe("7.5");
  });
});

// ─── discoverTv ─────────────────────────────────────────────────────────────

describe("discoverTv", () => {
  it("builds correct query params with defaults", async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse({ page: 1, total_pages: 1, total_results: 0, results: [] }));
    await discoverTv({});
    const url = new URL((fetchSpy.mock.calls[0] as [string])[0]);
    expect(url.pathname).toBe("/3/discover/tv");
    expect(url.searchParams.get("sort_by")).toBe("first_air_date.desc");
    expect(url.searchParams.get("page")).toBe("1");
  });

  it("applies date range and filters", async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse({ page: 1, total_pages: 1, total_results: 0, results: [] }));
    await discoverTv({
      firstAirDateGte: "2024-01-01",
      firstAirDateLte: "2024-06-30",
      voteCountGte: "50",
      filters: { withGenres: "18", withProviders: "337", withOriginalLanguage: "ko" },
    });
    const url = new URL((fetchSpy.mock.calls[0] as [string])[0]);
    expect(url.searchParams.get("first_air_date.gte")).toBe("2024-01-01");
    expect(url.searchParams.get("first_air_date.lte")).toBe("2024-06-30");
    expect(url.searchParams.get("vote_count.gte")).toBe("50");
    expect(url.searchParams.get("with_genres")).toBe("18");
    expect(url.searchParams.get("with_watch_providers")).toBe("337");
    expect(url.searchParams.get("with_original_language")).toBe("ko");
  });

  it("does not set vote_count.gte when not provided", async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse({ page: 1, total_pages: 1, total_results: 0, results: [] }));
    await discoverTv({});
    const url = new URL((fetchSpy.mock.calls[0] as [string])[0]);
    expect(url.searchParams.has("vote_count.gte")).toBe(false);
  });
});

// ─── Category endpoints ─────────────────────────────────────────────────────

describe("category endpoints", () => {
  const emptyPage = { page: 1, total_pages: 1, total_results: 0, results: [] };

  it("fetchPopularMovies calls /movie/popular with page", async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse(emptyPage));
    await fetchPopularMovies(2);
    const url = new URL((fetchSpy.mock.calls[0] as [string])[0]);
    expect(url.pathname).toBe("/3/movie/popular");
    expect(url.searchParams.get("page")).toBe("2");
  });

  it("fetchPopularMovies defaults to page 1", async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse(emptyPage));
    await fetchPopularMovies();
    const url = new URL((fetchSpy.mock.calls[0] as [string])[0]);
    expect(url.searchParams.get("page")).toBe("1");
  });

  it("fetchPopularTv calls /tv/popular", async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse(emptyPage));
    await fetchPopularTv();
    const url = new URL((fetchSpy.mock.calls[0] as [string])[0]);
    expect(url.pathname).toBe("/3/tv/popular");
  });

  it("fetchUpcomingMovies calls /movie/upcoming with region", async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse(emptyPage));
    await fetchUpcomingMovies();
    const url = new URL((fetchSpy.mock.calls[0] as [string])[0]);
    expect(url.pathname).toBe("/3/movie/upcoming");
    expect(url.searchParams.get("region")).toBeTruthy();
  });

  it("fetchOnTheAirTv calls /tv/on_the_air", async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse(emptyPage));
    await fetchOnTheAirTv();
    const url = new URL((fetchSpy.mock.calls[0] as [string])[0]);
    expect(url.pathname).toBe("/3/tv/on_the_air");
  });

  it("fetchTopRatedMovies calls /movie/top_rated", async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse(emptyPage));
    await fetchTopRatedMovies();
    const url = new URL((fetchSpy.mock.calls[0] as [string])[0]);
    expect(url.pathname).toBe("/3/movie/top_rated");
  });

  it("fetchTopRatedTv calls /tv/top_rated", async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse(emptyPage));
    await fetchTopRatedTv();
    const url = new URL((fetchSpy.mock.calls[0] as [string])[0]);
    expect(url.pathname).toBe("/3/tv/top_rated");
  });
});

// ─── searchMulti ────────────────────────────────────────────────────────────

describe("searchMulti", () => {
  it("passes query and pagination params", async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse({ page: 1, total_pages: 1, total_results: 0, results: [] }));
    await searchMulti("breaking bad", 2);
    const url = new URL((fetchSpy.mock.calls[0] as [string])[0]);
    expect(url.pathname).toBe("/3/search/multi");
    expect(url.searchParams.get("query")).toBe("breaking bad");
    expect(url.searchParams.get("page")).toBe("2");
    expect(url.searchParams.get("region")).toBeTruthy();
  });

  it("defaults to page 1", async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse({ page: 1, total_pages: 1, total_results: 0, results: [] }));
    await searchMulti("test");
    const url = new URL((fetchSpy.mock.calls[0] as [string])[0]);
    expect(url.searchParams.get("page")).toBe("1");
  });

  it("returns search results", async () => {
    const mockResponse = {
      page: 1,
      total_pages: 1,
      total_results: 2,
      results: [
        { id: 1, media_type: "movie", title: "Test Movie", overview: null },
        { id: 2, media_type: "tv", name: "Test Show", overview: null },
      ],
    };
    fetchSpy.mockResolvedValueOnce(jsonResponse(mockResponse));
    const result = await searchMulti("test");
    expect(result.results).toHaveLength(2);
    expect(result.results[0].media_type).toBe("movie");
    expect(result.results[1].media_type).toBe("tv");
  });
});

// ─── findByImdbId ───────────────────────────────────────────────────────────

describe("findByImdbId", () => {
  it("calls /find/{imdbId} with external_source param", async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse({ movie_results: [], tv_results: [] }));
    await findByImdbId("tt1234567");
    const url = new URL((fetchSpy.mock.calls[0] as [string])[0]);
    expect(url.pathname).toBe("/3/find/tt1234567");
    expect(url.searchParams.get("external_source")).toBe("imdb_id");
  });

  it("returns find response with movie results", async () => {
    const mockResponse = {
      movie_results: [{ id: 42, title: "Found Movie", original_title: "Found Movie", overview: "desc", release_date: "2024-01-01", poster_path: null, genre_ids: [], vote_average: 8, vote_count: 500, popularity: 30, adult: false, original_language: "en" }],
      tv_results: [],
    };
    fetchSpy.mockResolvedValueOnce(jsonResponse(mockResponse));
    const result = await findByImdbId("tt1234567");
    expect(result.movie_results).toHaveLength(1);
    expect(result.movie_results[0].title).toBe("Found Movie");
    expect(result.tv_results).toHaveLength(0);
  });
});

// ─── Cached endpoints (genres, providers, languages) ────────────────────────
// These use module-level caches. When running in a multi-file test suite,
// caches may already be warm from other test files. We test both scenarios.

describe("getMovieGenres", () => {
  it("returns a Map of genre id to name", async () => {
    const mockGenres = { genres: [{ id: 28, name: "Action" }, { id: 35, name: "Comedy" }] };
    fetchSpy.mockResolvedValueOnce(jsonResponse(mockGenres));
    const result = await getMovieGenres();
    expect(result).toBeInstanceOf(Map);
    expect(result.size).toBeGreaterThan(0);
  });

  it("returns cached results on subsequent calls (no additional fetch)", async () => {
    const callsBefore = fetchSpy.mock.calls.length;
    const result = await getMovieGenres();
    expect(fetchSpy.mock.calls.length).toBe(callsBefore); // no new fetch
    expect(result).toBeInstanceOf(Map);
  });
});

describe("getTvGenres", () => {
  it("returns a Map of genre id to name", async () => {
    const mockGenres = { genres: [{ id: 18, name: "Drama" }, { id: 10765, name: "Sci-Fi & Fantasy" }] };
    fetchSpy.mockResolvedValueOnce(jsonResponse(mockGenres));
    const result = await getTvGenres();
    expect(result).toBeInstanceOf(Map);
    expect(result.size).toBeGreaterThan(0);
  });
});

describe("getMovieWatchProviders", () => {
  it("returns array of provider objects with id, name, iconUrl", async () => {
    const mockProviders = {
      results: [
        { provider_id: 8, provider_name: "Netflix", logo_path: "/netflix.png", display_priority: 1, display_priorities: {} },
      ],
    };
    fetchSpy.mockResolvedValueOnce(jsonResponse(mockProviders));
    const result = await getMovieWatchProviders();
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
    expect(result[0]).toHaveProperty("id");
    expect(result[0]).toHaveProperty("name");
    expect(result[0]).toHaveProperty("iconUrl");
  });
});

describe("getTvWatchProviders", () => {
  it("returns array of provider objects with id, name, iconUrl", async () => {
    const mockProviders = {
      results: [
        { provider_id: 9, provider_name: "Amazon Prime", logo_path: "/prime.png", display_priority: 1, display_priorities: {} },
      ],
    };
    fetchSpy.mockResolvedValueOnce(jsonResponse(mockProviders));
    const result = await getTvWatchProviders();
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
    expect(result[0]).toHaveProperty("id");
    expect(result[0]).toHaveProperty("name");
    expect(result[0]).toHaveProperty("iconUrl");
  });
});

describe("getLanguages", () => {
  it("returns sorted array of language objects without 'No Language'", async () => {
    const mockLangs = [
      { iso_639_1: "en", english_name: "English", name: "English" },
      { iso_639_1: "xx", english_name: "No Language", name: "" },
      { iso_639_1: "de", english_name: "German", name: "Deutsch" },
      { iso_639_1: "fr", english_name: "French", name: "Français" },
      { iso_639_1: "zz", english_name: "", name: "" },
    ];
    fetchSpy.mockResolvedValueOnce(jsonResponse(mockLangs));
    const result = await getLanguages();
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
    // "No Language" and empty name should be filtered
    expect(result.find((l) => l.name === "No Language")).toBeUndefined();
    expect(result.find((l) => l.name === "")).toBeUndefined();
    // Should be sorted alphabetically
    const names = result.map((l) => l.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
  });
});

// ─── Malformed/partial responses ────────────────────────────────────────────

describe("malformed responses", () => {
  it("handles empty JSON object without crashing", async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse({}));
    const result = await fetchShowDetails("1");
    expect(result).toEqual({} as any);
  });

  it("handles response with extra unexpected fields", async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse({ id: 1, name: "Show", unexpected_field: true, nested: { deep: true } }));
    const result = await fetchShowDetails("1");
    expect((result as any).id).toBe(1);
  });

  it("handles null values in response gracefully", async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse({ id: 1, name: null, status: null, number_of_seasons: null, next_episode_to_air: null, last_episode_to_air: null }));
    const result = await fetchShowDetails("1");
    expect((result as any).name).toBeNull();
  });
});

// ─── Timeout tests (added from master — tests AbortController timeout) ──────

describe("tmdbRequest timeout", () => {
  test("passes abort signal to fetch", async () => {
    fetchSpy.mockImplementationOnce(async (_url: string | URL | Request, init?: RequestInit) => {
      expect(init?.signal).toBeDefined();
      expect(init?.signal).toBeInstanceOf(AbortSignal);
      return jsonResponse({ id: 1, name: "Test", status: "Returning", number_of_seasons: 1, next_episode_to_air: null, last_episode_to_air: null });
    });
    await fetchShowDetails("1");
  });

  test("completes successfully when response is fast", async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse({ page: 1, total_pages: 1, total_results: 1, results: [{ id: 1 }] }));
    const result = await searchMulti("test");
    expect(result.results).toHaveLength(1);
  });

  test("throws on non-ok response", async () => {
    fetchSpy.mockResolvedValueOnce(textResponse("Not Found", 404));
    await expect(searchMulti("test")).rejects.toThrow("TMDB API error 404: Not Found");
  });
});
