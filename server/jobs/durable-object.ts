/**
 * Durable Object job queue for Cloudflare Workers.
 *
 * One DO instance per job name (e.g. "sync-titles") for cron singletons,
 * or per "name:partitionKey" (e.g. "sync-show-episodes:42") for ad-hoc work.
 * DO Alarms drive execution; wrangler.toml cron triggers call armCron() as
 * a keep-alive in case DO storage is wiped.
 *
 * The Bun runtime never imports this file.
 */
import { parseExpression } from "cron-parser";
import { drizzle } from "drizzle-orm/d1";
import { runWithDb, schemaExports } from "../db/schema";
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

  constructor(ctx: DurableObjectState, env: DOEnv) {
    this.ctx = ctx;
    this.env = env;
  }

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

  // ─── Alarm: claim + run one job, then re-arm ─────────────────────────────

  async alarm(): Promise<void> {
    this.initSchema();
    const name = await this.ctx.storage.get<string>("name");
    if (!name) return;

    const now = new Date().toISOString();
    const rows = this.ctx.storage.sql
      .exec(
        "SELECT id, name, data, attempts, max_attempts FROM jobs WHERE status = 'pending' AND run_at <= ? ORDER BY run_at ASC LIMIT 1",
        now,
      )
      .toArray() as Pick<DOJobRow, "id" | "name" | "data" | "attempts" | "max_attempts">[];

    if (rows.length === 0) {
      await this.scheduleNextAlarm();
      return;
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
      if (name === "cleanup") {
        await runWithCache(cache, () => runWithDb(db, () => this.runCleanup()));
      } else {
        const handler = handlers[name];
        if (!handler) {
          log.warn("Unknown job type, marking failed", { name, jobId: job.id });
          this.ctx.storage.sql.exec(
            "UPDATE jobs SET status = 'failed', error = ?, completed_at = ? WHERE id = ?",
            `Unknown job type: ${name}`,
            new Date().toISOString(),
            job.id,
          );
          await this.scheduleNextAlarm();
          return;
        }
        log.info("Running job", { name, jobId: job.id });
        await runWithCache(cache, () => runWithDb(db, () => handler(job.data)));
      }

      this.ctx.storage.sql.exec(
        "UPDATE jobs SET status = 'completed', completed_at = ? WHERE id = ?",
        new Date().toISOString(),
        job.id,
      );
      log.info("Completed job", { name, jobId: job.id });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const newAttempts = job.attempts + 1;

      if (newAttempts < job.max_attempts) {
        // Exponential backoff: 2^attempts × 30 s — mirrors processor.ts:264
        const delaySec = Math.pow(2, newAttempts) * 30;
        const retryAt = new Date(Date.now() + delaySec * 1000).toISOString();
        this.ctx.storage.sql.exec(
          "UPDATE jobs SET status = 'pending', error = ?, run_at = ? WHERE id = ?",
          message,
          retryAt,
          job.id,
        );
        log.warn("Job failed, will retry", { name, jobId: job.id, attempt: newAttempts, retryAt, err });
      } else {
        this.ctx.storage.sql.exec(
          "UPDATE jobs SET status = 'failed', error = ?, completed_at = ? WHERE id = ?",
          message,
          new Date().toISOString(),
          job.id,
        );
        log.error("Job failed permanently", { name, jobId: job.id, attempts: newAttempts, err });
      }
    }

    await this.scheduleNextAlarm();
  }

  // ─── Internal methods (also used by tests via subclass) ──────────────────

  /** Arm this DO as a cron singleton. Stores name + cron, sets first alarm. */
  async armCron(name: string, cron: string): Promise<void> {
    this.initSchema();
    await this.ctx.storage.put("name", name);
    await this.ctx.storage.put("cron", cron);
    await this.scheduleNextAlarm(cron);
  }

  /** Insert a job row and schedule an immediate alarm. */
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

    // Schedule alarm as soon as possible (CF dedupes alarms within a DO)
    const currentAlarm = await this.ctx.storage.getAlarm();
    if (currentAlarm === null || currentAlarm > Date.now() + 1000) {
      await this.ctx.storage.setAlarm(Date.now());
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
    let nextRun: string | null = null;
    if (cron) {
      try {
        nextRun = parseExpression(cron).next().toDate().toISOString();
      } catch {
        // invalid expression
      }
    }
    const lastRows = this.ctx.storage.sql
      .exec(
        "SELECT completed_at FROM jobs WHERE status IN ('completed', 'failed') ORDER BY id DESC LIMIT 1",
      )
      .toArray() as Array<{ completed_at: string | null }>;
    return { cron, nextRun, lastRun: lastRows[0]?.completed_at ?? null };
  }

  // ─── Private helpers ─────────────────────────────────────────────────────

  private async scheduleNextAlarm(cron?: string): Promise<void> {
    const cronExpr = cron ?? (await this.ctx.storage.get<string>("cron")) ?? null;
    if (cronExpr) {
      const next = parseExpression(cronExpr).next().toDate().getTime();
      await this.ctx.storage.setAlarm(next);
      return;
    }
    // Ad-hoc DO: re-arm only if there are still pending jobs
    const rows = this.ctx.storage.sql
      .exec("SELECT COUNT(*) as count FROM jobs WHERE status = 'pending'")
      .toArray() as Array<{ count: number }>;
    if ((rows[0]?.count ?? 0) > 0) {
      await this.ctx.storage.setAlarm(Date.now());
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
