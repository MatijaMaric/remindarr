import { CONFIG } from "../config";
import type {
  TmdbShowDetails,
  TmdbSeasonResponse,
  TmdbMovieDetails,
  TmdbTvDetails,
  TmdbDiscoverResponse,
  TmdbDiscoverMovieResult,
  TmdbDiscoverTvResult,
  TmdbSearchMultiResult,
  TmdbFindResponse,
  TmdbGenreListResponse,
} from "./types";

async function tmdbRequest<T>(path: string, params?: Record<string, string>): Promise<T> {
  const url = new URL(`${CONFIG.TMDB_BASE_URL}${path}`);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }
  }
  const res = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${CONFIG.TMDB_API_KEY}`,
      "Content-Type": "application/json",
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`TMDB API error ${res.status}: ${body}`);
  }
  return res.json() as Promise<T>;
}

function tmdbLanguage(): string {
  return `${CONFIG.LANGUAGE}-${CONFIG.COUNTRY}`;
}

// ─── Episode endpoints (existing) ───────────────────────────────────────────

export async function fetchShowDetails(tmdbId: string): Promise<TmdbShowDetails> {
  return tmdbRequest<TmdbShowDetails>(`/tv/${tmdbId}`);
}

export async function fetchSeasonEpisodes(tmdbId: string, seasonNumber: number): Promise<TmdbSeasonResponse> {
  return tmdbRequest<TmdbSeasonResponse>(`/tv/${tmdbId}/season/${seasonNumber}`);
}

// ─── Detail endpoints (with watch providers + external IDs) ─────────────────

export async function fetchMovieDetails(tmdbId: number): Promise<TmdbMovieDetails> {
  return tmdbRequest<TmdbMovieDetails>(`/movie/${tmdbId}`, {
    language: tmdbLanguage(),
    append_to_response: "watch/providers,external_ids",
  });
}

export async function fetchTvDetails(tmdbId: number): Promise<TmdbTvDetails> {
  return tmdbRequest<TmdbTvDetails>(`/tv/${tmdbId}`, {
    language: tmdbLanguage(),
    append_to_response: "watch/providers,external_ids",
  });
}

// ─── Discover endpoints ─────────────────────────────────────────────────────

export async function discoverMovies(options: {
  releaseDateGte?: string;
  releaseDateLte?: string;
  page?: number;
}): Promise<TmdbDiscoverResponse<TmdbDiscoverMovieResult>> {
  const params: Record<string, string> = {
    language: tmdbLanguage(),
    region: CONFIG.COUNTRY,
    sort_by: "release_date.desc",
    page: String(options.page || 1),
    "vote_count.gte": "0",
    watch_region: CONFIG.COUNTRY,
  };
  if (options.releaseDateGte) params["release_date.gte"] = options.releaseDateGte;
  if (options.releaseDateLte) params["release_date.lte"] = options.releaseDateLte;
  return tmdbRequest<TmdbDiscoverResponse<TmdbDiscoverMovieResult>>("/discover/movie", params);
}

export async function discoverTv(options: {
  firstAirDateGte?: string;
  firstAirDateLte?: string;
  page?: number;
}): Promise<TmdbDiscoverResponse<TmdbDiscoverTvResult>> {
  const params: Record<string, string> = {
    language: tmdbLanguage(),
    watch_region: CONFIG.COUNTRY,
    sort_by: "first_air_date.desc",
    page: String(options.page || 1),
  };
  if (options.firstAirDateGte) params["first_air_date.gte"] = options.firstAirDateGte;
  if (options.firstAirDateLte) params["first_air_date.lte"] = options.firstAirDateLte;
  return tmdbRequest<TmdbDiscoverResponse<TmdbDiscoverTvResult>>("/discover/tv", params);
}

// ─── Search ─────────────────────────────────────────────────────────────────

export async function searchMulti(
  query: string,
  page = 1
): Promise<TmdbDiscoverResponse<TmdbSearchMultiResult>> {
  return tmdbRequest<TmdbDiscoverResponse<TmdbSearchMultiResult>>("/search/multi", {
    query,
    language: tmdbLanguage(),
    region: CONFIG.COUNTRY,
    page: String(page),
  });
}

// ─── Find by external ID ────────────────────────────────────────────────────

export async function findByImdbId(imdbId: string): Promise<TmdbFindResponse> {
  return tmdbRequest<TmdbFindResponse>(`/find/${imdbId}`, {
    external_source: "imdb_id",
    language: tmdbLanguage(),
  });
}

// ─── Genre lists (for mapping genre_ids to names) ───────────────────────────

let movieGenreCache: Map<number, string> | null = null;
let tvGenreCache: Map<number, string> | null = null;

export async function getMovieGenres(): Promise<Map<number, string>> {
  if (movieGenreCache) return movieGenreCache;
  const data = await tmdbRequest<TmdbGenreListResponse>("/genre/movie/list", {
    language: tmdbLanguage(),
  });
  movieGenreCache = new Map(data.genres.map((g) => [g.id, g.name]));
  return movieGenreCache;
}

export async function getTvGenres(): Promise<Map<number, string>> {
  if (tvGenreCache) return tvGenreCache;
  const data = await tmdbRequest<TmdbGenreListResponse>("/genre/tv/list", {
    language: tmdbLanguage(),
  });
  tvGenreCache = new Map(data.genres.map((g) => [g.id, g.name]));
  return tvGenreCache;
}
