import Sentry from "./sentry";
import { dbQueryDurationSeconds, tmdbRequestsTotal, tmdbRequestDurationSeconds } from "./metrics";

/**
 * Wraps a DB operation in a Sentry span and records query duration metrics.
 * Supports both sync (bun:sqlite) and async (D1) return types.
 */
export function traceDbQuery<T>(operation: string, fn: () => T): T {
  const start = performance.now();
  const result = Sentry.startSpan(
    {
      name: operation,
      op: "db.query",
      attributes: { "db.system": "sqlite" },
    },
    fn
  );
  const r = result as unknown;
  if (r instanceof Promise) {
    // Side-effect: record duration when the promise settles (does not alter return type)
    void r.then(
      () => dbQueryDurationSeconds.observe({ operation }, (performance.now() - start) / 1000),
      () => dbQueryDurationSeconds.observe({ operation }, (performance.now() - start) / 1000),
    );
    return result;
  }
  dbQueryDurationSeconds.observe({ operation }, (performance.now() - start) / 1000);
  return result;
}

/**
 * Wraps an async outbound HTTP call in a Sentry span and records TMDB metrics.
 */
export function traceHttp<T>(method: string, url: string, fn: () => Promise<T>): Promise<T> {
  const parsedUrl = new URL(url);
  const start = performance.now();
  return Sentry.startSpan(
    {
      name: `${method} ${parsedUrl.pathname}`,
      op: "http.client",
      attributes: {
        "http.method": method,
        "http.url": url,
        "server.address": parsedUrl.hostname,
      },
    },
    async () => {
      try {
        const result = await fn();
        tmdbRequestsTotal.inc({ method, status: "success" });
        tmdbRequestDurationSeconds.observe({ method }, (performance.now() - start) / 1000);
        return result;
      } catch (err) {
        tmdbRequestsTotal.inc({ method, status: "error" });
        tmdbRequestDurationSeconds.observe({ method }, (performance.now() - start) / 1000);
        throw err;
      }
    }
  );
}
