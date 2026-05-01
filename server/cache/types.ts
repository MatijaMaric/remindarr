/**
 * Cache interface for distributed caching across backends.
 *
 * Implementations:
 * - MemoryCache: in-memory with TTL (default, single-instance)
 * - RedisCache: Redis-backed (self-hosted distributed)
 * - CloudflareKvCache: CF Workers KV (Cloudflare deployment)
 */
export interface Cache {
  /** Get a cached value by key. Returns null on miss or expired. */
  get<T = unknown>(key: string): Promise<T | null>;
  /** Set a value with a TTL in seconds. */
  set(key: string, value: unknown, ttlSeconds: number): Promise<void>;
  /** Delete a cached key. */
  delete(key: string): Promise<void>;
  /** Clear all cached entries without closing the cache (flush). */
  flush?(): Promise<void>;
  /** Optional cleanup (close connections, clear timers). */
  close?(): Promise<void>;
}
