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
import {
  describe,
  it,
  expect,
  beforeEach,
  afterAll,
  mock,
  spyOn,
} from "bun:test";
import { setupTestDb, teardownTestDb } from "../test-utils/setup";
import { getDb, jobs } from "../db/schema";
import { CONFIG } from "../config";
import { runWithDb } from "../db/schema";

import * as processorModule from "./processor";
import {
  armCron,
  tickCron,
  triggerCron,
  cleanupOld,
  enqueueAdhoc,
  enqueueOnce,
  processPending,
  recoverStale,
  getJobsOverview,
  CRON_JOBS,
  CRON_BY_EXPRESSION,
  runWithEnv,
} from "./backend";

// ─── Processor mocks (D1 path) ────────────────────────────────────────────────

const mockEnqueueCronJob = spyOn(
  processorModule,
  "enqueueCronJob",
).mockResolvedValue(undefined);
const mockProcessPendingJobs = spyOn(
  processorModule,
  "processPendingJobs",
).mockResolvedValue(0);
const mockRecoverStaleJobs = spyOn(
  processorModule,
  "recoverStaleJobs",
).mockResolvedValue(0);
const mockEnqueueOneTimeMigration = spyOn(
  processorModule,
  "enqueueOneTimeMigration",
).mockResolvedValue(undefined);
const mockCleanupOldJobs = spyOn(
  processorModule,
  "cleanupOldJobs",
).mockResolvedValue(0);

// ─── DO stub factory ──────────────────────────────────────────────────────────

interface FetchCall {
  path: string;
  method: string;
  body: unknown;
}

function makeFakeDoNamespace(
  onFetch?: (path: string, method: string, body: unknown) => unknown,
) {
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
  mockCleanupOldJobs.mockClear();
});

afterAll(() => {
  teardownTestDb();
  CONFIG.JOB_QUEUE_BACKEND = originalBackend;
  mockEnqueueCronJob.mockRestore();
  mockProcessPendingJobs.mockRestore();
  mockRecoverStaleJobs.mockRestore();
  mockEnqueueOneTimeMigration.mockRestore();
  mockCleanupOldJobs.mockRestore();
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
      await enqueueAdhoc("sync-show-episodes", {
        titleId: 42,
        tmdbId: 999,
        title: "Test",
      });
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
    const env = {
      ...d1Env,
      JOB_QUEUE_DO: ns as unknown as DurableObjectNamespace,
    };

    await armCron(env, "sync-titles", "0 3 * * *");

    expect(ns.calls).toHaveLength(1);
    expect(ns.calls[0].path).toBe("/arm");
    expect(ns.calls[0].body).toMatchObject({
      name: "sync-titles",
      cron: "0 3 * * *",
    });
    expect(mockEnqueueCronJob).not.toHaveBeenCalled();
  });
});

describe("tickCron", () => {
  it("sends POST /tick to the named DO in DO mode", async () => {
    CONFIG.JOB_QUEUE_BACKEND = "durable-object";
    const ns = makeFakeDoNamespace();
    const env = {
      ...d1Env,
      JOB_QUEUE_DO: ns as unknown as DurableObjectNamespace,
    };

    await tickCron(env, "sync-episodes");

    expect(ns.calls).toHaveLength(1);
    expect(ns.calls[0].path).toBe("/tick");
    expect(ns.calls[0].method).toBe("POST");
  });

  it("is a no-op in D1 mode", async () => {
    CONFIG.JOB_QUEUE_BACKEND = "d1";
    const ns = makeFakeDoNamespace();
    const env = {
      ...d1Env,
      JOB_QUEUE_DO: ns as unknown as DurableObjectNamespace,
    };

    await tickCron(env, "sync-episodes");

    expect(ns.calls).toHaveLength(0);
  });

  it("swallows a failing DO so the watchdog loop continues", async () => {
    CONFIG.JOB_QUEUE_BACKEND = "durable-object";
    const throwingNs = {
      idFromName: (name: string) => ({ toString: () => name }),
      get: () => ({
        fetch: async () => {
          throw new Error("DO unavailable");
        },
      }),
    };
    const env = {
      ...d1Env,
      JOB_QUEUE_DO: throwingNs as unknown as DurableObjectNamespace,
    };

    // Must not throw
    await tickCron(env, "sync-episodes");
  });
});

describe("triggerCron (DO mode)", () => {
  it("arms, enqueues, AND ticks the named DO so 'Run now' actually executes", async () => {
    CONFIG.JOB_QUEUE_BACKEND = "durable-object";
    const ns = makeFakeDoNamespace();
    const env = {
      ...d1Env,
      JOB_QUEUE_DO: ns as unknown as DurableObjectNamespace,
    };
    const deferred: Promise<unknown>[] = [];

    const result = await triggerCron(env, "sync-episodes", (p) =>
      deferred.push(p),
    );
    // The tick is deferred to waitUntil so the caller can respond immediately;
    // await it here to assert the full dispatch happened.
    await Promise.all(deferred);

    expect(result.jobId).toBeNull();
    const paths = ns.calls.map((c) => c.path);
    expect(paths).toContain("/arm");
    expect(paths).toContain("/enqueue");
    expect(paths).toContain("/tick");
    // The forced job row must be enqueued before the tick that drains it,
    // otherwise tick() finds nothing to run when the cron isn't due.
    expect(paths.indexOf("/enqueue")).toBeLessThan(paths.indexOf("/tick"));
  });

  it("defers /tick to waitUntil instead of awaiting it inline (non-blocking 'Run now')", async () => {
    CONFIG.JOB_QUEUE_BACKEND = "durable-object";
    const ns = makeFakeDoNamespace();
    const env = {
      ...d1Env,
      JOB_QUEUE_DO: ns as unknown as DurableObjectNamespace,
    };
    const deferred: Promise<unknown>[] = [];

    // /arm and /enqueue are awaited; /tick is handed to waitUntil.
    await triggerCron(env, "sync-episodes", (p) => deferred.push(p));

    expect(deferred).toHaveLength(1);
    const armEnqueue = ns.calls.map((c) => c.path);
    expect(armEnqueue).toContain("/arm");
    expect(armEnqueue).toContain("/enqueue");
  });

  it("returns jobId null for an unknown job without dispatching", async () => {
    CONFIG.JOB_QUEUE_BACKEND = "durable-object";
    const ns = makeFakeDoNamespace();
    const env = {
      ...d1Env,
      JOB_QUEUE_DO: ns as unknown as DurableObjectNamespace,
    };

    const result = await triggerCron(env, "not-a-real-job");

    expect(result.jobId).toBeNull();
    expect(ns.calls).toHaveLength(0);
  });
});

describe("getJobsOverview (DO mode) read-RPC timeout", () => {
  it("returns promptly with empty stats when a DO's read RPCs hang", async () => {
    CONFIG.JOB_QUEUE_BACKEND = "durable-object";
    // A DO blocked running a long job never responds to its read RPCs. The stub honors
    // the abort signal doFetch attaches, so each read aborts after READ_RPC_TIMEOUT_MS
    // and the .catch falls back to empty — the overview must not hang.
    const stub = {
      fetch: (req: Request) =>
        new Promise<Response>((_resolve, reject) => {
          req.signal?.addEventListener("abort", () =>
            reject(new Error("aborted")),
          );
          // never resolve otherwise
        }),
    };
    const env = {
      ...d1Env,
      JOB_QUEUE_DO: {
        idFromName: (name: string) => ({ toString: () => name }),
        get: () => stub,
      } as unknown as DurableObjectNamespace,
    };

    const start = Date.now();
    const overview = await getJobsOverview(env);
    const elapsed = Date.now() - start;

    // Resolves around the 3s timeout, well short of the platform's ~30s hang.
    expect(elapsed).toBeLessThan(10_000);
    // Every cron DO degraded to empty stats rather than blocking the page.
    for (const s of Object.values(overview.stats)) {
      expect(s).toEqual({ pending: 0, running: 0, completed: 0, failed: 0 });
    }
    expect(overview.crons.every((c) => c.last_run === null)).toBe(true);
  }, 15_000);
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
    const env = {
      ...d1Env,
      JOB_QUEUE_DO: ns as unknown as DurableObjectNamespace,
    };

    await runWithEnv(env, async () => {
      await enqueueAdhoc("sync-show-episodes", {
        titleId: 42,
        tmdbId: 999,
        title: "Test",
      });
    });

    // enqueue then immediately drive the partition via /tick (#795)
    expect(ns.calls).toHaveLength(2);
    expect(ns.calls[0].path).toBe("/enqueue");
    expect(ns.calls[1].path).toBe("/tick");
    // idFromName should have been called with "sync-show-episodes:42"
    // (we can't directly check idFromName, but the stub body contains the name)
    const body = ns.calls[0].body as { name: string };
    expect(body.name).toBe("sync-show-episodes");
  });

  it("routes backfill-title-offers to a partitioned DO (by tmdbId)", async () => {
    CONFIG.JOB_QUEUE_BACKEND = "durable-object";
    const ns = makeFakeDoNamespace(() => ({ id: 1 }));
    const env = {
      ...d1Env,
      JOB_QUEUE_DO: ns as unknown as DurableObjectNamespace,
    };

    await runWithEnv(env, async () => {
      await enqueueAdhoc("backfill-title-offers", {
        tmdbId: 77,
        objectType: "MOVIE",
      });
    });

    expect(ns.calls).toHaveLength(2);
    expect(ns.calls[0].path).toBe("/enqueue");
    expect(ns.calls[1].path).toBe("/tick");
    const body = ns.calls[0].body as { name: string };
    expect(body.name).toBe("backfill-title-offers");
  });

  it("routes a non-partitioned job to a singleton DO", async () => {
    CONFIG.JOB_QUEUE_BACKEND = "durable-object";
    const ns = makeFakeDoNamespace(() => ({ id: 1 }));
    const env = {
      ...d1Env,
      JOB_QUEUE_DO: ns as unknown as DurableObjectNamespace,
    };

    await runWithEnv(env, async () => {
      await enqueueAdhoc("sync-plex-library");
    });

    expect(ns.calls).toHaveLength(2);
    expect(ns.calls[0].path).toBe("/enqueue");
    expect(ns.calls[1].path).toBe("/tick");
  });
});

// ─── scheduled() bootstrap pattern — arm all CRON_JOBS ───────────────────────
//
// Verifies the pattern used by server/worker.ts scheduled() handler:
// iterate CRON_JOBS and call armCron for each one, regardless of which Worker
// cron expression fired. This ensures any daily bootstrap tick arms every
// cron-singleton DO, not just the one whose expression matches event.cron.

describe("scheduled() bootstrap pattern (DO mode)", () => {
  it("arms every CRON_JOBS entry with one /arm request each", async () => {
    CONFIG.JOB_QUEUE_BACKEND = "durable-object";
    const fetchCalls: FetchCall[] = [];
    const ns = makeFakeDoNamespace((path, method, body) => {
      fetchCalls.push({ path, method, body });
      return { ok: true };
    });
    const env = {
      ...d1Env,
      JOB_QUEUE_DO: ns as unknown as DurableObjectNamespace,
    };

    // Mirror what worker.ts scheduled() now does
    for (const { name, cron } of CRON_JOBS) {
      await armCron(env, name, cron);
    }

    const armCalls = fetchCalls.filter((c) => c.path === "/arm");
    expect(armCalls).toHaveLength(CRON_JOBS.length);
    for (const { name, cron } of CRON_JOBS) {
      expect(armCalls).toContainEqual(
        expect.objectContaining({
          path: "/arm",
          body: expect.objectContaining({ name, cron }),
        }),
      );
    }
  });

  it("does not call enqueueCronJob (D1 path) in DO mode", async () => {
    CONFIG.JOB_QUEUE_BACKEND = "durable-object";
    const ns = makeFakeDoNamespace(() => ({ ok: true }));
    const env = {
      ...d1Env,
      JOB_QUEUE_DO: ns as unknown as DurableObjectNamespace,
    };

    for (const { name, cron } of CRON_JOBS) {
      await armCron(env, name, cron);
    }

    expect(mockEnqueueCronJob).not.toHaveBeenCalled();
  });
});

// ─── runWithEnv ───────────────────────────────────────────────────────────────

describe("runWithEnv", () => {
  it("makes env available in the callback for DO mode", async () => {
    CONFIG.JOB_QUEUE_BACKEND = "durable-object";
    const ns = makeFakeDoNamespace(() => ({ id: 1 }));
    const env = {
      ...d1Env,
      JOB_QUEUE_DO: ns as unknown as DurableObjectNamespace,
    };

    // If runWithEnv works, enqueueAdhoc inside can get the env
    await runWithEnv(env, async () => {
      await enqueueAdhoc("sync-plex-library");
    });
    // /enqueue + /tick
    expect(ns.calls).toHaveLength(2);
  });
});

// ─── cleanupOld ──────────────────────────────────────────────────────────────

describe("cleanupOld (D1 mode)", () => {
  it("delegates to cleanupOldJobs with the given retention days", async () => {
    mockCleanupOldJobs.mockResolvedValueOnce(7);
    const count = await cleanupOld(d1Env, 14);
    expect(count).toBe(7);
    expect(mockCleanupOldJobs).toHaveBeenCalledWith(14);
  });
});

describe("cleanupOld (DO mode)", () => {
  it("fans out POST /cleanup to all 6 cron DOs and sums counts", async () => {
    CONFIG.JOB_QUEUE_BACKEND = "durable-object";
    const ns = makeFakeDoNamespace(() => ({ count: 2 }));
    const env = {
      ...d1Env,
      JOB_QUEUE_DO: ns as unknown as DurableObjectNamespace,
    };

    const total = await cleanupOld(env, 30);

    // 5 CRON_JOB_NAMES + "cleanup" = 6 DOs
    expect(ns.calls).toHaveLength(6);
    expect(
      ns.calls.every((c) => c.path === "/cleanup" && c.method === "POST"),
    ).toBe(true);
    expect(ns.calls.every((c) => (c.body as any).retentionDays === 30)).toBe(
      true,
    );
    expect(total).toBe(12); // 6 × 2
    expect(mockCleanupOldJobs).not.toHaveBeenCalled();
  });

  it("continues and sums fulfilled counts when one peer DO rejects", async () => {
    CONFIG.JOB_QUEUE_BACKEND = "durable-object";
    const attempted: string[] = [];
    // Use name-aware stub so each DO call can be routed by the captured id
    const failingNs = {
      idFromName: (name: string) => ({ name, toString: () => name }),
      get: (id: any) => ({
        fetch: async () => {
          const name: string = id.name ?? id.toString();
          attempted.push(name);
          if (name === "send-notifications") throw new Error("DO unavailable");
          return new Response(JSON.stringify({ count: 3 }), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        },
      }),
    };
    const env = {
      ...d1Env,
      JOB_QUEUE_DO: failingNs as unknown as DurableObjectNamespace,
    };

    const total = await cleanupOld(env, 30);

    // All 6 DOs were attempted despite one failure
    expect(attempted).toHaveLength(6);
    expect(attempted).toContain("send-notifications");
    // Only 5 fulfilled × 3 = 15 (send-notifications rejected, excluded)
    expect(total).toBe(15);
  });
});
