import { describe, it, expect } from "bun:test";
import { pwaOptions } from "./vite.config";

describe("PWA configuration", () => {
  it("uses autoUpdate register type", () => {
    expect(pwaOptions.registerType).toBe("autoUpdate");
  });

  it("enables clientsClaim for immediate SW control", () => {
    expect(pwaOptions.workbox?.clientsClaim).toBe(true);
  });

  it("enables cleanupOutdatedCaches to remove stale caches", () => {
    expect(pwaOptions.workbox?.cleanupOutdatedCaches).toBe(true);
  });

  it("excludes /api/ routes from navigateFallback", () => {
    const denylist = pwaOptions.workbox?.navigateFallbackDenylist;
    expect(denylist).toBeDefined();
    expect(denylist!.some((re) => re.test("/api/titles"))).toBe(true);
  });
});
