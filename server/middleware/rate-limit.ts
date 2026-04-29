import { createMiddleware } from "hono/factory";
import type { AppEnv } from "../types";
import { logger } from "../logger";

const log = logger.child({ module: "rate-limit" });

// ─── Store interface ────────────────────────────────────────────────────────

export interface RateLimitStore {
  /** Consume one request token. Returns whether the request is allowed. */
  consume(
    key: string,
    limit: number,
    windowMs: number,
    now: number,
  ): Promise<{ allowed: boolean; retryAfterMs: number }>;
}

// ─── In-memory token-bucket store (Bun) ────────────────────────────────────

interface TokenBucket {
  tokens: number;
  lastRefill: number;
}

export class MemoryRateLimitStore implements RateLimitStore {
  private readonly buckets = new Map<string, TokenBucket>();
  private readonly cleanupTimer: ReturnType<typeof setInterval>;

  constructor(cleanupIntervalMs = 5 * 60 * 1000) {
    this.cleanupTimer = setInterval(() => {
      const now = Date.now();
      for (const [k, bucket] of this.buckets) {
        // Remove buckets that have been inactive for 2× the longest possible window.
        // We don't know windowMs per bucket, so use a generous 5-minute threshold.
        if (now - bucket.lastRefill > 5 * 60 * 1000) {
          this.buckets.delete(k);
        }
      }
    }, cleanupIntervalMs);

    if (typeof this.cleanupTimer === "object" && "unref" in this.cleanupTimer) {
      (this.cleanupTimer as NodeJS.Timeout).unref();
    }
  }

  async consume(
    key: string,
    limit: number,
    windowMs: number,
    now: number,
  ): Promise<{ allowed: boolean; retryAfterMs: number }> {
    let bucket = this.buckets.get(key);
    if (!bucket) {
      bucket = { tokens: limit, lastRefill: now };
      this.buckets.set(key, bucket);
    }

    const elapsed = now - bucket.lastRefill;
    const tokensToAdd = (elapsed / windowMs) * limit;
    bucket.tokens = Math.min(limit, bucket.tokens + tokensToAdd);
    bucket.lastRefill = now;

    if (bucket.tokens < 1) {
      const retryAfterMs = Math.ceil(((1 - bucket.tokens) / limit) * windowMs);
      return { allowed: false, retryAfterMs };
    }

    bucket.tokens -= 1;
    return { allowed: true, retryAfterMs: 0 };
  }

  /** Exposed for testing — allows direct inspection of the cleanup callback. */
  getCleanupTimer(): ReturnType<typeof setInterval> {
    return this.cleanupTimer;
  }

  /** For testing: expose bucket map to allow simulating stale entries. */
  getBuckets(): Map<string, TokenBucket> {
    return this.buckets;
  }
}

// ─── KV-backed fixed-window store (Cloudflare Workers) ─────────────────────

interface KVRecord {
  count: number;
  windowStart: number;
}

export class KvRateLimitStore implements RateLimitStore {
  constructor(private readonly kv: KVNamespace) {}

  async consume(
    key: string,
    limit: number,
    windowMs: number,
    now: number,
  ): Promise<{ allowed: boolean; retryAfterMs: number }> {
    const windowStart = Math.floor(now / windowMs) * windowMs;
    const kvKey = `rl:${key}:${windowStart}`;
    const ttlSeconds = Math.max(60, Math.ceil(windowMs / 1000));

    const raw = await this.kv.get(kvKey, "text");
    let record: KVRecord;
    if (raw !== null) {
      try {
        record = JSON.parse(raw) as KVRecord;
      } catch {
        record = { count: 0, windowStart };
      }
    } else {
      record = { count: 0, windowStart };
    }

    if (record.count >= limit) {
      const windowEnd = windowStart + windowMs;
      return { allowed: false, retryAfterMs: windowEnd - now };
    }

    record.count += 1;
    await this.kv.put(kvKey, JSON.stringify(record), { expirationTtl: ttlSeconds });
    return { allowed: true, retryAfterMs: 0 };
  }
}

// ─── Middleware factory ─────────────────────────────────────────────────────

interface RateLimitOptions {
  /** Shared store instance (MemoryRateLimitStore or KvRateLimitStore). */
  store: RateLimitStore;
  /** Bucket scope — buckets are keyed by `${scope}:${ip}`. Defaults to "global". */
  scope?: string;
  /** Maximum requests allowed per window. */
  limit: number;
  /** Window duration in milliseconds. */
  windowMs: number;
  /** Function to derive a key from the request (defaults to x-forwarded-for or "anonymous"). */
  keyGenerator?: (c: { req: { header: (name: string) => string | undefined } }) => string;
}

export function rateLimiter(options: RateLimitOptions) {
  const { store, limit, windowMs } = options;
  const scope = options.scope ?? "global";
  const keyGenerator =
    options.keyGenerator ??
    ((c) => c.req.header("x-forwarded-for") ?? "anonymous");

  return createMiddleware<AppEnv>(async (c, next) => {
    const ip = keyGenerator(c);
    const key = `${scope}:${ip}`;
    const now = Date.now();

    const { allowed, retryAfterMs } = await store.consume(key, limit, windowMs, now);

    if (!allowed) {
      log.info("Rate limit exceeded", { scope, ip, path: c.req.path });
      c.header("Retry-After", String(Math.ceil(retryAfterMs / 1000)));
      return c.json({ error: "Too many requests" }, 429);
    }

    await next();
  });
}
