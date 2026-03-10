export interface TmdbShowDetails {
  id: number;
  name: string;
  status: string; // "Returning Series", "Ended", "Canceled", etc.
  number_of_seasons: number;
  next_episode_to_air: TmdbEpisode | null;
  last_episode_to_air: TmdbEpisode | null;
}

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
