/**
 * Tests for JobQueueDO.
 *
 * Uses a fake DurableObjectState whose storage.sql is backed by bun:sqlite
 * in-memory so tests run under the standard bun:test runner without Miniflare.
 *
 * Tests that exercise job-processing logic (retry, backoff, single-writer) call
 * runJob() directly — bypassing the Alarms timestamp dispatch so tests don't
 * depend on wall-clock timing. Tests that exercise alarm scheduling (armCron
 * idempotency, re-arm after processing) call alarm() and manipulate the
 * _actor_alarms table directly.
 */
import { describe, it, expect, beforeEach, afterEach, spyOn } from "bun:test";
import { Database } from "bun:sqlite";
import { JobQueueDO } from "./durable-object";
import * as processorModule from "./processor";
import { setupTestDb, teardownTestDb } from "../test-utils/setup";

// ─── Fake CF storage ──────────────────────────────────────────────────────────

class FakeSqlCursor {
  private rows: Record<string, unknown>[];

  constructor(rows: Record<string, unknown>[]) {
    this.rows = rows;
  }

  toArray(): Record<string, unknown>[] {
    return this.rows;
  }

  one(): Record<string, unknown> {
    return this.rows[0];
  }

  // Iterable so spread ([...cursor]) works — required by @cloudflare/actors/alarms internals
  [Symbol.iterator](): IterableIterator<Record<string, unknown>> {
    return this.rows[Symbol.iterator]();
  }

  // Stub row-count properties used by SQLSchemaMigrations (unused here but satisfies types)
  rowsRead = 0;
  rowsWritten = 0;
}

class FakeSqlStorage {
  private db: Database;

  constructor(db: Database) {
    this.db = db;
  }

  exec(sql: string, ...params: (string | number | boolean | null)[]): FakeSqlCursor {
    const stmt = this.db.prepare(sql);
    const rows = stmt.all(...params) as Record<string, unknown>[];
    return new FakeSqlCursor(rows);
  }
}

class FakeDurableObjectStorage {
  sql: FakeSqlStorage;
  private kv: Map<string, unknown> = new Map();
  scheduledAlarm: number | null = null;
  alarmHistory: number[] = [];

  constructor(db: Database) {
    this.sql = new FakeSqlStorage(db);
  }

  async get<T>(key: string): Promise<T | undefined> {
    return this.kv.get(key) as T | undefined;
  }

  async put(key: string, value: unknown): Promise<void> {
    this.kv.set(key, value);
  }

  async delete(key: string): Promise<boolean> {
    return this.kv.delete(key);
  }

  async setAlarm(time: number | Date): Promise<void> {
    const ts = typeof time === "number" ? time : time.getTime();
    this.scheduledAlarm = ts;
    this.alarmHistory.push(ts);
  }

  async getAlarm(): Promise<number | null> {
    return this.scheduledAlarm;
  }

  async deleteAlarm(): Promise<void> {
    this.scheduledAlarm = null;
  }
}

class FakeDurableObjectState {
  storage: FakeDurableObjectStorage;
  id: { toString: () => string; equals: (o: unknown) => boolean };
  private db: Database;

  constructor(name: string) {
    this.db = new Database(":memory:");
    this.storage = new FakeDurableObjectStorage(this.db);
    this.id = { toString: () => name, equals: (o: unknown) => String(o) === name };
  }

  close() {
    this.db.close();
  }

  // Expose for tests that need to query DO-internal state directly
  get rawDb() {
    return this.db;
  }

  async blockConcurrencyWhile<T>(fn: () => Promise<T>): Promise<T> {
    return fn();
  }
}

// ─── Minimal fake env ─────────────────────────────────────────────────────────

const fakeEnv = {
  DB: {} as D1Database,   // handlers are mocked so real DB never accessed via DO env
  CACHE_KV: undefined,
  JOB_QUEUE_DO: undefined,
};

// ─── Spy setup ────────────────────────────────────────────────────────────────

const mockSyncTitles = spyOn(processorModule.handlers, "sync-titles" as any);

// Snapshot original handlers so afterEach can restore them (prevents mutation leaking to processor.test.ts)
const originalHandlers: Record<string, (data: string | null) => Promise<void>> = { ...processorModule.handlers };

// Helpers
function makeDO(name: string): { do_: JobQueueDO; state: FakeDurableObjectState } {
  const state = new FakeDurableObjectState(name);
  const do_ = new JobQueueDO(state as any, fakeEnv as any);
  return { do_, state };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("JobQueueDO", () => {
  let state: FakeDurableObjectState;
  let do_: JobQueueDO;

  beforeEach(() => {
    setupTestDb(); // keep the shared DB fresh for processor imports
    ({ do_, state } = makeDO("sync-titles"));

    // Reset handler mocks
    for (const key of Object.keys(processorModule.handlers)) {
      (processorModule.handlers as any)[key] = async () => {};
    }
  });

  afterEach(() => {
    state.close();
    teardownTestDb();
    // Restore handler entries mutated in beforeEach so they don't leak to other test files
    for (const key of Object.keys(originalHandlers)) {
      (processorModule.handlers as any)[key] = originalHandlers[key];
    }
  });

  // ── enqueue ──────────────────────────────────────────────────────────────

  it("enqueue inserts a pending row and sets an alarm", async () => {
    const id = await do_.enqueue("sync-titles", null);
    expect(id).toBeGreaterThan(0);

    const rows = do_.getRecentJobs();
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("pending");
    expect(rows[0].name).toBe("sync-titles");

    // Alarms.schedule() calls _scheduleNextAlarm() → setAlarm()
    const alarm = await state.storage.getAlarm();
    expect(alarm).not.toBeNull();
  });

  it("enqueue accepts data payload", async () => {
    const data = JSON.stringify({ titleId: 42, tmdbId: 999 });
    await do_.enqueue("sync-show-episodes", data);
    const rows = do_.getRecentJobs();
    expect(rows[0].data).toBe(data);
  });

  // ── runJob: basic execution ───────────────────────────────────────────────
  // Tests below call runJob() directly to exercise processing logic without
  // depending on Alarms dispatch timing (which uses integer-second precision).

  it("runJob processes a pending job and marks it completed", async () => {
    let called = false;
    processorModule.handlers["sync-titles"] = async () => { called = true; };
    await do_.enqueue("sync-titles", null);
    await do_.runJob(null);

    expect(called).toBe(true);
    const rows = do_.getRecentJobs();
    expect(rows[0].status).toBe("completed");
    expect(rows[0].completed_at).not.toBeNull();
  });

  it("runJob auto-creates and runs a job for cron DOs when no pending rows exist", async () => {
    let called = false;
    processorModule.handlers["sync-titles"] = async () => { called = true; };
    await do_.armCron("sync-titles", "0 3 * * *");
    await do_.runJob(null); // no rows pre-inserted — auto-create kicks in

    expect(called).toBe(true);
    const rows = do_.getRecentJobs();
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("completed");
  });

  it("runJob skips jobs not yet ready (future run_at)", async () => {
    let called = false;
    processorModule.handlers["sync-show-episodes"] = async () => { called = true; };
    // Ad-hoc DO (no armCron) — no auto-create when nothing is pending
    await do_.enqueue("sync-show-episodes", null, new Date(Date.now() + 60_000).toISOString());
    await do_.runJob(null);
    expect(called).toBe(false);
  });

  // ── single-writer atomicity ───────────────────────────────────────────────

  it("two concurrent runJob() calls process a job at most once (single-writer guarantee)", async () => {
    let callCount = 0;
    processorModule.handlers["sync-titles"] = async () => { callCount++; };
    // No armCron — bare enqueue so cron is null and auto-create doesn't kick in.
    // enqueue() sets the "name" key so runJob() still identifies the DO.
    await do_.enqueue("sync-titles", null);

    // In the DO model, single-writer guarantees exclusion. In tests, runJob() claims
    // via UPDATE before any await on the handler, so the second concurrent call finds
    // no pending work after the first claims the row.
    await Promise.all([do_.runJob(null), do_.runJob(null)]);
    expect(callCount).toBe(1);
  });

  // ── exponential backoff ───────────────────────────────────────────────────

  it("retries a failed job with exponential backoff", async () => {
    processorModule.handlers["sync-titles"] = async () => {
      throw new Error("transient error");
    };
    await do_.enqueue("sync-titles", null, undefined, 3);
    const before = Date.now();
    await do_.runJob(null);

    const rows = do_.getRecentJobs();
    expect(rows[0].status).toBe("pending");
    expect(rows[0].attempts).toBe(1);
    expect(rows[0].error).toBe("transient error");
    // run_at should be ~60s in the future (2^1 * 30s)
    const retryAt = new Date(rows[0].run_at as string).getTime();
    expect(retryAt).toBeGreaterThan(before + 50_000);
  });

  it("marks a job permanently failed after max attempts", async () => {
    processorModule.handlers["sync-titles"] = async () => {
      throw new Error("fatal error");
    };
    // Insert with maxAttempts=1 so first failure is permanent
    await do_.enqueue("sync-titles", null, undefined, 1);
    await do_.runJob(null);

    const rows = do_.getRecentJobs();
    expect(rows[0].status).toBe("failed");
    expect(rows[0].error).toBe("fatal error");
    expect(rows[0].completed_at).not.toBeNull();
  });

  // ── unknown handler ───────────────────────────────────────────────────────

  it("marks unknown job types as failed without running a handler", async () => {
    await do_.enqueue("nonexistent-job", null);
    await do_.runJob(null);

    const rows = do_.getRecentJobs();
    expect(rows[0].status).toBe("failed");
    expect(rows[0].error).toContain("Unknown job type");
  });

  // ── armCron ───────────────────────────────────────────────────────────────

  it("armCron does not reset the alarm if one is already scheduled", async () => {
    await do_.armCron("sync-titles", "0 3 * * *");
    const firstAlarm = await state.storage.getAlarm();
    expect(firstAlarm).not.toBeNull();

    // Second armCron call (as the CF scheduled handler does each cron tick) must NOT
    // push the alarm forward — doing so would cause the current tick's job to be skipped.
    await do_.armCron("sync-titles", "0 3 * * *");
    const secondAlarm = await state.storage.getAlarm();
    expect(secondAlarm).toBe(firstAlarm); // unchanged
    // Only one alarm was set (by the first armCron call)
    expect(state.storage.alarmHistory).toHaveLength(1);
  });

  it("armCron sets the cron expression and schedules an alarm", async () => {
    await do_.armCron("sync-titles", "0 3 * * *");
    const cronInfo = await do_.getCronInfo();
    expect(cronInfo.cron).toBe("0 3 * * *");
    expect(cronInfo.nextRun).not.toBeNull();
    const alarm = await state.storage.getAlarm();
    expect(alarm).not.toBeNull();
    expect(alarm!).toBeGreaterThan(Date.now());
  });

  it("alarm() re-arms to the next cron tick after processing", async () => {
    processorModule.handlers["sync-titles"] = async () => {};
    await do_.armCron("sync-titles", "0 3 * * *");
    // Force the cron schedule to be due (past time) so alarm() actually dispatches it
    state.rawDb.prepare("UPDATE _actor_alarms SET time = 0 WHERE callback = 'runJob'").run();

    const beforeAlarmCount = state.storage.alarmHistory.length;
    await do_.alarm();

    // After processing, Alarms framework updates the cron row and calls _scheduleNextAlarm
    expect(state.storage.alarmHistory.length).toBeGreaterThan(beforeAlarmCount);
    const newAlarm = state.storage.scheduledAlarm!;
    expect(newAlarm).toBeGreaterThan(Date.now());
  });

  it("ad-hoc DO (no cron) does NOT auto-create when no pending rows exist", async () => {
    const { do_: adHocDo, state: adHocState } = makeDO("sync-show-episodes:99");
    // Enqueue then manually mark it completed, so the DO has a "name" but no pending rows
    await adHocDo.enqueue("sync-show-episodes", null);
    adHocState.rawDb.prepare("UPDATE jobs SET status='completed', completed_at=? WHERE status='pending'")
      .run(new Date().toISOString());

    const alarmsBefore = adHocState.storage.alarmHistory.length;
    await adHocDo.runJob(null);
    // No auto-create for ad-hoc DOs — runJob exits without creating a new job row
    expect(adHocDo.getRecentJobs().filter((r) => r.status === "pending")).toHaveLength(0);
    // rearmIfPending finds no pending work → no new alarm scheduled
    expect(adHocState.storage.alarmHistory.length).toBe(alarmsBefore);
    adHocState.close();
  });

  it("ad-hoc DO (no cron) re-arms only when pending rows remain", async () => {
    processorModule.handlers["sync-show-episodes"] = async () => {};
    const { do_: adHocDo, state: adHocState } = makeDO("sync-show-episodes:42");
    await adHocDo.enqueue("sync-show-episodes", null);
    await adHocDo.enqueue("sync-show-episodes", null); // second job

    const alarmsAfterEnqueue = adHocState.storage.alarmHistory.length;

    await adHocDo.runJob(null); // processes first
    // Second job still pending → re-arm check: a delayed schedule should exist
    const hasDelayedSchedule = adHocDo.alarms.getSchedules({ type: "delayed" }).some(
      (s) => s.callback === "runJob",
    );
    expect(hasDelayedSchedule).toBe(true);

    await adHocDo.runJob(null); // processes second

    // After all jobs done, another runJob call should not schedule a new alarm
    const alarmsBeforeFinal = adHocState.storage.alarmHistory.length;
    await adHocDo.runJob(null); // no-op
    expect(adHocState.storage.alarmHistory.length).toBe(alarmsBeforeFinal);

    adHocState.close();
  });

  // ── partition isolation ───────────────────────────────────────────────────

  it("two partitioned DOs run independently (partition isolation)", async () => {
    const calls: number[] = [];
    processorModule.handlers["sync-show-episodes"] = async (data) => {
      const { titleId } = JSON.parse(data!);
      calls.push(titleId);
    };

    const { do_: do1, state: s1 } = makeDO("sync-show-episodes:1");
    const { do_: do2, state: s2 } = makeDO("sync-show-episodes:2");

    await do1.enqueue("sync-show-episodes", JSON.stringify({ titleId: 1 }));
    await do2.enqueue("sync-show-episodes", JSON.stringify({ titleId: 2 }));

    await do1.runJob(null);
    await do2.runJob(null);

    expect(calls).toContain(1);
    expect(calls).toContain(2);
    expect(do1.getRecentJobs()[0].status).toBe("completed");
    expect(do2.getRecentJobs()[0].status).toBe("completed");

    s1.close();
    s2.close();
  });

  // ── recover ──────────────────────────────────────────────────────────────

  it("recover resets stale running jobs to pending", async () => {
    await do_.enqueue("sync-titles", null);
    // Manually force job to "running" with old started_at
    state.rawDb.prepare(
      "UPDATE jobs SET status = 'running', started_at = ? WHERE status = 'pending'",
    ).run(new Date(Date.now() - 30 * 60 * 1000).toISOString());

    const count = do_.recover(15);
    expect(count).toBe(1);
    const rows = do_.getRecentJobs();
    expect(rows[0].status).toBe("pending");
    expect(rows[0].error).toBe("Recovered after stale timeout");
  });

  it("recover does not reset recently started jobs", async () => {
    await do_.enqueue("sync-titles", null);
    state.rawDb.prepare(
      "UPDATE jobs SET status = 'running', started_at = ? WHERE status = 'pending'",
    ).run(new Date().toISOString());

    const count = do_.recover(15);
    expect(count).toBe(0);
    expect(do_.getRecentJobs()[0].status).toBe("running");
  });

  // ── cleanup ───────────────────────────────────────────────────────────────

  it("cleanup removes old completed/failed jobs", async () => {
    await do_.enqueue("sync-titles", null);
    // Force completed with old completed_at
    state.rawDb.prepare(
      "UPDATE jobs SET status = 'completed', completed_at = ? WHERE status = 'pending'",
    ).run(new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString());

    const count = do_.cleanup(30);
    expect(count).toBe(1);
    expect(do_.getRecentJobs()).toHaveLength(0);
  });

  it("cleanup keeps recent completed jobs", async () => {
    await do_.enqueue("sync-titles", null);
    state.rawDb.prepare(
      "UPDATE jobs SET status = 'completed', completed_at = ? WHERE status = 'pending'",
    ).run(new Date().toISOString());

    const count = do_.cleanup(30);
    expect(count).toBe(0);
    expect(do_.getRecentJobs()).toHaveLength(1);
  });

  // ── getStats ──────────────────────────────────────────────────────────────

  it("getStats returns counts by status", async () => {
    await do_.enqueue("sync-titles", null);
    await do_.enqueue("sync-titles", null);
    state.rawDb.prepare("UPDATE jobs SET status = 'completed', completed_at = ? WHERE id = 2").run(new Date().toISOString());

    const stats = do_.getStats();
    expect(stats.pending).toBe(1);
    expect(stats.completed).toBe(1);
    expect(stats.running).toBe(0);
    expect(stats.failed).toBe(0);
  });

  // ── HTTP fetch interface ──────────────────────────────────────────────────

  it("GET /stats returns job counts", async () => {
    await do_.enqueue("sync-titles", null);
    const resp = await do_.fetch(new Request("https://do/stats"));
    expect(resp.status).toBe(200);
    const body = await resp.json() as { pending: number };
    expect(body.pending).toBe(1);
  });

  it("POST /arm arms the DO and returns ok", async () => {
    const resp = await do_.fetch(
      new Request("https://do/arm", {
        method: "POST",
        body: JSON.stringify({ name: "sync-titles", cron: "0 3 * * *" }),
        headers: { "content-type": "application/json" },
      }),
    );
    expect(resp.status).toBe(200);
    const body = await resp.json() as { ok: boolean };
    expect(body.ok).toBe(true);
    const alarm = await state.storage.getAlarm();
    expect(alarm).not.toBeNull();
  });

  it("POST /enqueue inserts a job and returns id", async () => {
    const resp = await do_.fetch(
      new Request("https://do/enqueue", {
        method: "POST",
        body: JSON.stringify({ name: "sync-titles", data: null }),
        headers: { "content-type": "application/json" },
      }),
    );
    expect(resp.status).toBe(200);
    const body = await resp.json() as { id: number };
    expect(body.id).toBeGreaterThan(0);
  });

  it("GET /cron-info returns cron expression and times", async () => {
    await do_.armCron("sync-titles", "0 3 * * *");
    await do_.enqueue("sync-titles", null);
    state.rawDb.prepare(
      "UPDATE jobs SET status = 'completed', completed_at = ? WHERE status = 'pending'",
    ).run(new Date().toISOString());
    const resp = await do_.fetch(new Request("https://do/cron-info"));
    const body = await resp.json() as { cron: string; nextRun: string | null; lastRun: string | null };
    expect(body.cron).toBe("0 3 * * *");
    expect(body.nextRun).not.toBeNull();
    expect(body.lastRun).not.toBeNull();
  });

  it("POST /recover returns recovered count", async () => {
    await do_.enqueue("sync-titles", null);
    state.rawDb.prepare(
      "UPDATE jobs SET status = 'running', started_at = ? WHERE status = 'pending'",
    ).run(new Date(Date.now() - 30 * 60 * 1000).toISOString());
    const resp = await do_.fetch(
      new Request("https://do/recover", {
        method: "POST",
        body: JSON.stringify({ staleMinutes: 15 }),
        headers: { "content-type": "application/json" },
      }),
    );
    const body = await resp.json() as { count: number };
    expect(body.count).toBe(1);
  });

  it("returns 404 for unknown paths", async () => {
    const resp = await do_.fetch(new Request("https://do/unknown-path"));
    expect(resp.status).toBe(404);
  });
});

// Suppress unused-variable warning for the spy (it suppresses console output in tests)
void mockSyncTitles;
