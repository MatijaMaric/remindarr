import { describe, it, expect, afterEach } from "bun:test";
import { apiMock, resetApiMock } from "../test-utils/apiMock";
import { loadFilters } from "./loadFilters";

const mockProviders = [
  { id: 1, name: "Netflix", technical_name: "netflix", icon_url: "" },
];

afterEach(() => {
  resetApiMock();
});

describe("loadFilters", () => {
  it("returns all filter data when all API calls succeed", async () => {
    apiMock.getGenres.mockResolvedValue({ genres: ["Action", "Drama"] });
    apiMock.getProviders.mockResolvedValue({
      providers: mockProviders,
      regionProviderIds: [],
    });
    apiMock.getLanguages.mockResolvedValue({
      languages: ["en", "fr"],
      priorityLanguageCodes: [],
    });

    const result = await loadFilters();

    expect(result.genres).toEqual(["Action", "Drama"]);
    expect(result.providers).toEqual(mockProviders);
    expect(result.languages).toEqual(["en", "fr"]);
  });

  it("returns empty genres when getGenres fails", async () => {
    apiMock.getGenres.mockRejectedValue(new Error("Network error"));
    apiMock.getProviders.mockResolvedValue({
      providers: mockProviders,
      regionProviderIds: [],
    });
    apiMock.getLanguages.mockResolvedValue({
      languages: ["en"],
      priorityLanguageCodes: [],
    });

    const result = await loadFilters();

    expect(result.genres).toEqual([]);
    expect(result.providers).toEqual(mockProviders);
    expect(result.languages).toEqual(["en"]);
  });

  it("returns empty providers when getProviders fails", async () => {
    apiMock.getGenres.mockResolvedValue({ genres: ["Action"] });
    apiMock.getProviders.mockRejectedValue(new Error("Server error"));
    apiMock.getLanguages.mockResolvedValue({
      languages: ["en"],
      priorityLanguageCodes: [],
    });

    const result = await loadFilters();

    expect(result.genres).toEqual(["Action"]);
    expect(result.providers).toEqual([]);
    expect(result.languages).toEqual(["en"]);
  });

  it("returns empty languages when getLanguages fails", async () => {
    apiMock.getGenres.mockResolvedValue({ genres: ["Action"] });
    apiMock.getProviders.mockResolvedValue({
      providers: mockProviders,
      regionProviderIds: [],
    });
    apiMock.getLanguages.mockRejectedValue(new Error("Timeout"));

    const result = await loadFilters();

    expect(result.genres).toEqual(["Action"]);
    expect(result.providers).toEqual(mockProviders);
    expect(result.languages).toEqual([]);
  });

  it("returns all empty arrays when all API calls fail", async () => {
    apiMock.getGenres.mockRejectedValue(new Error("fail"));
    apiMock.getProviders.mockRejectedValue(new Error("fail"));
    apiMock.getLanguages.mockRejectedValue(new Error("fail"));

    const result = await loadFilters();

    expect(result.genres).toEqual([]);
    expect(result.providers).toEqual([]);
    expect(result.languages).toEqual([]);
  });
});
