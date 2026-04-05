// Re-exports all repository functions for backward compatibility.
// Individual modules can be imported directly for smaller dependency scope.

export { getOffersForTitle, getOffersForTitles, getOffersWithPlex, getTitlesNeedingSaEnrichment } from "./offers";
export {
  upsertPlexLibraryItems,
  deleteStaleLibraryItems,
  deletePlexLibraryByIntegration,
  getPlexOffersForUser,
  PLEX_PROVIDER_ID,
} from "./plex-library";

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
  getSeasonEpisodeStatus,
  getWatchedEpisodesForExport,
  getEpisodeIdsBySE,
} from "./episodes";

export {
  trackTitle,
  untrackTitle,
  getTrackedTitleIds,
  getTrackedTitles,
  getPublicTrackedTitles,
  getPublicTrackedCount,
  updateTrackedVisibility,
  updateAllTrackedVisibility,
  getTrackedMoviesByReleaseDate,
  updateTrackedStatus,
} from "./tracked";
export type { UserStatus } from "./tracked";

export { getUserPublicProfile, updateProfilePublic } from "./profile";
export type { ProfileVisibility } from "./profile";

export {
  createUser,
  getUserByUsername,
  getUserById,
  getUserByProviderSubject,
  getUserCount,
  updateUserPassword,
  updateUserAdmin,
  searchUsers,
  createSession,
  getSessionWithUser,
  deleteSession,
  deleteExpiredSessions,
  getHomepageLayout,
  setHomepageLayout,
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

export {
  follow,
  unfollow,
  getFollowers,
  getFollowing,
  isFollowing,
  areMutualFollowers,
  getFollowerCount,
  getFollowingCount,
} from "./follows";

export {
  rateTitle,
  unrateTitle,
  getUserRating,
  getTitleRatings,
  getFriendsRatings,
} from "./ratings";
export type { RatingValue } from "./ratings";

export {
  createRecommendation,
  getUserRecommendation,
  getDiscoveryFeed,
  getDiscoveryFeedCount,
  getSentRecommendations,
  markAsRead,
  deleteRecommendation,
  getUnreadCount,
} from "./recommendations";

export {
  createInvitation,
  getInvitation,
  redeemInvitation,
  getUserInvitations,
  revokeInvitation,
  getUsersByIds,
} from "./invitations";

export {
  createIntegration,
  updateIntegration,
  deleteIntegration,
  getIntegrationsByUser,
  getIntegrationById,
  getEnabledIntegrationsByProvider,
  updateIntegrationSyncStatus,
  disableIntegration,
} from "./integrations";
export type { IntegrationConfig, PlexConfig } from "./integrations";
