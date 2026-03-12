export interface NotificationEpisode {
  showTitle: string;
  seasonNumber: number;
  episodeNumber: number;
  episodeName: string | null;
  posterUrl: string | null;
  offers: Array<{ providerName: string; providerIconUrl: string | null }>;
}

export interface NotificationMovie {
  title: string;
  releaseYear: number | null;
  posterUrl: string | null;
  offers: Array<{ providerName: string; providerIconUrl: string | null }>;
}

export interface NotificationContent {
  episodes: NotificationEpisode[];
  movies: NotificationMovie[];
  date: string;
}

export interface NotificationProvider {
  readonly name: string;
  send(
    config: Record<string, string>,
    content: NotificationContent
  ): Promise<void>;
  validateConfig(
    config: Record<string, string>
  ): { valid: boolean; error?: string };
}
