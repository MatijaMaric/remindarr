import { setupTestDb, teardownTestDb } from "../test-utils/setup";
import { bunClientAddress } from "./client-address";
import { describe, it, expect, spyOn, beforeEach, afterAll } from "bun:test";
import { Hono } from "hono";
import {
  rateLimiter,
  MemoryRateLimitStore,
  SqlRateLimitStore,
  type RateLimitStore,
} from "./rate-limit";
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

  it("ignores spoofed forwarding headers", async () => {
    const app = new Hono<AppEnv>();
    app.use(
      "*",
      rateLimiter({
        store: new MemoryRateLimitStore(),
        limit: 1,
        windowMs: 60_000,
      }),
    );
    app.get("/", (c) => c.text("ok"));
    expect(
      (await app.request("/", { headers: { "x-forwarded-for": "1.1.1.1" } }))
        .status,
    ).toBe(200);
    expect(
      (
        await app.request("/", {
          headers: {
            "x-forwarded-for": "2.2.2.2",
            "cf-connecting-ip": "2.2.2.2",
          },
        })
      ).status,
    ).toBe(429);
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
    const spy = spyOn(globalThis, "setInterval").mockImplementation(((
      fn: TimerHandler,
      ms?: number,
    ) => {
      if (typeof fn === "function") capturedCallback = fn as () => void;
      return originalSetInterval(fn, ms);
    }) as typeof setInterval);

    new MemoryRateLimitStore(60_000);

    expect(spy).toHaveBeenCalledTimes(1);
    expect(capturedCallback).not.toBeNull();

    spy.mockRestore();
  });

  it("periodic cleanup removes stale buckets", async () => {
    let capturedCallback: (() => void) | null = null;
    const originalSetInterval = globalThis.setInterval;
    const spy = spyOn(globalThis, "setInterval").mockImplementation(((
      fn: TimerHandler,
      ms?: number,
    ) => {
      if (typeof fn === "function") capturedCallback = fn as () => void;
      return originalSetInterval(fn, ms);
    }) as typeof setInterval);

    const store = new MemoryRateLimitStore(50);
    const app = new Hono<AppEnv>();
    app.use("/test/*", rateLimiter({ store, limit: 1, windowMs: 10 }));
    app.get("/test/hello", (c) => c.json({ ok: true }));

    spy.mockRestore();

    // Consume all tokens for a specific IP
    await app.request("/test/hello", {
      headers: { "x-forwarded-for": "5.5.5.5" },
    });
    const limited = await app.request("/test/hello", {
      headers: { "x-forwarded-for": "5.5.5.5" },
    });
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
    const res = await app.request("/test/hello", {
      headers: { "x-forwarded-for": "5.5.5.5" },
    });
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
      }),
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
    const limiter = rateLimiter({
      store,
      scope: "global",
      limit: 3,
      windowMs: 60_000,
    });
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
    const searchLimiter = rateLimiter({
      store,
      scope: "search",
      limit: 2,
      windowMs: 60_000,
    });
    const browseLimiter = rateLimiter({
      store,
      scope: "browse",
      limit: 2,
      windowMs: 60_000,
    });
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
    const globalLimiter = rateLimiter({
      store,
      scope: "global",
      limit: 10,
      windowMs: 60_000,
    });
    const searchLimiter = rateLimiter({
      store,
      scope: "search",
      limit: 3,
      windowMs: 60_000,
    });
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

// ─── SqlRateLimitStore tests ─────────────────────────────────────────────────

describe("SqlRateLimitStore", () => {
  beforeEach(setupTestDb);
  afterAll(teardownTestDb);
  it("atomically limits concurrent requests across stores and resets at the window boundary", async () => {
    const results = await Promise.all(
      Array.from({ length: 20 }, () =>
        new SqlRateLimitStore().consume("auth:client", 1, 60_000, 1_000),
      ),
    );
    expect(results.filter((r) => r.allowed)).toHaveLength(1);
    expect(results[1].retryAfterMs).toBe(59_000);
    expect(
      (await new SqlRateLimitStore().consume("auth:client", 1, 60_000, 60_000))
        .allowed,
    ).toBe(true);
    expect(
      (
        await new SqlRateLimitStore().consume(
          "global:client",
          1,
          60_000,
          60_000,
        )
      ).allowed,
    ).toBe(true);
  });
});

describe("trusted client addresses", () => {
  it("uses the peer by default and rejects a spoofed left-hand prefix", () => {
    expect(bunClientAddress("203.0.113.4", "1.1.1.1")).toBe("203.0.113.4");
    expect(
      bunClientAddress("127.0.0.1", "1.1.1.1, 203.0.113.4", ["127.0.0.1"]),
    ).toBe("203.0.113.4");
    expect(
      bunClientAddress("127.0.0.1", "203.0.113.4, 10.0.0.1", [
        "127.0.0.1",
        "10.0.0.1",
      ]),
    ).toBe("203.0.113.4");
    expect(bunClientAddress("::ffff:127.0.0.1", "bad-ip", ["127.0.0.1"])).toBe(
      "127.0.0.1",
    );
    expect(bunClientAddress(undefined, "1.1.1.1")).toBe("anonymous");
  });
});

describe("store outage policy", () => {
  for (const scope of ["global", "auth"]) {
    it(`fails closed for ${scope}`, async () => {
      const store: RateLimitStore = {
        consume: async () => {
          throw new Error("unavailable");
        },
      };
      const app = new Hono<AppEnv>();
      app.use("*", rateLimiter({ store, scope, limit: 1, windowMs: 60_000 }));
      app.get("/", (c) => c.text("must not run"));
      const res = await app.request("/");
      expect(res.status).toBe(503);
      expect(res.headers.get("Retry-After")).toBe("60");
    });
  }
});
