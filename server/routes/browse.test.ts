import { describe, it, expect, beforeEach, mock } from "bun:test";
import { Hono } from "hono";
import type { AppEnv } from "../types";

const mockFetchPopularMovies = mock(() => Promise.resolve({ results: [], total_pages: 1, total_results: 0, page: 1 }));
const mockFetchPopularTv = mock(() => Promise.resolve({ results: [], total_pages: 1, total_results: 0, page: 1 }));
const mockFetchUpcomingMovies = mock(() => Promise.resolve({ results: [], total_pages: 1, total_results: 0, page: 1 }));
const mockFetchOnTheAirTv = mock(() => Promise.resolve({ results: [], total_pages: 1, total_results: 0, page: 1 }));
const mockFetchTopRatedMovies = mock(() => Promise.resolve({ results: [], total_pages: 1, total_results: 0, page: 1 }));
const mockFetchTopRatedTv = mock(() => Promise.resolve({ results: [], total_pages: 1, total_results: 0, page: 1 }));
const mockFetchMovieDetails = mock(() => Promise.resolve({}));
const mockFetchTvDetails = mock(() => Promise.resolve({}));
const mockGetMovieGenres = mock(() => Promise.resolve(new Map([[28, "Action"]])));
const mockGetTvGenres = mock(() => Promise.resolve(new Map([[18, "Drama"]])));
const mockGetTrackedTitleIds = mock(() => new Set<string>());

mock.module("../tmdb/client", () => ({
  fetchPopularMovies: mockFetchPopularMovies,
  fetchPopularTv: mockFetchPopularTv,
  fetchUpcomingMovies: mockFetchUpcomingMovies,
  fetchOnTheAirTv: mockFetchOnTheAirTv,
  fetchTopRatedMovies: mockFetchTopRatedMovies,
  fetchTopRatedTv: mockFetchTopRatedTv,
  fetchMovieDetails: mockFetchMovieDetails,
  fetchTvDetails: mockFetchTvDetails,
  getMovieGenres: mockGetMovieGenres,
  getTvGenres: mockGetTvGenres,
  searchMulti: mock(() => Promise.resolve({ results: [], total_pages: 1, total_results: 0, page: 1 })),
}));

mock.module("../db/repository", () => ({
  getTrackedTitleIds: mockGetTrackedTitleIds,
}));

const { makeTmdbDiscoverMovie, makeTmdbDiscoverTv, makeTmdbMovieDetails, makeTmdbTvDetails } = await import("../test-utils/fixtures");
const browseApp = (await import("./browse")).default;

let app: Hono<AppEnv>;

beforeEach(() => {
  app = new Hono<AppEnv>();
  app.route("/browse", browseApp);

  mockFetchPopularMovies.mockClear();
  mockFetchPopularTv.mockClear();
  mockFetchUpcomingMovies.mockClear();
  mockFetchOnTheAirTv.mockClear();
  mockFetchTopRatedMovies.mockClear();
  mockFetchTopRatedTv.mockClear();
  mockFetchMovieDetails.mockClear();
  mockFetchTvDetails.mockClear();
  mockGetTrackedTitleIds.mockClear();
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
    mockFetchPopularMovies.mockResolvedValueOnce({
      results: [movie], total_pages: 5, total_results: 100, page: 1,
    });
    mockFetchMovieDetails.mockResolvedValueOnce(makeTmdbMovieDetails({ id: movie.id }));

    const res = await app.request("/browse?category=popular&type=MOVIE");
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.titles).toHaveLength(1);
    expect(body.page).toBe(1);
    expect(body.totalPages).toBe(5);
    expect(mockFetchPopularMovies).toHaveBeenCalledWith(1);
    expect(mockFetchPopularTv).not.toHaveBeenCalled();
  });

  it("fetches popular TV when type=SHOW", async () => {
    const tv = makeTmdbDiscoverTv();
    mockFetchPopularTv.mockResolvedValueOnce({
      results: [tv], total_pages: 3, total_results: 60, page: 1,
    });
    mockFetchTvDetails.mockResolvedValueOnce(makeTmdbTvDetails({ id: tv.id }));

    const res = await app.request("/browse?category=popular&type=SHOW");
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.titles).toHaveLength(1);
    expect(mockFetchPopularTv).toHaveBeenCalledWith(1);
    expect(mockFetchPopularMovies).not.toHaveBeenCalled();
  });

  it("fetches both types when type is omitted", async () => {
    const movie = makeTmdbDiscoverMovie();
    const tv = makeTmdbDiscoverTv();
    mockFetchPopularMovies.mockResolvedValueOnce({
      results: [movie], total_pages: 2, total_results: 40, page: 1,
    });
    mockFetchPopularTv.mockResolvedValueOnce({
      results: [tv], total_pages: 3, total_results: 60, page: 1,
    });
    mockFetchMovieDetails.mockResolvedValueOnce(makeTmdbMovieDetails({ id: movie.id }));
    mockFetchTvDetails.mockResolvedValueOnce(makeTmdbTvDetails({ id: tv.id }));

    const res = await app.request("/browse?category=popular");
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.titles).toHaveLength(2);
    expect(body.totalPages).toBe(3); // max of 2 and 3
    expect(mockFetchPopularMovies).toHaveBeenCalled();
    expect(mockFetchPopularTv).toHaveBeenCalled();
  });

  it("uses upcoming fetchers for upcoming category", async () => {
    mockFetchUpcomingMovies.mockResolvedValueOnce({
      results: [], total_pages: 1, total_results: 0, page: 1,
    });

    const res = await app.request("/browse?category=upcoming&type=MOVIE");
    expect(res.status).toBe(200);
    expect(mockFetchUpcomingMovies).toHaveBeenCalled();
  });

  it("uses on_the_air for upcoming TV shows", async () => {
    mockFetchOnTheAirTv.mockResolvedValueOnce({
      results: [], total_pages: 1, total_results: 0, page: 1,
    });

    const res = await app.request("/browse?category=upcoming&type=SHOW");
    expect(res.status).toBe(200);
    expect(mockFetchOnTheAirTv).toHaveBeenCalled();
  });

  it("uses top_rated fetchers for top_rated category", async () => {
    mockFetchTopRatedMovies.mockResolvedValueOnce({
      results: [], total_pages: 1, total_results: 0, page: 1,
    });

    const res = await app.request("/browse?category=top_rated&type=MOVIE");
    expect(res.status).toBe(200);
    expect(mockFetchTopRatedMovies).toHaveBeenCalled();
  });

  it("passes page parameter correctly", async () => {
    mockFetchPopularMovies.mockResolvedValueOnce({
      results: [], total_pages: 10, total_results: 200, page: 3,
    });

    const res = await app.request("/browse?category=popular&type=MOVIE&page=3");
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.page).toBe(3);
    expect(mockFetchPopularMovies).toHaveBeenCalledWith(3);
  });

  it("falls back to basic data when detail fetch fails", async () => {
    const movie = makeTmdbDiscoverMovie();
    mockFetchPopularMovies.mockResolvedValueOnce({
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
    mockFetchPopularMovies.mockResolvedValueOnce({
      results: [movie], total_pages: 1, total_results: 1, page: 1,
    });
    mockFetchMovieDetails.mockResolvedValueOnce(makeTmdbMovieDetails({ id: movie.id }));

    const res = await app.request("/browse?category=popular&type=MOVIE");
    const body = await res.json();

    expect(body.titles[0].isTracked).toBe(false);
    expect(mockGetTrackedTitleIds).not.toHaveBeenCalled();
  });

  it("returns isTracked=true for tracked titles when user is authenticated", async () => {
    const movie = makeTmdbDiscoverMovie({ id: 555 });
    mockFetchPopularMovies.mockResolvedValueOnce({
      results: [movie], total_pages: 1, total_results: 1, page: 1,
    });
    mockFetchMovieDetails.mockResolvedValueOnce(makeTmdbMovieDetails({ id: 555 }));
    mockGetTrackedTitleIds.mockReturnValueOnce(new Set(["movie-555"]));

    const authedApp = new Hono<AppEnv>();
    authedApp.use("/browse/*", async (c, next) => {
      c.set("user", { id: "user-1", username: "testuser", isAdmin: false });
      await next();
    });
    authedApp.route("/browse", browseApp);

    const res = await authedApp.request("/browse?category=popular&type=MOVIE");
    const body = await res.json();

    expect(body.titles[0].isTracked).toBe(true);
    expect(mockGetTrackedTitleIds).toHaveBeenCalledWith("user-1");
  });
});
