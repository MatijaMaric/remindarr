import * as Sentry from "@sentry/bun";

/**
 * Wraps a synchronous DB operation in a Sentry span.
 */
export function traceDbQuery<T>(operation: string, fn: () => T): T {
  return Sentry.startSpan(
    {
      name: operation,
      op: "db.query",
      attributes: { "db.system": "sqlite" },
    },
    fn
  );
}

/**
 * Wraps an async outbound HTTP call in a Sentry span.
 */
export function traceHttp<T>(method: string, url: string, fn: () => Promise<T>): Promise<T> {
  const parsedUrl = new URL(url);
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
    fn
  );
}
