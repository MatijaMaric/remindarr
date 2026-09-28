import { describe, it, expect, beforeEach, afterAll, spyOn } from "bun:test";
import { setupTestDb, teardownTestDb } from "../test-utils/setup";
import { getRawDb } from "../db/bun-db";
import { CONFIG } from "../config";

import * as tmdbClient from "../tmdb/client";
import * as http from "../lib/http";

const mockFetchMovieDetails = spyOn(
  tmdbClient,
  "fetchMovieDetails",
).mockResolvedValue({} as any);
const mockFetchTvDetails = spyOn(
  tmdbClient,
  "fetchTvDetails",
).mockResolvedValue({} as any);
const sleepSpy = spyOn(http, "sleep").mockResolvedValue(undefined);

import { migrateBackdrops } from "./migrate-backdrops";

function insertTitle(
  id: string,
  objectType: string,
  tmdbId: string | null,
  backdropUrl: string | null = null,
) {
  getRawDb()
    .prepare(
      `INSERT INTO titles (id, object_type, tmdb_id, title, release_date, backdrop_url) VALUES (?, ?, ?, ?, '2024-01-01', ?)`,
    )
    .run(id, objectType, tmdbId, `Title ${id}`, backdropUrl);
}

function getTitle(id: string): {
  backdrop_url: string | null;
  backdrop_checked: number;
} {
  return getRawDb()
    .prepare("SELECT backdrop_url, backdrop_checked FROM titles WHERE id = ?")
    .get(id) as { backdrop_url: string | null; backdrop_checked: number };
}

const originalApiKey = CONFIG.TMDB_API_KEY;

beforeEach(() => {
  setupTestDb();
  mockFetchMovieDetails.mockReset();
  mockFetchTvDetails.mockReset();
  mockFetchMovieDetails.mockResolvedValue({} as any);
  mockFetchTvDetails.mockResolvedValue({} as any);
  CONFIG.TMDB_API_KEY = "test-api-key";
});

afterAll(() => {
  CONFIG.TMDB_API_KEY = originalApiKey;
  mockFetchMovieDetails.mockRestore();
  mockFetchTvDetails.mockRestore();
  sleepSpy.mockRestore();
  teardownTestDb();
});

describe("migrateBackdrops", () => {
  it("returns early when TMDB_API_KEY is not configured", async () => {
    CONFIG.TMDB_API_KEY = "";
    insertTitle("movie-1", "MOVIE", "1");

    const result = await migrateBackdrops();

    expect(result).toEqual({
      updated: 0,
      skipped: 0,
      failed: 0,
      hasMore: false,
    });
    expect(mockFetchMovieDetails).not.toHaveBeenCalled();
    expect(getTitle("movie-1").backdrop_checked).toBe(0);
  });

  it("returns zeros when no titles need a backdrop", async () => {
    const result = await migrateBackdrops();

    expect(result).toEqual({
      updated: 0,
      skipped: 0,
      failed: 0,
      hasMore: false,
    });
  });

  it("writes a movie backdrop and marks the row checked", async () => {
    insertTitle("movie-200", "MOVIE", "200");
    mockFetchMovieDetails.mockResolvedValueOnce({
      backdrop_path: "/backdrop.jpg",
    } as any);

    const result = await migrateBackdrops();

    expect(result).toEqual({
      updated: 1,
      skipped: 0,
      failed: 0,
      hasMore: false,
    });
    expect(mockFetchMovieDetails).toHaveBeenCalledWith(200);
    const row = getTitle("movie-200");
    expect(row.backdrop_url).toBe(
      `${CONFIG.TMDB_IMAGE_BASE_URL}/w1280/backdrop.jpg`,
    );
    expect(row.backdrop_checked).toBe(1);
  });

  it("fetches TV details for shows", async () => {
    insertTitle("tv-300", "SHOW", "300");
    mockFetchTvDetails.mockResolvedValueOnce({
      backdrop_path: "/tv.jpg",
    } as any);

    const result = await migrateBackdrops();

    expect(result).toMatchObject({ updated: 1, hasMore: false });
    expect(mockFetchTvDetails).toHaveBeenCalledWith(300);
    expect(getTitle("tv-300").backdrop_url).toContain("/w1280/tv.jpg");
  });

  it("marks a title with no backdrop so the next batch does not refetch it", async () => {
    insertTitle("movie-400", "MOVIE", "400");
    mockFetchMovieDetails.mockResolvedValue({ backdrop_path: null } as any);

    const first = await migrateBackdrops();
    expect(first).toMatchObject({ skipped: 1, hasMore: false });
    expect(getTitle("movie-400").backdrop_checked).toBe(1);

    mockFetchMovieDetails.mockClear();
    const second = await migrateBackdrops();
    expect(second).toEqual({
      updated: 0,
      skipped: 0,
      failed: 0,
      hasMore: false,
    });
    expect(mockFetchMovieDetails).not.toHaveBeenCalled();
  });

  it("marks a failed lookup checked so it is not retried forever", async () => {
    insertTitle("movie-500", "MOVIE", "500");
    mockFetchMovieDetails.mockRejectedValueOnce(new Error("TMDB 500"));

    const result = await migrateBackdrops();

    expect(result).toMatchObject({ failed: 1, hasMore: false });
    expect(getTitle("movie-500").backdrop_checked).toBe(1);
  });

  it("leaves titles that already have a backdrop or no tmdb id alone", async () => {
    insertTitle("movie-600", "MOVIE", "600", "https://example.com/already.jpg");
    insertTitle("movie-601", "MOVIE", null);

    const result = await migrateBackdrops();

    expect(result.hasMore).toBe(false);
    expect(mockFetchMovieDetails).not.toHaveBeenCalled();
    expect(getTitle("movie-600").backdrop_checked).toBe(0);
    expect(getTitle("movie-601").backdrop_checked).toBe(0);
  });

  it("returns hasMore when the batch is full", async () => {
    insertTitle("movie-701", "MOVIE", "701");
    insertTitle("movie-702", "MOVIE", "702");
    mockFetchMovieDetails.mockResolvedValue({
      backdrop_path: "/b.jpg",
    } as any);

    const result = await migrateBackdrops(1);

    expect(result).toMatchObject({ updated: 1, hasMore: true });
    expect(mockFetchMovieDetails).toHaveBeenCalledTimes(1);
    expect(getTitle("movie-702").backdrop_checked).toBe(0);
  });
});
