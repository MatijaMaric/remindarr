import { CONFIG } from "../config";
import { traceHttp } from "../tracing";
import { getCache } from "../cache";
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
  TmdbWatchProviderListResponse,
  TmdbLanguage,
  TmdbMovieFullDetails,
  TmdbShowFullDetails,
  TmdbSeasonDetails,
  TmdbEpisodeDetails,
  TmdbPersonDetails,
} from "./types";

async function tmdbRequest<T>(path: string, params?: Record<string, string>): Promise<T> {
  const url = new URL(`${CONFIG.TMDB_BASE_URL}${path}`);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }
  }
  return traceHttp("GET", url.toString(), async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), CONFIG.TMDB_API_TIMEOUT_MS);
    try {
      const res = await fetch(url.toString(), {
        headers: {
          Authorization: `Bearer ${CONFIG.TMDB_API_KEY}`,
          "Content-Type": "application/json",
        },
        signal: controller.signal,
      });
      if (!res.ok) {
        const body = await res.text();
        throw new Error(`TMDB API error ${res.status}: ${body}`);
      }
      return res.json() as Promise<T>;
    } finally {
      clearTimeout(timeout);
    }
  });
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

// ─── Full detail endpoints (for detail pages with credits, release dates) ───

export async function fetchMovieFullDetails(tmdbId: string): Promise<TmdbMovieFullDetails> {
  return tmdbRequest<TmdbMovieFullDetails>(`/movie/${tmdbId}`, {
    language: tmdbLanguage(),
    append_to_response: "credits,release_dates,watch/providers,external_ids",
  });
}

export async function fetchShowFullDetails(tmdbId: string): Promise<TmdbShowFullDetails> {
  return tmdbRequest<TmdbShowFullDetails>(`/tv/${tmdbId}`, {
    language: tmdbLanguage(),
    append_to_response: "credits,content_ratings,watch/providers,external_ids",
  });
}

export async function fetchSeasonDetails(tmdbId: string, seasonNumber: number): Promise<TmdbSeasonDetails> {
  return tmdbRequest<TmdbSeasonDetails>(`/tv/${tmdbId}/season/${seasonNumber}`, {
    language: tmdbLanguage(),
    append_to_response: "credits",
  });
}

export async function fetchEpisodeDetails(
  tmdbId: string,
  seasonNumber: number,
  episodeNumber: number
): Promise<TmdbEpisodeDetails> {
  return tmdbRequest<TmdbEpisodeDetails>(`/tv/${tmdbId}/season/${seasonNumber}/episode/${episodeNumber}`, {
    language: tmdbLanguage(),
    append_to_response: "credits",
  });
}

// ─── Person endpoints ────────────────────────────────────────────────────────

export async function fetchPersonDetails(personId: number): Promise<TmdbPersonDetails> {
  return tmdbRequest<TmdbPersonDetails>(`/person/${personId}`, {
    language: tmdbLanguage(),
    append_to_response: "combined_credits,external_ids",
  });
}

// ─── Discover endpoints ─────────────────────────────────────────────────────

export interface DiscoverFilters {
  withGenres?: string;       // comma-separated TMDB genre IDs
  withProviders?: string;    // comma-separated TMDB provider IDs
  withOriginalLanguage?: string; // ISO 639-1 language code
  yearMin?: number;          // earliest release/first-air year (inclusive)
  yearMax?: number;          // latest release/first-air year (inclusive)
  voteAverageGte?: number;   // minimum TMDB vote average
}

export async function discoverMovies(options: {
  releaseDateGte?: string;
  releaseDateLte?: string;
  page?: number;
  sortBy?: string;
  voteCountGte?: string;
  filters?: DiscoverFilters;
}): Promise<TmdbDiscoverResponse<TmdbDiscoverMovieResult>> {
  const params: Record<string, string> = {
    language: tmdbLanguage(),
    region: CONFIG.COUNTRY,
    sort_by: options.sortBy || "release_date.desc",
    page: String(options.page || 1),
    "vote_count.gte": options.voteCountGte || "0",
    watch_region: CONFIG.COUNTRY,
  };
  // Intersect category's default date range with user-supplied year filter
  // (more restrictive bound wins, so "upcoming" stays in the future even if a
  // wider year range is requested).
  let dateGte = options.releaseDateGte;
  let dateLte = options.releaseDateLte;
  if (options.filters?.yearMin != null) {
    const userMin = `${options.filters.yearMin}-01-01`;
    dateGte = !dateGte || userMin > dateGte ? userMin : dateGte;
  }
  if (options.filters?.yearMax != null) {
    const userMax = `${options.filters.yearMax}-12-31`;
    dateLte = !dateLte || userMax < dateLte ? userMax : dateLte;
  }
  if (dateGte) params["release_date.gte"] = dateGte;
  if (dateLte) params["release_date.lte"] = dateLte;
  if (options.filters?.withGenres) params["with_genres"] = options.filters.withGenres;
  if (options.filters?.withProviders) params["with_watch_providers"] = options.filters.withProviders;
  if (options.filters?.withOriginalLanguage) params["with_original_language"] = options.filters.withOriginalLanguage;
  if (options.filters?.voteAverageGte != null) params["vote_average.gte"] = String(options.filters.voteAverageGte);
  return tmdbRequest<TmdbDiscoverResponse<TmdbDiscoverMovieResult>>("/discover/movie", params);
}

export async function discoverTv(options: {
  firstAirDateGte?: string;
  firstAirDateLte?: string;
  page?: number;
  sortBy?: string;
  voteCountGte?: string;
  filters?: DiscoverFilters;
}): Promise<TmdbDiscoverResponse<TmdbDiscoverTvResult>> {
  const params: Record<string, string> = {
    language: tmdbLanguage(),
    watch_region: CONFIG.COUNTRY,
    sort_by: options.sortBy || "first_air_date.desc",
    page: String(options.page || 1),
  };
  if (options.voteCountGte) params["vote_count.gte"] = options.voteCountGte;
  // Intersect category's default first-air range with user year filter
  let dateGte = options.firstAirDateGte;
  let dateLte = options.firstAirDateLte;
  if (options.filters?.yearMin != null) {
    const userMin = `${options.filters.yearMin}-01-01`;
    dateGte = !dateGte || userMin > dateGte ? userMin : dateGte;
  }
  if (options.filters?.yearMax != null) {
    const userMax = `${options.filters.yearMax}-12-31`;
    dateLte = !dateLte || userMax < dateLte ? userMax : dateLte;
  }
  if (dateGte) params["first_air_date.gte"] = dateGte;
  if (dateLte) params["first_air_date.lte"] = dateLte;
  if (options.filters?.withGenres) params["with_genres"] = options.filters.withGenres;
  if (options.filters?.withProviders) params["with_watch_providers"] = options.filters.withProviders;
  if (options.filters?.withOriginalLanguage) params["with_original_language"] = options.filters.withOriginalLanguage;
  if (options.filters?.voteAverageGte != null) params["vote_average.gte"] = String(options.filters.voteAverageGte);
  return tmdbRequest<TmdbDiscoverResponse<TmdbDiscoverTvResult>>("/discover/tv", params);
}

// ─── Category endpoints (popular, upcoming, top rated) ─────────────────────

export async function fetchPopularMovies(page = 1): Promise<TmdbDiscoverResponse<TmdbDiscoverMovieResult>> {
  return tmdbRequest<TmdbDiscoverResponse<TmdbDiscoverMovieResult>>("/movie/popular", {
    language: tmdbLanguage(),
    region: CONFIG.COUNTRY,
    page: String(page),
  });
}

export async function fetchPopularTv(page = 1): Promise<TmdbDiscoverResponse<TmdbDiscoverTvResult>> {
  return tmdbRequest<TmdbDiscoverResponse<TmdbDiscoverTvResult>>("/tv/popular", {
    language: tmdbLanguage(),
    page: String(page),
  });
}

export async function fetchUpcomingMovies(page = 1): Promise<TmdbDiscoverResponse<TmdbDiscoverMovieResult>> {
  return tmdbRequest<TmdbDiscoverResponse<TmdbDiscoverMovieResult>>("/movie/upcoming", {
    language: tmdbLanguage(),
    region: CONFIG.COUNTRY,
    page: String(page),
  });
}

export async function fetchOnTheAirTv(page = 1): Promise<TmdbDiscoverResponse<TmdbDiscoverTvResult>> {
  return tmdbRequest<TmdbDiscoverResponse<TmdbDiscoverTvResult>>("/tv/on_the_air", {
    language: tmdbLanguage(),
    page: String(page),
  });
}

export async function fetchTopRatedMovies(page = 1): Promise<TmdbDiscoverResponse<TmdbDiscoverMovieResult>> {
  return tmdbRequest<TmdbDiscoverResponse<TmdbDiscoverMovieResult>>("/movie/top_rated", {
    language: tmdbLanguage(),
    region: CONFIG.COUNTRY,
    page: String(page),
  });
}

export async function fetchTopRatedTv(page = 1): Promise<TmdbDiscoverResponse<TmdbDiscoverTvResult>> {
  return tmdbRequest<TmdbDiscoverResponse<TmdbDiscoverTvResult>>("/tv/top_rated", {
    language: tmdbLanguage(),
    page: String(page),
  });
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

// ─── Cached TMDB helper ─────────────────────────────────────────────────────

async function cachedTmdbRequest<T>(
  cacheKey: string,
  ttlSeconds: number,
  fetcher: () => Promise<T>,
): Promise<T> {
  const cache = getCache();
  const cached = await cache.get<T>(cacheKey);
  if (cached !== null) return cached;
  const result = await fetcher();
  await cache.set(cacheKey, result, ttlSeconds);
  return result;
}

// ─── Genre lists (for mapping genre_ids to names) ───────────────────────────

export async function getMovieGenres(): Promise<Map<number, string>> {
  const entries = await cachedTmdbRequest<[number, string][]>(
    `tmdb:genres:movie:${tmdbLanguage()}`,
    CONFIG.CACHE_TTL_GENRES,
    async () => {
      const data = await tmdbRequest<TmdbGenreListResponse>("/genre/movie/list", {
        language: tmdbLanguage(),
      });
      return data.genres.map((g) => [g.id, g.name]);
    },
  );
  return new Map(entries);
}

export async function getTvGenres(): Promise<Map<number, string>> {
  const entries = await cachedTmdbRequest<[number, string][]>(
    `tmdb:genres:tv:${tmdbLanguage()}`,
    CONFIG.CACHE_TTL_GENRES,
    async () => {
      const data = await tmdbRequest<TmdbGenreListResponse>("/genre/tv/list", {
        language: tmdbLanguage(),
      });
      return data.genres.map((g) => [g.id, g.name]);
    },
  );
  return new Map(entries);
}

// ─── Watch provider lists (for filter dropdowns) ────────────────────────────

export async function getMovieWatchProviders(): Promise<{ id: number; name: string; iconUrl: string }[]> {
  return cachedTmdbRequest(
    `tmdb:providers:movie:${CONFIG.COUNTRY}:${tmdbLanguage()}`,
    CONFIG.CACHE_TTL_PROVIDERS,
    async () => {
      const data = await tmdbRequest<TmdbWatchProviderListResponse>("/watch/providers/movie", {
        watch_region: CONFIG.COUNTRY,
        language: tmdbLanguage(),
      });
      return data.results.map((p) => ({
        id: p.provider_id,
        name: p.provider_name,
        iconUrl: `${CONFIG.TMDB_IMAGE_BASE_URL}/w92${p.logo_path}`,
      }));
    },
  );
}

export async function getTvWatchProviders(): Promise<{ id: number; name: string; iconUrl: string }[]> {
  return cachedTmdbRequest(
    `tmdb:providers:tv:${CONFIG.COUNTRY}:${tmdbLanguage()}`,
    CONFIG.CACHE_TTL_PROVIDERS,
    async () => {
      const data = await tmdbRequest<TmdbWatchProviderListResponse>("/watch/providers/tv", {
        watch_region: CONFIG.COUNTRY,
        language: tmdbLanguage(),
      });
      return data.results.map((p) => ({
        id: p.provider_id,
        name: p.provider_name,
        iconUrl: `${CONFIG.TMDB_IMAGE_BASE_URL}/w92${p.logo_path}`,
      }));
    },
  );
}

// ─── Language list ──────────────────────────────────────────────────────────

export async function getLanguages(): Promise<{ code: string; name: string }[]> {
  return cachedTmdbRequest(
    "tmdb:languages",
    CONFIG.CACHE_TTL_LANGUAGES,
    async () => {
      const data = await tmdbRequest<TmdbLanguage[]>("/configuration/languages");
      return data
        .map((l) => ({ code: l.iso_639_1, name: l.english_name }))
        .filter((l) => l.name && l.name !== "No Language")
        .sort((a, b) => a.name.localeCompare(b.name));
    },
  );
}
