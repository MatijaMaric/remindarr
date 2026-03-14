import { describe, it, expect, beforeEach, afterAll, mock } from "bun:test";
import { Hono } from "hono";
import type { AppEnv } from "../types";
import type { TmdbSearchMultiResult } from "../tmdb/types";
import { setupTestDb, teardownTestDb } from "../test-utils/setup";
import { upsertTitles, trackTitle, createUser } from "../db/repository";
import { makeParsedTitle } from "../test-utils/fixtures";

const mockSearchMulti = mock(() => Promise.resolve({ results: [] as TmdbSearchMultiResult[], total_pages: 1, total_results: 0, page: 1 }));
const mockFetchMovieDetails = mock(() => Promise.resolve({}));
const mockFetchTvDetails = mock(() => Promise.resolve({}));
const mockGetMovieGenres = mock(() => Promise.resolve(new Map([[28, "Action"]])));
const mockGetTvGenres = mock(() => Promise.resolve(new Map([[18, "Drama"]])));

const realClient = await import("../tmdb/client");

mock.module("../tmdb/client", () => ({
  ...realClient,
  searchMulti: mockSearchMulti,
  fetchMovieDetails: mockFetchMovieDetails,
  fetchTvDetails: mockFetchTvDetails,
  getMovieGenres: mockGetMovieGenres,
  getTvGenres: mockGetTvGenres,
  fetchPopularMovies: mock(() => Promise.resolve({ results: [], total_pages: 1, total_results: 0, page: 1 })),
  fetchPopularTv: mock(() => Promise.resolve({ results: [], total_pages: 1, total_results: 0, page: 1 })),
  fetchUpcomingMovies: mock(() => Promise.resolve({ results: [], total_pages: 1, total_results: 0, page: 1 })),
  fetchOnTheAirTv: mock(() => Promise.resolve({ results: [], total_pages: 1, total_results: 0, page: 1 })),
  fetchTopRatedMovies: mock(() => Promise.resolve({ results: [], total_pages: 1, total_results: 0, page: 1 })),
  fetchTopRatedTv: mock(() => Promise.resolve({ results: [], total_pages: 1, total_results: 0, page: 1 })),
}));

const { makeTmdbSearchMultiMovie, makeTmdbMovieDetails } = await import("../test-utils/fixtures");
const searchApp = (await import("./search")).default;

let app: Hono<AppEnv>;

beforeEach(() => {
  setupTestDb();

  app = new Hono<AppEnv>();
  app.route("/search", searchApp);

  mockSearchMulti.mockClear();
  mockFetchMovieDetails.mockClear();
  mockFetchTvDetails.mockClear();
});

afterAll(() => {
  teardownTestDb();
});

describe("GET /search", () => {
  it("returns 400 when query is missing", async () => {
    const res = await app.request("/search");
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("required");
  });

  it("returns search results with isTracked=false when no user", async () => {
    const movie = makeTmdbSearchMultiMovie({ id: 42 });
    mockSearchMulti.mockResolvedValueOnce({
      results: [movie], total_pages: 1, total_results: 1, page: 1,
    });
    mockFetchMovieDetails.mockResolvedValueOnce(makeTmdbMovieDetails({ id: 42 }));

    const res = await app.request("/search?q=test");
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.titles).toHaveLength(1);
    expect(body.titles[0].isTracked).toBe(false);
  });

  it("returns isTracked=true for tracked titles when user is authenticated", async () => {
    // Set up real DB data for tracking
    upsertTitles([makeParsedTitle({ id: "movie-42" })]);
    const userId = createUser("testuser", "hash");
    trackTitle("movie-42", userId);

    const movie = makeTmdbSearchMultiMovie({ id: 42 });
    mockSearchMulti.mockResolvedValueOnce({
      results: [movie], total_pages: 1, total_results: 1, page: 1,
    });
    mockFetchMovieDetails.mockResolvedValueOnce(makeTmdbMovieDetails({ id: 42 }));

    const authedApp = new Hono<AppEnv>();
    authedApp.use("/search/*", async (c, next) => {
      c.set("user", { id: userId, username: "testuser", display_name: null, auth_provider: "test", is_admin: false });
      await next();
    });
    authedApp.route("/search", searchApp);

    const res = await authedApp.request("/search?q=test");
    const body = await res.json();

    expect(body.titles[0].isTracked).toBe(true);
  });
});
