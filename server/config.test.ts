import { describe, it, expect } from "bun:test";
import { CONFIG, patchConfig } from "./config";

describe("patchConfig", () => {
  it("overrides specified keys", () => {
    const original = CONFIG.TMDB_API_KEY;
    patchConfig({ TMDB_API_KEY: "test-key-123" });
    expect(CONFIG.TMDB_API_KEY).toBe("test-key-123");
    // Restore
    patchConfig({ TMDB_API_KEY: original });
  });

  it("does not affect unpatched keys", () => {
    const originalCountry = CONFIG.COUNTRY;
    const originalLanguage = CONFIG.LANGUAGE;
    patchConfig({ COUNTRY: "US" });
    expect(CONFIG.COUNTRY).toBe("US");
    expect(CONFIG.LANGUAGE).toBe(originalLanguage);
    // Restore
    patchConfig({ COUNTRY: originalCountry });
  });

  it("can patch multiple keys at once", () => {
    const origKey = CONFIG.TMDB_API_KEY;
    const origCountry = CONFIG.COUNTRY;
    patchConfig({ TMDB_API_KEY: "multi-1", COUNTRY: "DE" });
    expect(CONFIG.TMDB_API_KEY).toBe("multi-1");
    expect(CONFIG.COUNTRY).toBe("DE");
    // Restore
    patchConfig({ TMDB_API_KEY: origKey, COUNTRY: origCountry });
  });
});
