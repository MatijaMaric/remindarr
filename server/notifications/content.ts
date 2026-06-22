import {
  getEpisodesByDateRange,
  getTrackedMoviesByReleaseDate,
  getTrackedMoviesByReleaseDateRange,
} from "../db/repository";
import type {
  NotificationContent,
  NotificationEpisode,
  NotificationMovie,
} from "./types";

type RawEpisode = Awaited<ReturnType<typeof getEpisodesByDateRange>>[number];
type RawMovie = Awaited<
  ReturnType<typeof getTrackedMoviesByReleaseDate>
>[number];

/**
 * Filters out snoozed/muted episodes and maps the rest to notification shape.
 * `now` is passed in so callers share a single timestamp.
 */
function mapEpisodes(
  rawEpisodes: RawEpisode[],
  now: Date,
): NotificationEpisode[] {
  return rawEpisodes
    .filter((ep) => {
      // Skip snoozed titles
      if (ep.snooze_until && new Date(ep.snooze_until) > now) return false;
      const mode = ep.notification_mode;
      if (mode === "none") return false;
      if (mode === "premieres_only") return ep.episode_number === 1;
      return true; // "all" or null
    })
    .map((ep) => ({
      showTitle: ep.show_title,
      seasonNumber: ep.season_number,
      episodeNumber: ep.episode_number,
      episodeName: ep.name,
      posterUrl: ep.poster_url,
      offers: (ep.offers || []).map((o) => ({
        providerName: o.provider_name,
        providerIconUrl: o.provider_icon_url,
      })),
    }));
}

/**
 * Filters out snoozed movies and maps the rest to notification shape.
 * `now` is passed in so callers share a single timestamp.
 */
function mapMovies(rawMovies: RawMovie[], now: Date): NotificationMovie[] {
  return rawMovies
    .filter((m) => {
      // Skip snoozed titles
      if (m.snooze_until && new Date(m.snooze_until) > now) return false;
      return true;
    })
    .map((m) => ({
      title: m.title,
      releaseYear: m.release_year,
      posterUrl: m.poster_url,
      offers: (m.offers || []).map((o) => ({
        providerName: o.provider_name,
        providerIconUrl: o.provider_icon_url,
      })),
    }));
}

/**
 * Formats a human-readable "leaving" copy for departure alerts.
 * Examples:
 *   formatLeavingCopy("Netflix", null)          → "Leaving Netflix soon"
 *   formatLeavingCopy("Netflix", "2025-06-01")  → "Leaving Netflix on Jun 1, 2025"
 */
export function formatLeavingCopy(
  providerName: string,
  leavingAt: string | null | undefined,
): string {
  if (!leavingAt) return `Leaving ${providerName} soon`;
  try {
    const date = new Date(leavingAt);
    if (isNaN(date.getTime())) return `Leaving ${providerName} soon`;
    const formatted = date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      timeZone: "UTC",
    });
    return `Leaving ${providerName} on ${formatted}`;
  } catch {
    return `Leaving ${providerName} soon`;
  }
}

export async function buildNotificationContent(
  userId: string,
  date: string,
): Promise<NotificationContent> {
  // Get the next day for the date range query
  const d = new Date(date + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + 1);
  const nextDay = d.toISOString().slice(0, 10);

  const now = new Date();

  // Episodes airing today for tracked shows
  const rawEpisodes = await getEpisodesByDateRange(date, nextDay, userId);
  const episodes = mapEpisodes(rawEpisodes, now);

  // Tracked movies releasing today
  const rawMovies = await getTrackedMoviesByReleaseDate(date, userId);
  const movies = mapMovies(rawMovies, now);

  return { episodes, movies, date };
}

/**
 * Builds notification content covering a date range (e.g. next 7 days for weekly digest).
 * startDate is inclusive, endDate is exclusive.
 */
export async function buildWeeklyDigestContent(
  userId: string,
  startDate: string,
  endDate: string,
): Promise<NotificationContent> {
  const now = new Date();

  // Episodes airing in the range for tracked shows
  const rawEpisodes = await getEpisodesByDateRange(startDate, endDate, userId);
  const episodes = mapEpisodes(rawEpisodes, now);

  // Tracked movies releasing in the range
  const rawMovies = await getTrackedMoviesByReleaseDateRange(
    startDate,
    endDate,
    userId,
  );
  const movies = mapMovies(rawMovies, now);

  return { episodes, movies, date: startDate };
}
