import { describe, it, expect } from "bun:test";
import { normalizeSearchTitle, type SearchTitle } from "./types";

function makeSearchTitle(overrides?: Partial<SearchTitle>): SearchTitle {
  return {
    id: "movie-100",
    objectType: "MOVIE",
    title: "Test Film",
    releaseYear: 2024,
    releaseDate: "2024-05-01",
    runtimeMinutes: 100,
    shortDescription: "A test film",
    genres: ["Comedy"],
    imdbId: "tt0000001",
    tmdbId: "100",
    posterUrl: "/poster.jpg",
    ageCertification: "PG-13",
    tmdbUrl: "https://www.themoviedb.org/movie/100",
    offers: [],
    scores: { imdbScore: 6.5, imdbVotes: 5000, tmdbScore: 6.0 },
    ...overrides,
  };
}

describe("normalizeSearchTitle", () => {
  it("maps camelCase fields to snake_case", () => {
    const result = normalizeSearchTitle(makeSearchTitle());
    expect(result.id).toBe("movie-100");
    expect(result.object_type).toBe("MOVIE");
    expect(result.release_year).toBe(2024);
    expect(result.release_date).toBe("2024-05-01");
    expect(result.runtime_minutes).toBe(100);
    expect(result.short_description).toBe("A test film");
    expect(result.imdb_id).toBe("tt0000001");
    expect(result.tmdb_id).toBe("100");
    expect(result.poster_url).toBe("/poster.jpg");
    expect(result.age_certification).toBe("PG-13");
    expect(result.tmdb_url).toBe("https://www.themoviedb.org/movie/100");
  });

  it("maps scores correctly", () => {
    const result = normalizeSearchTitle(makeSearchTitle());
    expect(result.imdb_score).toBe(6.5);
    expect(result.imdb_votes).toBe(5000);
    expect(result.tmdb_score).toBe(6.0);
  });

  it("sets is_tracked to false", () => {
    const result = normalizeSearchTitle(makeSearchTitle());
    expect(result.is_tracked).toBe(false);
  });

  it("transforms offers from camelCase to snake_case", () => {
    const searchTitle = makeSearchTitle({
      offers: [
        {
          titleId: "movie-100",
          providerId: 8,
          providerName: "Netflix",
          providerTechnicalName: "netflix",
          providerIconUrl: "/netflix.jpg",
          monetizationType: "FLATRATE",
          presentationType: "HD",
          priceValue: null,
          priceCurrency: null,
          url: "https://netflix.com",
          availableTo: null,
        },
      ],
    });

    const result = normalizeSearchTitle(searchTitle);
    expect(result.offers).toHaveLength(1);
    expect(result.offers[0].provider_id).toBe(8);
    expect(result.offers[0].provider_name).toBe("Netflix");
    expect(result.offers[0].monetization_type).toBe("FLATRATE");
    expect(result.offers[0].title_id).toBe("movie-100");
    expect(result.offers[0].id).toBe(0); // index-based ID
  });

  it("handles empty offers array", () => {
    const result = normalizeSearchTitle(makeSearchTitle({ offers: [] }));
    expect(result.offers).toEqual([]);
  });

  it("handles null values", () => {
    const result = normalizeSearchTitle(
      makeSearchTitle({
        releaseYear: null,
        runtimeMinutes: null,
        shortDescription: null,
        imdbId: null,
        scores: { imdbScore: null, imdbVotes: null, tmdbScore: null },
      })
    );
    expect(result.release_year).toBeNull();
    expect(result.runtime_minutes).toBeNull();
    expect(result.imdb_score).toBeNull();
  });
});
