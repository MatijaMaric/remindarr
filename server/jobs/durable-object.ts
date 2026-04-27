/**
 * Durable Object job queue for Cloudflare Workers.
 *
 * Powered by @cloudflare/actors/alarms for cron scheduling and alarm dispatch.
 * One DO instance per job name (e.g. "sync-titles") for cron singletons,
 * or per "name:partitionKey" (e.g. "sync-show-episodes:42") for ad-hoc work.
 * The Bun runtime never imports this file.
 */
import { Alarms } from "@cloudflare/actors/alarms";
import { drizzle } from "drizzle-orm/d1";
import { eq, sql } from "drizzle-orm";
import { runWithDb, schemaExports, titles } from "../db/schema";
import { runWithCache } from "../cache";
import { CloudflareKvCache } from "../cache/cloudflare-kv";
import { MemoryCache } from "../cache/memory";
import { logger } from "../logger";
import { deleteExpiredSessions } from "../db/repository";
import { handlers } from "./processor";
import type { DrizzleDb } from "../platform/types";

// ─── Inline CF type declarations ───────────────────────────────────────────
// Mirrors the declare global block in server/worker.ts (merged at compile time).
declare global {
  interface DurableObjectNamespace {
    idFromName(name: string): DurableObjectId;
    idFromString(hex: string): DurableObjectId;
    get(id: DurableObjectId, options?: { locationHint?: string }): DurableObjectStub;
  }
  interface DurableObjectId {
    toString(): string;
    equals(other: DurableObjectId): boolean;
    readonly name?: string;
  }
  interface DurableObjectStub {
    fetch(input: RequestInfo, init?: RequestInit): Promise<Response>;
    readonly id: DurableObjectId;
  }
  interface DurableObjectState {
    storage: DurableObjectStorage;
    readonly id: DurableObjectId;
    blockConcurrencyWhile<T>(callback: () => Promise<T>): Promise<T>;
  }
  interface DurableObjectStorage {
    get<T = unknown>(key: string): Promise<T | undefined>;
    put(key: string, value: unknown): Promise<void>;
    delete(key: string): Promise<boolean>;
    setAlarm(scheduledTime: number | Date): Promise<void>;
    getAlarm(): Promise<number | null>;
    deleteAlarm(): Promise<void>;
    sql: SqlStorage;
  }
  interface SqlStorage {
    exec(query: string, ...bindings: (string | number | boolean | null | ArrayBuffer)[]): SqlStorageCursor;
  }
  interface SqlStorageCursor extends Iterable<Record<string, unknown>> {
    toArray(): Record<string, unknown>[];
    one(): Record<string, unknown>;
    next(): IteratorResult<Record<string, unknown>>;
  }
}

// ─── Minimal CF env shape needed by the DO ─────────────────────────────────
export interface DOEnv {
  DB: D1Database;
  CACHE_KV?: KVNamespace;
  JOB_QUEUE_DO?: DurableObjectNamespace;
}

// ─── Cron singleton names whose DOs get cleanup fan-out ────────────────────
export const CRON_JOB_NAMES = [
  "sync-titles",
  "sync-episodes",
  "sync-deep-links",
  "send-notifications",
] as const;

// ─── DO-local job row type ──────────────────────────────────────────────────
export interface DOJobRow {
  id: number;
  name: string;
  data: string | null;
  status: "pending" | "running" | "completed" | "failed";
  attempts: number;
  max_attempts: number;
  error: string | null;
  run_at: string;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
}

const log = logger.child({ module: "job-queue-do" });

export class JobQueueDO {
  private ctx: DurableObjectState;
  private env: DOEnv;
  private initialized = false;
  // Cast to any: Alarms<P> requires P extends DurableObject, but P only needs
  // callable methods by name at runtime. The constraint is TS-only.
  alarms: Alarms<JobQueueDO>;

  constructor(ctx: DurableObjectState, env: DOEnv) {
    this.ctx = ctx;
    this.env = env;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.alarms = new Alarms(ctx, this as any);
  }

  /** Required stub — Alarms calls setName() on the parent before each callback. */
  setName(_name: string): void {}

  // ─── Schema bootstrap ────────────────────────────────────────────────────

  private initSchema(): void {
    if (this.initialized) return;
    this.initialized = true;
    this.ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS jobs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL DEFAULT '',
        data TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        attempts INTEGER NOT NULL DEFAULT 0,
        max_attempts INTEGER NOT NULL DEFAULT 3,
        error TEXT,
        run_at TEXT NOT NULL,
        started_at TEXT,
        completed_at TEXT,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
      )
    `);
  }

  // ─── HTTP RPC surface ────────────────────────────────────────────────────

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    try {
      this.initSchema();
      if (request.method === "GET" && path === "/stats") {
        return Response.json(this.getStats());
      }
      if (request.method === "GET" && path === "/recent-jobs") {
        const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "20", 10), 100);
        return Response.json(this.getRecentJobs(limit));
      }
      if (request.method === "GET" && path === "/cron-info") {
        return Response.json(await this.getCronInfo());
      }
      if (request.method === "POST" && path === "/arm") {
        const body = await request.json() as { name: string; cron: string };
        await this.armCron(body.name, body.cron);
        return Response.json({ ok: true });
      }
      if (request.method === "POST" && path === "/enqueue") {
        const body = await request.json() as {
          name: string;
          data?: string | null;
          runAt?: string;
          maxAttempts?: number;
        };
        const id = await this.enqueue(body.name, body.data ?? null, body.runAt, body.maxAttempts);
        return Response.json({ id });
      }
      if (request.method === "POST" && path === "/recover") {
        const body = await request.json() as { staleMinutes?: number };
        const count = this.recover(body.staleMinutes ?? 15);
        return Response.json({ count });
      }
      if (request.method === "POST" && path === "/cleanup") {
        const body = await request.json() as { retentionDays?: number };
        const count = this.cleanup(body.retentionDays ?? 30);
        return Response.json({ count });
      }
      return new Response("Not found", { status: 404 });
    } catch (err) {
      log.error("DO fetch error", { err, path });
      return new Response(JSON.stringify({ error: String(err) }), {
        status: 500,
        headers: { "content-type": "application/json" },
      });
    }
  }

  // ─── CF alarm handler — delegates to Alarms dispatcher ───────────────────

  async alarm(): Promise<void> {
    this.initSchema();
    await this.alarms.alarm();
  }

  // ─── Job execution: invoked by Alarms when a cron or delayed schedule fires

  async runJob(_payload: unknown = null): Promise<void> {
    const name = await this.ctx.storage.get<string>("name");
    if (!name) return;
    const cron = (await this.ctx.storage.get<string>("cron")) ?? null;
    const now = new Date().toISOString();

    let rows = this.ctx.storage.sql
      .exec(
        "SELECT id, name, data, attempts, max_attempts FROM jobs WHERE status = 'pending' AND run_at <= ? ORDER BY run_at ASC LIMIT 1",
        now,
      )
      .toArray() as Pick<DOJobRow, "id" | "name" | "data" | "attempts" | "max_attempts">[];

    if (rows.length === 0) {
      if (cron) {
        // Cron singleton: alarm fires at each scheduled tick. Auto-create the job for
        // this tick if no pending rows exist (including future-scheduled ones).
        const anyPending = this.ctx.storage.sql
          .exec("SELECT 1 FROM jobs WHERE status = 'pending' LIMIT 1")
          .toArray().length > 0;
        if (!anyPending) {
          this.ctx.storage.sql.exec(
            "INSERT INTO jobs (name, run_at, max_attempts) VALUES (?, ?, 3)",
            name,
            now,
          );
          rows = this.ctx.storage.sql
            .exec(
              "SELECT id, name, data, attempts, max_attempts FROM jobs WHERE status = 'pending' AND run_at <= ? ORDER BY run_at ASC LIMIT 1",
              now,
            )
            .toArray() as Pick<DOJobRow, "id" | "name" | "data" | "attempts" | "max_attempts">[];
        }
      }
      if (rows.length === 0) {
        await this.rearmIfPending(cron);
        return;
      }
    }

    const job = rows[0];

    // Claim — single-writer guarantees this is safe without CAS
    this.ctx.storage.sql.exec(
      "UPDATE jobs SET status = 'running', started_at = ?, attempts = ? WHERE id = ?",
      now,
      job.attempts + 1,
      job.id,
    );

    // Set up ALS context (getDb() and getCache() work inside handlers)
    const db = drizzle(this.env.DB, { schema: schemaExports }) as unknown as DrizzleDb;
    const cache = this.env.CACHE_KV
      ? new CloudflareKvCache(this.env.CACHE_KV)
      : new MemoryCache();

    try {
      if (job.name === "cleanup") {
        await runWithCache(cache, () => runWithDb(db, () => this.runCleanup()));
      } else {
        const handler = handlers[job.name];
        if (!handler) {
          log.warn("Unknown job type, marking failed", { name: job.name, jobId: job.id });
          this.ctx.storage.sql.exec(
            "UPDATE jobs SET status = 'failed', error = ?, completed_at = ? WHERE id = ?",
            `Unknown job type: ${job.name}`,
            new Date().toISOString(),
            job.id,
          );
          await this.rearmIfPending(cron);
          return;
        }
        log.info("Running job", { name: job.name, jobId: job.id });
        await runWithCache(cache, () => runWithDb(db, () => handler(job.data)));
      }

      this.ctx.storage.sql.exec(
        "UPDATE jobs SET status = 'completed', completed_at = ? WHERE id = ?",
        new Date().toISOString(),
        job.id,
      );
      log.info("Completed job", { name: job.name, jobId: job.id });

      // migrate-offers: re-enqueue next batch in this DO's SQLite when more titles remain.
      // In D1 mode this is handled by handleMigrateOffers inserting a D1 row directly;
      // in DO mode the handler skips that and we do it here instead.
      if (job.name === "migrate-offers") {
        const remaining = await db
          .select({ count: sql<number>`count(*)` })
          .from(titles)
          .where(eq(titles.offersChecked, 0))
          .get();
        if (remaining && remaining.count > 0) {
          this.ctx.storage.sql.exec(
            "INSERT INTO jobs (name, run_at, max_attempts) VALUES ('migrate-offers', ?, 1)",
            new Date().toISOString(),
          );
          log.info("migrate-offers batch done, re-queued in DO", { remaining: remaining.count });
        } else {
          log.info("migrate-offers migration complete");
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const newAttempts = job.attempts + 1;

      if (newAttempts < job.max_attempts) {
        // Exponential backoff: 2^attempts × 30 s — mirrors processor.ts
        const delaySec = Math.pow(2, newAttempts) * 30;
        const retryAt = new Date(Date.now() + delaySec * 1000).toISOString();
        this.ctx.storage.sql.exec(
          "UPDATE jobs SET status = 'pending', error = ?, run_at = ? WHERE id = ?",
          message,
          retryAt,
          job.id,
        );
        log.warn("Job failed, will retry", { name: job.name, jobId: job.id, attempt: newAttempts, retryAt, err });
      } else {
        this.ctx.storage.sql.exec(
          "UPDATE jobs SET status = 'failed', error = ?, completed_at = ? WHERE id = ?",
          message,
          new Date().toISOString(),
          job.id,
        );
        log.error("Job failed permanently", { name: job.name, jobId: job.id, attempts: newAttempts, err });
      }
    }

    await this.rearmIfPending(cron);
  }

  // ─── Internal methods (also used by tests via subclass) ──────────────────

  /** Arm this DO as a cron singleton. Idempotent — only schedules if no cron alarm exists. */
  async armCron(name: string, cron: string): Promise<void> {
    this.initSchema();
    await this.ctx.storage.put("name", name);
    await this.ctx.storage.put("cron", cron);
    const existing = this.alarms.getSchedules({ type: "cron" });
    if (!existing.some((s) => s.callback === "runJob")) {
      await this.alarms.schedule(cron, "runJob" as keyof JobQueueDO, null);
    }
  }

  /** Insert a job row and schedule an alarm to fire within 1 second. */
  async enqueue(
    name: string,
    data: string | null,
    runAt?: string,
    maxAttempts?: number,
  ): Promise<number> {
    this.initSchema();
    await this.ctx.storage.put("name", name);
    const now = new Date().toISOString();
    const rows = this.ctx.storage.sql
      .exec(
        "INSERT INTO jobs (name, data, run_at, max_attempts) VALUES (?, ?, ?, ?) RETURNING id",
        name,
        data,
        runAt ?? now,
        maxAttempts ?? 3,
      )
      .toArray() as Array<{ id: number }>;

    // Only schedule if no delayed runJob alarm is already pending
    const existing = this.alarms.getSchedules({ type: "delayed" });
    if (!existing.some((s) => s.callback === "runJob")) {
      await this.alarms.schedule(1, "runJob" as keyof JobQueueDO, null);
    }
    return rows[0].id;
  }

  /** Reset running jobs older than staleMinutes back to pending. */
  recover(staleMinutes = 15): number {
    this.initSchema();
    const cutoff = new Date(Date.now() - staleMinutes * 60 * 1000).toISOString();
    const countRows = this.ctx.storage.sql
      .exec(
        "SELECT COUNT(*) as count FROM jobs WHERE status = 'running' AND started_at < ?",
        cutoff,
      )
      .toArray() as Array<{ count: number }>;
    const count = countRows[0]?.count ?? 0;
    if (count > 0) {
      this.ctx.storage.sql.exec(
        "UPDATE jobs SET status = 'pending', error = 'Recovered after stale timeout' WHERE status = 'running' AND started_at < ?",
        cutoff,
      );
      log.info("Recovered stale jobs", { count });
    }
    return count;
  }

  /** Delete old completed/failed rows. */
  cleanup(retentionDays = 30): number {
    this.initSchema();
    const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000).toISOString();
    const countRows = this.ctx.storage.sql
      .exec(
        "SELECT COUNT(*) as count FROM jobs WHERE status IN ('completed', 'failed') AND completed_at <= ?",
        cutoff,
      )
      .toArray() as Array<{ count: number }>;
    const count = countRows[0]?.count ?? 0;
    if (count > 0) {
      this.ctx.storage.sql.exec(
        "DELETE FROM jobs WHERE status IN ('completed', 'failed') AND completed_at <= ?",
        cutoff,
      );
    }
    return count;
  }

  getStats(): { pending: number; running: number; completed: number; failed: number } {
    this.initSchema();
    const rows = this.ctx.storage.sql
      .exec("SELECT status, COUNT(*) as count FROM jobs GROUP BY status")
      .toArray() as Array<{ status: string; count: number }>;
    const stats = { pending: 0, running: 0, completed: 0, failed: 0 };
    for (const row of rows) {
      const s = row.status as keyof typeof stats;
      if (s in stats) stats[s] = row.count;
    }
    return stats;
  }

  getRecentJobs(limit = 20): DOJobRow[] {
    this.initSchema();
    return this.ctx.storage.sql
      .exec("SELECT * FROM jobs ORDER BY id DESC LIMIT ?", limit)
      .toArray() as unknown as DOJobRow[];
  }

  async getCronInfo(): Promise<{ cron: string | null; nextRun: string | null; lastRun: string | null }> {
    this.initSchema();
    const cron = (await this.ctx.storage.get<string>("cron")) ?? null;
    // nextRun is read from the Alarms table (authoritative next execution time)
    let nextRun: string | null = null;
    const cronSchedules = this.alarms.getSchedules({ type: "cron" });
    if (cronSchedules.length > 0) {
      const schedule = cronSchedules[0] as { time: number };
      nextRun = new Date(schedule.time * 1000).toISOString();
    }
    const lastRows = this.ctx.storage.sql
      .exec(
        "SELECT completed_at FROM jobs WHERE status IN ('completed', 'failed') ORDER BY id DESC LIMIT 1",
      )
      .toArray() as Array<{ completed_at: string | null }>;
    return { cron, nextRun, lastRun: lastRows[0]?.completed_at ?? null };
  }

  // ─── Private helpers ─────────────────────────────────────────────────────

  /**
   * For ad-hoc DOs: re-arm with a 1-second delayed alarm if pending jobs remain.
   * Cron DOs are re-armed automatically by the Alarms framework (cron type schedules
   * update their own next-execution time after each run).
   */
  private async rearmIfPending(cron: string | null): Promise<void> {
    if (cron) return;
    const rows = this.ctx.storage.sql
      .exec("SELECT COUNT(*) as count FROM jobs WHERE status = 'pending'")
      .toArray() as Array<{ count: number }>;
    if ((rows[0]?.count ?? 0) > 0) {
      const existing = this.alarms.getSchedules({ type: "delayed" });
      if (!existing.some((s) => s.callback === "runJob")) {
        await this.alarms.schedule(1, "runJob" as keyof JobQueueDO, null);
      }
    }
  }

  /** Cleanup handler: delete expired sessions + fan out per-DO cleanup. */
  private async runCleanup(): Promise<void> {
    // deleteExpiredSessions() uses getDb() which is bound via runWithDb above
    await deleteExpiredSessions();

    // Fan out cleanup to the four cron-singleton DOs
    if (this.env.JOB_QUEUE_DO) {
      await Promise.all(
        CRON_JOB_NAMES.map((cronName) => {
          const id = this.env.JOB_QUEUE_DO!.idFromName(cronName);
          const stub = this.env.JOB_QUEUE_DO!.get(id);
          return stub.fetch(
            new Request("https://do/cleanup", {
              method: "POST",
              body: JSON.stringify({ retentionDays: 30 }),
              headers: { "content-type": "application/json" },
            }),
          );
        }),
      );
    }

    // Also clean our own jobs table
    this.cleanup(30);
  }
}
