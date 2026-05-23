import { describe, it, expect, beforeEach, afterAll, spyOn } from "bun:test";
import * as tmdbClient from "./client";
import * as metricsModule from "../metrics";

// Mock all TMDB client functions — no real HTTP calls in tests
const mockGetMovieGenres = spyOn(
  tmdbClient,
  "getMovieGenres",
).mockResolvedValue(new Map<number, string>());
const mockDiscoverMovies = spyOn(
  tmdbClient,
  "discoverMovies",
).mockResolvedValue({ results: [], total_pages: 1, page: 1, total_results: 0 });
const mockGetTvGenres = spyOn(tmdbClient, "getTvGenres").mockResolvedValue(
  new Map<number, string>(),
);
const mockDiscoverTv = spyOn(tmdbClient, "discoverTv").mockResolvedValue({
  results: [],
  total_pages: 1,
  page: 1,
  total_results: 0,
});
// fetchMovieDetails / fetchTvDetails are only called when discoverMovies/discoverTv
// return non-empty results. All tests in this file return empty results, so no spy needed.

// Spy on syncFailureTotal.inc so we can assert metric increments
const incSpy = spyOn(metricsModule.syncFailureTotal, "inc").mockImplementation(
  () => {},
);

import { fetchNewReleases } from "./sync-titles";

beforeEach(() => {
  mockGetMovieGenres.mockClear();
  mockDiscoverMovies.mockClear();
  mockGetTvGenres.mockClear();
  mockDiscoverTv.mockClear();
  incSpy.mockClear();
});

afterAll(() => {
  mockGetMovieGenres.mockRestore();
  mockDiscoverMovies.mockRestore();
  mockGetTvGenres.mockRestore();
  mockDiscoverTv.mockRestore();
  incSpy.mockRestore();
});

describe("fetchNewReleases", () => {
  it("returns empty array when discover endpoints return no results", async () => {
    const titles = await fetchNewReleases({ daysBack: 1 });
    expect(titles).toEqual([]);
    expect(mockGetMovieGenres).toHaveBeenCalledTimes(1);
    expect(mockGetTvGenres).toHaveBeenCalledTimes(1);
  });

  it("movie path failure with continueOnError:true — does not throw, TV path still runs, increments tmdb-movies metric", async () => {
    mockGetMovieGenres.mockRejectedValueOnce(new Error("TMDB genres timeout"));

    const titles = await fetchNewReleases({
      daysBack: 1,
      continueOnError: true,
    });

    expect(titles).toEqual([]);
    expect(incSpy).toHaveBeenCalledWith({ source: "tmdb-movies" });
    expect(incSpy).not.toHaveBeenCalledWith({ source: "tmdb-tv" });
    expect(mockGetTvGenres).toHaveBeenCalledTimes(1);
  });

  it("TV path failure with continueOnError:true — does not throw, increments tmdb-tv metric", async () => {
    mockGetTvGenres.mockRejectedValueOnce(new Error("TMDB TV timeout"));

    const titles = await fetchNewReleases({
      daysBack: 1,
      continueOnError: true,
    });

    expect(titles).toEqual([]);
    expect(incSpy).toHaveBeenCalledWith({ source: "tmdb-tv" });
    expect(incSpy).not.toHaveBeenCalledWith({ source: "tmdb-movies" });
    expect(mockGetMovieGenres).toHaveBeenCalledTimes(1);
  });

  it("movie path failure without continueOnError (default) — throws and does not increment metric", async () => {
    mockGetMovieGenres.mockRejectedValueOnce(new Error("TMDB down"));

    await expect(fetchNewReleases({ daysBack: 1 })).rejects.toThrow(
      "TMDB down",
    );
    expect(incSpy).not.toHaveBeenCalled();
    expect(mockGetTvGenres).not.toHaveBeenCalled();
  });

  it("objectType:MOVIE skips TV path entirely", async () => {
    const titles = await fetchNewReleases({ daysBack: 1, objectType: "MOVIE" });
    expect(titles).toEqual([]);
    expect(mockGetMovieGenres).toHaveBeenCalledTimes(1);
    expect(mockGetTvGenres).not.toHaveBeenCalled();
  });

  it("objectType:SHOW skips movie path entirely", async () => {
    const titles = await fetchNewReleases({ daysBack: 1, objectType: "SHOW" });
    expect(titles).toEqual([]);
    expect(mockGetTvGenres).toHaveBeenCalledTimes(1);
    expect(mockGetMovieGenres).not.toHaveBeenCalled();
  });
});
