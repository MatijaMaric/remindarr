import { describe, it, expect, beforeEach, afterAll, mock, spyOn } from "bun:test";
import { setupTestDb, teardownTestDb } from "../test-utils/setup";
import { getRawDb } from "../db/bun-db";
import { CONFIG } from "../config";

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockFetchMovieDetails = mock(async (_id: number) => ({
  title: "English Movie Title",
  original_title: "Original Movie Title",
}));

const mockFetchTvDetails = mock(async (_id: number) => ({
  name: "English Show Name",
  original_name: "Original Show Name",
}));

mock.module("../tmdb/client", () => ({
  fetchMovieDetails: mockFetchMovieDetails,
  fetchTvDetails: mockFetchTvDetails,
}));

// ─── Import after mocks ───────────────────────────────────────────────────────
import { migrateTitles } from "./migrate-titles";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function insertTitle(opts: {
  id: string;
  objectType: string;
  tmdbId: string | null;
  title: string;
  originalTitle: string | null;
}) {
  const db = getRawDb();
  db.prepare(
    `INSERT INTO titles (id, object_type, tmdb_id, title, original_title, release_date)
     VALUES (?, ?, ?, ?, ?, '2024-01-01')`
  ).run(opts.id, opts.objectType, opts.tmdbId, opts.title, opts.originalTitle);
}

// ─── Setup ───────────────────────────────────────────────────────────────────

const originalApiKey = CONFIG.TMDB_API_KEY;

beforeEach(() => {
  setupTestDb();
  mockFetchMovieDetails.mockClear();
  mockFetchTvDetails.mockClear();
  CONFIG.TMDB_API_KEY = "test-api-key";
});

afterAll(() => {
  CONFIG.TMDB_API_KEY = originalApiKey;
  teardownTestDb();
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("migrateTitles", () => {
  it("returns early with zeros when TMDB_API_KEY is not configured", async () => {
    CONFIG.TMDB_API_KEY = "";

    const result = await migrateTitles();

    expect(result).toEqual({ updated: 0, failed: 0 });
    expect(mockFetchMovieDetails).not.toHaveBeenCalled();
    expect(mockFetchTvDetails).not.toHaveBeenCalled();
  });

  it("returns zeros when no titles need migration", async () => {
    // Insert a title that already has original_title set
    insertTitle({
      id: "movie-1",
      objectType: "MOVIE",
      tmdbId: "123",
      title: "Already Migrated",
      originalTitle: "Already Migrated Original",
    });

    const result = await migrateTitles();

    expect(result).toEqual({ updated: 0, failed: 0 });
    expect(mockFetchMovieDetails).not.toHaveBeenCalled();
  });

  it("returns zeros when no titles exist", async () => {
    const result = await migrateTitles();

    expect(result).toEqual({ updated: 0, failed: 0 });
  });

  it("migrates a movie title without original_title", async () => {
    insertTitle({
      id: "movie-100",
      objectType: "MOVIE",
      tmdbId: "100",
      title: "Old Title",
      originalTitle: null,
    });

    mockFetchMovieDetails.mockResolvedValueOnce({
      title: "English Movie",
      original_title: "Original Film",
    });

    const result = await migrateTitles();

    expect(result).toEqual({ updated: 1, failed: 0 });
    expect(mockFetchMovieDetails).toHaveBeenCalledWith(100);

    const db = getRawDb();
    const row = db.prepare("SELECT title, original_title FROM titles WHERE id = ?").get("movie-100") as any;
    expect(row.title).toBe("English Movie");
    expect(row.original_title).toBe("Original Film");
  });

  it("migrates a TV show title without original_title", async () => {
    insertTitle({
      id: "tv-200",
      objectType: "SHOW",
      tmdbId: "200",
      title: "Old Show",
      originalTitle: null,
    });

    mockFetchTvDetails.mockResolvedValueOnce({
      name: "English Show",
      original_name: "Original Naziv",
    });

    const result = await migrateTitles();

    expect(result).toEqual({ updated: 1, failed: 0 });
    expect(mockFetchTvDetails).toHaveBeenCalledWith(200);

    const db = getRawDb();
    const row = db.prepare("SELECT title, original_title FROM titles WHERE id = ?").get("tv-200") as any;
    expect(row.title).toBe("English Show");
    expect(row.original_title).toBe("Original Naziv");
  });

  it("uses object_type MOVIE to route to fetchMovieDetails", async () => {
    // id doesn't start with "movie-" but object_type is MOVIE
    insertTitle({
      id: "custom-movie-abc",
      objectType: "MOVIE",
      tmdbId: "300",
      title: "Custom ID Movie",
      originalTitle: null,
    });

    mockFetchMovieDetails.mockResolvedValueOnce({
      title: "Fetched Title",
      original_title: "Fetched Original",
    });

    const result = await migrateTitles();

    expect(result.updated).toBe(1);
    expect(mockFetchMovieDetails).toHaveBeenCalledWith(300);
    expect(mockFetchTvDetails).not.toHaveBeenCalled();
  });

  it("uses id prefix 'movie-' to route to fetchMovieDetails when object_type differs", async () => {
    // object_type is "SHOW" but id starts with "movie-"
    insertTitle({
      id: "movie-400",
      objectType: "SHOW",
      tmdbId: "400",
      title: "Mismatched Type",
      originalTitle: null,
    });

    mockFetchMovieDetails.mockResolvedValueOnce({
      title: "Correct Fetch",
      original_title: "Correct Original",
    });

    const result = await migrateTitles();

    expect(result.updated).toBe(1);
    expect(mockFetchMovieDetails).toHaveBeenCalledWith(400);
    expect(mockFetchTvDetails).not.toHaveBeenCalled();
  });

  it("counts failed titles when TMDB fetch throws", async () => {
    insertTitle({
      id: "movie-500",
      objectType: "MOVIE",
      tmdbId: "500",
      title: "Failing Movie",
      originalTitle: null,
    });

    mockFetchMovieDetails.mockRejectedValueOnce(new Error("TMDB 404"));

    const result = await migrateTitles();

    expect(result).toEqual({ updated: 0, failed: 1 });
  });

  it("continues processing remaining titles after one failure", async () => {
    insertTitle({
      id: "movie-600",
      objectType: "MOVIE",
      tmdbId: "600",
      title: "Failing Movie",
      originalTitle: null,
    });
    insertTitle({
      id: "movie-601",
      objectType: "MOVIE",
      tmdbId: "601",
      title: "Succeeding Movie",
      originalTitle: null,
    });

    mockFetchMovieDetails
      .mockRejectedValueOnce(new Error("API error"))
      .mockResolvedValueOnce({ title: "Success", original_title: "Success Original" });

    const result = await migrateTitles();

    expect(result).toEqual({ updated: 1, failed: 1 });
  });

  it("skips titles without tmdb_id", async () => {
    const db = getRawDb();
    db.prepare(
      `INSERT INTO titles (id, object_type, tmdb_id, title, original_title, release_date)
       VALUES ('movie-no-tmdb', 'MOVIE', NULL, 'No TMDB', NULL, '2024-01-01')`
    ).run();

    const result = await migrateTitles();

    expect(result).toEqual({ updated: 0, failed: 0 });
    expect(mockFetchMovieDetails).not.toHaveBeenCalled();
  });

  it("migrates multiple titles and returns correct counts", async () => {
    insertTitle({ id: "movie-700", objectType: "MOVIE", tmdbId: "700", title: "Movie 1", originalTitle: null });
    insertTitle({ id: "movie-701", objectType: "MOVIE", tmdbId: "701", title: "Movie 2", originalTitle: null });
    insertTitle({ id: "tv-702", objectType: "SHOW", tmdbId: "702", title: "Show 1", originalTitle: null });

    mockFetchMovieDetails
      .mockResolvedValueOnce({ title: "Movie 1 EN", original_title: "Film 1" })
      .mockResolvedValueOnce({ title: "Movie 2 EN", original_title: "Film 2" });
    mockFetchTvDetails.mockResolvedValueOnce({ name: "Show 1 EN", original_name: "Serija 1" });

    const result = await migrateTitles();

    expect(result).toEqual({ updated: 3, failed: 0 });
    expect(mockFetchMovieDetails).toHaveBeenCalledTimes(2);
    expect(mockFetchTvDetails).toHaveBeenCalledTimes(1);
  });
});
