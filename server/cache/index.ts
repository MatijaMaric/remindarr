import { AsyncLocalStorage } from "node:async_hooks";
import type { Cache } from "./types";
import { MemoryCache } from "./memory";
import { CONFIG } from "../config";
import { logger } from "../logger";

const log = logger.child({ module: "cache" });

const cacheStorage = new AsyncLocalStorage<Cache>();
let singletonCache: Cache | null = null;

/** Set the singleton cache instance (Bun startup). */
export function initCache(cache: Cache): void {
  singletonCache = cache;
}

/** Run a function with a per-request cache (CF Workers). */
export function runWithCache<T>(cache: Cache, fn: () => T): T {
  return cacheStorage.run(cache, fn);
}

/** Get the current cache instance (ALS → singleton). */
export function getCache(): Cache {
  const alsCache = cacheStorage.getStore();
  if (alsCache) return alsCache;
  if (singletonCache) return singletonCache;
  throw new Error("Cache not initialized. Call initCache() or use runWithCache().");
}

/**
 * Create a cache instance based on CONFIG.CACHE_BACKEND.
 * - "memory": in-memory with TTL (default)
 * - "redis": Redis-backed (requires ioredis + REDIS_URL)
 * - "kv": Cloudflare KV (must be created externally via KV binding)
 */
export async function createCache(): Promise<Cache> {
  const backend = CONFIG.CACHE_BACKEND;

  switch (backend) {
    case "redis": {
      if (!CONFIG.REDIS_URL) {
        throw new Error("CACHE_BACKEND=redis requires REDIS_URL to be set");
      }
      const { RedisCache } = await import("./redis");
      const cache = new RedisCache(CONFIG.REDIS_URL);
      log.info("Cache initialized", { backend: "redis" });
      return cache;
    }
    case "kv":
      throw new Error(
        "CACHE_BACKEND=kv is only valid for Cloudflare Workers. Use the KV binding directly.",
      );
    case "memory":
    default: {
      const cache = new MemoryCache(CONFIG.CACHE_MAX_MEMORY_ENTRIES);
      log.info("Cache initialized", { backend: "memory" });
      return cache;
    }
  }
}

export type { Cache } from "./types";
