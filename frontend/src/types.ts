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
  release_year: number | null;
  release_date: string | null;
  runtime_minutes: number | null;
  short_description: string | null;
  genres: string[];
  imdb_id: string | null;
  tmdb_id: string | null;
  poster_url: string | null;
  age_certification: string | null;
  tmdb_url: string | null;
  imdb_score: number | null;
  imdb_votes: number | null;
  tmdb_score: number | null;
  is_tracked: boolean;
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
  is_watched?: boolean;
  offers?: Offer[];
}

// Search results come from the API directly with different shape
export interface SearchTitle {
  id: string;
  objectType: "MOVIE" | "SHOW";
  title: string;
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
  offers: SearchOffer[];
  scores: {
    imdbScore: number | null;
    imdbVotes: number | null;
    tmdbScore: number | null;
  };
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

// Normalize search results to same shape as DB titles
export function normalizeSearchTitle(t: SearchTitle): Title {
  return {
    id: t.id,
    object_type: t.objectType,
    title: t.title,
    release_year: t.releaseYear,
    release_date: t.releaseDate,
    runtime_minutes: t.runtimeMinutes,
    short_description: t.shortDescription,
    genres: t.genres,
    imdb_id: t.imdbId,
    tmdb_id: t.tmdbId,
    poster_url: t.posterUrl,
    age_certification: t.ageCertification,
    tmdb_url: t.tmdbUrl,
    imdb_score: t.scores.imdbScore,
    imdb_votes: t.scores.imdbVotes,
    tmdb_score: t.scores.tmdbScore,
    is_tracked: false,
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
