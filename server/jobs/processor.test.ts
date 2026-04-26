import { describe, it, expect, beforeEach, afterAll, spyOn } from "bun:test";
import { setupTestDb, teardownTestDb } from "../test-utils/setup";
import { getDb, jobs } from "../db/schema";
import { eq } from "drizzle-orm";

// ─── Mocks ───────────────────────────────────────────────────────────────────

import * as syncTitlesModule from "../tmdb/sync-titles";
const mockFetchNewReleases = spyOn(syncTitlesModule, "fetchNewReleases").mockResolvedValue([]);

import * as repository from "../db/repository";
const mockUpsertTitles = spyOn(repository, "upsertTitles").mockResolvedValue(0);
const mockDeleteExpiredSessions = spyOn(repository, "deleteExpiredSessions").mockResolvedValue();

import * as syncModule from "../tmdb/sync";
const mockSyncEpisodes = spyOn(syncModule, "syncEpisodes").mockResolvedValue({ synced: 0, shows: 0 });
const mockSyncEpisodesForShow = spyOn(syncModule, "syncEpisodesForShow").mockResolvedValue(0);

import { CONFIG } from "../config";

import { processPendingJobs, enqueueCronJob, cleanupOldJobs } from "./processor";

// ─── Setup ───────────────────────────────────────────────────────────────────

const originalApiKey = CONFIG.TMDB_API_KEY;

beforeEach(() => {
  setupTestDb();
  CONFIG.TMDB_API_KEY = "test-key";
  mockFetchNewReleases.mockClear();
  mockUpsertTitles.mockClear();
  mockSyncEpisodes.mockClear();
  mockSyncEpisodesForShow.mockClear();
  mockDeleteExpiredSessions.mockClear();
});

afterAll(() => {
  teardownTestDb();
  CONFIG.TMDB_API_KEY = originalApiKey;
  mockFetchNewReleases.mockRestore();
  mockUpsertTitles.mockRestore();
  mockSyncEpisodes.mockRestore();
  mockSyncEpisodesForShow.mockRestore();
  mockDeleteExpiredSessions.mockRestore();
});

async function insertJob(name: string, data?: Record<string, unknown>, status = "pending") {
  const db = getDb();
  await db.insert(jobs).values({
    name,
    data: data ? JSON.stringify(data) : null,
    status,
    runAt: new Date().toISOString(),
  });
}

async function getJobById(id: number) {
  const db = getDb();
  return db.select().from(jobs).where(eq(jobs.id, id)).get();
}

async function getAllJobs() {
  const db = getDb();
  return db.select().from(jobs).all();
}

// ─── processPendingJobs ──────────────────────────────────────────────────────

describe("processPendingJobs", () => {
  it("returns 0 when no pending jobs exist", async () => {
    const count = await processPendingJobs();
    expect(count).toBe(0);
  });

  it("processes sync-titles job", async () => {
    mockFetchNewReleases.mockResolvedValueOnce([{ id: "movie-1" }] as any[]);
    mockUpsertTitles.mockResolvedValueOnce(1);

    await insertJob("sync-titles");
    const count = await processPendingJobs();

    expect(count).toBe(1);
    expect(mockFetchNewReleases).toHaveBeenCalledTimes(1);
    expect(mockUpsertTitles).toHaveBeenCalledTimes(1);

    const allJobs = await getAllJobs();
    expect(allJobs[0].status).toBe("completed");
  });

  it("processes sync-episodes job", async () => {
    mockSyncEpisodes.mockResolvedValueOnce({ synced: 10, shows: 3 });

    await insertJob("sync-episodes");
    const count = await processPendingJobs();

    expect(count).toBe(1);
    expect(mockSyncEpisodes).toHaveBeenCalledTimes(1);
  });

  it("processes sync-show-episodes job with data", async () => {
    mockSyncEpisodesForShow.mockResolvedValueOnce(8);

    await insertJob("sync-show-episodes", {
      titleId: "tv-95557",
      tmdbId: "95557",
      title: "Invincible",
    });
    const count = await processPendingJobs();

    expect(count).toBe(1);
    expect(mockSyncEpisodesForShow).toHaveBeenCalledWith("tv-95557", "95557", "Invincible");

    const allJobs = await getAllJobs();
    expect(allJobs[0].status).toBe("completed");
  });

  it("fails sync-show-episodes job when data is missing", async () => {
    await insertJob("sync-show-episodes", { titleId: "tv-123" });
    const count = await processPendingJobs();

    expect(count).toBe(0);
    const allJobs = await getAllJobs();
    // Should be re-queued for retry (attempts < maxAttempts)
    expect(allJobs[0].status).toBe("pending");
    expect(allJobs[0].error).toContain("missing required data fields");
  });

  it("skips jobs not yet ready to run", async () => {
    const db = getDb();
    await db.insert(jobs).values({
      name: "sync-titles",
      status: "pending",
      runAt: new Date(Date.now() + 60_000).toISOString(), // 1 minute in future
    });

    const count = await processPendingJobs();
    expect(count).toBe(0);
    expect(mockFetchNewReleases).not.toHaveBeenCalled();
  });

  it("skips already completed jobs", async () => {
    await insertJob("sync-titles", undefined, "completed");
    const count = await processPendingJobs();

    expect(count).toBe(0);
    expect(mockFetchNewReleases).not.toHaveBeenCalled();
  });

  it("retries failed jobs with exponential backoff", async () => {
    mockFetchNewReleases.mockRejectedValueOnce(new Error("TMDB timeout"));

    await insertJob("sync-titles");
    await processPendingJobs();

    const allJobs = await getAllJobs();
    expect(allJobs[0].status).toBe("pending"); // Re-queued for retry
    expect(allJobs[0].error).toBe("TMDB timeout");
    expect(allJobs[0].attempts).toBe(1);
    // run_at should be in the future (backoff)
    expect(new Date(allJobs[0].runAt).getTime()).toBeGreaterThan(Date.now());
  });

  it("marks job as permanently failed after max attempts", async () => {
    mockFetchNewReleases.mockRejectedValueOnce(new Error("TMDB timeout"));

    const db = getDb();
    await db.insert(jobs).values({
      name: "sync-titles",
      status: "pending",
      attempts: 2, // Already tried twice
      maxAttempts: 3,
      runAt: new Date().toISOString(),
    });

    await processPendingJobs();

    const allJobs = await getAllJobs();
    expect(allJobs[0].status).toBe("failed");
    expect(allJobs[0].completedAt).not.toBeNull();
  });

  it("marks unknown job types as failed", async () => {
    await insertJob("unknown-job-type");
    await processPendingJobs();

    const allJobs = await getAllJobs();
    expect(allJobs[0].status).toBe("failed");
    expect(allJobs[0].error).toContain("Unknown job type");
  });

  it("processes multiple jobs in order", async () => {
    mockFetchNewReleases.mockResolvedValue([]);
    mockUpsertTitles.mockResolvedValue(0);
    mockSyncEpisodes.mockResolvedValue({ synced: 0, shows: 0 });

    await insertJob("sync-titles");
    await insertJob("sync-episodes");

    const count = await processPendingJobs();
    expect(count).toBe(2);
    expect(mockFetchNewReleases).toHaveBeenCalledTimes(1);
    expect(mockSyncEpisodes).toHaveBeenCalledTimes(1);
  });

  it("skips episode sync when TMDB_API_KEY is not set", async () => {
    CONFIG.TMDB_API_KEY = "";

    await insertJob("sync-episodes");
    const count = await processPendingJobs();

    expect(count).toBe(1); // Still completes, just skips the actual sync
    expect(mockSyncEpisodes).not.toHaveBeenCalled();
  });

  it("claims jobs atomically — handler runs at most once if two invocations race on the same pending job", async () => {
    let callCount = 0;
    mockFetchNewReleases.mockImplementation(async () => {
      callCount++;
      return [];
    });
    mockUpsertTitles.mockResolvedValue(0);

    await insertJob("sync-titles");

    const [c1, c2] = await Promise.all([processPendingJobs(), processPendingJobs()]);

    expect(callCount).toBe(1);
    expect(c1 + c2).toBe(1);
  });
});

// ─── enqueueCronJob ──────────────────────────────────────────────────────────

describe("enqueueCronJob", () => {
  it("enqueues a job when none is pending", async () => {
    await enqueueCronJob("sync-titles");

    const allJobs = await getAllJobs();
    expect(allJobs.length).toBe(1);
    expect(allJobs[0].name).toBe("sync-titles");
    expect(allJobs[0].status).toBe("pending");
  });

  it("does not enqueue duplicate when job is already pending", async () => {
    await insertJob("sync-titles");
    await enqueueCronJob("sync-titles");

    const allJobs = await getAllJobs();
    expect(allJobs.length).toBe(1);
  });

  it("does not enqueue duplicate when job is running", async () => {
    await insertJob("sync-titles", undefined, "running");
    await enqueueCronJob("sync-titles");

    const allJobs = await getAllJobs();
    expect(allJobs.length).toBe(1);
  });

  it("enqueues when previous job is completed", async () => {
    await insertJob("sync-titles", undefined, "completed");
    await enqueueCronJob("sync-titles");

    const allJobs = await getAllJobs();
    expect(allJobs.length).toBe(2);
  });
});

// ─── cleanupOldJobs ──────────────────────────────────────────────────────────

describe("cleanupOldJobs", () => {
  it("removes old completed jobs", async () => {
    const db = getDb();
    const oldDate = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString();
    await db.insert(jobs).values({
      name: "sync-titles",
      status: "completed",
      completedAt: oldDate,
      runAt: oldDate,
    });

    await cleanupOldJobs(30);

    const allJobs = await getAllJobs();
    expect(allJobs.length).toBe(0);
  });

  it("keeps recent completed jobs", async () => {
    const db = getDb();
    const recentDate = new Date().toISOString();
    await db.insert(jobs).values({
      name: "sync-titles",
      status: "completed",
      completedAt: recentDate,
      runAt: recentDate,
    });

    await cleanupOldJobs(30);

    const allJobs = await getAllJobs();
    expect(allJobs.length).toBe(1);
  });
});

describe("processor error logging includes stack traces", () => {
  it("logs raw err object on retry so stack is preserved", async () => {
    // Spy on console.error — the logger routes error/warn there as JSON
    const consoleErrorSpy = spyOn(console, "error").mockImplementation(() => {});

    mockFetchNewReleases.mockRejectedValueOnce(new Error("TMDB timeout with stack"));

    await insertJob("sync-titles");
    await processPendingJobs();

    expect(consoleErrorSpy).toHaveBeenCalled();
    const warnCalls = consoleErrorSpy.mock.calls
      .map((args) => { try { return JSON.parse(args[0] as string) as Record<string, unknown>; } catch { return null; } })
      .filter((obj): obj is Record<string, unknown> => obj !== null && obj.level === "warn");

    const retryLog = warnCalls.find((obj) => obj.msg === "Job failed, will retry");
    expect(retryLog).toBeDefined();
    // err must be the serialized Error object, not a plain string
    const errObj = retryLog!.err as Record<string, unknown>;
    expect(typeof errObj.stack).toBe("string");
    expect((errObj.stack as string).length).toBeGreaterThan(0);

    consoleErrorSpy.mockRestore();
  });

  it("logs raw err object on permanent failure so stack is preserved", async () => {
    const consoleErrorSpy = spyOn(console, "error").mockImplementation(() => {});

    mockFetchNewReleases.mockRejectedValueOnce(new Error("Permanent failure"));

    const db = getDb();
    await db.insert(jobs).values({
      name: "sync-titles",
      status: "pending",
      attempts: 2, // Already at max-1
      maxAttempts: 3,
      runAt: new Date().toISOString(),
    });

    await processPendingJobs();

    const errorCalls = consoleErrorSpy.mock.calls
      .map((args) => { try { return JSON.parse(args[0] as string) as Record<string, unknown>; } catch { return null; } })
      .filter((obj): obj is Record<string, unknown> => obj !== null && obj.level === "error");

    const permanentLog = errorCalls.find((obj) => obj.msg === "Job failed permanently");
    expect(permanentLog).toBeDefined();
    const errObj = permanentLog!.err as Record<string, unknown>;
    expect(typeof errObj.stack).toBe("string");
    expect((errObj.stack as string).length).toBeGreaterThan(0);

    consoleErrorSpy.mockRestore();
  });
});
