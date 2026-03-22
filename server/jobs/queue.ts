import { parseExpression } from "cron-parser";
import { getRawDb } from "../db/bun-db";
import { logger } from "../logger";

const log = logger.child({ module: "jobs" });

// ─── Types ──────────────────────────────────────────────────────────────────

export type JobStatus = "pending" | "running" | "completed" | "failed";

export interface Job {
  id: number;
  name: string;
  data: string | null;
  status: JobStatus;
  attempts: number;
  max_attempts: number;
  error: string | null;
  run_at: string;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
}

export interface CronJob {
  name: string;
  cron: string;
  last_run: string | null;
  next_run: string;
  enabled: number;
}

export type JobHandler = (job: Job) => Promise<void>;

// ─── Cron Expression Parser ─────────────────────────────────────────────────

export function getNextCronDate(cron: string, after: Date = new Date()): Date {
  try {
    const interval = parseExpression(cron, { currentDate: after });
    return interval.next().toDate();
  } catch {
    throw new Error(`Invalid cron expression: ${cron}`);
  }
}

// ─── Queue Operations ───────────────────────────────────────────────────────

export function enqueueJob(
  name: string,
  data?: Record<string, unknown>,
  options?: { runAt?: Date; maxAttempts?: number }
): number {
  const db = getRawDb();
  const runAt = (options?.runAt ?? new Date()).toISOString();
  const maxAttempts = options?.maxAttempts ?? 3;
  const dataStr = data ? JSON.stringify(data) : null;

  const result = db
    .prepare(
      "INSERT INTO jobs (name, data, run_at, max_attempts) VALUES (?, ?, ?, ?)"
    )
    .run(name, dataStr, runAt, maxAttempts);

  return Number(result.lastInsertRowid);
}

export function claimNextJob(name: string): Job | null {
  const db = getRawDb();
  const now = new Date().toISOString();

  // Atomically claim one pending job that's ready to run
  const row = db
    .prepare(
      `UPDATE jobs
       SET status = 'running', started_at = ?, attempts = attempts + 1
       WHERE id = (
         SELECT id FROM jobs
         WHERE name = ? AND status = 'pending' AND run_at <= ?
         ORDER BY run_at ASC
         LIMIT 1
       )
       RETURNING *`
    )
    .get(now, name, now) as Job | null;

  return row;
}

export function completeJob(id: number) {
  const db = getRawDb();
  db.prepare(
    "UPDATE jobs SET status = 'completed', completed_at = datetime('now') WHERE id = ?"
  ).run(id);
}

export function failJob(id: number, error: string) {
  const db = getRawDb();
  const job = db.prepare("SELECT * FROM jobs WHERE id = ?").get(id) as Job;

  if (job && job.attempts < job.max_attempts) {
    // Re-queue with exponential backoff: 2^attempts * 30 seconds
    const delaySec = Math.pow(2, job.attempts) * 30;
    db.prepare(
      `UPDATE jobs SET status = 'pending', error = ?,
       run_at = datetime('now', '+' || ? || ' seconds')
       WHERE id = ?`
    ).run(error, delaySec, id);
  } else {
    db.prepare(
      "UPDATE jobs SET status = 'failed', error = ?, completed_at = datetime('now') WHERE id = ?"
    ).run(error, id);
  }
}

export function cleanupOldJobs(retentionDays: number = 30) {
  const db = getRawDb();
  const result = db
    .prepare(
      `DELETE FROM jobs
       WHERE status IN ('completed', 'failed')
       AND completed_at < datetime('now', '-' || ? || ' days')`
    )
    .run(retentionDays);
  return result.changes;
}

// Reset jobs that were left running (e.g., after a crash)
export function recoverStaleJobs(staleMinutes: number = 30) {
  const db = getRawDb();
  const result = db
    .prepare(
      `UPDATE jobs SET status = 'pending', error = 'Recovered after stale timeout'
       WHERE status = 'running'
       AND started_at < datetime('now', '-' || ? || ' minutes')`
    )
    .run(staleMinutes);
  if (result.changes > 0) {
    log.info("Recovered stale jobs", { count: result.changes });
  }
}

export function getJobStats(): Record<string, { pending: number; running: number; completed: number; failed: number }> {
  const db = getRawDb();
  const rows = db
    .prepare(
      `SELECT name, status, COUNT(*) as count FROM jobs GROUP BY name, status`
    )
    .all() as { name: string; status: JobStatus; count: number }[];

  const stats: Record<string, { pending: number; running: number; completed: number; failed: number }> = {};
  for (const row of rows) {
    if (!stats[row.name]) {
      stats[row.name] = { pending: 0, running: 0, completed: 0, failed: 0 };
    }
    stats[row.name][row.status] = row.count;
  }
  return stats;
}

// ─── Cron Registration ──────────────────────────────────────────────────────

export function registerCron(name: string, cron: string) {
  const db = getRawDb();
  const nextRun = getNextCronDate(cron).toISOString();

  db.prepare(
    `INSERT INTO cron_jobs (name, cron, next_run)
     VALUES (?, ?, ?)
     ON CONFLICT(name) DO UPDATE SET cron = excluded.cron, next_run = excluded.next_run`
  ).run(name, cron, nextRun);

  log.info("Registered cron", { name, cron, nextRun });
}

export function tickCrons() {
  const db = getRawDb();
  const now = new Date().toISOString();

  const dueCrons = db
    .prepare(
      "SELECT * FROM cron_jobs WHERE enabled = 1 AND next_run <= ?"
    )
    .all(now) as CronJob[];

  for (const cron of dueCrons) {
    // Check if there's already a pending/running job for this cron
    const existing = db
      .prepare(
        "SELECT id FROM jobs WHERE name = ? AND status IN ('pending', 'running') LIMIT 1"
      )
      .get(cron.name);

    if (!existing) {
      enqueueJob(cron.name);
      log.info("Cron enqueued", { name: cron.name });
    }

    // Advance to next run
    const nextRun = getNextCronDate(cron.cron, new Date()).toISOString();
    db.prepare(
      "UPDATE cron_jobs SET last_run = ?, next_run = ? WHERE name = ?"
    ).run(now, nextRun, cron.name);
  }
}

export function getCronExpression(name: string): string | null {
  const db = getRawDb();
  const row = db
    .prepare("SELECT cron FROM cron_jobs WHERE name = ? AND enabled = 1")
    .get(name) as { cron: string } | null;
  return row?.cron ?? null;
}

export function getCronJobs(): CronJob[] {
  const db = getRawDb();
  return db.prepare("SELECT * FROM cron_jobs ORDER BY name").all() as CronJob[];
}

export function getRecentJobs(limit: number = 20): Job[] {
  const db = getRawDb();
  return db
    .prepare(
      `SELECT * FROM jobs ORDER BY id DESC LIMIT ?`
    )
    .all(limit) as Job[];
}
