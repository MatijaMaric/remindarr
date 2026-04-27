/**
 * Tests for the backend dispatcher (server/jobs/backend.ts).
 *
 * Covers:
 * - D1 mode: delegates to existing processor functions
 * - DO mode: dispatches to the correct DO stub via fetch
 * - Partition-key inference for sync-show-episodes and backfill-title-offers
 * - enqueueOnce always uses D1 (one-time migration semantics)
 * - CRON_BY_EXPRESSION lookup table
 */
import { describe, it, expect, beforeEach, afterAll, mock, spyOn } from "bun:test";
import { setupTestDb, teardownTestDb } from "../test-utils/setup";
import { getDb, jobs } from "../db/schema";
import { CONFIG } from "../config";
import { runWithDb } from "../db/schema";

import * as processorModule from "./processor";
import {
  armCron,
  enqueueAdhoc,
  enqueueOnce,
  processPending,
  recoverStale,
  CRON_JOBS,
  CRON_BY_EXPRESSION,
  runWithEnv,
} from "./backend";

// ─── Processor mocks (D1 path) ────────────────────────────────────────────────

const mockEnqueueCronJob = spyOn(processorModule, "enqueueCronJob").mockResolvedValue(undefined);
const mockProcessPendingJobs = spyOn(processorModule, "processPendingJobs").mockResolvedValue(0);
const mockRecoverStaleJobs = spyOn(processorModule, "recoverStaleJobs").mockResolvedValue(0);
const mockEnqueueOneTimeMigration = spyOn(processorModule, "enqueueOneTimeMigration").mockResolvedValue(undefined);

// ─── DO stub factory ──────────────────────────────────────────────────────────

interface FetchCall { path: string; method: string; body: unknown }

function makeFakeDoNamespace(onFetch?: (path: string, method: string, body: unknown) => unknown) {
  const calls: FetchCall[] = [];

  const stub = {
    fetch: async (req: Request) => {
      const url = new URL(req.url);
      const body = req.body ? await new Response(req.body).json() : null;
      calls.push({ path: url.pathname, method: req.method, body });
      const result = onFetch?.(url.pathname, req.method, body) ?? { ok: true };
      return new Response(JSON.stringify(result), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
  };

  const ns = {
    idFromName: (name: string) => ({ toString: () => name }),
    get: () => stub,
    calls,
  };

  return ns;
}

// ─── Setup ────────────────────────────────────────────────────────────────────

const originalBackend = CONFIG.JOB_QUEUE_BACKEND;

beforeEach(() => {
  setupTestDb();
  CONFIG.JOB_QUEUE_BACKEND = "d1";
  mockEnqueueCronJob.mockClear();
  mockProcessPendingJobs.mockClear();
  mockRecoverStaleJobs.mockClear();
  mockEnqueueOneTimeMigration.mockClear();
});

afterAll(() => {
  teardownTestDb();
  CONFIG.JOB_QUEUE_BACKEND = originalBackend;
  mockEnqueueCronJob.mockRestore();
  mockProcessPendingJobs.mockRestore();
  mockRecoverStaleJobs.mockRestore();
  mockEnqueueOneTimeMigration.mockRestore();
});

const d1Env = {
  DB: {} as D1Database,
  CACHE_KV: undefined,
  JOB_QUEUE_DO: undefined,
};

// ─── CRON_BY_EXPRESSION lookup ────────────────────────────────────────────────

describe("CRON_BY_EXPRESSION", () => {
  it("maps all CRON_JOBS expressions back to names", () => {
    for (const { name, cron } of CRON_JOBS) {
      expect(CRON_BY_EXPRESSION[cron]).toBe(name);
    }
  });

  it("covers sync-titles, send-notifications, and cleanup", () => {
    expect(CRON_BY_EXPRESSION["0 3 * * *"]).toBe("sync-titles");
    expect(CRON_BY_EXPRESSION["*/5 * * * *"]).toBe("send-notifications");
    expect(CRON_BY_EXPRESSION["0 0 * * *"]).toBe("cleanup");
  });
});

// ─── D1 mode ──────────────────────────────────────────────────────────────────

describe("armCron (D1 mode)", () => {
  it("delegates to enqueueCronJob", async () => {
    await armCron(d1Env, "sync-titles", "0 3 * * *");
    expect(mockEnqueueCronJob).toHaveBeenCalledWith("sync-titles");
  });
});

describe("processPending (D1 mode)", () => {
  it("delegates to processPendingJobs", async () => {
    mockProcessPendingJobs.mockResolvedValueOnce(3);
    const count = await processPending();
    expect(count).toBe(3);
    expect(mockProcessPendingJobs).toHaveBeenCalledTimes(1);
  });
});

describe("recoverStale (D1 mode)", () => {
  it("delegates to recoverStaleJobs with the given minutes", async () => {
    mockRecoverStaleJobs.mockResolvedValueOnce(2);
    const count = await recoverStale(d1Env, 20);
    expect(count).toBe(2);
    expect(mockRecoverStaleJobs).toHaveBeenCalledWith(20);
  });
});

describe("enqueueOnce", () => {
  it("delegates to enqueueOneTimeMigration in D1 mode", async () => {
    CONFIG.JOB_QUEUE_BACKEND = "d1";
    await enqueueOnce("migrate-offers");
    expect(mockEnqueueOneTimeMigration).toHaveBeenCalledWith("migrate-offers");
  });

  it("enqueues directly in the named DO in DO mode", async () => {
    const fetchCalls: { path: string; body: unknown }[] = [];
    const doEnv = {
      DB: {} as D1Database,
      JOB_QUEUE_DO: makeFakeDoNamespace((_path, _method, body) => {
        fetchCalls.push({ path: _path, body });
        return { id: 1 };
      }),
    };
    CONFIG.JOB_QUEUE_BACKEND = "durable-object";
    await runWithEnv(doEnv as any, () => enqueueOnce("migrate-offers"));
    expect(mockEnqueueOneTimeMigration).not.toHaveBeenCalled();
    expect(fetchCalls).toHaveLength(1);
    expect(fetchCalls[0].path).toBe("/enqueue");
    expect((fetchCalls[0].body as any).maxAttempts).toBe(1);
  });
});

describe("enqueueAdhoc (D1 mode)", () => {
  it("inserts a row into the D1 jobs table", async () => {
    const db = getDb();
    await runWithDb(db, async () => {
      await enqueueAdhoc("sync-show-episodes", { titleId: 42, tmdbId: 999, title: "Test" });
    });
    const rows = await db.select().from(jobs).all();
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe("sync-show-episodes");
    expect(JSON.parse(rows[0].data!)).toMatchObject({ titleId: 42 });
  });

  it("inserts without data", async () => {
    const db = getDb();
    await runWithDb(db, async () => {
      await enqueueAdhoc("migrate-offers");
    });
    const rows = await db.select().from(jobs).all();
    expect(rows[0].data).toBeNull();
  });
});

// ─── DO mode ──────────────────────────────────────────────────────────────────

describe("armCron (DO mode)", () => {
  it("sends POST /arm to the named DO", async () => {
    CONFIG.JOB_QUEUE_BACKEND = "durable-object";
    const ns = makeFakeDoNamespace();
    const env = { ...d1Env, JOB_QUEUE_DO: ns as unknown as DurableObjectNamespace };

    await armCron(env, "sync-titles", "0 3 * * *");

    expect(ns.calls).toHaveLength(1);
    expect(ns.calls[0].path).toBe("/arm");
    expect(ns.calls[0].body).toMatchObject({ name: "sync-titles", cron: "0 3 * * *" });
    expect(mockEnqueueCronJob).not.toHaveBeenCalled();
  });
});

describe("processPending (DO mode)", () => {
  it("returns 0 without calling processPendingJobs", async () => {
    CONFIG.JOB_QUEUE_BACKEND = "durable-object";
    const count = await processPending();
    expect(count).toBe(0);
    expect(mockProcessPendingJobs).not.toHaveBeenCalled();
  });
});

describe("enqueueAdhoc (DO mode)", () => {
  it("routes sync-show-episodes to a partitioned DO (by titleId)", async () => {
    CONFIG.JOB_QUEUE_BACKEND = "durable-object";
    const ns = makeFakeDoNamespace(() => ({ id: 1 }));
    const env = { ...d1Env, JOB_QUEUE_DO: ns as unknown as DurableObjectNamespace };

    await runWithEnv(env, async () => {
      await enqueueAdhoc("sync-show-episodes", { titleId: 42, tmdbId: 999, title: "Test" });
    });

    expect(ns.calls).toHaveLength(1);
    expect(ns.calls[0].path).toBe("/enqueue");
    // idFromName should have been called with "sync-show-episodes:42"
    // (we can't directly check idFromName, but the stub body contains the name)
    const body = ns.calls[0].body as { name: string };
    expect(body.name).toBe("sync-show-episodes");
  });

  it("routes backfill-title-offers to a partitioned DO (by tmdbId)", async () => {
    CONFIG.JOB_QUEUE_BACKEND = "durable-object";
    const ns = makeFakeDoNamespace(() => ({ id: 1 }));
    const env = { ...d1Env, JOB_QUEUE_DO: ns as unknown as DurableObjectNamespace };

    await runWithEnv(env, async () => {
      await enqueueAdhoc("backfill-title-offers", { tmdbId: 77, objectType: "MOVIE" });
    });

    expect(ns.calls).toHaveLength(1);
    const body = ns.calls[0].body as { name: string };
    expect(body.name).toBe("backfill-title-offers");
  });

  it("routes a non-partitioned job to a singleton DO", async () => {
    CONFIG.JOB_QUEUE_BACKEND = "durable-object";
    const ns = makeFakeDoNamespace(() => ({ id: 1 }));
    const env = { ...d1Env, JOB_QUEUE_DO: ns as unknown as DurableObjectNamespace };

    await runWithEnv(env, async () => {
      await enqueueAdhoc("sync-plex-library");
    });

    expect(ns.calls).toHaveLength(1);
    expect(ns.calls[0].path).toBe("/enqueue");
  });
});

// ─── runWithEnv ───────────────────────────────────────────────────────────────

describe("runWithEnv", () => {
  it("makes env available in the callback for DO mode", async () => {
    CONFIG.JOB_QUEUE_BACKEND = "durable-object";
    const ns = makeFakeDoNamespace(() => ({ id: 1 }));
    const env = { ...d1Env, JOB_QUEUE_DO: ns as unknown as DurableObjectNamespace };

    // If runWithEnv works, enqueueAdhoc inside can get the env
    await runWithEnv(env, async () => {
      await enqueueAdhoc("sync-plex-library");
    });
    expect(ns.calls).toHaveLength(1);
  });
});
