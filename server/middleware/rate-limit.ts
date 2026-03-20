import { createMiddleware } from "hono/factory";
import type { AppEnv } from "../types";
import { logger } from "../logger";

const log = logger.child({ module: "rate-limit" });

interface TokenBucket {
  tokens: number;
  lastRefill: number;
}

interface RateLimitOptions {
  /** Maximum number of requests allowed in the window */
  limit: number;
  /** Window duration in milliseconds */
  windowMs: number;
  /** Function to derive a key from the request (defaults to x-forwarded-for or "anonymous") */
  keyGenerator?: (c: { req: { header: (name: string) => string | undefined } }) => string;
}

/**
 * In-memory token bucket rate limiter.
 * Each call creates an independent store, so different routes can have different limits.
 */
export function rateLimiter(options: RateLimitOptions) {
  const { limit, windowMs } = options;
  const keyGenerator =
    options.keyGenerator ??
    ((c) => c.req.header("x-forwarded-for") ?? "anonymous");

  const buckets = new Map<string, TokenBucket>();
  let lastCleanup = Date.now();

  return createMiddleware<AppEnv>(async (c, next) => {
    const key = keyGenerator(c);
    const now = Date.now();

    // Lazy cleanup of stale buckets to prevent memory leaks
    if (now - lastCleanup > windowMs * 2) {
      for (const [k, bucket] of buckets) {
        if (now - bucket.lastRefill > windowMs * 2) {
          buckets.delete(k);
        }
      }
      lastCleanup = now;
    }

    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { tokens: limit, lastRefill: now };
      buckets.set(key, bucket);
    }

    // Refill tokens based on elapsed time
    const elapsed = now - bucket.lastRefill;
    const tokensToAdd = (elapsed / windowMs) * limit;
    bucket.tokens = Math.min(limit, bucket.tokens + tokensToAdd);
    bucket.lastRefill = now;

    if (bucket.tokens < 1) {
      log.warn("Rate limit exceeded", { key, path: c.req.path });
      c.header("Retry-After", String(Math.ceil(windowMs / 1000)));
      return c.json({ error: "Too many requests" }, 429);
    }

    bucket.tokens -= 1;
    await next();
  });
}
