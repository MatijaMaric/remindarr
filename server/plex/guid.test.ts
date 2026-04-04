import { describe, it, expect } from "bun:test";
import { parsePlexGuids, parseLegacyGuid, toRemindarrTitleId } from "./guid";

describe("parsePlexGuids", () => {
  it("parses new-format tmdb guid", () => {
    const result = parsePlexGuids([{ id: "tmdb://12345" }]);
    expect(result.tmdbId).toBe(12345);
  });

  it("parses new-format imdb guid", () => {
    const result = parsePlexGuids([{ id: "imdb://tt1234567" }]);
    expect(result.imdbId).toBe("tt1234567");
  });

  it("parses new-format tvdb guid", () => {
    const result = parsePlexGuids([{ id: "tvdb://67890" }]);
    expect(result.tvdbId).toBe(67890);
  });

  it("parses all three new-format guids together", () => {
    const result = parsePlexGuids([
      { id: "tmdb://12345" },
      { id: "imdb://tt1234567" },
      { id: "tvdb://67890" },
    ]);
    expect(result.tmdbId).toBe(12345);
    expect(result.imdbId).toBe("tt1234567");
    expect(result.tvdbId).toBe(67890);
  });

  it("parses legacy themoviedb agent format", () => {
    const result = parsePlexGuids([{ id: "com.plexapp.agents.themoviedb://12345?lang=en" }]);
    expect(result.tmdbId).toBe(12345);
  });

  it("parses legacy thetvdb agent format", () => {
    const result = parsePlexGuids([{ id: "com.plexapp.agents.thetvdb://67890?lang=en" }]);
    expect(result.tvdbId).toBe(67890);
  });

  it("parses legacy imdb agent format", () => {
    const result = parsePlexGuids([{ id: "com.plexapp.agents.imdb://tt9876543?lang=en" }]);
    expect(result.imdbId).toBe("tt9876543");
  });

  it("returns empty object for undefined input", () => {
    expect(parsePlexGuids(undefined)).toEqual({});
  });

  it("returns empty object for empty array", () => {
    expect(parsePlexGuids([])).toEqual({});
  });

  it("ignores unrecognized guid formats", () => {
    const result = parsePlexGuids([{ id: "unknown://12345" }, { id: "tmdb://99" }]);
    expect(result.tmdbId).toBe(99);
  });
});

describe("parseLegacyGuid", () => {
  it("parses legacy guid string", () => {
    const result = parseLegacyGuid("com.plexapp.agents.themoviedb://777?lang=en");
    expect(result.tmdbId).toBe(777);
  });

  it("returns empty for undefined", () => {
    expect(parseLegacyGuid(undefined)).toEqual({});
  });
});

describe("toRemindarrTitleId", () => {
  it("creates movie title ID", () => {
    expect(toRemindarrTitleId("movie", 12345)).toBe("movie-12345");
  });

  it("creates show title ID", () => {
    expect(toRemindarrTitleId("show", 67890)).toBe("tv-67890");
  });
});
