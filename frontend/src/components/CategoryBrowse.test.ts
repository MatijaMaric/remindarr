import { describe, it, expect } from "bun:test";
import {
  filterBrowseTitles,
  extractBrowseGenres,
  extractBrowseProviders,
  extractBrowseLanguages,
} from "./CategoryBrowse";
import type { Title } from "../types";

function makeTitle(overrides: Partial<Title> & { id: string }): Title {
  return {
    object_type: "MOVIE",
    title: "Test Title",
    original_title: null,
    release_year: 2025,
    release_date: "2025-01-01",
    runtime_minutes: 120,
    short_description: "A test movie",
    genres: [],
    imdb_id: null,
    tmdb_id: null,
    poster_url: null,
    age_certification: null,
    original_language: "en",
    tmdb_url: null,
    imdb_score: null,
    imdb_votes: null,
    tmdb_score: null,
    is_tracked: false,
    offers: [],
    ...overrides,
  };
}

function makeOffer(providerName: string, technicalName: string) {
  return {
    id: 1,
    title_id: "test",
    provider_id: 1,
    monetization_type: "FLATRATE",
    presentation_type: "HD",
    price_value: null,
    price_currency: null,
    url: "https://example.com",
    available_to: null,
    provider_name: providerName,
    provider_technical_name: technicalName,
    provider_icon_url: "https://example.com/icon.png",
  };
}

describe("filterBrowseTitles", () => {
  const titles: Title[] = [
    makeTitle({ id: "1", genres: ["Action", "Drama"], original_language: "en", offers: [makeOffer("Netflix", "netflix")] }),
    makeTitle({ id: "2", genres: ["Comedy"], original_language: "fr", offers: [makeOffer("Disney Plus", "disney_plus")] }),
    makeTitle({ id: "3", genres: ["Action", "Comedy"], original_language: "en", offers: [makeOffer("Netflix", "netflix"), makeOffer("Disney Plus", "disney_plus")] }),
  ];

  it("returns all titles when no filters are active", () => {
    const result = filterBrowseTitles(titles, { genre: [], provider: [], language: [] });
    expect(result.length).toBe(3);
  });

  it("filters by genre", () => {
    const result = filterBrowseTitles(titles, { genre: ["Action"], provider: [], language: [] });
    expect(result.length).toBe(2);
    expect(result.map((t) => t.id)).toEqual(["1", "3"]);
  });

  it("filters by multiple genres (OR)", () => {
    const result = filterBrowseTitles(titles, { genre: ["Action", "Comedy"], provider: [], language: [] });
    expect(result.length).toBe(3);
  });

  it("filters by provider", () => {
    const result = filterBrowseTitles(titles, { genre: [], provider: ["disney_plus"], language: [] });
    expect(result.length).toBe(2);
    expect(result.map((t) => t.id)).toEqual(["2", "3"]);
  });

  it("filters by multiple providers (OR)", () => {
    const result = filterBrowseTitles(titles, { genre: [], provider: ["netflix", "disney_plus"], language: [] });
    expect(result.length).toBe(3);
  });

  it("filters by language", () => {
    const result = filterBrowseTitles(titles, { genre: [], provider: [], language: ["fr"] });
    expect(result.length).toBe(1);
    expect(result[0].id).toBe("2");
  });

  it("filters by multiple languages (OR)", () => {
    const result = filterBrowseTitles(titles, { genre: [], provider: [], language: ["en", "fr"] });
    expect(result.length).toBe(3);
  });

  it("combines filters with AND logic between categories", () => {
    const result = filterBrowseTitles(titles, { genre: ["Action"], provider: ["netflix"], language: ["en"] });
    expect(result.length).toBe(2);
    expect(result.map((t) => t.id)).toEqual(["1", "3"]);
  });

  it("returns empty array when no titles match", () => {
    const result = filterBrowseTitles(titles, { genre: ["Horror"], provider: [], language: [] });
    expect(result.length).toBe(0);
  });

  it("handles empty titles array", () => {
    const result = filterBrowseTitles([], { genre: ["Action"], provider: [], language: [] });
    expect(result.length).toBe(0);
  });
});

describe("extractBrowseGenres", () => {
  it("extracts unique sorted genres from titles", () => {
    const titles = [
      makeTitle({ id: "1", genres: ["Drama", "Action"] }),
      makeTitle({ id: "2", genres: ["Comedy", "Action"] }),
    ];
    const genres = extractBrowseGenres(titles);
    expect(genres).toEqual(["Action", "Comedy", "Drama"]);
  });

  it("returns empty array for titles with no genres", () => {
    const titles = [makeTitle({ id: "1", genres: [] })];
    expect(extractBrowseGenres(titles)).toEqual([]);
  });

  it("returns empty array for empty titles", () => {
    expect(extractBrowseGenres([])).toEqual([]);
  });
});

describe("extractBrowseProviders", () => {
  it("extracts unique providers sorted by name", () => {
    const titles = [
      makeTitle({ id: "1", offers: [makeOffer("Netflix", "netflix"), makeOffer("Disney Plus", "disney_plus")] }),
      makeTitle({ id: "2", offers: [makeOffer("Netflix", "netflix")] }),
    ];
    const providers = extractBrowseProviders(titles);
    expect(providers.length).toBe(2);
    expect(providers[0].name).toBe("Disney Plus");
    expect(providers[1].name).toBe("Netflix");
  });

  it("returns empty array for titles with no offers", () => {
    const titles = [makeTitle({ id: "1", offers: [] })];
    expect(extractBrowseProviders(titles)).toEqual([]);
  });
});

describe("extractBrowseLanguages", () => {
  it("extracts unique sorted languages", () => {
    const titles = [
      makeTitle({ id: "1", original_language: "en" }),
      makeTitle({ id: "2", original_language: "fr" }),
      makeTitle({ id: "3", original_language: "en" }),
    ];
    const languages = extractBrowseLanguages(titles);
    expect(languages).toEqual(["en", "fr"]);
  });

  it("excludes null languages", () => {
    const titles = [
      makeTitle({ id: "1", original_language: null }),
      makeTitle({ id: "2", original_language: "en" }),
    ];
    const languages = extractBrowseLanguages(titles);
    expect(languages).toEqual(["en"]);
  });

  it("returns empty array for empty titles", () => {
    expect(extractBrowseLanguages([])).toEqual([]);
  });
});
