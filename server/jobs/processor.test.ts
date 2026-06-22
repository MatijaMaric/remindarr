import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  afterAll,
  spyOn,
} from "bun:test";
import { setupTestDb, teardownTestDb } from "../test-utils/setup";
import { getDb, jobs } from "../db/schema";
import { eq } from "drizzle-orm";
import Sentry from "../sentry";

// ─── Mocks ───────────────────────────────────────────────────────────────────

import * as syncTitlesModule from "../tmdb/sync-titles";
const mockFetchNewReleases = spyOn(
  syncTitlesModule,
  "fetchNewReleases",
).mockResolvedValue([]);

import * as repository from "../db/repository";
const mockUpsertTitles = spyOn(repository, "upsertTitles").mockResolvedValue(0);
const mockDeleteExpiredSessions = spyOn(
  repository,
  "deleteExpiredSessions",
).mockResolvedValue();

import * as syncModule from "../tmdb/sync";
const mockSyncEpisodes = spyOn(syncModule, "syncEpisodes").mockResolvedValue({
  synced: 0,
  shows: 0,
});
const mockSyncEpisodesForShow = spyOn(
  syncModule,
  "syncEpisodesForShow",
).mockResolvedValue(0);
const mockListTrackedShows = spyOn(
  syncModule,
  "listTrackedShowsForEpisodeSync",
).mockResolvedValue([]);

// Mock enqueueAdhoc so the sync-episodes fan-out can be asserted without
// inserting real sync-show-episodes rows back into the jobs table.
import * as backendModule from "./backend";
const mockEnqueueAdhoc = spyOn(backendModule, "enqueueAdhoc").mockResolvedValue(
  undefined,
);

import * as tmdbClientModule from "../tmdb/client";
const emptyTrendingPage = {
  results: [],
  total_pages: 1,
  total_results: 0,
  page: 1,
};
const mockFetchTrendingMovies = spyOn(
  tmdbClientModule,
  "fetchTrendingMovies",
).mockResolvedValue(emptyTrendingPage as any);
const mockFetchTrendingTv = spyOn(
  tmdbClientModule,
  "fetchTrendingTv",
).mockResolvedValue(emptyTrendingPage as any);
const mockFetchTrendingPeople = spyOn(
  tmdbClientModule,
  "fetchTrendingPeople",
).mockResolvedValue(emptyTrendingPage as any);

import { CONFIG } from "../config";
import { initCache, getCache } from "../cache";
import { MemoryCache } from "../cache/memory";
import { CRON_JOBS } from "./backend";
import { trendingCacheKey } from "../routes/trending";
import { makeTmdbDiscoverMovie } from "../test-utils/fixtures";

// Trending sync writes to the distributed cache — initialize an in-memory one.
initCache(new MemoryCache(100));

import {
  processPendingJobs,
  enqueueCronJob,
  cleanupOldJobs,
  handlers,
} from "./processor";

// ─── Setup ───────────────────────────────────────────────────────────────────

const originalApiKey = CONFIG.TMDB_API_KEY;

beforeEach(() => {
  setupTestDb();
  CONFIG.TMDB_API_KEY = "test-key";
  mockFetchNewReleases.mockClear();
  mockUpsertTitles.mockClear();
  mockSyncEpisodes.mockClear();
  mockSyncEpisodesForShow.mockClear();
  mockListTrackedShows.mockClear();
  mockEnqueueAdhoc.mockClear();
  mockDeleteExpiredSessions.mockClear();
  mockFetchTrendingMovies.mockClear();
  mockFetchTrendingTv.mockClear();
  mockFetchTrendingPeople.mockClear();
  initCache(new MemoryCache(100));
});

afterAll(() => {
  teardownTestDb();
  CONFIG.TMDB_API_KEY = originalApiKey;
  mockFetchNewReleases.mockRestore();
  mockUpsertTitles.mockRestore();
  mockSyncEpisodes.mockRestore();
  mockSyncEpisodesForShow.mockRestore();
  mockListTrackedShows.mockRestore();
  mockEnqueueAdhoc.mockRestore();
  mockDeleteExpiredSessions.mockRestore();
  mockFetchTrendingMovies.mockRestore();
  mockFetchTrendingTv.mockRestore();
  mockFetchTrendingPeople.mockRestore();
});

async function insertJob(
  name: string,
  data?: Record<string, unknown>,
  status = "pending",
) {
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

  it("passes continueOnError:true to fetchNewReleases for sync-titles", async () => {
    mockFetchNewReleases.mockResolvedValueOnce([]);
    mockUpsertTitles.mockResolvedValueOnce(0);

    await insertJob("sync-titles");
    await processPendingJobs();

    expect(mockFetchNewReleases).toHaveBeenCalledWith(
      expect.objectContaining({ continueOnError: true }),
    );
  });

  it("skips sync-titles when TMDB_API_KEY is not set", async () => {
    CONFIG.TMDB_API_KEY = "";

    await insertJob("sync-titles");
    await processPendingJobs();

    expect(mockFetchNewReleases).not.toHaveBeenCalled();

    const allJobs = await getAllJobs();
    expect(allJobs[0].status).toBe("completed");
  });

  it("fans out one sync-show-episodes adhoc job per tracked show", async () => {
    mockListTrackedShows.mockResolvedValueOnce([
      { id: "tv-1", tmdb_id: "1", title: "Show One" },
      { id: "tv-2", tmdb_id: "2", title: "Show Two" },
    ]);

    await insertJob("sync-episodes");
    const count = await processPendingJobs();

    expect(count).toBe(1);
    expect(mockEnqueueAdhoc).toHaveBeenCalledTimes(2);
    expect(mockEnqueueAdhoc).toHaveBeenCalledWith("sync-show-episodes", {
      titleId: "tv-1",
      tmdbId: "1",
      title: "Show One",
    });
    expect(mockEnqueueAdhoc).toHaveBeenCalledWith("sync-show-episodes", {
      titleId: "tv-2",
      tmdbId: "2",
      title: "Show Two",
    });
    // Fan-out only — no inline per-show sync in the cron handler.
    expect(mockSyncEpisodesForShow).not.toHaveBeenCalled();
    expect(mockSyncEpisodes).not.toHaveBeenCalled();
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
    expect(mockSyncEpisodesForShow).toHaveBeenCalledWith(
      "tv-95557",
      "95557",
      "Invincible",
    );

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

  it("permanent failure log message embeds job name, id, and attempt count (#838)", async () => {
    mockFetchNewReleases.mockRejectedValueOnce(new Error("TMDB 503"));
    const captureSpy = spyOn(Sentry, "captureException");
    const consoleSpy = spyOn(console, "error");

    const db = getDb();
    await db.insert(jobs).values({
      name: "sync-titles",
      status: "pending",
      attempts: 2,
      maxAttempts: 3,
      runAt: new Date().toISOString(),
    });
    const inserted = await getAllJobs();
    const jobId = inserted[0].id;

    await processPendingJobs();

    const permanentLogs = consoleSpy.mock.calls
      .map(([line]) => (typeof line === "string" ? line : ""))
      .filter((line) => line.includes("failed permanently"));

    expect(permanentLogs.length).toBeGreaterThan(0);
    const entry = JSON.parse(permanentLogs[0]);
    expect(entry.msg).toContain("sync-titles failed permanently");
    expect(entry.msg).toContain(`id=${jobId}`);
    expect(entry.msg).toContain("attempts=3/3");
    expect(captureSpy).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        fingerprint: ["job-permanent-failure", "sync-titles"],
      }),
    );

    consoleSpy.mockRestore();
    captureSpy.mockRestore();
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
    mockListTrackedShows.mockResolvedValue([]);

    await insertJob("sync-titles");
    await insertJob("sync-episodes");

    const count = await processPendingJobs();
    expect(count).toBe(2);
    expect(mockFetchNewReleases).toHaveBeenCalledTimes(1);
    expect(mockListTrackedShows).toHaveBeenCalledTimes(1);
  });

  it("skips episode sync when TMDB_API_KEY is not set", async () => {
    CONFIG.TMDB_API_KEY = "";

    await insertJob("sync-episodes");
    const count = await processPendingJobs();

    expect(count).toBe(1); // Still completes, just skips the actual sync
    expect(mockListTrackedShows).not.toHaveBeenCalled();
    expect(mockEnqueueAdhoc).not.toHaveBeenCalled();
  });

  it("claims jobs atomically — handler runs at most once if two invocations race on the same pending job", async () => {
    let callCount = 0;
    mockFetchNewReleases.mockImplementation(async () => {
      callCount++;
      return [];
    });
    mockUpsertTitles.mockResolvedValue(0);

    await insertJob("sync-titles");

    const [c1, c2] = await Promise.all([
      processPendingJobs(),
      processPendingJobs(),
    ]);

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
    const oldDate = new Date(
      Date.now() - 31 * 24 * 60 * 60 * 1000,
    ).toISOString();
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
    const consoleErrorSpy = spyOn(console, "error").mockImplementation(
      () => {},
    );

    mockFetchNewReleases.mockRejectedValueOnce(
      new Error("TMDB timeout with stack"),
    );

    await insertJob("sync-titles");
    await processPendingJobs();

    expect(consoleErrorSpy).toHaveBeenCalled();
    const warnCalls = consoleErrorSpy.mock.calls
      .map((args) => {
        try {
          return JSON.parse(args[0] as string) as Record<string, unknown>;
        } catch {
          return null;
        }
      })
      .filter(
        (obj): obj is Record<string, unknown> =>
          obj !== null && obj.level === "warn",
      );

    const retryLog = warnCalls.find(
      (obj) => obj.msg === "Job failed, will retry",
    );
    expect(retryLog).toBeDefined();
    // stack must be a top-level string field (not nested inside err)
    expect(typeof retryLog!.stack).toBe("string");
    expect((retryLog!.stack as string).length).toBeGreaterThan(0);

    consoleErrorSpy.mockRestore();
  });

  it("logs raw err object on permanent failure so stack is preserved", async () => {
    const consoleErrorSpy = spyOn(console, "error").mockImplementation(
      () => {},
    );

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
      .map((args) => {
        try {
          return JSON.parse(args[0] as string) as Record<string, unknown>;
        } catch {
          return null;
        }
      })
      .filter(
        (obj): obj is Record<string, unknown> =>
          obj !== null && obj.level === "error",
      );

    const permanentLog = errorCalls.find(
      (obj) =>
        typeof obj.msg === "string" && obj.msg.includes("failed permanently"),
    );
    expect(permanentLog).toBeDefined();
    // stack must be a top-level string field (not nested inside err)
    expect(typeof permanentLog!.stack).toBe("string");
    expect((permanentLog!.stack as string).length).toBeGreaterThan(0);

    consoleErrorSpy.mockRestore();
  });
});

describe("processor Sentry capture on permanent failure", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let captureExceptionSpy: ReturnType<
    typeof spyOn<typeof Sentry, "captureException">
  >;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let addBreadcrumbSpy: ReturnType<
    typeof spyOn<typeof Sentry, "addBreadcrumb">
  >;

  beforeEach(() => {
    captureExceptionSpy = spyOn(Sentry, "captureException").mockReturnValue(
      "test-event-id" as any,
    );
    captureExceptionSpy.mockClear();
    addBreadcrumbSpy = spyOn(Sentry, "addBreadcrumb").mockImplementation(
      () => {},
    );
    addBreadcrumbSpy.mockClear();
  });

  afterEach(() => {
    captureExceptionSpy.mockRestore();
    addBreadcrumbSpy.mockRestore();
  });

  it("captures permanent failures to Sentry with stable fingerprint and tags", async () => {
    mockFetchNewReleases.mockRejectedValueOnce(
      new Error("permanent sync error"),
    );
    const db = getDb();
    await db.insert(jobs).values({
      name: "sync-titles",
      status: "pending",
      attempts: 2,
      maxAttempts: 3,
      runAt: new Date().toISOString(),
    });

    await processPendingJobs();

    expect(captureExceptionSpy).toHaveBeenCalledTimes(1);
    const capturedErr = captureExceptionSpy.mock.calls[0]?.[0];
    const capturedCtx = captureExceptionSpy.mock.calls[0]?.[1];
    expect(capturedErr).toBeInstanceOf(Error);
    expect((capturedErr as Error).message).toBe("permanent sync error");
    expect(capturedCtx).toMatchObject({
      level: "error",
      tags: { jobName: "sync-titles", jobId: expect.any(String) },
      extra: { attempts: 3, maxAttempts: 3, lastError: "permanent sync error" },
      fingerprint: ["job-permanent-failure", "sync-titles"],
    });
  });

  it("does NOT capture transient retry failures to Sentry", async () => {
    mockFetchNewReleases.mockRejectedValueOnce(new Error("transient error"));
    await insertJob("sync-titles"); // attempts=0, maxAttempts=3 → retry, not permanent
    await processPendingJobs();

    expect(captureExceptionSpy).not.toHaveBeenCalled();
  });

  it("adds a breadcrumb on retry without calling captureException", async () => {
    mockFetchNewReleases.mockRejectedValueOnce(
      new Error("transient for breadcrumb"),
    );
    await insertJob("sync-titles"); // attempts=0, maxAttempts=3
    await processPendingJobs();

    expect(captureExceptionSpy).not.toHaveBeenCalled();
    const retryBreadcrumb = addBreadcrumbSpy.mock.calls.find(
      (args) =>
        (args[0] as { message?: string }).message === "Job retry scheduled",
    );
    expect(retryBreadcrumb).toBeDefined();
    const bc = retryBreadcrumb![0] as {
      data?: { name?: string; attempt?: string };
    };
    expect(bc.data?.name).toBe("sync-titles");
    expect(bc.data?.attempt).toBe("1");
  });

  it("surfaces job payload and runAt in permanent failure Sentry extra and log", async () => {
    const consoleErrorSpy = spyOn(console, "error").mockImplementation(
      () => {},
    );
    consoleErrorSpy.mockClear(); // discard calls leaked from prior test files (Bun cross-file spy leak on Linux CI)
    mockFetchNewReleases.mockRejectedValueOnce(
      new Error("payload test failure"),
    );
    const db = getDb();
    await db.insert(jobs).values({
      name: "sync-titles",
      status: "pending",
      attempts: 2,
      maxAttempts: 3,
      runAt: new Date().toISOString(),
      data: JSON.stringify({ marker: "p801" }),
    });

    await processPendingJobs();

    // Sentry extra has data and runAt
    expect(captureExceptionSpy).toHaveBeenCalledTimes(1);
    const capturedCtx = captureExceptionSpy.mock.calls[0]?.[1] as {
      extra?: Record<string, unknown>;
    };
    expect(capturedCtx?.extra?.data).toBe('{"marker":"p801"}');
    expect(typeof capturedCtx?.extra?.runAt).toBe("string");

    // JSON log line has data and runAt
    const errorCalls = consoleErrorSpy.mock.calls
      .map((args) => {
        try {
          return JSON.parse(args[0] as string) as Record<string, unknown>;
        } catch {
          return null;
        }
      })
      .filter(
        (obj): obj is Record<string, unknown> =>
          obj !== null && obj.level === "error",
      );
    const permanentLog = errorCalls.find(
      (obj) =>
        typeof obj.msg === "string" && obj.msg.includes("failed permanently"),
    );
    expect(permanentLog).toBeDefined();
    expect(permanentLog!.data).toBe('{"marker":"p801"}');
    expect(typeof permanentLog!.runAt).toBe("string");

    consoleErrorSpy.mockRestore();
  });
});

// ─── CF handler parity ───────────────────────────────────────────────────────
// The CF runtime dispatches every job through the `handlers` record (D1 mode via
// processPendingJobs, DO mode via durable-object runJob). A cron in CRON_JOBS
// with no handler here fails with "Unknown job type" on every tick — this guard
// catches that class of dual-runtime parity gap.

describe("CF handler parity", () => {
  it("every cron job in CRON_JOBS has a CF processor handler", () => {
    for (const { name } of CRON_JOBS) {
      expect(handlers[name]).toBeDefined();
    }
  });

  it("includes a sync-trending handler", () => {
    expect(handlers["sync-trending"]).toBeDefined();
  });
});

// ─── sync-trending (CF path) ─────────────────────────────────────────────────

describe("sync-trending handler (CF path)", () => {
  it("builds the snapshot and writes the cache via processPendingJobs", async () => {
    mockFetchTrendingMovies.mockResolvedValueOnce({
      results: [makeTmdbDiscoverMovie({ id: 1 })],
      total_pages: 1,
      total_results: 1,
      page: 1,
    } as any);

    await insertJob("sync-trending");
    await processPendingJobs();

    expect(mockFetchTrendingMovies).toHaveBeenCalledTimes(1);
    const cached = (await getCache().get(trendingCacheKey("week"))) as any;
    expect(cached).not.toBeNull();
    expect(cached.movies).toHaveLength(1);
    expect(cached.movies[0].id).toBe("movie-1");
  });

  it("skips and writes nothing when TMDB_API_KEY is unset", async () => {
    CONFIG.TMDB_API_KEY = "";
    await insertJob("sync-trending");
    await processPendingJobs();

    expect(mockFetchTrendingMovies).not.toHaveBeenCalled();
    expect(await getCache().get(trendingCacheKey("week"))).toBeNull();
    CONFIG.TMDB_API_KEY = "test-key";
  });
});
