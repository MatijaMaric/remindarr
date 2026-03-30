import { describe, it, expect, afterEach } from "bun:test";
import { CONFIG } from "../config";
import {
  parseMovieDetails,
  parseTvDetails,
  parseDiscoverMovie,
  parseDiscoverTv,
  parseSearchResult,
  extractProviders,
} from "./parser";
import {
  makeTmdbMovieDetails,
  makeTmdbTvDetails,
  makeTmdbDiscoverMovie,
  makeTmdbDiscoverTv,
  makeTmdbSearchMultiMovie,
  makeTmdbSearchMultiTv,
  makeParsedTitle,
  makeParsedOffer,
} from "../test-utils/fixtures";

describe("parseMovieDetails", () => {
  it("parses movie with correct fields", () => {
    const movie = makeTmdbMovieDetails();
    const result = parseMovieDetails(movie);

    expect(result.id).toBe("movie-123");
    expect(result.objectType).toBe("MOVIE");
    expect(result.title).toBe("Test Movie");
    expect(result.releaseYear).toBe(2024);
    expect(result.releaseDate).toBe("2024-06-15");
    expect(result.runtimeMinutes).toBe(120);
    expect(result.shortDescription).toBe("A test movie");
    expect(result.genres).toEqual(["Action"]);
    expect(result.imdbId).toBe("tt1234567");
    expect(result.tmdbId).toBe("123");
    expect(result.tmdbUrl).toBe("https://www.themoviedb.org/movie/123");
    expect(result.posterUrl).toContain("/w342/test.jpg");
    expect(result.scores.tmdbScore).toBe(7.2);
  });

  it("handles null poster_path", () => {
    const movie = makeTmdbMovieDetails({ poster_path: null });
    const result = parseMovieDetails(movie);
    expect(result.posterUrl).toBeNull();
  });

  it("parses backdrop_path", () => {
    const movie = makeTmdbMovieDetails({ backdrop_path: "/backdrop.jpg" });
    const result = parseMovieDetails(movie);
    expect(result.backdropUrl).toContain("/w1280/backdrop.jpg");
  });

  it("handles null backdrop_path", () => {
    const movie = makeTmdbMovieDetails({ backdrop_path: null });
    const result = parseMovieDetails(movie);
    expect(result.backdropUrl).toBeNull();
  });

  it("handles missing backdrop_path", () => {
    const movie = makeTmdbMovieDetails();
    const result = parseMovieDetails(movie);
    expect(result.backdropUrl).toBeNull();
  });

  it("handles missing external_ids", () => {
    const movie = makeTmdbMovieDetails({ external_ids: undefined });
    const result = parseMovieDetails(movie);
    expect(result.imdbId).toBeNull();
  });

  it("handles zero vote_average", () => {
    const movie = makeTmdbMovieDetails({ vote_average: 0 });
    const result = parseMovieDetails(movie);
    expect(result.scores.tmdbScore).toBeNull();
  });

  it("parses original_title", () => {
    const movie = makeTmdbMovieDetails({ original_title: "Film Original" });
    const result = parseMovieDetails(movie);
    expect(result.originalTitle).toBe("Film Original");
  });

  it("parses original_language", () => {
    const movie = makeTmdbMovieDetails({ original_language: "ja" });
    const result = parseMovieDetails(movie);
    expect(result.originalLanguage).toBe("ja");
  });

  it("parses watch providers for configured country", () => {
    const movie = makeTmdbMovieDetails({
      "watch/providers": {
        id: 123,
        results: {
          HR: {
            link: "https://tmdb.org",
            flatrate: [
              {
                logo_path: "/netflix.jpg",
                provider_id: 8,
                provider_name: "Netflix",
                display_priority: 1,
              },
            ],
          },
        },
      },
    });
    const result = parseMovieDetails(movie);
    expect(result.offers).toHaveLength(1);
    expect(result.offers[0].providerName).toBe("Netflix");
    expect(result.offers[0].monetizationType).toBe("FLATRATE");
    expect(result.offers[0].url).toBe("https://tmdb.org");
  });

  it("collapses duplicate providers to canonical ID", () => {
    const movie = makeTmdbMovieDetails({
      "watch/providers": {
        id: 123,
        results: {
          HR: {
            link: "https://tmdb.org",
            flatrate: [
              { logo_path: "/hbo.jpg", provider_id: 384, provider_name: "HBO Max", display_priority: 1 },
              { logo_path: "/hbo2.jpg", provider_id: 1899, provider_name: "HBO Max", display_priority: 2 },
              { logo_path: "/prime.jpg", provider_id: 119, provider_name: "Amazon Prime Video", display_priority: 3 },
              { logo_path: "/prime2.jpg", provider_id: 9, provider_name: "Prime Video", display_priority: 4 },
            ],
          },
        },
      },
    });
    const result = parseMovieDetails(movie);
    // 4 raw entries collapse to 2 canonical providers (384 and 9)
    expect(result.offers).toHaveLength(2);
    const ids = result.offers.map((o) => o.providerId);
    expect(ids).toContain(384);
    expect(ids).toContain(9);
    expect(ids).not.toContain(1899);
    expect(ids).not.toContain(119);
  });
});

describe("parseTvDetails", () => {
  it("parses TV show with correct fields", () => {
    const tv = makeTmdbTvDetails();
    const result = parseTvDetails(tv);

    expect(result.id).toBe("tv-456");
    expect(result.objectType).toBe("SHOW");
    expect(result.title).toBe("Test Show");
    expect(result.releaseYear).toBe(2024);
    expect(result.releaseDate).toBe("2024-01-10");
    expect(result.runtimeMinutes).toBe(45);
    expect(result.genres).toEqual(["Drama"]);
    expect(result.imdbId).toBe("tt7654321");
  });

  it("handles empty episode_run_time", () => {
    const tv = makeTmdbTvDetails({ episode_run_time: [] });
    const result = parseTvDetails(tv);
    expect(result.runtimeMinutes).toBeNull();
  });

  it("parses backdrop_path", () => {
    const tv = makeTmdbTvDetails({ backdrop_path: "/tvbackdrop.jpg" });
    const result = parseTvDetails(tv);
    expect(result.backdropUrl).toContain("/w1280/tvbackdrop.jpg");
  });

  it("handles missing backdrop_path", () => {
    const tv = makeTmdbTvDetails();
    const result = parseTvDetails(tv);
    expect(result.backdropUrl).toBeNull();
  });

  it("parses original_name", () => {
    const tv = makeTmdbTvDetails({ original_name: "Original Show Name" });
    const result = parseTvDetails(tv);
    expect(result.originalTitle).toBe("Original Show Name");
  });

  it("parses original_language", () => {
    const tv = makeTmdbTvDetails({ original_language: "ko" });
    const result = parseTvDetails(tv);
    expect(result.originalLanguage).toBe("ko");
  });
});

describe("parseDiscoverMovie", () => {
  it("parses discover movie result", () => {
    const genreMap = new Map([[28, "Action"], [12, "Adventure"]]);
    const movie = makeTmdbDiscoverMovie();
    const result = parseDiscoverMovie(movie, genreMap);

    expect(result.id).toBe("movie-789");
    expect(result.objectType).toBe("MOVIE");
    expect(result.title).toBe("Discover Movie");
    expect(result.genres).toEqual(["Action", "Adventure"]);
    expect(result.runtimeMinutes).toBeNull();
    expect(result.offers).toEqual([]);
  });

  it("filters unknown genre IDs", () => {
    const genreMap = new Map([[28, "Action"]]);
    const movie = makeTmdbDiscoverMovie({ genre_ids: [28, 9999] });
    const result = parseDiscoverMovie(movie, genreMap);
    expect(result.genres).toEqual(["Action"]);
  });

  it("parses original_title", () => {
    const genreMap = new Map([[28, "Action"]]);
    const movie = makeTmdbDiscoverMovie({ original_title: "Pelicula" });
    const result = parseDiscoverMovie(movie, genreMap);
    expect(result.originalTitle).toBe("Pelicula");
  });

  it("parses original_language", () => {
    const genreMap = new Map([[28, "Action"]]);
    const movie = makeTmdbDiscoverMovie({ original_language: "fr" });
    const result = parseDiscoverMovie(movie, genreMap);
    expect(result.originalLanguage).toBe("fr");
  });
});

describe("parseDiscoverTv", () => {
  it("parses discover TV result", () => {
    const genreMap = new Map([[18, "Drama"]]);
    const tv = makeTmdbDiscoverTv();
    const result = parseDiscoverTv(tv, genreMap);

    expect(result.id).toBe("tv-101");
    expect(result.objectType).toBe("SHOW");
    expect(result.title).toBe("Discover Show");
    expect(result.genres).toEqual(["Drama"]);
  });

  it("parses original_name", () => {
    const genreMap = new Map([[18, "Drama"]]);
    const tv = makeTmdbDiscoverTv({ original_name: "Serie Original" });
    const result = parseDiscoverTv(tv, genreMap);
    expect(result.originalTitle).toBe("Serie Original");
  });

  it("parses original_language", () => {
    const genreMap = new Map([[18, "Drama"]]);
    const tv = makeTmdbDiscoverTv({ original_language: "es" });
    const result = parseDiscoverTv(tv, genreMap);
    expect(result.originalLanguage).toBe("es");
  });
});

describe("parseSearchResult", () => {
  it("parses movie search result", () => {
    const genreMap = new Map([[28, "Action"]]);
    const result = parseSearchResult(makeTmdbSearchMultiMovie(), genreMap);

    expect(result).not.toBeNull();
    expect(result!.id).toBe("movie-200");
    expect(result!.objectType).toBe("MOVIE");
    expect(result!.title).toBe("Search Movie");
  });

  it("parses TV search result", () => {
    const genreMap = new Map([[18, "Drama"]]);
    const result = parseSearchResult(makeTmdbSearchMultiTv(), genreMap);

    expect(result).not.toBeNull();
    expect(result!.id).toBe("tv-300");
    expect(result!.objectType).toBe("SHOW");
    expect(result!.title).toBe("Search Show");
  });

  it("returns null for person results", () => {
    const result = parseSearchResult(
      { id: 999, media_type: "person" },
      new Map()
    );
    expect(result).toBeNull();
  });
});

describe("parseWatchProviders fallback", () => {
  const origCountry = CONFIG.COUNTRY;
  const origFallback = CONFIG.FALLBACK_COUNTRIES;

  afterEach(() => {
    CONFIG.COUNTRY = origCountry;
    CONFIG.FALLBACK_COUNTRIES = origFallback;
  });

  it("uses primary country when available", () => {
    CONFIG.COUNTRY = "HR";
    CONFIG.FALLBACK_COUNTRIES = ["US"];

    const movie = makeTmdbMovieDetails({
      "watch/providers": {
        id: 123,
        results: {
          HR: {
            link: "https://tmdb.org",
            flatrate: [
              {
                logo_path: "/netflix.jpg",
                provider_id: 8,
                provider_name: "Netflix",
                display_priority: 1,
              },
            ],
          },
          US: {
            link: "https://tmdb.org",
            flatrate: [
              {
                logo_path: "/apple.jpg",
                provider_id: 350,
                provider_name: "Apple TV Plus",
                display_priority: 1,
              },
            ],
          },
        },
      },
    });

    const result = parseMovieDetails(movie);
    expect(result.offers).toHaveLength(1);
    expect(result.offers[0].providerName).toBe("Netflix");
  });

  it("falls back to first matching fallback country", () => {
    CONFIG.COUNTRY = "HR";
    CONFIG.FALLBACK_COUNTRIES = ["US", "GB"];

    const movie = makeTmdbMovieDetails({
      "watch/providers": {
        id: 123,
        results: {
          US: {
            link: "https://tmdb.org",
            flatrate: [
              {
                logo_path: "/apple.jpg",
                provider_id: 350,
                provider_name: "Apple TV Plus",
                display_priority: 1,
              },
            ],
          },
          GB: {
            link: "https://tmdb.org",
            flatrate: [
              {
                logo_path: "/apple.jpg",
                provider_id: 350,
                provider_name: "Apple TV+",
                display_priority: 1,
              },
            ],
          },
        },
      },
    });

    const result = parseMovieDetails(movie);
    expect(result.offers).toHaveLength(1);
    expect(result.offers[0].providerName).toBe("Apple TV Plus");
  });

  it("falls back to second country when first also has no data", () => {
    CONFIG.COUNTRY = "HR";
    CONFIG.FALLBACK_COUNTRIES = ["US", "GB"];

    const movie = makeTmdbMovieDetails({
      "watch/providers": {
        id: 123,
        results: {
          GB: {
            link: "https://tmdb.org",
            flatrate: [
              {
                logo_path: "/apple.jpg",
                provider_id: 350,
                provider_name: "Apple TV+",
                display_priority: 1,
              },
            ],
          },
        },
      },
    });

    const result = parseMovieDetails(movie);
    expect(result.offers).toHaveLength(1);
    expect(result.offers[0].providerName).toBe("Apple TV+");
  });

  it("returns empty when no country matches", () => {
    CONFIG.COUNTRY = "HR";
    CONFIG.FALLBACK_COUNTRIES = ["US", "GB"];

    const movie = makeTmdbMovieDetails({
      "watch/providers": {
        id: 123,
        results: {
          DE: {
            link: "https://tmdb.org",
            flatrate: [
              {
                logo_path: "/apple.jpg",
                provider_id: 350,
                provider_name: "Apple TV Plus",
                display_priority: 1,
              },
            ],
          },
        },
      },
    });

    const result = parseMovieDetails(movie);
    expect(result.offers).toHaveLength(0);
  });

  it("works with empty fallback list (default behavior)", () => {
    CONFIG.COUNTRY = "HR";
    CONFIG.FALLBACK_COUNTRIES = [];

    const movie = makeTmdbMovieDetails({
      "watch/providers": {
        id: 123,
        results: {
          US: {
            link: "https://tmdb.org",
            flatrate: [
              {
                logo_path: "/apple.jpg",
                provider_id: 350,
                provider_name: "Apple TV Plus",
                display_priority: 1,
              },
            ],
          },
        },
      },
    });

    const result = parseMovieDetails(movie);
    expect(result.offers).toHaveLength(0);
  });
});

describe("extractProviders", () => {
  it("extracts unique providers from titles", () => {
    const titles = [
      makeParsedTitle({
        offers: [
          makeParsedOffer({ providerId: 8, providerName: "Netflix" }),
          makeParsedOffer({ providerId: 337, providerName: "Disney Plus" }),
        ],
      }),
      makeParsedTitle({
        id: "movie-456",
        offers: [
          makeParsedOffer({ providerId: 8, providerName: "Netflix" }),
        ],
      }),
    ];

    const providers = extractProviders(titles);
    expect(providers).toHaveLength(2);
    expect(providers.map((p) => p.id).sort((a, b) => a - b)).toEqual([8, 337]);
  });

  it("returns empty array for titles with no offers", () => {
    const providers = extractProviders([makeParsedTitle({ offers: [] })]);
    expect(providers).toEqual([]);
  });
});
