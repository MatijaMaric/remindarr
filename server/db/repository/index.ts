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
  getNextUnwatchedEpisode,
  getLastWatchedAtPerShow,
  getEpisodeAirDate,
  getEpisodeTitleId,
  getEpisodeTitleIds,
  getReleasedEpisodeIds,
  getReleasedEpisodesWithAirDate,
  watchEpisode,
  unwatchEpisode,
  watchEpisodesBulk,
  unwatchEpisodesBulk,
  backdateWatchedEpisodesToAirDate,
  getSeasonEpisodeStatus,
  getWatchedEpisodesForExport,
  getEpisodeIdsBySE,
} from "./episodes";

export {
  logWatch,
  getTitlePlayCount,
  getTitleWatchHistory,
} from "./watch-history";

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
  getTrackedMoviesByReleaseDateRange,
  getUpcomingTrackedMovies,
  updateTrackedStatus,
  updateNotificationMode,
  getTrackedTitlesForNotifications,
  updateTrackedNotes,
  getUsersTrackingTitles,
  setSnooze,
  setRemindOnRelease,
} from "./tracked";
export type { UserStatus, NotificationMode } from "./tracked";

export { getTagsForUser, getTagsForTitle, setTags } from "./tags";

export {
  getUserPublicProfile,
  updateProfilePublic,
  updateUserBio,
  getUserVisibilityByUsername,
  getActivityKindVisibilityMap,
  setActivitySettings,
  getActivitySettings,
  getMyProfile,
  updateMyProfile,
} from "./profile";
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
  getAllUsers,
  getAdminUserCount,
  getUserTrackedCount,
  banUser,
  unbanUser,
  deleteUser,
  getFeedToken,
  setFeedToken,
  getUserByFeedToken,
  getKioskToken,
  setKioskToken,
  getUserByKioskToken,
  getWatchlistShareToken,
  setWatchlistShareToken,
  getUserByWatchlistShareToken,
  getUserDepartureSettings,
  updateUserDepartureSettings,
  getCrowdedWeekSettings,
  updateCrowdedWeekSettings,
  getAppearanceSettings,
  updateAppearanceSettings,
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
  getStreamingAlertNotifiersForUser,
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
  getMutualFollowers,
} from "./follows";
export type { MutualFollower } from "./follows";

export {
  getStatsOverview,
  getUserGenreBreakdown,
  getUserLanguageBreakdown,
  getMonthlyActivity,
  getShowsByStatus,
  buildMonthRange,
} from "./stats";
export type {
  StatsOverview,
  GenreCount,
  LanguageCount,
  MonthlyActivity,
  ShowsByStatus,
} from "./stats";

export {
  rateTitle,
  unrateTitle,
  getUserRating,
  getTitleRatings,
  getFriendsRatings,
  rateEpisode,
  unrateEpisode,
  getUserEpisodeRating,
  getEpisodeRatings,
  getFriendsEpisodeRatings,
  getSeasonEpisodeRatings,
  getFriendsLovedThisWeek,
} from "./ratings";
export type { RatingValue, FriendsLovedTitle } from "./ratings";

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

export { getUserActivity } from "./activity";
export type { ActivityEvent, ActivityType, ActivityTitleRef, ActivityEpisodeRef, ActivityKindVisibilityMap } from "./activity";

export { hideActivityEvent, unhideActivityEvent, getHiddenActivityEventKeys } from "./hidden-activity";

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

export {
  getUnalertedProviders,
  markAlerted,
  getArrivalAlertedProviders,
} from "./streaming-alerts";

export {
  getPinnedTitles,
  pinTitle,
  unpinTitle,
  reorderPinnedTitles,
  isPinnedTitle,
} from "./pinned";
export type { PinnedTitle } from "./pinned";

export {
  recordDelivery,
  getRecentForNotifier,
  getSuccessRateForNotifier,
  pruneOldRows,
} from "./notification-log";
export type { NotificationLogRow } from "./notification-log";
