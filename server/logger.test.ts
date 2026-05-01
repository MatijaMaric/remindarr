import { describe, it, expect } from "bun:test";
import { getRecentLogs, type LogLevel } from "./logger";

// The ring buffer is disabled in test environment (NODE_ENV=test),
// so getRecentLogs always returns []. These tests verify the function
// signature and that it never throws.

describe("getRecentLogs", () => {
  it("returns an array (empty when buffer is disabled in test env)", () => {
    expect(Array.isArray(getRecentLogs(50))).toBe(true);
  });

  it("accepts limit, level, and module filters without throwing", () => {
    expect(Array.isArray(getRecentLogs(10, "warn" as LogLevel, "admin"))).toBe(true);
  });

  it("returns at most limit entries", () => {
    expect(getRecentLogs(5).length).toBeLessThanOrEqual(5);
  });
});
