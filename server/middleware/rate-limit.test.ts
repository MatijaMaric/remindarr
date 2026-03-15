import { describe, it, expect } from "bun:test";
import { Hono } from "hono";
import { rateLimiter } from "./rate-limit";
import type { AppEnv } from "../types";

function createApp(limit: number, windowMs: number) {
  const app = new Hono<AppEnv>();
  app.use("/test/*", rateLimiter({ limit, windowMs }));
  app.get("/test/hello", (c) => c.json({ ok: true }));
  return app;
}

describe("rateLimiter", () => {
  it("allows requests under the limit", async () => {
    const app = createApp(3, 60_000);

    for (let i = 0; i < 3; i++) {
      const res = await app.request("/test/hello");
      expect(res.status).toBe(200);
    }
  });

  it("returns 429 when limit is exceeded", async () => {
    const app = createApp(2, 60_000);

    await app.request("/test/hello");
    await app.request("/test/hello");

    const res = await app.request("/test/hello");
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error).toBe("Too many requests");
    expect(res.headers.get("Retry-After")).toBe("60");
  });

  it("uses x-forwarded-for to differentiate clients", async () => {
    const app = createApp(1, 60_000);

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
    const app = new Hono<AppEnv>();
    // Use a very short window so tokens refill quickly
    app.use("/test/*", rateLimiter({ limit: 1, windowMs: 50 }));
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

  it("supports custom keyGenerator", async () => {
    const app = new Hono<AppEnv>();
    app.use(
      "/test/*",
      rateLimiter({
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
