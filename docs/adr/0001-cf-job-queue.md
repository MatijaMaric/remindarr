# ADR 0001 — Cloudflare Workers Job Queue Architecture

## Status

Accepted (2026-04-27)

## Context

Remindarr runs background jobs (TMDB sync, notifications, offer backfill) on two runtimes:

- **Bun** (self-hosted Docker): long-lived process with `setInterval` polling, raw `bun:sqlite`, in-memory handler registry.
- **Cloudflare Workers** (managed hosting): stateless isolates; no long-lived process; no `bun:sqlite`.

On CF, jobs need persistent scheduling and a durable claim mechanism. Issue #487 identified four candidate architectures.

## Alternatives Evaluated

### Option 1 — D1 Optimistic Locking (shipped in #596)

Each scheduled invocation and each `fetch` handler calls `processPendingJobs()`, which SELECT+UPDATEs rows using an atomic CAS clause (`WHERE status = 'pending' RETURNING id`). Cron dedup uses a non-atomic SELECT-then-INSERT.

**Pros:** No new infrastructure. Tiny diff.
**Cons:** Poll-and-race pattern. Every fetch isolate competes for the same rows. No FIFO within a job name. Cron dedup has a non-atomic window (fixed by the single-writer DO below). D1 round-trips: 2 reads + 1 write per claim attempt.

### Option 2 — Durable Objects (selected, implemented in #597)

One DO instance per job name (for cron singletons) or `${name}:${partitionKey}` (for ad-hoc sharded jobs). DO Alarms drive execution; the Worker's `scheduled()` handler `arm()`s the alarm on each cron tick as a keep-alive.

**Pros:** Single-writer guarantee → at-most-once execution without CAS. FIFO within a partition. Cron dedup is implicit (one DO per name). Stale-job recovery is per-DO. Cost: 1 DO RPC per enqueue.
**Cons:** New infrastructure class. More code. DO SQLite storage is separate from D1 (admin stats require fan-out). Partitioned ad-hoc DOs are not enumerable without a registry.

### Option 3 — Cloudflare Queues

Purpose-built message queue. Enqueue returns immediately; a `queue()` Consumer handles the message.

**Pros:** Simple producer/consumer model. Automatic retry with DLQ. No schema management.
**Cons:** Does not subsume the cron scheduling layer (still need `scheduled()` + dedup). Different programming model from the Bun side. No per-name isolation without routing logic. Requires separate Consumer binding.

### Option 4 — Bun-only Execution via Webhook

CF Worker receives a request and forwards job execution to a Bun instance via an internal HTTP call.

**Pros:** No CF job logic at all.
**Cons:** Requires a reachable Bun endpoint (breaks pure CF hosting). Not a real fix; just avoids the problem.

## Decision

**Durable Objects (Option 2)**, feature-flagged behind `JOB_QUEUE_BACKEND` (`"d1"` default, `"durable-object"` opt-in).

The decisive factors:
- A job queue is canonically a "single-writer over shared state" problem, the exact use case DOs were designed for.
- DO Alarms provide the cron scheduling layer: `armCron(name, expr)` stores the cron expression and sets the first alarm; `alarm()` re-arms itself. The `wrangler.toml` cron triggers remain as a durable keep-alive (`arm()` is idempotent).
- The existing `handlers` dispatch map (`server/jobs/processor.ts`) is reused unchanged by the DO's `alarm()` handler, keeping a single source of truth for job logic.

## Architecture

### DO Identity

| Job type | DO name |
|---|---|
| Cron singleton | `idFromName("sync-titles")` |
| Partitioned ad-hoc | `idFromName("sync-show-episodes:42")` |

Partition key per job name:
- `sync-show-episodes` → `data.titleId`
- `backfill-title-offers` → `data.tmdbId`
- All others → singleton (no partition)

### DO Local Schema

```sql
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
```

### Fairness / Reliability Comparison

| Property | D1 optimistic (Option 1) | DO (Option 2, selected) |
|---|---|---|
| At-most-once execution | Best-effort CAS retry | Guaranteed (single writer) |
| FIFO within job name | No | Yes (per-partition) |
| Cross-name isolation | No (shared table) | Yes (one DO per name) |
| Cron dedup | App-level SELECT-then-INSERT (non-atomic window) | Implicit (one DO instance) |
| Stale recovery | Global `UPDATE ... WHERE started_at <` | Per-DO alarm on next tick |
| Cost per claim | 2 D1 reads + 1 D1 write | 1 DO fetch RPC |

### Backend Dispatcher

`server/jobs/backend.ts` provides a single API consumed by `worker.ts` and routes. It dispatches to D1 or DO based on `CONFIG.JOB_QUEUE_BACKEND`.

### Cleanup Job

The existing `0 0 * * *` cleanup (previously inline in `scheduled()`) is converted to a `cleanup` job name. In D1 mode its handler calls `deleteExpiredSessions()` + `cleanupOldJobs(30)`. In DO mode the cleanup DO's `alarm()` calls `deleteExpiredSessions()` (via ALS-bound D1) and fans out `cleanup(30)` to each cron-singleton DO.

### Stats / Admin UI

`GET /api/jobs` under DO mode fans out to the four cron-singleton DOs (`sync-titles`, `sync-episodes`, `sync-deep-links`, `send-notifications`) in parallel and aggregates `getStats()` and `getRecentJobs(5)` results. Partitioned ad-hoc DOs are intentionally excluded — their state is ephemeral and the admin UI is cron-focused.

## Cutover Playbook

1. Deploy the code with `JOB_QUEUE_BACKEND` unset (defaults to `"d1"`). Verify existing behaviour unchanged.
2. Set `wrangler secret put JOB_QUEUE_BACKEND durable-object`.
3. On the next `scheduled()` trigger, each cron DO is armed.
4. Any D1 `jobs` rows still in `pending` or `running` at cutover are a known gap:
   - Cron jobs: re-enqueued on the next cron tick (max wait: 24 h for daily syncs, 5 min for notifications).
   - Ad-hoc jobs (`sync-show-episodes`, `backfill-title-offers`): re-triggered by the next user action (re-track, etc.).
   - Operators can `UPDATE jobs SET status = 'failed' WHERE status IN ('pending','running')` on D1 after the flip to clean up the old table.
5. Rollback: `wrangler secret put JOB_QUEUE_BACKEND d1`.

## Consequences

- The D1 `jobs` table is preserved. Under DO mode it is not used for job execution but remains for schema compat (Bun still uses it).
- `server/jobs/queue.ts` and the Bun worker are fully untouched.
- `wrangler.toml` gains `[[durable_objects.bindings]]` and `[[migrations]] new_sqlite_classes = ["JobQueueDO"]`.
- Compatibility date `2024-12-01` already satisfies the DO-SQLite requirement (`>= 2024-09-01`).
- The existing `sync-plex-library` CF gap (no handler in processor.ts) is preserved — that job is Bun-only and silently fails if enqueued on CF.
