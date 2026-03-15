// Re-exports all repository functions for backward compatibility.
// Individual modules can be imported directly for smaller dependency scope.

export { getOffersForTitle } from "./offers";

export {
  upsertTitles,
  getTitleById,
  getRecentTitles,
  searchLocalTitles,
  getTitlesByMonth,
  getProviders,
  getGenres,
  getLanguages,
} from "./titles";
export type { TitleFilters, MonthFilters } from "./titles";

export {
  upsertEpisodes,
  getEpisodesByMonth,
  getEpisodesByDateRange,
  deleteEpisodesForTitle,
  getUnwatchedEpisodes,
  getEpisodeAirDate,
  getReleasedEpisodeIds,
  watchEpisode,
  unwatchEpisode,
  watchEpisodesBulk,
  unwatchEpisodesBulk,
} from "./episodes";

export {
  trackTitle,
  untrackTitle,
  getTrackedTitleIds,
  getTrackedTitles,
  getTrackedMoviesByReleaseDate,
} from "./tracked";

export {
  createUser,
  getUserByUsername,
  getUserById,
  getUserByProviderSubject,
  getUserCount,
  updateUserPassword,
  updateUserAdmin,
  createSession,
  getSessionWithUser,
  deleteSession,
  deleteExpiredSessions,
} from "./users";

export {
  getSetting,
  setSetting,
  deleteSetting,
  getSettingsByPrefix,
  getOidcConfig,
  isOidcConfigured,
} from "./settings";

export {
  createNotifier,
  updateNotifier,
  deleteNotifier,
  getNotifiersByUser,
  getNotifierById,
  getDueNotifiers,
  markNotifierSent,
  getDistinctNotifierTimezones,
  getEnabledNotifierSchedules,
} from "./notifiers";
