import { describe, it, expect, beforeEach, afterEach, spyOn } from "bun:test";
import * as api from "../api";
import { loadFilters } from "./loadFilters";

const mockProviders = [
  { id: 1, name: "Netflix", technical_name: "netflix", icon_url: "" },
];

let spies: ReturnType<typeof spyOn>[] = [];

afterEach(() => {
  for (const spy of spies) spy.mockRestore();
  spies = [];
});

describe("loadFilters", () => {
  it("returns all filter data when all API calls succeed", async () => {
    spies = [
      spyOn(api, "getGenres").mockResolvedValue({ genres: ["Action", "Drama"] } as any),
      spyOn(api, "getProviders").mockResolvedValue({ providers: mockProviders } as any),
      spyOn(api, "getLanguages").mockResolvedValue({ languages: ["en", "fr"] } as any),
    ];

    const result = await loadFilters();

    expect(result.genres).toEqual(["Action", "Drama"]);
    expect(result.providers).toEqual(mockProviders);
    expect(result.languages).toEqual(["en", "fr"]);
  });

  it("returns empty genres when getGenres fails", async () => {
    spies = [
      spyOn(api, "getGenres").mockRejectedValue(new Error("Network error")),
      spyOn(api, "getProviders").mockResolvedValue({ providers: mockProviders } as any),
      spyOn(api, "getLanguages").mockResolvedValue({ languages: ["en"] } as any),
    ];

    const result = await loadFilters();

    expect(result.genres).toEqual([]);
    expect(result.providers).toEqual(mockProviders);
    expect(result.languages).toEqual(["en"]);
  });

  it("returns empty providers when getProviders fails", async () => {
    spies = [
      spyOn(api, "getGenres").mockResolvedValue({ genres: ["Action"] } as any),
      spyOn(api, "getProviders").mockRejectedValue(new Error("Server error")),
      spyOn(api, "getLanguages").mockResolvedValue({ languages: ["en"] } as any),
    ];

    const result = await loadFilters();

    expect(result.genres).toEqual(["Action"]);
    expect(result.providers).toEqual([]);
    expect(result.languages).toEqual(["en"]);
  });

  it("returns empty languages when getLanguages fails", async () => {
    spies = [
      spyOn(api, "getGenres").mockResolvedValue({ genres: ["Action"] } as any),
      spyOn(api, "getProviders").mockResolvedValue({ providers: mockProviders } as any),
      spyOn(api, "getLanguages").mockRejectedValue(new Error("Timeout")),
    ];

    const result = await loadFilters();

    expect(result.genres).toEqual(["Action"]);
    expect(result.providers).toEqual(mockProviders);
    expect(result.languages).toEqual([]);
  });

  it("returns all empty arrays when all API calls fail", async () => {
    spies = [
      spyOn(api, "getGenres").mockRejectedValue(new Error("fail")),
      spyOn(api, "getProviders").mockRejectedValue(new Error("fail")),
      spyOn(api, "getLanguages").mockRejectedValue(new Error("fail")),
    ];

    const result = await loadFilters();

    expect(result.genres).toEqual([]);
    expect(result.providers).toEqual([]);
    expect(result.languages).toEqual([]);
  });
});
