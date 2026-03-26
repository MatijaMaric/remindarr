/**
 * Platform-agnostic Sentry wrapper.
 *
 * On Bun, re-exports @sentry/bun. On Cloudflare Workers, re-exports
 * @sentry/cloudflare. If neither is available, provides no-op stubs so the
 * rest of the codebase can import Sentry unconditionally without crashing.
 */

interface SentryLike {
  captureException(err: unknown): string;
  startSpan<T>(opts: { name: string; op?: string; attributes?: Record<string, string> }, fn: () => T): T;
  withMonitor<T>(monitorSlug: string, fn: () => Promise<T>, config?: unknown): Promise<T>;
  flush(timeoutMs?: number): Promise<boolean>;
  init(opts: Record<string, unknown>): void;
  honoIntegration(): Record<string, unknown>;
  setupHonoErrorHandler?(...args: unknown[]): void;
  [key: string]: unknown;
}

const noopSentry: SentryLike = {
  captureException: () => "",
  startSpan: (_opts, fn) => fn(),
  withMonitor: (_slug, fn) => fn(),
  flush: () => Promise.resolve(true),
  init: () => {},
  honoIntegration: () => ({}),
};

let sentry: SentryLike;

try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  sentry = require("@sentry/bun");
} catch {
  try {
    // Cloudflare Workers: @sentry/bun isn't available, use @sentry/cloudflare
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    sentry = require("@sentry/cloudflare");
  } catch {
    sentry = noopSentry;
  }
}

export default sentry;
