// ─── Existing episode types ──────────────────────────────────────────────────

export interface TmdbEpisode {
  id: number;
  name: string;
  overview: string;
  air_date: string | null;
  episode_number: number;
  season_number: number;
  still_path: string | null;
}

export interface TmdbSeasonResponse {
  id: number;
  season_number: number;
  episodes: TmdbEpisode[];
}

export interface TmdbShowDetails {
  id: number;
  name: string;
  status: string;
  number_of_seasons: number;
  next_episode_to_air: TmdbEpisode | null;
  last_episode_to_air: TmdbEpisode | null;
}

// ─── Movie / TV detail types (with append_to_response) ─────────────────────

export interface TmdbGenre {
  id: number;
  name: string;
}

export interface TmdbExternalIds {
  imdb_id: string | null;
  tvdb_id?: number | null;
}

export interface TmdbWatchProviderEntry {
  logo_path: string;
  provider_id: number;
  provider_name: string;
  display_priority: number;
}

export interface TmdbWatchProviderCountry {
  link: string;
  flatrate?: TmdbWatchProviderEntry[];
  rent?: TmdbWatchProviderEntry[];
  buy?: TmdbWatchProviderEntry[];
  free?: TmdbWatchProviderEntry[];
  ads?: TmdbWatchProviderEntry[];
}

export interface TmdbWatchProviderResponse {
  id: number;
  results: Record<string, TmdbWatchProviderCountry>;
}

export interface TmdbMovieDetails {
  id: number;
  title: string;
  overview: string | null;
  release_date: string;
  runtime: number | null;
  genres: TmdbGenre[];
  poster_path: string | null;
  adult: boolean;
  vote_average: number;
  vote_count: number;
  popularity: number;
  original_language: string;
  // append_to_response fields
  external_ids?: TmdbExternalIds;
  "watch/providers"?: TmdbWatchProviderResponse;
}

export interface TmdbTvDetails {
  id: number;
  name: string;
  overview: string | null;
  first_air_date: string;
  episode_run_time: number[];
  genres: TmdbGenre[];
  poster_path: string | null;
  vote_average: number;
  vote_count: number;
  popularity: number;
  original_language: string;
  number_of_seasons: number;
  status: string;
  // append_to_response fields
  external_ids?: TmdbExternalIds;
  "watch/providers"?: TmdbWatchProviderResponse;
}

// ─── Discover / Search types ────────────────────────────────────────────────

export interface TmdbDiscoverMovieResult {
  id: number;
  title: string;
  overview: string | null;
  release_date: string;
  poster_path: string | null;
  genre_ids: number[];
  vote_average: number;
  vote_count: number;
  popularity: number;
  adult: boolean;
  original_language: string;
}

export interface TmdbDiscoverTvResult {
  id: number;
  name: string;
  overview: string | null;
  first_air_date: string;
  poster_path: string | null;
  genre_ids: number[];
  vote_average: number;
  vote_count: number;
  popularity: number;
  original_language: string;
}

export interface TmdbDiscoverResponse<T> {
  page: number;
  total_pages: number;
  total_results: number;
  results: T[];
}

export interface TmdbSearchMultiResult {
  id: number;
  media_type: "movie" | "tv" | "person";
  // Movie fields
  title?: string;
  release_date?: string;
  // TV fields
  name?: string;
  first_air_date?: string;
  // Common fields
  overview?: string | null;
  poster_path?: string | null;
  genre_ids?: number[];
  vote_average?: number;
  vote_count?: number;
  popularity?: number;
}

// ─── Find (by external ID) ─────────────────────────────────────────────────

export interface TmdbFindResponse {
  movie_results: TmdbDiscoverMovieResult[];
  tv_results: TmdbDiscoverTvResult[];
}

// ─── Genre list ─────────────────────────────────────────────────────────────

export interface TmdbGenreListResponse {
  genres: TmdbGenre[];
}
