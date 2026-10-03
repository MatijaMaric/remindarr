import { sql } from "drizzle-orm";
import { getDb, rateLimitBuckets } from "../db/schema";
import type { Context } from "hono";
import { routePath } from "hono/route";
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

  /** For testing: expose bucket map to allow simulating stale entries. */
  getBuckets(): Map<string, TokenBucket> {
    return this.buckets;
  }
}

// ─── SQL-backed fixed-window store (Cloudflare Workers) ─────────────────────

// D1 serializes each UPSERT: concurrent isolates cannot lose increments.
export class SqlRateLimitStore implements RateLimitStore {
  async consume(key: string, limit: number, windowMs: number, now: number) {
    const expiresAt = (Math.floor(now / windowMs) + 1) * windowMs;
    const row = await getDb()
      .insert(rateLimitBuckets)
      .values({ key, count: 1, expiresAt })
      .onConflictDoUpdate({
        target: rateLimitBuckets.key,
        set: {
          count: sql`CASE WHEN ${rateLimitBuckets.expiresAt} <= ${now} THEN 1 ELSE ${rateLimitBuckets.count} + 1 END`,
          expiresAt,
        },
      })
      .returning({ count: rateLimitBuckets.count })
      .get();
    if (!row) throw new Error("Missing rate-limit counter");
    return {
      allowed: row.count <= limit,
      retryAfterMs: row.count <= limit ? 0 : expiresAt - now,
    };
  }
}

export async function pruneRateLimits(now = Date.now()) {
  await getDb().run(
    sql`DELETE FROM rate_limit_buckets WHERE expires_at <= ${now}`,
  );
}

interface RateLimitOptions {
  /** Shared store instance (MemoryRateLimitStore or SqlRateLimitStore). */
  store: RateLimitStore;
  /** Bucket scope — buckets are keyed by `${scope}:${ip}`. Defaults to "global". */
  scope?: string;
  /** Maximum requests allowed per window. */
  limit: number;
  /** Window duration in milliseconds. */
  windowMs: number;
  /** Defaults to the client address established by the runtime adapter. */
  keyGenerator?: (c: Context<AppEnv>) => string;
}

export function rateLimiter(options: RateLimitOptions) {
  const { store, limit, windowMs } = options;
  const scope = options.scope ?? "global";
  const keyGenerator =
    options.keyGenerator ?? ((c) => c.get("clientIp") ?? "anonymous");

  return createMiddleware<AppEnv>(async (c, next) => {
    const ip = keyGenerator(c);
    const key = `${scope}:${ip}`;
    const now = Date.now();

    let allowed: boolean;
    let retryAfterMs: number;
    try {
      ({ allowed, retryAfterMs } = await store.consume(
        key,
        limit,
        windowMs,
        now,
      ));
    } catch (err) {
      log.warn("Rate limit store error", {
        scope,
        ip,
        path: routePath(c) || "<unmatched>",
        error: err instanceof Error ? err.message : String(err),
      });
      c.header("Retry-After", "60");
      return c.json({ error: "Rate limiting unavailable; please retry" }, 503);
    }

    if (!allowed) {
      log.info("Rate limit exceeded", {
        scope,
        ip,
        path: routePath(c) || "<unmatched>",
      });
      c.header("Retry-After", String(Math.ceil(retryAfterMs / 1000)));
      return c.json({ error: "Too many requests" }, 429);
    }

    await next();
  });
}
