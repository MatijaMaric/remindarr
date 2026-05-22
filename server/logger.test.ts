import { describe, it, expect, spyOn } from "bun:test";
import { Hono } from "hono";
import { getRecentLogs, requestLogger, type LogLevel } from "./logger";

// The ring buffer is disabled in test environment (NODE_ENV=test),
// so getRecentLogs always returns []. These tests verify the function
// signature and that it never throws.

describe("requestLogger — slow request warning", () => {
  it("emits a warn log when handler duration exceeds 5000ms", async () => {
    const consoleSpy = spyOn(console, "error");
    const nowSpy = spyOn(performance, "now")
      .mockReturnValueOnce(0) // start
      .mockReturnValueOnce(6000); // end → 6000ms elapsed

    const app = new Hono();
    app.use("*", requestLogger());
    app.get("/slow-path", (c) => c.json({ ok: true }));

    await app.request("/slow-path");

    const slowLogs = consoleSpy.mock.calls
      .map(([line]) => (typeof line === "string" ? line : ""))
      .filter((line) => line.includes("Slow request"));

    expect(slowLogs.length).toBeGreaterThan(0);
    const entry = JSON.parse(slowLogs[0]);
    expect(entry.msg).toContain("GET /slow-path");
    expect(entry.msg).toContain("6000ms");
    expect(entry.level).toBe("warn");

    nowSpy.mockRestore();
    consoleSpy.mockRestore();
  });

  it("does not emit a slow-request warn for a fast response", async () => {
    const consoleSpy = spyOn(console, "error");
    const nowSpy = spyOn(performance, "now")
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(200); // 200ms — below threshold

    const app = new Hono();
    app.use("*", requestLogger());
    app.get("/fast-path", (c) => c.json({ ok: true }));

    await app.request("/fast-path");

    const slowLogs = consoleSpy.mock.calls
      .map(([line]) => (typeof line === "string" ? line : ""))
      .filter((line) => line.includes("Slow request"));

    expect(slowLogs.length).toBe(0);

    nowSpy.mockRestore();
    consoleSpy.mockRestore();
  });
});

describe("getRecentLogs", () => {
  it("returns an array (empty when buffer is disabled in test env)", () => {
    expect(Array.isArray(getRecentLogs(50))).toBe(true);
  });

  it("accepts limit, level, and module filters without throwing", () => {
    expect(Array.isArray(getRecentLogs(10, "warn" as LogLevel, "admin"))).toBe(
      true,
    );
  });

  it("returns at most limit entries", () => {
    expect(getRecentLogs(5).length).toBeLessThanOrEqual(5);
  });
});
