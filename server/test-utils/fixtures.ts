import type { ParsedTitle, ParsedOffer } from "../tmdb/parser";
import type { TmdbMovieDetails, TmdbTvDetails, TmdbDiscoverMovieResult, TmdbDiscoverTvResult, TmdbSearchMultiResult } from "../tmdb/types";

export function makeParsedTitle(overrides?: Partial<ParsedTitle>): ParsedTitle {
  return {
    id: "movie-123",
    objectType: "MOVIE",
    title: "Test Movie",
    originalTitle: null,
    releaseYear: 2024,
    releaseDate: "2024-06-15",
    runtimeMinutes: 120,
    shortDescription: "A test movie",
    genres: ["Action", "Drama"],
    originalLanguage: "en",
    imdbId: "tt1234567",
    tmdbId: "123",
    posterUrl: "https://image.tmdb.org/t/p/w342/test.jpg",
    backdropUrl: null,
    ageCertification: null,
    tmdbUrl: "https://www.themoviedb.org/movie/123",
    offers: [],
    scores: { imdbScore: 7.5, imdbVotes: 10000, tmdbScore: 7.2 },
    ...overrides,
  };
}

export function makeParsedOffer(overrides?: Partial<ParsedOffer>): ParsedOffer {
  return {
    titleId: "movie-123",
    providerId: 8,
    providerName: "Netflix",
    providerTechnicalName: "netflix",
    providerIconUrl: "https://image.tmdb.org/t/p/w92/netflix.jpg",
    monetizationType: "FLATRATE",
    presentationType: "",
    priceValue: null,
    priceCurrency: null,
    url: "https://www.themoviedb.org/movie/123",
    availableTo: null,
    ...overrides,
  };
}

export function makeTmdbMovieDetails(overrides?: Partial<TmdbMovieDetails>): TmdbMovieDetails {
  return {
    id: 123,
    title: "Test Movie",
    original_title: "Test Movie",
    overview: "A test movie",
    release_date: "2024-06-15",
    runtime: 120,
    genres: [{ id: 28, name: "Action" }],
    poster_path: "/test.jpg",
    adult: false,
    vote_average: 7.2,
    vote_count: 1000,
    popularity: 50,
    original_language: "en",
    external_ids: { imdb_id: "tt1234567" },
    ...overrides,
  };
}

export function makeTmdbTvDetails(overrides?: Partial<TmdbTvDetails>): TmdbTvDetails {
  return {
    id: 456,
    name: "Test Show",
    original_name: "Test Show",
    overview: "A test show",
    first_air_date: "2024-01-10",
    episode_run_time: [45],
    genres: [{ id: 18, name: "Drama" }],
    poster_path: "/show.jpg",
    vote_average: 8.0,
    vote_count: 2000,
    popularity: 75,
    original_language: "en",
    number_of_seasons: 3,
    status: "Returning Series",
    external_ids: { imdb_id: "tt7654321" },
    ...overrides,
  };
}

export function makeTmdbDiscoverMovie(overrides?: Partial<TmdbDiscoverMovieResult>): TmdbDiscoverMovieResult {
  return {
    id: 789,
    title: "Discover Movie",
    original_title: "Discover Movie",
    overview: "A discovered movie",
    release_date: "2024-03-20",
    poster_path: "/discover.jpg",
    genre_ids: [28, 12],
    vote_average: 6.5,
    vote_count: 500,
    popularity: 30,
    adult: false,
    original_language: "en",
    ...overrides,
  };
}

export function makeTmdbDiscoverTv(overrides?: Partial<TmdbDiscoverTvResult>): TmdbDiscoverTvResult {
  return {
    id: 101,
    name: "Discover Show",
    original_name: "Discover Show",
    overview: "A discovered show",
    first_air_date: "2024-05-01",
    poster_path: "/discovershow.jpg",
    genre_ids: [18],
    vote_average: 7.0,
    vote_count: 800,
    popularity: 40,
    original_language: "en",
    ...overrides,
  };
}

export function makeTmdbSearchMultiMovie(overrides?: Partial<TmdbSearchMultiResult>): TmdbSearchMultiResult {
  return {
    id: 200,
    media_type: "movie",
    title: "Search Movie",
    release_date: "2024-07-01",
    overview: "A searched movie",
    poster_path: "/search.jpg",
    genre_ids: [28],
    vote_average: 6.0,
    vote_count: 300,
    popularity: 20,
    ...overrides,
  };
}

export function makeTmdbSearchMultiTv(overrides?: Partial<TmdbSearchMultiResult>): TmdbSearchMultiResult {
  return {
    id: 300,
    media_type: "tv",
    name: "Search Show",
    first_air_date: "2024-08-01",
    overview: "A searched show",
    poster_path: "/searchshow.jpg",
    genre_ids: [18],
    vote_average: 7.5,
    vote_count: 600,
    popularity: 35,
    ...overrides,
  };
}
