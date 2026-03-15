import { describe, it, expect, mock, beforeEach } from "bun:test";

const mockProviders = [
  { id: 1, name: "Netflix", technical_name: "netflix", icon_url: "" },
];

beforeEach(() => {
  mock.restore();
});

describe("loadFilters", () => {
  it("returns all filter data when all API calls succeed", async () => {
    mock.module("../api", () => ({
      getGenres: () => Promise.resolve({ genres: ["Action", "Drama"] }),
      getProviders: () => Promise.resolve({ providers: mockProviders }),
      getLanguages: () => Promise.resolve({ languages: ["en", "fr"] }),
    }));

    const { loadFilters } = await import("./loadFilters");
    const result = await loadFilters();

    expect(result.genres).toEqual(["Action", "Drama"]);
    expect(result.providers).toEqual(mockProviders);
    expect(result.languages).toEqual(["en", "fr"]);
  });

  it("returns empty genres when getGenres fails", async () => {
    mock.module("../api", () => ({
      getGenres: () => Promise.reject(new Error("Network error")),
      getProviders: () => Promise.resolve({ providers: mockProviders }),
      getLanguages: () => Promise.resolve({ languages: ["en"] }),
    }));

    const { loadFilters } = await import("./loadFilters");
    const result = await loadFilters();

    expect(result.genres).toEqual([]);
    expect(result.providers).toEqual(mockProviders);
    expect(result.languages).toEqual(["en"]);
  });

  it("returns empty providers when getProviders fails", async () => {
    mock.module("../api", () => ({
      getGenres: () => Promise.resolve({ genres: ["Action"] }),
      getProviders: () => Promise.reject(new Error("Server error")),
      getLanguages: () => Promise.resolve({ languages: ["en"] }),
    }));

    const { loadFilters } = await import("./loadFilters");
    const result = await loadFilters();

    expect(result.genres).toEqual(["Action"]);
    expect(result.providers).toEqual([]);
    expect(result.languages).toEqual(["en"]);
  });

  it("returns empty languages when getLanguages fails", async () => {
    mock.module("../api", () => ({
      getGenres: () => Promise.resolve({ genres: ["Action"] }),
      getProviders: () => Promise.resolve({ providers: mockProviders }),
      getLanguages: () => Promise.reject(new Error("Timeout")),
    }));

    const { loadFilters } = await import("./loadFilters");
    const result = await loadFilters();

    expect(result.genres).toEqual(["Action"]);
    expect(result.providers).toEqual(mockProviders);
    expect(result.languages).toEqual([]);
  });

  it("returns all empty arrays when all API calls fail", async () => {
    mock.module("../api", () => ({
      getGenres: () => Promise.reject(new Error("fail")),
      getProviders: () => Promise.reject(new Error("fail")),
      getLanguages: () => Promise.reject(new Error("fail")),
    }));

    const { loadFilters } = await import("./loadFilters");
    const result = await loadFilters();

    expect(result.genres).toEqual([]);
    expect(result.providers).toEqual([]);
    expect(result.languages).toEqual([]);
  });
});
