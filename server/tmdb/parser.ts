import { CONFIG } from "../config";
import type {
  TmdbMovieDetails,
  TmdbTvDetails,
  TmdbWatchProviderCountry,
  TmdbWatchProviderEntry,
  TmdbDiscoverMovieResult,
  TmdbDiscoverTvResult,
  TmdbSearchMultiResult,
} from "./types";

// ─── Shared types (previously in justwatch/parser.ts) ───────────────────────

export interface ParsedTitle {
  id: string;
  objectType: "MOVIE" | "SHOW";
  title: string;
  originalTitle: string | null;
  releaseYear: number | null;
  releaseDate: string | null;
  runtimeMinutes: number | null;
  shortDescription: string | null;
  genres: string[];
  imdbId: string | null;
  tmdbId: string | null;
  posterUrl: string | null;
  ageCertification: string | null;
  tmdbUrl: string | null;
  offers: ParsedOffer[];
  scores: ParsedScores;
}

export interface ParsedOffer {
  titleId: string;
  providerId: number;
  providerName: string;
  providerTechnicalName: string;
  providerIconUrl: string;
  monetizationType: string;
  presentationType: string;
  priceValue: number | null;
  priceCurrency: string | null;
  url: string;
  availableTo: string | null;
}

export interface ParsedScores {
  imdbScore: number | null;
  imdbVotes: number | null;
  tmdbScore: number | null;
}

export interface ParsedProvider {
  id: number;
  name: string;
  technicalName: string;
  iconUrl: string;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function posterUrl(path: string | null): string | null {
  if (!path) return null;
  return `${CONFIG.TMDB_IMAGE_BASE_URL}/w342${path}`;
}

function providerIconUrl(path: string): string {
  return `${CONFIG.TMDB_IMAGE_BASE_URL}/w92${path}`;
}

function parseYear(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null;
  const year = parseInt(dateStr.substring(0, 4), 10);
  return isNaN(year) ? null : year;
}

function movieId(tmdbId: number): string {
  return `movie-${tmdbId}`;
}

function tvId(tmdbId: number): string {
  return `tv-${tmdbId}`;
}

function parseWatchProviders(
  wpResponse: { results: Record<string, TmdbWatchProviderCountry> } | undefined,
  titleId: string,
  tmdbLink: string
): ParsedOffer[] {
  if (!wpResponse) return [];
  const countryData = wpResponse.results[CONFIG.COUNTRY];
  if (!countryData) return [];

  const offers: ParsedOffer[] = [];
  const types: [string, TmdbWatchProviderEntry[] | undefined][] = [
    ["FLATRATE", countryData.flatrate],
    ["FREE", countryData.free],
    ["ADS", countryData.ads],
    ["RENT", countryData.rent],
    ["BUY", countryData.buy],
  ];

  for (const [monetizationType, entries] of types) {
    if (!entries) continue;
    for (const entry of entries) {
      offers.push({
        titleId,
        providerId: entry.provider_id,
        providerName: entry.provider_name,
        providerTechnicalName: entry.provider_name.toLowerCase().replace(/[^a-z0-9]+/g, "_"),
        providerIconUrl: providerIconUrl(entry.logo_path),
        monetizationType,
        presentationType: "",
        priceValue: null,
        priceCurrency: null,
        url: tmdbLink,
        availableTo: null,
      });
    }
  }

  return offers;
}

// ─── Parse full detail responses ────────────────────────────────────────────

export function parseMovieDetails(movie: TmdbMovieDetails): ParsedTitle {
  const id = movieId(movie.id);
  const tmdbUrl = `https://www.themoviedb.org/movie/${movie.id}`;

  return {
    id,
    objectType: "MOVIE",
    title: movie.title,
    originalTitle: movie.original_title || null,
    releaseYear: parseYear(movie.release_date),
    releaseDate: movie.release_date || null,
    runtimeMinutes: movie.runtime,
    shortDescription: movie.overview,
    genres: movie.genres.map((g) => g.name),
    imdbId: movie.external_ids?.imdb_id || null,
    tmdbId: String(movie.id),
    posterUrl: posterUrl(movie.poster_path),
    ageCertification: null,
    tmdbUrl,
    offers: parseWatchProviders(movie["watch/providers"], id, tmdbUrl),
    scores: {
      imdbScore: null,
      imdbVotes: null,
      tmdbScore: movie.vote_average || null,
    },
  };
}

export function parseTvDetails(tv: TmdbTvDetails): ParsedTitle {
  const id = tvId(tv.id);
  const tmdbUrl = `https://www.themoviedb.org/tv/${tv.id}`;
  const runtime = tv.episode_run_time?.length > 0 ? tv.episode_run_time[0] : null;

  return {
    id,
    objectType: "SHOW",
    title: tv.name,
    originalTitle: tv.original_name || null,
    releaseYear: parseYear(tv.first_air_date),
    releaseDate: tv.first_air_date || null,
    runtimeMinutes: runtime,
    shortDescription: tv.overview,
    genres: tv.genres.map((g) => g.name),
    imdbId: tv.external_ids?.imdb_id || null,
    tmdbId: String(tv.id),
    posterUrl: posterUrl(tv.poster_path),
    ageCertification: null,
    tmdbUrl,
    offers: parseWatchProviders(tv["watch/providers"], id, tmdbUrl),
    scores: {
      imdbScore: null,
      imdbVotes: null,
      tmdbScore: tv.vote_average || null,
    },
  };
}

// ─── Parse discover/search results (lightweight, no watch providers) ────────

export function parseDiscoverMovie(
  movie: TmdbDiscoverMovieResult,
  genreMap: Map<number, string>
): ParsedTitle {
  const id = movieId(movie.id);
  return {
    id,
    objectType: "MOVIE",
    title: movie.title,
    originalTitle: movie.original_title || null,
    releaseYear: parseYear(movie.release_date),
    releaseDate: movie.release_date || null,
    runtimeMinutes: null,
    shortDescription: movie.overview,
    genres: movie.genre_ids.map((gid) => genreMap.get(gid) || "").filter(Boolean),
    imdbId: null,
    tmdbId: String(movie.id),
    posterUrl: posterUrl(movie.poster_path),
    ageCertification: null,
    tmdbUrl: `https://www.themoviedb.org/movie/${movie.id}`,
    offers: [],
    scores: {
      imdbScore: null,
      imdbVotes: null,
      tmdbScore: movie.vote_average || null,
    },
  };
}

export function parseDiscoverTv(
  tv: TmdbDiscoverTvResult,
  genreMap: Map<number, string>
): ParsedTitle {
  const id = tvId(tv.id);
  return {
    id,
    objectType: "SHOW",
    title: tv.name,
    originalTitle: tv.original_name || null,
    releaseYear: parseYear(tv.first_air_date),
    releaseDate: tv.first_air_date || null,
    runtimeMinutes: null,
    shortDescription: tv.overview,
    genres: tv.genre_ids.map((gid) => genreMap.get(gid) || "").filter(Boolean),
    imdbId: null,
    tmdbId: String(tv.id),
    posterUrl: posterUrl(tv.poster_path),
    ageCertification: null,
    tmdbUrl: `https://www.themoviedb.org/tv/${tv.id}`,
    offers: [],
    scores: {
      imdbScore: null,
      imdbVotes: null,
      tmdbScore: tv.vote_average || null,
    },
  };
}

export function parseSearchResult(
  result: TmdbSearchMultiResult,
  genreMap: Map<number, string>
): ParsedTitle | null {
  if (result.media_type === "person") return null;

  if (result.media_type === "movie") {
    const id = movieId(result.id);
    return {
      id,
      objectType: "MOVIE",
      title: result.title || "",
      originalTitle: null,
      releaseYear: parseYear(result.release_date),
      releaseDate: result.release_date || null,
      runtimeMinutes: null,
      shortDescription: result.overview || null,
      genres: (result.genre_ids || []).map((gid) => genreMap.get(gid) || "").filter(Boolean),
      imdbId: null,
      tmdbId: String(result.id),
      posterUrl: posterUrl(result.poster_path || null),
      ageCertification: null,
      tmdbUrl: `https://www.themoviedb.org/movie/${result.id}`,
      offers: [],
      scores: {
        imdbScore: null,
        imdbVotes: null,
        tmdbScore: result.vote_average || null,
      },
    };
  }

  // TV
  const id = tvId(result.id);
  return {
    id,
    objectType: "SHOW",
    title: result.name || "",
    originalTitle: null,
    releaseYear: parseYear(result.first_air_date),
    releaseDate: result.first_air_date || null,
    runtimeMinutes: null,
    shortDescription: result.overview || null,
    genres: (result.genre_ids || []).map((gid) => genreMap.get(gid) || "").filter(Boolean),
    imdbId: null,
    tmdbId: String(result.id),
    posterUrl: posterUrl(result.poster_path || null),
    ageCertification: null,
    tmdbUrl: `https://www.themoviedb.org/tv/${result.id}`,
    offers: [],
    scores: {
      imdbScore: null,
      imdbVotes: null,
      tmdbScore: result.vote_average || null,
    },
  };
}

// ─── Provider extraction (for DB upsert) ────────────────────────────────────

export function extractProviders(titles: ParsedTitle[]): ParsedProvider[] {
  const seen = new Map<number, ParsedProvider>();
  for (const t of titles) {
    for (const o of t.offers) {
      if (!seen.has(o.providerId)) {
        seen.set(o.providerId, {
          id: o.providerId,
          name: o.providerName,
          technicalName: o.providerTechnicalName,
          iconUrl: o.providerIconUrl,
        });
      }
    }
  }
  return Array.from(seen.values());
}
