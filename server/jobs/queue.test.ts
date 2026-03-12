import { describe, it, expect, beforeEach, afterAll } from "bun:test";
import { setupTestDb, teardownTestDb } from "../test-utils/setup";
import {
  getNextCronDate,
  enqueueJob,
  claimNextJob,
  completeJob,
  failJob,
  getJobStats,
  registerCron,
  getCronJobs,
} from "./queue";

beforeEach(() => {
  setupTestDb();
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
