import {
  getEpisodesByDateRange,
  getTrackedMoviesByReleaseDate,
} from "../db/repository";
import type { NotificationContent } from "./types";

export function buildNotificationContent(
  userId: string,
  date: string
): NotificationContent {
  // Get the next day for the date range query
  const d = new Date(date + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + 1);
  const nextDay = d.toISOString().slice(0, 10);

  // Episodes airing today for tracked shows
  const rawEpisodes = getEpisodesByDateRange(date, nextDay, userId);
  const episodes = rawEpisodes.map((ep) => ({
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
  const rawMovies = getTrackedMoviesByReleaseDate(date, userId);
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
