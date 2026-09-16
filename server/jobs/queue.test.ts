import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  afterAll,
  setSystemTime,
} from "bun:test";
import { getRawDb } from "../db/bun-db";
import { setupTestDb, teardownTestDb } from "../test-utils/setup";
import {
  getNextCronDate,
  enqueueJob,
  claimNextJob,
  completeJob,
  failJob,
  getJobStats,
  getRecentJobs,
  registerCron,
  getCronJobs,
  cleanupOldJobs,
  recoverStaleJobs,
} from "./queue";

beforeEach(() => {
  setupTestDb();
});

afterEach(() => {
  setSystemTime();
});

afterAll(() => {
  teardownTestDb();
});

// ─── Cron Parser ────────────────────────────────────────────────────────────

describe("getNextCronDate", () => {
  it("parses simple daily cron (0 3 * * *)", () => {
    const after = new Date("2024-06-15T02:00:00Z");
    const next = getNextCronDate("0 3 * * *", after);
    expect(next.getHours()).toBe(3);
    expect(next.getMinutes()).toBe(0);
  });

  it("parses hourly cron (0 * * * *)", () => {
    const after = new Date("2024-06-15T14:30:00Z");
    const next = getNextCronDate("0 * * * *", after);
    expect(next.getMinutes()).toBe(0);
    expect(next.getHours()).toBe(15);
  });

  it("parses every-5-minutes cron (*/5 * * * *)", () => {
    const after = new Date("2024-06-15T10:03:00Z");
    const next = getNextCronDate("*/5 * * * *", after);
    expect(next.getMinutes()).toBe(5);
  });

  it("parses specific day of week (0 9 * * 1 = Monday)", () => {
    // 2024-06-15 is Saturday
    const after = new Date("2024-06-15T10:00:00Z");
    const next = getNextCronDate("0 9 * * 1", after);
    expect(next.getDay()).toBe(1); // Monday
    expect(next.getHours()).toBe(9);
  });

  it("throws for invalid cron expression", () => {
    expect(() => getNextCronDate("invalid")).toThrow("Invalid cron expression");
  });

  it("handles comma-separated values (0 9,17 * * *)", () => {
    const after = new Date("2024-06-15T10:00:00Z");
    const next = getNextCronDate("0 9,17 * * *", after);
    expect(next.getHours()).toBe(17);
    expect(next.getMinutes()).toBe(0);
  });

  it("handles range (0 9-11 * * *)", () => {
    const after = new Date("2024-06-15T08:00:00Z");
    const next = getNextCronDate("0 9-11 * * *", after);
    expect(next.getHours()).toBe(9);
  });
});

// ─── Job Queue ──────────────────────────────────────────────────────────────

describe("enqueueJob", () => {
  it("enqueues and returns job ID", () => {
    const id = enqueueJob("test-job", { key: "value" });
    expect(id).toBeGreaterThan(0);
  });
});

describe("claimNextJob", () => {
  it("claims a pending job", () => {
    enqueueJob("test-job");
    const job = claimNextJob("test-job");

    expect(job).not.toBeNull();
    expect(job!.name).toBe("test-job");
    expect(job!.status).toBe("running");
    expect(job!.attempts).toBe(1);
  });

  it("returns null when no jobs available", () => {
    expect(claimNextJob("nonexistent")).toBeNull();
  });

  it("does not claim a future job", () => {
    const future = new Date(Date.now() + 3600_000);
    enqueueJob("future-job", undefined, { runAt: future });
    expect(claimNextJob("future-job")).toBeNull();
  });
});

describe("completeJob", () => {
  it("marks job as completed", () => {
    const id = enqueueJob("test-job");
    claimNextJob("test-job");
    completeJob(id);

    const stats = getJobStats();
    expect(stats["test-job"].completed).toBe(1);
  });
});

describe("failJob", () => {
  it("re-queues job with retries remaining", () => {
    const id = enqueueJob("test-job", undefined, { maxAttempts: 3 });
    claimNextJob("test-job");
    failJob(id, "some error");

    const stats = getJobStats();
    expect(stats["test-job"].pending).toBe(1);
  });

  it("permanently fails job after max attempts", () => {
    const id = enqueueJob("test-job", undefined, { maxAttempts: 1 });
    claimNextJob("test-job");
    failJob(id, "final error");

    const stats = getJobStats();
    expect(stats["test-job"].failed).toBe(1);
  });
});

describe("getJobStats", () => {
  it("returns grouped stats", () => {
    enqueueJob("job-a");
    enqueueJob("job-a");
    enqueueJob("job-b");

    const stats = getJobStats();
    expect(stats["job-a"].pending).toBe(2);
    expect(stats["job-b"].pending).toBe(1);
  });
});

describe("getRecentJobs", () => {
  it("returns recent jobs in descending order", () => {
    enqueueJob("job-a");
    enqueueJob("job-b");
    enqueueJob("job-a");

    const recent = getRecentJobs();
    expect(recent).toHaveLength(3);
    expect(recent[0].name).toBe("job-a");
    expect(recent[0].id).toBeGreaterThan(recent[1].id);
  });

  it("respects limit parameter", () => {
    enqueueJob("job-a");
    enqueueJob("job-b");
    enqueueJob("job-c");

    const recent = getRecentJobs(2);
    expect(recent).toHaveLength(2);
  });

  it("returns empty array when no jobs exist", () => {
    const recent = getRecentJobs();
    expect(recent).toHaveLength(0);
  });
});

// ─── Cron Registration ──────────────────────────────────────────────────────

describe("cron registration", () => {
  it("registers and lists cron jobs", () => {
    registerCron("sync-titles", "0 3 * * *");
    const crons = getCronJobs();
    expect(crons).toHaveLength(1);
    expect(crons[0].name).toBe("sync-titles");
    expect(crons[0].cron).toBe("0 3 * * *");
  });

  it("updates cron on re-register", () => {
    registerCron("sync-titles", "0 3 * * *");
    registerCron("sync-titles", "0 5 * * *");

    const crons = getCronJobs();
    expect(crons).toHaveLength(1);
    expect(crons[0].cron).toBe("0 5 * * *");
  });
});

// These clocks exercise both same-day comparisons and the UTC date boundary.
describe.each(["2026-09-15T10:00:00.000Z", "2026-09-15T23:59:30.000Z"])(
  "queue timestamps at %s",
  (clock) => {
    it("waits until each exponential-backoff deadline before retrying", () => {
      setSystemTime(new Date(clock));
      const id = enqueueJob("retry");
      expect(getRecentJobs()[0].created_at).toBe(clock);
      for (const delay of [60_000, 120_000]) {
        expect(claimNextJob("retry")?.id).toBe(id);
        const failedAt = Date.now();
        failJob(id, "temporary failure");
        expect(getRecentJobs()[0].run_at).toBe(
          new Date(failedAt + delay).toISOString(),
        );
        expect(claimNextJob("retry")).toBeNull();
        setSystemTime(new Date(failedAt + delay - 1));
        expect(claimNextJob("retry")).toBeNull();
        setSystemTime(new Date(failedAt + delay));
      }
      expect(claimNextJob("retry")?.attempts).toBe(3);
      failJob(id, "final failure");
      expect(getRecentJobs()[0].completed_at).toBe(new Date().toISOString());
    });

    it("honors pending retry deadlines written in the legacy SQLite format", () => {
      const now = new Date(clock).getTime();
      setSystemTime(new Date(now));
      const id = enqueueJob("legacy-retry");
      getRawDb()
        .prepare("UPDATE jobs SET run_at = ? WHERE id = ?")
        .run(
          new Date(now + 60_000).toISOString().slice(0, 19).replace("T", " "),
          id,
        );
      expect(claimNextJob("legacy-retry")).toBeNull();
      setSystemTime(new Date(now + 60_000));
      expect(claimNextJob("legacy-retry")?.id).toBe(id);
    });

    it("recovers stale jobs but leaves jobs at the timeout boundary running", () => {
      const startedAt = new Date(clock).getTime();
      setSystemTime(new Date(startedAt));
      const staleId = enqueueJob("stale");
      claimNextJob("stale");
      setSystemTime(new Date(startedAt + 1));
      enqueueJob("fresh");
      claimNextJob("fresh");
      setSystemTime(new Date(startedAt + 30 * 60_000 + 1));
      recoverStaleJobs(30);
      expect(getJobStats().stale.pending).toBe(1);
      expect(getJobStats().fresh.running).toBe(1);
      expect(claimNextJob("stale")?.id).toBe(staleId);
    });

    it("cleans up old ISO and legacy completion times without deleting recent jobs", () => {
      const completedAt = new Date(clock).getTime();
      setSystemTime(new Date(completedAt));
      const oldId = enqueueJob("old");
      completeJob(oldId);
      expect(getRecentJobs()[0].completed_at).toBe(clock);
      const legacyId = enqueueJob("legacy");
      getRawDb()
        .prepare(
          "UPDATE jobs SET status = 'failed', completed_at = ? WHERE id = ?",
        )
        .run(clock.slice(0, 19).replace("T", " "), legacyId);
      setSystemTime(new Date(completedAt + 1));
      const recentId = enqueueJob("recent");
      completeJob(recentId);
      setSystemTime(new Date(completedAt + 86400_000 + 1));
      expect(cleanupOldJobs(1)).toBe(2);
      expect(getRecentJobs().map((job) => job.id)).toEqual([recentId]);
    });
  },
);
