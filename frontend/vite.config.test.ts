import { describe, it, expect } from "bun:test";
import { pwaOptions } from "./vite.config";

describe("PWA configuration", () => {
  it("uses autoUpdate register type", () => {
    expect(pwaOptions.registerType).toBe("autoUpdate");
  });

  it("uses injectManifest strategy for custom service worker", () => {
    expect(pwaOptions.strategies).toBe("injectManifest");
  });

  it("points to custom service worker source", () => {
    expect(pwaOptions.srcDir).toBe("src");
    expect(pwaOptions.filename).toBe("sw.ts");
  });

  it("configures glob patterns for precaching", () => {
    expect(pwaOptions.injectManifest?.globPatterns).toBeDefined();
    expect(pwaOptions.injectManifest!.globPatterns!).toContain(
      "**/*.{js,css,html,ico,png,svg,woff2}"
    );
  });
});
