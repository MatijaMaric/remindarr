import { Logger } from "../logger";
import { sleep } from "../lib/http";

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
export type SyncEachErrorAction<R> = "stop" | "continue" | { result: R } | void;

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

/**
 * Run `onItem` for each entry in `items` with an inter-item delay and
 * per-item error isolation. Centralizes the
 * "iterate → delay → try/catch → log → continue" pattern used across
 * the various TMDB / Plex / streaming-availability sync paths.
 *
 * Sequential semantics:
 *   for each item:
 *     try onItem(item)
 *     handle error via onError or default (log + push to failures)
 *     await sleep(delayMs) before next item
 */
export async function syncEachWithDelay<T, R>(
  items: T[],
  opts: SyncEachOptions<T, R>,
): Promise<SyncEachResult<T, R>> {
  const { delayMs, onItem, label, log, onError } = opts;

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

  for (const item of items) {
    if (stopped) break;
    await handleItem(item);
    if (stopped) break;
    if (delayMs > 0) await sleep(delayMs);
  }
  return { results, failures };
}
