import { Logger } from "../logger";

/**
 * Directive returned from {@link SyncEachOptions.onError} to control how
 * a per-item failure is handled.
 *
 * - `"stop"` — abort the loop immediately (no further items processed).
 * - `"continue"` (or `undefined`) — record the failure in the `failures`
 *   array and proceed to the next item.
 * - An object `{ result: R }` — treat the failure as a success and use the
 *   provided value for the result list. Useful when callers want to fall
 *   back to a degraded value instead of dropping the item.
 */
export type SyncEachErrorAction<R> =
  | "stop"
  | "continue"
  | { result: R }
  | void;

export interface SyncEachOptions<T, R> {
  /** Milliseconds to wait between items. Set to 0 to disable. */
  delayMs: number;
  /** Per-item async worker. */
  onItem: (item: T) => Promise<R>;
  /** Short label included in default error log messages. */
  label: string;
  /**
   * Child logger. The helper does NOT add bindings — callers should
   * pass a child that already includes `module`/`label` context so all
   * log lines from the loop can be correlated.
   */
  log: Logger;
  /**
   * Number of items to process in parallel. Defaults to 1 (sequential).
   * When > 1, items are scheduled across a fixed-size worker pool and the
   * delay is observed before each item dispatch.
   */
  concurrency?: number;
  /**
   * Optional error handler. Return value controls loop behavior; see
   * {@link SyncEachErrorAction}. If omitted, the helper logs an error
   * and pushes the item into `failures`.
   */
  onError?: (err: unknown, item: T) => SyncEachErrorAction<R>;
}

export interface SyncEachResult<T, R> {
  results: R[];
  failures: Array<{ item: T; error: unknown }>;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Run `onItem` for each entry in `items` with an inter-item delay and
 * per-item error isolation. Centralizes the
 * "iterate → delay → try/catch → log → continue" pattern used across
 * the various TMDB / Plex / streaming-availability sync paths.
 *
 * Sequential semantics (concurrency = 1, the default):
 *   for each item:
 *     try onItem(item)
 *     handle error via onError or default (log + push to failures)
 *     await delay(delayMs) before next item
 *
 * Parallel semantics (concurrency > 1):
 *   A simple worker pool drains the items array. Each worker calls
 *   onItem then awaits the delay before picking the next item, matching
 *   the "rate limit between requests" intent of the original loops. If
 *   any worker observes an `onError` returning `"stop"`, the shared
 *   stop flag halts further dispatch.
 */
export async function syncEachWithDelay<T, R>(
  items: T[],
  opts: SyncEachOptions<T, R>,
): Promise<SyncEachResult<T, R>> {
  const { delayMs, onItem, label, log, onError } = opts;
  const concurrency = Math.max(1, opts.concurrency ?? 1);

  const results: R[] = [];
  const failures: Array<{ item: T; error: unknown }> = [];
  let stopped = false;

  const handleItem = async (item: T): Promise<void> => {
    if (stopped) return;
    try {
      const value = await onItem(item);
      results.push(value);
    } catch (err) {
      const action = onError ? onError(err, item) : undefined;
      if (action === "stop") {
        stopped = true;
        return;
      }
      if (action && typeof action === "object" && "result" in action) {
        results.push(action.result);
        return;
      }
      if (!onError) {
        log.error(`${label} item failed`, { err });
      }
      failures.push({ item, error: err });
    }
  };

  if (concurrency === 1) {
    for (const item of items) {
      if (stopped) break;
      await handleItem(item);
      if (stopped) break;
      if (delayMs > 0) await delay(delayMs);
    }
    return { results, failures };
  }

  // Worker-pool: shared queue index, each worker pulls items until exhausted.
  let nextIndex = 0;
  const worker = async (): Promise<void> => {
    while (!stopped) {
      const i = nextIndex++;
      if (i >= items.length) return;
      await handleItem(items[i]);
      if (stopped) return;
      if (delayMs > 0) await delay(delayMs);
    }
  };
  const workers: Promise<void>[] = [];
  for (let i = 0; i < concurrency; i++) workers.push(worker());
  await Promise.all(workers);

  return { results, failures };
}
