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

export interface NotificationStreamingAlert {
  titleId: string;
  title: string;
  posterUrl: string | null;
  providerName: string;
  kind: "arrival" | "departure";
  leavingAt?: string | null;
}

export interface NotificationAchievementEarned {
  key: string;
  title: string;
  description: string;
  icon: string;
  points: number;
  earnedAt: string;
}

export interface NotificationPersonCredit {
  personName: string;
  title: string;
  role: string | null;
  releaseDate: string | null;
  posterUrl: string | null;
}

export interface NotificationContent {
  episodes: NotificationEpisode[];
  movies: NotificationMovie[];
  date: string;
  streamingAlerts?: NotificationStreamingAlert[];
  achievementsEarned?: NotificationAchievementEarned[];
  personCredits?: NotificationPersonCredit[];
}

export interface NotificationProvider {
  readonly name: string;
  send(
    config: Record<string, string>,
    content: NotificationContent,
  ): Promise<void>;
  validateConfig(config: Record<string, string>): {
    valid: boolean;
    error?: string;
  };
}

/**
 * A delivery failure that retrying cannot fix: the destination is gone or the
 * credentials were revoked. The notification job disables the notifier instead
 * of retrying it (and logging an error) on every tick for the rest of the day.
 */
export class PermanentDeliveryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PermanentDeliveryError";
  }
}

// 401/403: credentials revoked or bot blocked; 404/410: webhook/topic deleted.
const PERMANENT_STATUSES = new Set([401, 403, 404, 410]);

/** Builds the error for a non-ok provider response, e.g. `Discord webhook failed (404)`. */
export function deliveryError(label: string, status: number): Error {
  const message = `${label} (${status})`;
  return PERMANENT_STATUSES.has(status)
    ? new PermanentDeliveryError(message)
    : new Error(message);
}
