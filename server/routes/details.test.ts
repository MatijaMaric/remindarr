import { describe, it, expect, beforeEach, afterAll, mock } from "bun:test";
import { Hono } from "hono";
import type { AppEnv } from "../types";
import { CONFIG } from "../config";
import { setupTestDb, teardownTestDb } from "../test-utils/setup";
import { upsertTitles } from "../db/repository";
import { makeParsedTitle } from "../test-utils/fixtures";

// Ensure TMDB API key is set so fallback logic is exercised
CONFIG.TMDB_API_KEY = "test-api-key";

const mockFetchMovieDetails = mock(() => Promise.resolve({}));
const mockFetchTvDetails = mock(() => Promise.resolve({}));
const mockFetchMovieFullDetails = mock(() => Promise.resolve(null));
const mockFetchShowFullDetails = mock(() => Promise.resolve(null));
const mockFetchSeasonDetails = mock(() => Promise.resolve(null));
const mockFetchEpisodeDetails = mock(() => Promise.resolve(null));
const mockFetchPersonDetails = mock(() => Promise.resolve(null as any));

const realClient = await import("../tmdb/client");

mock.module("../tmdb/client", () => ({
  ...realClient,
  fetchMovieDetails: mockFetchMovieDetails,
  fetchTvDetails: mockFetchTvDetails,
  fetchMovieFullDetails: mockFetchMovieFullDetails,
  fetchShowFullDetails: mockFetchShowFullDetails,
  fetchSeasonDetails: mockFetchSeasonDetails,
  fetchEpisodeDetails: mockFetchEpisodeDetails,
  fetchPersonDetails: mockFetchPersonDetails,
}));

const { makeTmdbMovieDetails, makeTmdbTvDetails } = await import("../test-utils/fixtures");
const detailsApp = (await import("./details")).default;

let app: Hono<AppEnv>;

beforeEach(() => {
  setupTestDb();

  app = new Hono<AppEnv>();
  app.route("/details", detailsApp);

  mockFetchMovieDetails.mockClear();
  mockFetchTvDetails.mockClear();
  mockFetchMovieFullDetails.mockClear();
  mockFetchShowFullDetails.mockClear();
  mockFetchSeasonDetails.mockClear();
  mockFetchEpisodeDetails.mockClear();
  mockFetchPersonDetails.mockClear();
});

afterAll(() => {
  teardownTestDb();
});

describe("GET /details/movie/:id", () => {
  it("returns title from DB without TMDB fallback", async () => {
    upsertTitles([makeParsedTitle({ id: "movie-123", title: "DB Movie", tmdbId: "123" })]);

    const res = await app.request("/details/movie/movie-123");
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.title.title).toBe("DB Movie");
    expect(mockFetchMovieDetails).not.toHaveBeenCalled();
  });

  it("fetches from TMDB and persists when title not in DB", async () => {
    mockFetchMovieDetails.mockResolvedValueOnce(
      makeTmdbMovieDetails({ id: 999, title: "TMDB Movie" })
    );

    const res = await app.request("/details/movie/movie-999");
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.title.title).toBe("TMDB Movie");
    expect(body.title.id).toBe("movie-999");
    expect(mockFetchMovieDetails).toHaveBeenCalledWith(999);
  });

  it("returns 404 when TMDB fallback fails", async () => {
    mockFetchMovieDetails.mockRejectedValueOnce(new Error("TMDB API error"));

    const res = await app.request("/details/movie/movie-999");
    expect(res.status).toBe(404);
  });

  it("returns 404 for invalid title ID format", async () => {
    const res = await app.request("/details/movie/invalid-id");
    expect(res.status).toBe(404);
  });
});

describe("GET /details/show/:id", () => {
  it("returns title from DB without TMDB fallback", async () => {
    upsertTitles([makeParsedTitle({ id: "tv-456", objectType: "SHOW", title: "DB Show", tmdbId: "456" })]);

    const res = await app.request("/details/show/tv-456");
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.title.title).toBe("DB Show");
    expect(mockFetchTvDetails).not.toHaveBeenCalled();
  });

  it("fetches from TMDB and persists when show not in DB", async () => {
    mockFetchTvDetails.mockResolvedValueOnce(
      makeTmdbTvDetails({ id: 789, name: "TMDB Show" })
    );

    const res = await app.request("/details/show/tv-789");
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.title.title).toBe("TMDB Show");
    expect(body.title.id).toBe("tv-789");
    expect(mockFetchTvDetails).toHaveBeenCalledWith(789);
  });

  it("returns 404 when TMDB fallback fails", async () => {
    mockFetchTvDetails.mockRejectedValueOnce(new Error("TMDB API error"));

    const res = await app.request("/details/show/tv-789");
    expect(res.status).toBe(404);
  });
});

describe("GET /details/show/:id/season/:season", () => {
  it("fetches show from TMDB when not in DB for season endpoint", async () => {
    mockFetchTvDetails.mockResolvedValueOnce(
      makeTmdbTvDetails({ id: 555, name: "Season Show" })
    );

    const res = await app.request("/details/show/tv-555/season/1");
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.title.title).toBe("Season Show");
    expect(body.seasonNumber).toBe(1);
    expect(mockFetchTvDetails).toHaveBeenCalledWith(555);
  });
});

describe("GET /details/person/:personId", () => {
  it("returns person details from TMDB", async () => {
    mockFetchPersonDetails.mockResolvedValueOnce({
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
    expect(mockFetchPersonDetails).toHaveBeenCalledWith(123);
  });

  it("returns 400 for invalid person ID", async () => {
    const res = await app.request("/details/person/abc");
    expect(res.status).toBe(400);
  });

  it("returns 404 when TMDB fetch fails", async () => {
    mockFetchPersonDetails.mockRejectedValueOnce(new Error("Not found"));
    const res = await app.request("/details/person/999");
    expect(res.status).toBe(404);
  });
});
