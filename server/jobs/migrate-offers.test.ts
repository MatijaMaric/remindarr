import { describe, it, expect, beforeEach, afterAll, spyOn } from "bun:test";
import { setupTestDb, teardownTestDb } from "../test-utils/setup";
import { makeParsedTitle, makeParsedOffer } from "../test-utils/fixtures";
import { upsertTitles } from "../db/repository";
import { getRawDb } from "../db/bun-db";
import { CONFIG } from "../config";

// ─── Mocks ───────────────────────────────────────────────────────────────────

import * as tmdbClient from "../tmdb/client";
import * as tmdbParser from "../tmdb/parser";
import * as repository from "../db/repository";

const mockFetchMovieDetails = spyOn(tmdbClient, "fetchMovieDetails").mockResolvedValue({} as any);
const mockFetchTvDetails = spyOn(tmdbClient, "fetchTvDetails").mockResolvedValue({} as any);

const mockParseMovieDetails = spyOn(tmdbParser, "parseMovieDetails").mockReturnValue(
  makeParsedTitle({ offers: [] })
);
const mockParseTvDetails = spyOn(tmdbParser, "parseTvDetails").mockReturnValue(
  makeParsedTitle({ id: "tv-1", objectType: "SHOW", offers: [] })
);

const mockUpsertTitles = spyOn(repository, "upsertTitles");

// ─── Import after mocks ─────────────────────────────────────────────────────
import { migrateOffers } from "./migrate-offers";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function insertTitle(id: string, objectType: string, tmdbId: string) {
  const db = getRawDb();
  db.prepare(
    `INSERT INTO titles (id, object_type, tmdb_id, title, release_date) VALUES (?, ?, ?, ?, '2024-01-01')`
  ).run(id, objectType, tmdbId, `Title ${id}`);
}

function insertOffer(titleId: string) {
  const db = getRawDb();
  db.prepare(`INSERT OR IGNORE INTO providers (id, name) VALUES (8, 'Netflix')`).run();
  db.prepare(
    `INSERT INTO offers (title_id, provider_id, monetization_type) VALUES (?, 8, 'FLATRATE')`
  ).run(titleId);
}

function countOffers(titleId: string): number {
  const db = getRawDb();
  const row = db.prepare("SELECT COUNT(*) as cnt FROM offers WHERE title_id = ?").get(titleId) as any;
  return row.cnt;
}

// ─── Setup ───────────────────────────────────────────────────────────────────

const originalApiKey = CONFIG.TMDB_API_KEY;

beforeEach(() => {
  setupTestDb();
  mockFetchMovieDetails.mockClear();
  mockFetchTvDetails.mockClear();
  mockParseMovieDetails.mockClear();
  mockParseTvDetails.mockClear();
  mockUpsertTitles.mockClear();
  // Restore real upsertTitles for integration-style tests
  mockUpsertTitles.mockRestore();
  CONFIG.TMDB_API_KEY = "test-api-key";
});

afterAll(() => {
  CONFIG.TMDB_API_KEY = originalApiKey;
  mockFetchMovieDetails.mockRestore();
  mockFetchTvDetails.mockRestore();
  mockParseMovieDetails.mockRestore();
  mockParseTvDetails.mockRestore();
  teardownTestDb();
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("migrateOffers", () => {
  it("returns early when TMDB_API_KEY is not configured", async () => {
    CONFIG.TMDB_API_KEY = "";

    const result = await migrateOffers();

    expect(result).toEqual({ updated: 0, skipped: 0, failed: 0, hasMore: false });
    expect(mockFetchMovieDetails).not.toHaveBeenCalled();
    expect(mockFetchTvDetails).not.toHaveBeenCalled();
  });

  it("returns zeros when no titles exist", async () => {
    const result = await migrateOffers();

    expect(result).toEqual({ updated: 0, skipped: 0, failed: 0, hasMore: false });
  });

  it("skips titles that already have offers", async () => {
    insertTitle("movie-100", "MOVIE", "100");
    insertOffer("movie-100");

    const result = await migrateOffers();

    expect(result).toEqual({ updated: 0, skipped: 0, failed: 0, hasMore: false });
    expect(mockFetchMovieDetails).not.toHaveBeenCalled();
  });

  it("fetches and upserts offers for a movie without offers", async () => {
    insertTitle("movie-200", "MOVIE", "200");

    const parsedTitle = makeParsedTitle({
      id: "movie-200",
      tmdbId: "200",
      offers: [makeParsedOffer({ titleId: "movie-200" })],
    });
    mockFetchMovieDetails.mockResolvedValueOnce({} as any);
    mockParseMovieDetails.mockReturnValueOnce(parsedTitle);

    const result = await migrateOffers();

    expect(result).toEqual({ updated: 1, skipped: 0, failed: 0, hasMore: false });
    expect(mockFetchMovieDetails).toHaveBeenCalledWith(200);
    expect(countOffers("movie-200")).toBe(1);
  });

  it("fetches TV details for shows", async () => {
    insertTitle("tv-300", "SHOW", "300");

    const parsedTitle = makeParsedTitle({
      id: "tv-300",
      objectType: "SHOW",
      tmdbId: "300",
      offers: [makeParsedOffer({ titleId: "tv-300" })],
    });
    mockFetchTvDetails.mockResolvedValueOnce({} as any);
    mockParseTvDetails.mockReturnValueOnce(parsedTitle);

    const result = await migrateOffers();

    expect(result).toEqual({ updated: 1, skipped: 0, failed: 0, hasMore: false });
    expect(mockFetchTvDetails).toHaveBeenCalledWith(300);
    expect(countOffers("tv-300")).toBe(1);
  });

  it("counts as skipped when TMDB returns no offers", async () => {
    insertTitle("movie-400", "MOVIE", "400");

    mockFetchMovieDetails.mockResolvedValueOnce({} as any);
    mockParseMovieDetails.mockReturnValueOnce(makeParsedTitle({ id: "movie-400", offers: [] }));

    const result = await migrateOffers();

    expect(result).toEqual({ updated: 0, skipped: 1, failed: 0, hasMore: false });
    expect(countOffers("movie-400")).toBe(0);
  });

  it("counts failures when TMDB fetch throws", async () => {
    insertTitle("movie-500", "MOVIE", "500");

    mockFetchMovieDetails.mockRejectedValueOnce(new Error("TMDB 500"));

    const result = await migrateOffers();

    expect(result).toEqual({ updated: 0, skipped: 0, failed: 1, hasMore: false });
  });

  it("continues after a failure and processes remaining titles", async () => {
    insertTitle("movie-600", "MOVIE", "600");
    insertTitle("movie-601", "MOVIE", "601");

    mockFetchMovieDetails.mockRejectedValueOnce(new Error("API error"));
    const parsedTitle = makeParsedTitle({
      id: "movie-601",
      tmdbId: "601",
      offers: [makeParsedOffer({ titleId: "movie-601" })],
    });
    mockFetchMovieDetails.mockResolvedValueOnce({} as any);
    mockParseMovieDetails.mockReturnValueOnce(parsedTitle);

    const result = await migrateOffers();

    expect(result).toEqual({ updated: 1, skipped: 0, failed: 1, hasMore: false });
  });

  it("returns hasMore: true when the batch is full and more titles remain", async () => {
    insertTitle("movie-701", "MOVIE", "701");
    insertTitle("movie-702", "MOVIE", "702");

    mockFetchMovieDetails.mockRejectedValue(new Error("API error"));

    // batchSize=1 so only movie-701 is processed; movie-702 remains
    const result = await migrateOffers(1);

    expect(result).toMatchObject({ hasMore: true });
    expect(mockFetchMovieDetails).toHaveBeenCalledTimes(1);
  });
});
