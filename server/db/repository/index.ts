// Re-exports all repository functions for backward compatibility.
// Individual modules can be imported directly for smaller dependency scope.

export { getOffersForTitle, getOffersForTitles, getTitlesNeedingSaEnrichment } from "./offers";

export {
  upsertTitles,
  getTitleById,
  getRecentTitles,
  searchLocalTitles,
  getTitlesByMonth,
  getProviders,
  getGenres,
  getLanguages,
  invalidateFilterCaches,
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
  getWatchedEpisodesForExport,
  getEpisodeIdsBySE,
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
  createOidcState,
  consumeOidcState,
  cleanExpiredOidcStates,
} from "./settings";

export {
  watchTitle,
  unwatchTitle,
  getWatchedTitleIds,
} from "./watched-titles";

export {
  createNotifier,
  updateNotifier,
  deleteNotifier,
  disableNotifier,
  getNotifiersByUser,
  getNotifierById,
  getDueNotifiers,
  markNotifierSent,
  getDistinctNotifierTimezones,
  getEnabledNotifierSchedules,
} from "./notifiers";
