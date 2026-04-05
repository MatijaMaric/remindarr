import {
  getEpisodesByDateRange,
  getTrackedMoviesByReleaseDate,
  getTrackedMoviesByReleaseDateRange,
} from "../db/repository";
import type { NotificationContent } from "./types";

export async function buildNotificationContent(
  userId: string,
  date: string
): Promise<NotificationContent> {
  // Get the next day for the date range query
  const d = new Date(date + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + 1);
  const nextDay = d.toISOString().slice(0, 10);

  // Episodes airing today for tracked shows
  const rawEpisodes = await getEpisodesByDateRange(date, nextDay, userId);
  const episodes = rawEpisodes
    .filter((ep) => {
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

  // Tracked movies releasing today
  const rawMovies = await getTrackedMoviesByReleaseDate(date, userId);
  const movies = rawMovies.map((m) => ({
    title: m.title,
    releaseYear: m.release_year,
    posterUrl: m.poster_url,
    offers: (m.offers || []).map((o) => ({
      providerName: o.provider_name,
      providerIconUrl: o.provider_icon_url,
    })),
  }));

  return { episodes, movies, date };
}

/**
 * Builds notification content covering a date range (e.g. next 7 days for weekly digest).
 * startDate is inclusive, endDate is exclusive.
 */
export async function buildWeeklyDigestContent(
  userId: string,
  startDate: string,
  endDate: string
): Promise<NotificationContent> {
  // Episodes airing in the range for tracked shows
  const rawEpisodes = await getEpisodesByDateRange(startDate, endDate, userId);
  const episodes = rawEpisodes
    .filter((ep) => {
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

  // Tracked movies releasing in the range
  const rawMovies = await getTrackedMoviesByReleaseDateRange(startDate, endDate, userId);
  const movies = rawMovies.map((m) => ({
    title: m.title,
    releaseYear: m.release_year,
    posterUrl: m.poster_url,
    offers: (m.offers || []).map((o) => ({
      providerName: o.provider_name,
      providerIconUrl: o.provider_icon_url,
    })),
  }));

  return { episodes, movies, date: startDate };
}
