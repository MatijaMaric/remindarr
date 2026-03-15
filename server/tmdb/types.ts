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
  facebook_id?: string | null;
  instagram_id?: string | null;
  twitter_id?: string | null;
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
  original_title: string;
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
  original_name: string;
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
  original_title: string;
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
  original_name: string;
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

// ─── Watch provider list ────────────────────────────────────────────────────

export interface TmdbWatchProviderListEntry {
  provider_id: number;
  provider_name: string;
  logo_path: string;
  display_priority: number;
  display_priorities: Record<string, number>;
}

export interface TmdbWatchProviderListResponse {
  results: TmdbWatchProviderListEntry[];
}

// ─── Language list ──────────────────────────────────────────────────────────

export interface TmdbLanguage {
  iso_639_1: string;
  english_name: string;
  name: string;
}

// ─── Full Detail Types (for detail pages with credits, release dates) ───────

export interface TmdbCastMember {
  id: number;
  name: string;
  character: string;
  profile_path: string | null;
  order: number;
}

export interface TmdbCrewMember {
  id: number;
  name: string;
  job: string;
  department: string;
  profile_path: string | null;
}

export interface TmdbCredits {
  cast: TmdbCastMember[];
  crew: TmdbCrewMember[];
}

export interface TmdbProductionCompany {
  id: number;
  name: string;
  logo_path: string | null;
  origin_country: string;
}

export interface TmdbProductionCountry {
  iso_3166_1: string;
  name: string;
}

export interface TmdbSpokenLanguage {
  iso_639_1: string;
  english_name: string;
  name: string;
}

export interface TmdbReleaseDateEntry {
  certification: string;
  iso_639_1: string;
  note: string;
  release_date: string;
  type: number; // 1=Premiere, 2=Theatrical (limited), 3=Theatrical, 4=Digital, 5=Physical, 6=TV
}

export interface TmdbReleaseDatesResult {
  iso_3166_1: string;
  release_dates: TmdbReleaseDateEntry[];
}

export interface TmdbNetwork {
  id: number;
  name: string;
  logo_path: string | null;
  origin_country: string;
}

export interface TmdbSeasonSummary {
  id: number;
  name: string;
  overview: string;
  air_date: string | null;
  episode_count: number;
  poster_path: string | null;
  season_number: number;
  vote_average: number;
}

export interface TmdbCreatedBy {
  id: number;
  name: string;
  profile_path: string | null;
}

export interface TmdbContentRatingResult {
  iso_3166_1: string;
  rating: string;
}

export interface TmdbMovieFullDetails {
  id: number;
  title: string;
  original_title: string;
  overview: string;
  tagline: string;
  runtime: number;
  release_date: string;
  status: string;
  budget: number;
  revenue: number;
  original_language: string;
  genres: TmdbGenre[];
  production_companies: TmdbProductionCompany[];
  production_countries: TmdbProductionCountry[];
  spoken_languages: TmdbSpokenLanguage[];
  poster_path: string | null;
  backdrop_path: string | null;
  vote_average: number;
  vote_count: number;
  imdb_id: string | null;
  credits: TmdbCredits;
  release_dates: { results: TmdbReleaseDatesResult[] };
  "watch/providers": { results: Record<string, TmdbWatchProviderCountry> };
  external_ids?: TmdbExternalIds;
}

export interface TmdbShowFullDetails {
  id: number;
  name: string;
  original_name: string;
  overview: string;
  tagline: string;
  first_air_date: string;
  last_air_date: string;
  status: string;
  type: string;
  number_of_seasons: number;
  number_of_episodes: number;
  episode_run_time: number[];
  original_language: string;
  genres: TmdbGenre[];
  created_by: TmdbCreatedBy[];
  networks: TmdbNetwork[];
  production_companies: TmdbProductionCompany[];
  production_countries: TmdbProductionCountry[];
  spoken_languages: TmdbSpokenLanguage[];
  seasons: TmdbSeasonSummary[];
  poster_path: string | null;
  backdrop_path: string | null;
  vote_average: number;
  vote_count: number;
  next_episode_to_air: TmdbEpisode | null;
  last_episode_to_air: TmdbEpisode | null;
  credits: TmdbCredits;
  content_ratings: { results: TmdbContentRatingResult[] };
  "watch/providers": { results: Record<string, TmdbWatchProviderCountry> };
  external_ids?: TmdbExternalIds;
}

export interface TmdbSeasonDetails {
  id: number;
  name: string;
  overview: string;
  air_date: string | null;
  poster_path: string | null;
  season_number: number;
  vote_average: number;
  episodes: (TmdbEpisode & {
    runtime: number | null;
    vote_average: number;
    guest_stars: TmdbCastMember[];
    crew: TmdbCrewMember[];
  })[];
  credits: TmdbCredits;
}

export interface TmdbEpisodeDetails {
  id: number;
  name: string;
  overview: string;
  air_date: string | null;
  episode_number: number;
  season_number: number;
  still_path: string | null;
  runtime: number | null;
  vote_average: number;
  vote_count: number;
  guest_stars: TmdbCastMember[];
  crew: TmdbCrewMember[];
  credits: TmdbCredits;
}

// ─── Person Types ────────────────────────────────────────────────────────────

export interface TmdbPersonCastCredit {
  id: number;
  media_type: "movie" | "tv";
  title?: string;
  name?: string;
  character: string;
  release_date?: string;
  first_air_date?: string;
  poster_path: string | null;
  vote_average: number;
  vote_count: number;
  popularity: number;
}

export interface TmdbPersonCrewCredit {
  id: number;
  media_type: "movie" | "tv";
  title?: string;
  name?: string;
  job: string;
  department: string;
  release_date?: string;
  first_air_date?: string;
  poster_path: string | null;
  vote_average: number;
  vote_count: number;
  popularity: number;
}

export interface TmdbPersonCombinedCredits {
  cast: TmdbPersonCastCredit[];
  crew: TmdbPersonCrewCredit[];
}

export interface TmdbPersonDetails {
  id: number;
  name: string;
  biography: string;
  birthday: string | null;
  deathday: string | null;
  place_of_birth: string | null;
  known_for_department: string;
  profile_path: string | null;
  also_known_as: string[];
  popularity: number;
  combined_credits: TmdbPersonCombinedCredits;
  external_ids?: TmdbExternalIds;
}
