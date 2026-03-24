import { describe, it, expect, beforeEach, afterAll, mock, spyOn } from "bun:test";
import { setupTestDb, teardownTestDb } from "../test-utils/setup";
import { enqueueJob, registerCron, getCronJobs, claimNextJob } from "./queue";
import { registerHandler, processJobs, stopWorker } from "./worker";

// ─── Mocks ───────────────────────────────────────────────────────────────────

// Mock Sentry to avoid side effects
import Sentry from "../sentry";
spyOn(Sentry, "withMonitor").mockImplementation(
  ((_slug: string, fn: () => unknown) => fn()) as typeof Sentry.withMonitor
);
const captureExceptionSpy = spyOn(Sentry, "captureException").mockReturnValue("test-event-id");

// Mock TMDB sync-titles — use spyOn to avoid clobbering the module
import * as syncTitlesModule from "../tmdb/sync-titles";
const mockFetchNewReleases = spyOn(syncTitlesModule, "fetchNewReleases").mockResolvedValue([]);

// Mock upsertTitles via spyOn to avoid clobbering the entire repository module
import * as repository from "../db/repository";
const mockUpsertTitles = spyOn(repository, "upsertTitles").mockResolvedValue(0);

// Mock tmdb/sync syncEpisodes and syncEpisodesForShow — use spyOn
import * as syncModule from "../tmdb/sync";
const mockSyncEpisodes = spyOn(syncModule, "syncEpisodes").mockResolvedValue({ synced: 0, shows: 0 });
const mockSyncEpisodesForShow = spyOn(syncModule, "syncEpisodesForShow").mockResolvedValue(0);

// Mock episode repository functions for watched episode restoration
const mockGetEpisodeIdsBySE = spyOn(repository, "getEpisodeIdsBySE").mockResolvedValue([]);
const mockWatchEpisodesBulk = spyOn(repository, "watchEpisodesBulk").mockResolvedValue(undefined);

// Mock migrate-titles — use spyOn
import * as migrateTitlesModule from "./migrate-titles";
const mockMigrateTitles = spyOn(migrateTitlesModule, "migrateTitles").mockResolvedValue({ updated: 0, failed: 0 });

import { CONFIG } from "../config";

// Import after mocks are set up
import { registerSyncJobs } from "./sync";

// ─── Setup ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  setupTestDb();
  mockFetchNewReleases.mockClear();
  mockUpsertTitles.mockClear();
  mockSyncEpisodes.mockClear();
  mockSyncEpisodesForShow.mockClear();
  mockGetEpisodeIdsBySE.mockClear();
  mockWatchEpisodesBulk.mockClear();
  mockMigrateTitles.mockClear();
  captureExceptionSpy.mockClear();
});

afterAll(() => {
  stopWorker();
  teardownTestDb();
  // Restore all spies so they don't leak into other test files
  mockFetchNewReleases.mockRestore();
  mockUpsertTitles.mockRestore();
  mockSyncEpisodes.mockRestore();
  mockSyncEpisodesForShow.mockRestore();
  mockGetEpisodeIdsBySE.mockRestore();
  mockWatchEpisodesBulk.mockRestore();
  mockMigrateTitles.mockRestore();
});

// ─── registerSyncJobs ────────────────────────────────────────────────────────

describe("registerSyncJobs", () => {
  it("registers cron schedules for sync-titles and sync-episodes", () => {
    registerSyncJobs();

    const crons = getCronJobs();
    const names = crons.map((c) => c.name);

    expect(names).toContain("sync-titles");
    expect(names).toContain("sync-episodes");
  });

  it("uses CONFIG cron expressions for sync-titles and sync-episodes", () => {
    registerSyncJobs();

    const crons = getCronJobs();
    const syncTitles = crons.find((c) => c.name === "sync-titles");
    const syncEpisodes = crons.find((c) => c.name === "sync-episodes");

    expect(syncTitles?.cron).toBe(CONFIG.SYNC_TITLES_CRON);
    expect(syncEpisodes?.cron).toBe(CONFIG.SYNC_EPISODES_CRON);
  });

  it("enqueues a one-time migrate-titles job on registration", () => {
    registerSyncJobs();

    // registerSyncJobs should enqueue a migrate-titles job automatically
    const job = claimNextJob("migrate-titles");
    expect(job).not.toBeNull();
    expect(job!.name).toBe("migrate-titles");
  });
});

// ─── sync-titles handler ─────────────────────────────────────────────────────

describe("sync-titles handler", () => {
  beforeEach(() => {
    registerSyncJobs();
    // Drain the auto-enqueued migrate-titles job to avoid interfering with assertions
    claimNextJob("migrate-titles");
  });

  it("fetches new releases and upserts them", async () => {
    const fakeTitles = [{ id: "movie-1", title: "Test Movie" }] as any[];
    mockFetchNewReleases.mockResolvedValueOnce(fakeTitles);
    mockUpsertTitles.mockResolvedValueOnce(1);

    enqueueJob("sync-titles");
    await processJobs();

    expect(mockFetchNewReleases).toHaveBeenCalledTimes(1);
    expect(mockFetchNewReleases).toHaveBeenCalledWith({
      daysBack: CONFIG.DEFAULT_DAYS_BACK,
    });
    expect(mockUpsertTitles).toHaveBeenCalledWith(fakeTitles);
  });

  it("calls upsertTitles with empty array when no new releases found", async () => {
    mockFetchNewReleases.mockResolvedValueOnce([]);
    mockUpsertTitles.mockResolvedValueOnce(0);

    enqueueJob("sync-titles");
    await processJobs();

    expect(mockUpsertTitles).toHaveBeenCalledWith([]);
  });

  it("handles fetchNewReleases failure gracefully (job fails)", async () => {
    const error = new Error("TMDB API timeout");
    mockFetchNewReleases.mockRejectedValueOnce(error);

    enqueueJob("sync-titles");
    await processJobs();

    expect(captureExceptionSpy).toHaveBeenCalledWith(error);
  });

  it("handles upsertTitles failure gracefully (job fails)", async () => {
    mockFetchNewReleases.mockResolvedValueOnce([{ id: "movie-1" }] as any[]);
    const error = new Error("DB write error");
    mockUpsertTitles.mockRejectedValueOnce(error);

    enqueueJob("sync-titles");
    await processJobs();

    expect(captureExceptionSpy).toHaveBeenCalledWith(error);
  });
});

// ─── sync-episodes handler ───────────────────────────────────────────────────

describe("sync-episodes handler", () => {
  const originalApiKey = CONFIG.TMDB_API_KEY;

  beforeEach(() => {
    registerSyncJobs();
    // Drain the auto-enqueued migrate-titles job to avoid interfering with assertions
    claimNextJob("migrate-titles");
  });

  afterAll(() => {
    CONFIG.TMDB_API_KEY = originalApiKey;
  });

  it("calls syncEpisodes when TMDB_API_KEY is configured", async () => {
    CONFIG.TMDB_API_KEY = "test-api-key";
    mockSyncEpisodes.mockResolvedValueOnce({ synced: 5, shows: 2 });

    enqueueJob("sync-episodes");
    await processJobs();

    expect(mockSyncEpisodes).toHaveBeenCalledTimes(1);
  });

  it("skips episode sync when TMDB_API_KEY is not set", async () => {
    CONFIG.TMDB_API_KEY = "";

    enqueueJob("sync-episodes");
    await processJobs();

    expect(mockSyncEpisodes).not.toHaveBeenCalled();
  });

  it("handles syncEpisodes failure gracefully (job fails)", async () => {
    CONFIG.TMDB_API_KEY = "test-api-key";
    const error = new Error("Episode sync failed");
    mockSyncEpisodes.mockRejectedValueOnce(error);

    enqueueJob("sync-episodes");
    await processJobs();

    expect(captureExceptionSpy).toHaveBeenCalledWith(error);
  });
});

// ─── migrate-titles handler ──────────────────────────────────────────────────

describe("migrate-titles handler", () => {
  beforeEach(() => {
    // registerSyncJobs() auto-enqueues a migrate-titles job — use that directly
    registerSyncJobs();
  });

  it("calls migrateTitles when job is processed", async () => {
    mockMigrateTitles.mockResolvedValueOnce({ updated: 3, failed: 0 });

    // The migrate-titles job was already enqueued by registerSyncJobs()
    await processJobs();

    expect(mockMigrateTitles).toHaveBeenCalledTimes(1);
  });

  it("handles migrateTitles failure gracefully (job fails)", async () => {
    const error = new Error("Migration error");
    mockMigrateTitles.mockRejectedValueOnce(error);

    await processJobs();

    expect(captureExceptionSpy).toHaveBeenCalledWith(error);
  });
});

// ─── sync-show-episodes handler ─────────────────────────────────────────────

describe("sync-show-episodes handler", () => {
  const originalApiKey = CONFIG.TMDB_API_KEY;

  beforeEach(() => {
    registerSyncJobs();
    claimNextJob("migrate-titles");
    CONFIG.TMDB_API_KEY = "test-api-key";
  });

  afterAll(() => {
    CONFIG.TMDB_API_KEY = originalApiKey;
  });

  it("restores watched episodes after syncing when watchedEpisodes and userId are in job data", async () => {
    mockSyncEpisodesForShow.mockResolvedValueOnce(10);
    mockGetEpisodeIdsBySE.mockResolvedValueOnce([1, 2, 3]);

    enqueueJob("sync-show-episodes", {
      titleId: "tv-100",
      tmdbId: "100",
      title: "Test Show",
      watchedEpisodes: [{ season: 1, episode: 1 }, { season: 1, episode: 2 }, { season: 1, episode: 3 }],
      userId: "user-abc",
    });
    await processJobs();

    expect(mockSyncEpisodesForShow).toHaveBeenCalledWith("tv-100", "100", "Test Show");
    expect(mockGetEpisodeIdsBySE).toHaveBeenCalledWith("tv-100", [
      { season: 1, episode: 1 },
      { season: 1, episode: 2 },
      { season: 1, episode: 3 },
    ]);
    expect(mockWatchEpisodesBulk).toHaveBeenCalledWith([1, 2, 3], "user-abc");
  });

  it("does not attempt watched restoration when watchedEpisodes is not in job data", async () => {
    mockSyncEpisodesForShow.mockResolvedValueOnce(5);

    enqueueJob("sync-show-episodes", {
      titleId: "tv-200",
      tmdbId: "200",
      title: "Another Show",
    });
    await processJobs();

    expect(mockSyncEpisodesForShow).toHaveBeenCalledWith("tv-200", "200", "Another Show");
    expect(mockGetEpisodeIdsBySE).not.toHaveBeenCalled();
    expect(mockWatchEpisodesBulk).not.toHaveBeenCalled();
  });

  it("does not call watchEpisodesBulk when no episode IDs are resolved", async () => {
    mockSyncEpisodesForShow.mockResolvedValueOnce(10);
    mockGetEpisodeIdsBySE.mockResolvedValueOnce([]);

    enqueueJob("sync-show-episodes", {
      titleId: "tv-300",
      tmdbId: "300",
      title: "No Match Show",
      watchedEpisodes: [{ season: 99, episode: 99 }],
      userId: "user-xyz",
    });
    await processJobs();

    expect(mockGetEpisodeIdsBySE).toHaveBeenCalled();
    expect(mockWatchEpisodesBulk).not.toHaveBeenCalled();
  });

  it("skips sync when TMDB_API_KEY is not set", async () => {
    CONFIG.TMDB_API_KEY = "";

    enqueueJob("sync-show-episodes", {
      titleId: "tv-400",
      tmdbId: "400",
      title: "Skip Show",
    });
    await processJobs();

    expect(mockSyncEpisodesForShow).not.toHaveBeenCalled();
  });
});
