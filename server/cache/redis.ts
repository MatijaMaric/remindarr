import type { Cache } from "./types";
import { logger } from "../logger";

const log = logger.child({ module: "cache-redis" });

/**
 * Redis-backed distributed cache.
 * Requires the `ioredis` package to be installed (`bun add ioredis`).
 */
export class RedisCache implements Cache {
  private client: any;
  private ready: Promise<void>;

  constructor(redisUrl: string) {
    this.ready = this.connect(redisUrl);
  }

  private async connect(url: string): Promise<void> {
    try {
      // Dynamic import — ioredis is an optional dependency
      const mod = await import(/* webpackIgnore: true */ "ioredis" as string);
      const Redis = mod.default ?? mod;
      this.client = new Redis(url, { lazyConnect: false, maxRetriesPerRequest: 3 });
      this.client.on("error", (err: Error) => {
        log.error("Redis connection error", { error: err.message });
      });
      log.info("Redis cache connected");
    } catch {
      throw new Error(
        "Failed to initialize Redis cache. Install ioredis: bun add ioredis",
      );
    }
  }

  async get<T = unknown>(key: string): Promise<T | null> {
    await this.ready;
    const value = await this.client.get(key);
    if (value === null) return null;
    try {
      return JSON.parse(value) as T;
    } catch {
      return null;
    }
  }

  async set(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    await this.ready;
    await this.client.setex(key, ttlSeconds, JSON.stringify(value));
  }

  async delete(key: string): Promise<void> {
    await this.ready;
    await this.client.del(key);
  }

  async close(): Promise<void> {
    await this.ready;
    if (this.client) {
      await this.client.quit();
      log.info("Redis cache disconnected");
    }
  }
}
