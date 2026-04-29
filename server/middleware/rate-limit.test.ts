import { describe, it, expect, spyOn } from "bun:test";
import { Hono } from "hono";
import { rateLimiter, MemoryRateLimitStore, KvRateLimitStore } from "./rate-limit";
import type { AppEnv } from "../types";

// ─── MemoryRateLimitStore tests ─────────────────────────────────────────────

describe("MemoryRateLimitStore", () => {
  it("allows requests under the limit", async () => {
    const store = new MemoryRateLimitStore();
    const app = new Hono<AppEnv>();
    app.use("/test/*", rateLimiter({ store, limit: 3, windowMs: 60_000 }));
    app.get("/test/hello", (c) => c.json({ ok: true }));

    for (let i = 0; i < 3; i++) {
      const res = await app.request("/test/hello");
      expect(res.status).toBe(200);
    }
  });

  it("returns 429 when limit is exceeded", async () => {
    const store = new MemoryRateLimitStore();
    const app = new Hono<AppEnv>();
    app.use("/test/*", rateLimiter({ store, limit: 2, windowMs: 60_000 }));
    app.get("/test/hello", (c) => c.json({ ok: true }));

    await app.request("/test/hello");
    await app.request("/test/hello");

    const res = await app.request("/test/hello");
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error).toBe("Too many requests");
    expect(Number(res.headers.get("Retry-After"))).toBeGreaterThan(0);
  });

  it("uses x-forwarded-for to differentiate clients", async () => {
    const store = new MemoryRateLimitStore();
    const app = new Hono<AppEnv>();
    app.use("/test/*", rateLimiter({ store, limit: 1, windowMs: 60_000 }));
    app.get("/test/hello", (c) => c.json({ ok: true }));

    const res1 = await app.request("/test/hello", {
      headers: { "x-forwarded-for": "1.1.1.1" },
    });
    expect(res1.status).toBe(200);

    const res2 = await app.request("/test/hello", {
      headers: { "x-forwarded-for": "2.2.2.2" },
    });
    expect(res2.status).toBe(200);

    // First client is now rate limited
    const res3 = await app.request("/test/hello", {
      headers: { "x-forwarded-for": "1.1.1.1" },
    });
    expect(res3.status).toBe(429);
  });

  it("refills tokens over time", async () => {
    const store = new MemoryRateLimitStore();
    const app = new Hono<AppEnv>();
    app.use("/test/*", rateLimiter({ store, limit: 1, windowMs: 50 }));
    app.get("/test/hello", (c) => c.json({ ok: true }));

    const res1 = await app.request("/test/hello");
    expect(res1.status).toBe(200);

    const res2 = await app.request("/test/hello");
    expect(res2.status).toBe(429);

    // Wait for tokens to refill
    await new Promise((resolve) => setTimeout(resolve, 60));

    const res3 = await app.request("/test/hello");
    expect(res3.status).toBe(200);
  });

  it("sets up a periodic cleanup interval on initialization", () => {
    let capturedCallback: (() => void) | null = null;
    const originalSetInterval = globalThis.setInterval;
    const spy = spyOn(globalThis, "setInterval").mockImplementation(
      ((fn: TimerHandler, ms?: number) => {
        if (typeof fn === "function") capturedCallback = fn as () => void;
        return originalSetInterval(fn, ms);
      }) as typeof setInterval
    );

    new MemoryRateLimitStore(60_000);

    expect(spy).toHaveBeenCalledTimes(1);
    expect(capturedCallback).not.toBeNull();

    spy.mockRestore();
  });

  it("periodic cleanup removes stale buckets", async () => {
    let capturedCallback: (() => void) | null = null;
    const originalSetInterval = globalThis.setInterval;
    const spy = spyOn(globalThis, "setInterval").mockImplementation(
      ((fn: TimerHandler, ms?: number) => {
        if (typeof fn === "function") capturedCallback = fn as () => void;
        return originalSetInterval(fn, ms);
      }) as typeof setInterval
    );

    const store = new MemoryRateLimitStore(50);
    const app = new Hono<AppEnv>();
    app.use("/test/*", rateLimiter({ store, limit: 1, windowMs: 10 }));
    app.get("/test/hello", (c) => c.json({ ok: true }));

    spy.mockRestore();

    // Consume all tokens for a specific IP
    await app.request("/test/hello", { headers: { "x-forwarded-for": "5.5.5.5" } });
    const limited = await app.request("/test/hello", { headers: { "x-forwarded-for": "5.5.5.5" } });
    expect(limited.status).toBe(429);

    // Simulate time passing beyond the stale threshold (5 min from the store cleanup)
    // by reaching into the bucket map and backdating the entry
    const buckets = store.getBuckets();
    for (const [, bucket] of buckets) {
      bucket.lastRefill = Date.now() - 6 * 60 * 1000;
    }

    // Manually invoke the cleanup callback (simulating the interval firing)
    expect(capturedCallback).not.toBeNull();
    capturedCallback!();

    // After cleanup, the IP should get a fresh bucket and be allowed again
    const res = await app.request("/test/hello", { headers: { "x-forwarded-for": "5.5.5.5" } });
    expect(res.status).toBe(200);
  });

  it("supports custom keyGenerator", async () => {
    const store = new MemoryRateLimitStore();
    const app = new Hono<AppEnv>();
    app.use(
      "/test/*",
      rateLimiter({
        store,
        limit: 1,
        windowMs: 60_000,
        keyGenerator: () => "same-key",
      })
    );
    app.get("/test/hello", (c) => c.json({ ok: true }));

    const res1 = await app.request("/test/hello", {
      headers: { "x-forwarded-for": "1.1.1.1" },
    });
    expect(res1.status).toBe(200);

    // Different IP but same key → rate limited
    const res2 = await app.request("/test/hello", {
      headers: { "x-forwarded-for": "2.2.2.2" },
    });
    expect(res2.status).toBe(429);
  });
});

// ─── Cross-route enforcement tests ─────────────────────────────────────────

describe("rateLimiter — cross-route enforcement", () => {
  it("enforces shared budget across routes with same scope", async () => {
    const store = new MemoryRateLimitStore();
    const limiter = rateLimiter({ store, scope: "global", limit: 3, windowMs: 60_000 });
    const app = new Hono<AppEnv>();
    app.use("/api/*", limiter);
    app.get("/api/foo", (c) => c.json({ ok: true }));
    app.get("/api/bar", (c) => c.json({ ok: true }));

    const ip = { headers: { "x-forwarded-for": "9.9.9.9" } };

    const r1 = await app.request("/api/foo", ip);
    const r2 = await app.request("/api/bar", ip);
    const r3 = await app.request("/api/foo", ip);
    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
    expect(r3.status).toBe(200);

    // Budget exhausted — any route is now blocked
    const r4 = await app.request("/api/bar", ip);
    expect(r4.status).toBe(429);
  });

  it("isolates budgets across different scopes for the same store", async () => {
    const store = new MemoryRateLimitStore();
    const searchLimiter = rateLimiter({ store, scope: "search", limit: 2, windowMs: 60_000 });
    const browseLimiter = rateLimiter({ store, scope: "browse", limit: 2, windowMs: 60_000 });
    const app = new Hono<AppEnv>();
    app.use("/api/search", searchLimiter);
    app.use("/api/browse", browseLimiter);
    app.get("/api/search", (c) => c.json({ ok: true }));
    app.get("/api/browse", (c) => c.json({ ok: true }));

    const ip = { headers: { "x-forwarded-for": "8.8.8.8" } };

    // Exhaust search budget
    await app.request("/api/search", ip);
    await app.request("/api/search", ip);
    expect((await app.request("/api/search", ip)).status).toBe(429);

    // Browse budget is independent — should still allow
    expect((await app.request("/api/browse", ip)).status).toBe(200);
  });

  it("layers global cap on top of per-route cap", async () => {
    const store = new MemoryRateLimitStore();
    const globalLimiter = rateLimiter({ store, scope: "global", limit: 10, windowMs: 60_000 });
    const searchLimiter = rateLimiter({ store, scope: "search", limit: 3, windowMs: 60_000 });
    const app = new Hono<AppEnv>();
    app.use("/api/*", globalLimiter);
    app.use("/api/search", searchLimiter);
    app.get("/api/search", (c) => c.json({ ok: true }));
    app.get("/api/other", (c) => c.json({ ok: true }));

    const ip = { headers: { "x-forwarded-for": "7.7.7.7" } };

    // Hit search 3 times — hits per-route cap
    for (let i = 0; i < 3; i++) {
      expect((await app.request("/api/search", ip)).status).toBe(200);
    }
    expect((await app.request("/api/search", ip)).status).toBe(429);

    // /api/other still works (only 3 out of 10 global tokens consumed so far)
    expect((await app.request("/api/other", ip)).status).toBe(200);
  });
});

// ─── KvRateLimitStore tests ─────────────────────────────────────────────────

/** Minimal in-memory KVNamespace mock for testing. */
class MockKvNamespace {
  private readonly store = new Map<string, { value: string; expires: number }>();
  readonly putCalls: Array<{ key: string; ttl: number }> = [];

  async get(key: string, _type: "text"): Promise<string | null> {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expires) {
      this.store.delete(key);
      return null;
    }
    return entry.value;
  }

  async put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void> {
    const ttl = options?.expirationTtl ?? 60;
    this.putCalls.push({ key, ttl });
    this.store.set(key, { value, expires: Date.now() + ttl * 1000 });
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }
}

describe("KvRateLimitStore", () => {
  it("allows requests under the fixed-window limit", async () => {
    const kv = new MockKvNamespace() as unknown as KVNamespace;
    const store = new KvRateLimitStore(kv);
    const now = Date.now();

    for (let i = 0; i < 3; i++) {
      const result = await store.consume("search:1.2.3.4", 3, 60_000, now);
      expect(result.allowed).toBe(true);
    }
  });

  it("blocks at the limit within the same window", async () => {
    const kv = new MockKvNamespace() as unknown as KVNamespace;
    const store = new KvRateLimitStore(kv);
    const now = Date.now();

    await store.consume("search:1.2.3.4", 2, 60_000, now);
    await store.consume("search:1.2.3.4", 2, 60_000, now);
    const result = await store.consume("search:1.2.3.4", 2, 60_000, now);
    expect(result.allowed).toBe(false);
    expect(result.retryAfterMs).toBeGreaterThan(0);
  });

  it("allows again after window rolls over", async () => {
    const kv = new MockKvNamespace() as unknown as KVNamespace;
    const store = new KvRateLimitStore(kv);
    const windowMs = 60_000;
    const now = Date.now();

    // Exhaust this window
    await store.consume("search:1.2.3.4", 1, windowMs, now);
    const blocked = await store.consume("search:1.2.3.4", 1, windowMs, now);
    expect(blocked.allowed).toBe(false);

    // Next window — key is different because windowStart changes
    const nextWindow = now + windowMs;
    const result = await store.consume("search:1.2.3.4", 1, windowMs, nextWindow);
    expect(result.allowed).toBe(true);
  });

  it("passes minimum 60s TTL to KV", async () => {
    const kv = new MockKvNamespace() as unknown as KVNamespace;
    const store = new KvRateLimitStore(kv);
    const now = Date.now();

    await store.consume("search:1.2.3.4", 5, 60_000, now);
    const mock = kv as unknown as MockKvNamespace;
    expect(mock.putCalls.length).toBeGreaterThan(0);
    // 60_000ms → 60s, which satisfies KV minimum
    expect(mock.putCalls[0].ttl).toBeGreaterThanOrEqual(60);
  });

  it("isolates different keys within the same window", async () => {
    const kv = new MockKvNamespace() as unknown as KVNamespace;
    const store = new KvRateLimitStore(kv);
    const now = Date.now();

    // Exhaust IP A
    await store.consume("search:1.1.1.1", 1, 60_000, now);
    const blockedA = await store.consume("search:1.1.1.1", 1, 60_000, now);
    expect(blockedA.allowed).toBe(false);

    // IP B is unaffected
    const allowedB = await store.consume("search:2.2.2.2", 1, 60_000, now);
    expect(allowedB.allowed).toBe(true);
  });
});
