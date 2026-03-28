export interface ExternalIds {
  imdb_id?: string | null;
  facebook_id?: string | null;
  instagram_id?: string | null;
  twitter_id?: string | null;
}

export interface Offer {
  id: number;
  title_id: string;
  provider_id: number;
  monetization_type: string;
  presentation_type: string;
  price_value: number | null;
  price_currency: string | null;
  url: string;
  available_to: string | null;
  provider_name: string;
  provider_technical_name: string;
  provider_icon_url: string;
}

export interface Title {
  id: string;
  object_type: "MOVIE" | "SHOW";
  title: string;
  original_title: string | null;
  release_year: number | null;
  release_date: string | null;
  runtime_minutes: number | null;
  short_description: string | null;
  genres: string[];
  imdb_id: string | null;
  tmdb_id: string | null;
  poster_url: string | null;
  age_certification: string | null;
  original_language: string | null;
  tmdb_url: string | null;
  imdb_score: number | null;
  imdb_votes: number | null;
  tmdb_score: number | null;
  is_tracked: boolean;
  is_public?: boolean;
  is_watched?: boolean;
  total_episodes?: number;
  watched_episodes_count?: number;
  offers: Offer[];
  tracked_at?: string;
  notes?: string;
}

export interface Episode {
  id: number;
  title_id: string;
  season_number: number;
  episode_number: number;
  name: string | null;
  overview: string | null;
  air_date: string | null;
  still_path: string | null;
  show_title: string;
  poster_url: string | null;
  backdrop_url?: string | null;
  is_watched?: boolean;
  offers?: Offer[];
}

// Search results come from the API directly with different shape
export interface SearchTitle {
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
  originalLanguage: string | null;
  tmdbUrl: string | null;
  offers: SearchOffer[];
  scores: {
    imdbScore: number | null;
    imdbVotes: number | null;
    tmdbScore: number | null;
  };
  isTracked?: boolean;
}

export interface SearchOffer {
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

export interface Provider {
  id: number;
  name: string;
  technical_name: string;
  icon_url: string;
}

// ─── Detail Types ────────────────────────────────────────────────────────────

export interface CastMember {
  id: number;
  name: string;
  character: string;
  profile_path: string | null;
  order: number;
}

export interface CrewMember {
  id: number;
  name: string;
  job: string;
  department: string;
  profile_path: string | null;
}

export interface TmdbGenre {
  id: number;
  name: string;
}

export interface ReleaseDateEntry {
  certification: string;
  note: string;
  release_date: string;
  type: number; // 1=Premiere, 2=Theatrical (limited), 3=Theatrical, 4=Digital, 5=Physical, 6=TV
}

export interface ReleaseDatesResult {
  iso_3166_1: string;
  release_dates: ReleaseDateEntry[];
}

export interface WatchProviderEntry {
  logo_path: string;
  provider_id: number;
  provider_name: string;
  display_priority: number;
}

export interface WatchProviderCountry {
  link: string;
  flatrate?: WatchProviderEntry[];
  rent?: WatchProviderEntry[];
  buy?: WatchProviderEntry[];
  ads?: WatchProviderEntry[];
  free?: WatchProviderEntry[];
}

export interface ProductionCompany {
  id: number;
  name: string;
  logo_path: string | null;
  origin_country: string;
}

export interface SpokenLanguage {
  iso_639_1: string;
  english_name: string;
  name: string;
}

export interface SeasonSummary {
  id: number;
  name: string;
  overview: string;
  air_date: string | null;
  episode_count: number;
  poster_path: string | null;
  season_number: number;
  vote_average: number;
}

export interface Network {
  id: number;
  name: string;
  logo_path: string | null;
  origin_country: string;
}

export interface MovieDetailsResponse {
  title: Title;
  tmdb: {
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
    production_companies: ProductionCompany[];
    production_countries: { iso_3166_1: string; name: string }[];
    spoken_languages: SpokenLanguage[];
    poster_path: string | null;
    backdrop_path: string | null;
    vote_average: number;
    vote_count: number;
    imdb_id: string | null;
    credits: { cast: CastMember[]; crew: CrewMember[] };
    release_dates: { results: ReleaseDatesResult[] };
    "watch/providers": { results: Record<string, WatchProviderCountry> };
    external_ids?: ExternalIds;
  } | null;
  country: string;
}

export interface ShowDetailsResponse {
  title: Title;
  tmdb: {
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
    created_by: { id: number; name: string; profile_path: string | null }[];
    networks: Network[];
    production_companies: ProductionCompany[];
    production_countries: { iso_3166_1: string; name: string }[];
    spoken_languages: SpokenLanguage[];
    seasons: SeasonSummary[];
    poster_path: string | null;
    backdrop_path: string | null;
    vote_average: number;
    vote_count: number;
    credits: { cast: CastMember[]; crew: CrewMember[] };
    content_ratings: { results: { iso_3166_1: string; rating: string }[] };
    "watch/providers": { results: Record<string, WatchProviderCountry> };
    external_ids?: ExternalIds;
  } | null;
  country: string;
}

export interface SeasonDetailsResponse {
  title: Title;
  tmdb: {
    id: number;
    name: string;
    overview: string;
    air_date: string | null;
    poster_path: string | null;
    season_number: number;
    vote_average: number;
    episodes: {
      id: number;
      name: string;
      overview: string;
      air_date: string | null;
      episode_number: number;
      season_number: number;
      still_path: string | null;
      runtime: number | null;
      vote_average: number;
      guest_stars: CastMember[];
      crew: CrewMember[];
    }[];
    credits: { cast: CastMember[]; crew: CrewMember[] };
  } | null;
  seasonNumber: number;
  country: string;
}

export interface EpisodeDetailsResponse {
  title: Title;
  tmdb: {
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
    guest_stars: CastMember[];
    crew: CrewMember[];
    credits: { cast: CastMember[]; crew: CrewMember[] };
  } | null;
  seasonNumber: number;
  episodeNumber: number;
  country: string;
}

// ─── Person Types ────────────────────────────────────────────────────────────

export interface PersonCastCredit {
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

export interface PersonCrewCredit {
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

export interface PersonDetailsResponse {
  person: {
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
    combined_credits: {
      cast: PersonCastCredit[];
      crew: PersonCrewCredit[];
    };
    external_ids?: ExternalIds;
  };
}

// ─── Admin Settings Types ────────────────────────────────────────────────────

export interface OidcSettingField {
  value: string;
  source: "env" | "db" | "unset";
}

export interface AdminSettings {
  oidc: {
    issuer_url: OidcSettingField;
    client_id: OidcSettingField;
    client_secret: OidcSettingField;
    redirect_uri: OidcSettingField;
    admin_claim: OidcSettingField;
    admin_value: OidcSettingField;
  };
  oidc_configured: boolean;
}

export interface AdminSettingsUpdateRequest {
  oidc_issuer_url?: string;
  oidc_client_id?: string;
  oidc_client_secret?: string;
  oidc_redirect_uri?: string;
  oidc_admin_claim?: string;
  oidc_admin_value?: string;
}

export interface AdminSettingsUpdateResponse {
  success: boolean;
  oidc_configured: boolean;
}

// ─── User Profile Types ─────────────────────────────────────────────────────

export interface UserProfileUser {
  username: string;
  display_name: string | null;
  image: string | null;
  member_since: string | null;
}

export interface UserProfileStats {
  tracked_count: number;
  watched_movies: number;
  watched_episodes: number;
}

export interface UserProfileResponse {
  user: UserProfileUser;
  stats: UserProfileStats;
  movies: Title[];
  shows: Title[];
  show_watchlist: boolean;
  is_own_profile: boolean;
}

// Normalize search results to same shape as DB titles
export function normalizeSearchTitle(t: SearchTitle): Title {
  return {
    id: t.id,
    object_type: t.objectType,
    title: t.title,
    original_title: t.originalTitle,
    release_year: t.releaseYear,
    release_date: t.releaseDate,
    runtime_minutes: t.runtimeMinutes,
    short_description: t.shortDescription,
    genres: t.genres,
    imdb_id: t.imdbId,
    tmdb_id: t.tmdbId,
    poster_url: t.posterUrl,
    age_certification: t.ageCertification,
    original_language: t.originalLanguage,
    tmdb_url: t.tmdbUrl,
    imdb_score: t.scores.imdbScore,
    imdb_votes: t.scores.imdbVotes,
    tmdb_score: t.scores.tmdbScore,
    is_tracked: t.isTracked ?? false,
    is_watched: false,
    offers: t.offers.map((o, i) => ({
      id: i,
      title_id: t.id,
      provider_id: o.providerId,
      monetization_type: o.monetizationType,
      presentation_type: o.presentationType,
      price_value: o.priceValue,
      price_currency: o.priceCurrency,
      url: o.url,
      available_to: o.availableTo,
      provider_name: o.providerName,
      provider_technical_name: o.providerTechnicalName,
      provider_icon_url: o.providerIconUrl,
    })),
  };
}
