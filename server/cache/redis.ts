import type { Cache } from "./types";
import { logger } from "../logger";

const log = logger.child({ module: "cache-redis" });

/**
 * Minimal structural type for the subset of the ioredis client we use.
 * ioredis is loaded via dynamic import (optional dependency), so we describe
 * only the methods we call rather than depending on the ioredis types.
 */
interface RedisClient {
  get(key: string): Promise<string | null>;
  setex(key: string, ttlSeconds: number, value: string): Promise<unknown>;
  del(key: string): Promise<unknown>;
  quit(): Promise<unknown>;
  on(event: "error", listener: (err: Error) => void): unknown;
}

interface RedisConstructor {
  new (
    url: string,
    options?: { lazyConnect?: boolean; maxRetriesPerRequest?: number },
  ): RedisClient;
}

/**
 * Redis-backed distributed cache.
 * Requires the `ioredis` package to be installed (`bun add ioredis`).
 */
export class RedisCache implements Cache {
  private client: RedisClient | null = null;
  private ready: Promise<void>;

  constructor(redisUrl: string) {
    this.ready = this.connect(redisUrl);
  }

  private async connect(url: string): Promise<void> {
    try {
      // Dynamic import — ioredis is an optional dependency
      const mod = (await import(/* webpackIgnore: true */ "ioredis" as string)) as {
        default?: RedisConstructor;
      } & RedisConstructor;
      const Redis: RedisConstructor = mod.default ?? mod;
      const client = new Redis(url, { lazyConnect: false, maxRetriesPerRequest: 3 });
      client.on("error", (err: Error) => {
        log.error("Redis connection error", { error: err.message });
      });
      this.client = client;
      log.info("Redis cache connected");
    } catch {
      throw new Error(
        "Failed to initialize Redis cache. Install ioredis: bun add ioredis",
      );
    }
  }

  async get<T = unknown>(key: string): Promise<T | null> {
    await this.ready;
    if (!this.client) return null;
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
    if (!this.client) return;
    await this.client.setex(key, ttlSeconds, JSON.stringify(value));
  }

  async delete(key: string): Promise<void> {
    await this.ready;
    if (!this.client) return;
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
