import { describe, it, expect, mock, afterEach } from "bun:test";
import { loadFilters } from "./loadFilters";

const mockProviders = [
  { id: 1, name: "Netflix", technical_name: "netflix", icon_url: "" },
];

const mockGetGenres = mock(async () => ({ genres: [] as string[] }));
const mockGetProviders = mock(async () => ({
  providers: [] as typeof mockProviders,
  regionProviderIds: [] as number[],
}));
const mockGetLanguages = mock(async () => ({
  languages: [] as string[],
  priorityLanguageCodes: [] as string[],
}));
// Leak-safe superset: bun does not reset mock.module() between files on Linux CI,
// so whichever ../api mock wins globally must define every fn the filters cluster
// (loadFilters + CategoryBrowse + NewReleases) calls. See HomePage.test.tsx.
const mockBrowseTitles = mock(async () => ({
  titles: [],
  page: 1,
  totalPages: 1,
  totalResults: 0,
  availableGenres: [],
  availableProviders: [],
  availableLanguages: [],
  regionProviderIds: [],
  priorityLanguageCodes: [],
}));
const mockGetTitles = mock(async () => ({
  titles: [],
  page: 1,
  totalPages: 1,
  totalResults: 0,
}));

mock.module("../api", () => ({
  getGenres: mockGetGenres,
  getProviders: mockGetProviders,
  getLanguages: mockGetLanguages,
  browseTitles: mockBrowseTitles,
  getTitles: mockGetTitles,
}));

afterEach(() => {
  mockGetGenres.mockReset();
  mockGetProviders.mockReset();
  mockGetLanguages.mockReset();
});

describe("loadFilters", () => {
  it("returns all filter data when all API calls succeed", async () => {
    mockGetGenres.mockResolvedValue({ genres: ["Action", "Drama"] });
    mockGetProviders.mockResolvedValue({
      providers: mockProviders,
      regionProviderIds: [],
    });
    mockGetLanguages.mockResolvedValue({
      languages: ["en", "fr"],
      priorityLanguageCodes: [],
    });

    const result = await loadFilters();

    expect(result.genres).toEqual(["Action", "Drama"]);
    expect(result.providers).toEqual(mockProviders);
    expect(result.languages).toEqual(["en", "fr"]);
  });

  it("returns empty genres when getGenres fails", async () => {
    mockGetGenres.mockRejectedValue(new Error("Network error"));
    mockGetProviders.mockResolvedValue({
      providers: mockProviders,
      regionProviderIds: [],
    });
    mockGetLanguages.mockResolvedValue({
      languages: ["en"],
      priorityLanguageCodes: [],
    });

    const result = await loadFilters();

    expect(result.genres).toEqual([]);
    expect(result.providers).toEqual(mockProviders);
    expect(result.languages).toEqual(["en"]);
  });

  it("returns empty providers when getProviders fails", async () => {
    mockGetGenres.mockResolvedValue({ genres: ["Action"] });
    mockGetProviders.mockRejectedValue(new Error("Server error"));
    mockGetLanguages.mockResolvedValue({
      languages: ["en"],
      priorityLanguageCodes: [],
    });

    const result = await loadFilters();

    expect(result.genres).toEqual(["Action"]);
    expect(result.providers).toEqual([]);
    expect(result.languages).toEqual(["en"]);
  });

  it("returns empty languages when getLanguages fails", async () => {
    mockGetGenres.mockResolvedValue({ genres: ["Action"] });
    mockGetProviders.mockResolvedValue({
      providers: mockProviders,
      regionProviderIds: [],
    });
    mockGetLanguages.mockRejectedValue(new Error("Timeout"));

    const result = await loadFilters();

    expect(result.genres).toEqual(["Action"]);
    expect(result.providers).toEqual(mockProviders);
    expect(result.languages).toEqual([]);
  });

  it("returns all empty arrays when all API calls fail", async () => {
    mockGetGenres.mockRejectedValue(new Error("fail"));
    mockGetProviders.mockRejectedValue(new Error("fail"));
    mockGetLanguages.mockRejectedValue(new Error("fail"));

    const result = await loadFilters();

    expect(result.genres).toEqual([]);
    expect(result.providers).toEqual([]);
    expect(result.languages).toEqual([]);
  });
});
