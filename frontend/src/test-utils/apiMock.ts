/**
 * Shared, COMPLETE mock of `../api` for the frontend test suite.
 *
 * Why this exists: Bun does not reset `mock.module()` registrations between test
 * files in a single `bun test` process, and there is no way to un-mock. On Linux
 * CI (where test-file discovery order differs from local) a *partial* `../api`
 * mock declared in one file leaks globally into every other file. That produced
 * two failure modes:
 *   1. wrong-instance binding — a component's live `import * as api` namespace
 *      points at another file's mock, so resolved data / call counts are wrong;
 *   2. load-time `SyntaxError: Export named 'X' not found` — a static
 *      `import { X } from "../api"` (e.g. AuthContext's `getSubscriptions`) hits
 *      a partial mock that omits `X`.
 *
 * The fix: ONE complete mock of the entire api surface, with shared singleton
 * mock fns, registered once. Every test file imports `apiMock` from here and
 * configures the shared instances per-test; none declare their own
 * `mock.module("../api", …)`. Because the mock is complete, no static import
 * ever fails; because the instances are shared, it doesn't matter which file's
 * binding "wins" — they all reference the same mocks.
 *
 * Import this module BEFORE importing any component/page under test so the mock
 * is registered before the component binds its api namespace.
 */
import { mock } from "bun:test";

const emptyPage = () => ({
  titles: [],
  page: 1,
  totalPages: 1,
  totalResults: 0,
});

const emptyBrowse = () => ({
  titles: [],
  page: 1,
  totalPages: 1,
  totalResults: 0,
  availableGenres: [],
  availableProviders: [],
  availableLanguages: [],
  regionProviderIds: [],
  priorityLanguageCodes: [],
});

// Default implementations for every export of `../api`. Realistic empty shapes
// are given for the functions that rendered components commonly read; the rest
// default to an empty object. Individual tests override what they assert on.
const defaults: Record<string, (...args: unknown[]) => Promise<unknown>> = {
  // ── Catalog / browse / search ──────────────────────────────────────────────
  getTitles: async () => emptyPage(),
  searchTitles: async () => ({ titles: [] }),
  browseTitles: async () => emptyBrowse(),
  syncReleases: async () => ({}),
  resolveImdb: async () => null,
  getProviders: async () => ({ providers: [], regionProviderIds: [] }),
  getGenres: async () => ({ genres: [] }),
  getLanguages: async () => ({ languages: [], priorityLanguageCodes: [] }),
  getCollection: async () => ({ titles: [] }),
  getTitleSuggestions: async () => emptyPage(),
  getSuggestionsAggregate: async () => ({ flat: [] }),
  dismissSuggestion: async () => ({}),
  undismissSuggestion: async () => ({}),

  // ── Tracking ────────────────────────────────────────────────────────────────
  trackTitle: async () => ({}),
  untrackTitle: async () => ({}),
  getTrackedTitles: async () => ({ titles: [] }),
  bulkTrackAction: async () => ({}),
  updateTrackedStatus: async () => ({}),
  updateTrackedNotes: async () => ({}),
  updateTrackedTags: async () => ({}),
  setNotificationMode: async () => ({}),
  setTitleSnooze: async () => ({}),
  setRemindOnRelease: async () => ({}),
  pinTitle: async () => ({}),
  unpinTitle: async () => ({}),
  reorderPinnedTitles: async () => ({}),

  // ── Watch / ratings ───────────────────────────────────────────────────────
  watchEpisode: async () => ({}),
  unwatchEpisode: async () => ({}),
  watchEpisodesBulk: async () => ({}),
  backdateWatchedToAirDate: async () => ({}),
  watchMovie: async () => ({}),
  unwatchMovie: async () => ({}),
  getMovieTracking: async () => ({ tracked: [] }),
  getWatchHistory: async () => ({ entries: [] }),
  patchWatchHistoryEntry: async () => ({}),
  rateTitle: async () => ({}),
  unrateTitle: async () => ({}),
  getTitleRating: async () => ({ rating: null }),
  rateEpisode: async () => ({}),
  unrateEpisode: async () => ({}),
  getEpisodeRating: async () => ({ rating: null }),
  getSeasonEpisodeRatings: async () => ({ ratings: {} }),

  // ── Calendar / episodes / details ─────────────────────────────────────────
  getCalendarTitles: async () => ({ titles: [] }),
  syncEpisodes: async () => ({}),
  getUpcomingEpisodes: async () => ({ episodes: [] }),
  getSeasonEpisodeStatus: async () => ({ episodes: [] }),
  getMovieDetails: async () => ({}),
  getShowDetails: async () => ({}),
  getSeasonDetails: async () => ({}),
  getEpisodeDetails: async () => ({}),
  getPersonDetails: async () => ({}),

  // ── Profile / social ──────────────────────────────────────────────────────
  getUserProfile: async () => ({}),
  getUserActivity: async () => ({ events: [] }),
  updateMyBio: async () => ({}),
  getMyProfile: async () => ({}),
  updateMyProfile: async () => ({}),
  getActivitySettings: async () => ({}),
  updateActivitySettings: async () => ({}),
  hideActivityEvent: async () => ({}),
  unhideActivityEvent: async () => ({}),
  updateProfileVisibility: async () => ({}),
  updateTitleVisibility: async () => ({}),
  updateAllTitleVisibility: async () => ({}),
  searchUsers: async () => ({ users: [] }),
  followUser: async () => ({}),
  unfollowUser: async () => ({}),
  getFollowers: async () => ({ users: [] }),
  getFollowing: async () => ({ users: [] }),
  getUpNext: async () => ({ items: [] }),
  getOverlap: async () => ({ items: [] }),
  getFriendsLoved: async () => ({ items: [] }),
  fetchFriendsLoved: async () => ({ items: [] }),

  // ── Recommendations ───────────────────────────────────────────────────────
  sendRecommendation: async () => ({}),
  checkRecommendation: async () => ({ canRecommend: true }),
  getRecommendations: async () => ({ recommendations: [] }),
  getSentRecommendations: async () => ({ recommendations: [] }),
  markRecommendationRead: async () => ({}),
  deleteRecommendation: async () => ({}),
  getUnreadRecommendationCount: async () => ({ count: 0 }),

  // ── Notifiers ─────────────────────────────────────────────────────────────
  getVapidPublicKey: async () => ({ publicKey: "" }),
  getNotifiers: async () => ({ notifiers: [] }),
  getNotifierProviders: async () => ({ providers: [] }),
  createNotifier: async () => ({}),
  updateNotifier: async () => ({}),
  previewNotifier: async () => ({}),
  deleteNotifier: async () => ({}),
  testNotifier: async () => ({}),
  getNotifierHistory: async () => ({ entries: [] }),

  // ── Invitations / integrations ────────────────────────────────────────────
  createInvitation: async () => ({}),
  getInvitations: async () => ({ invitations: [] }),
  redeemInvitation: async () => ({}),
  revokeInvitation: async () => ({}),
  getIntegrations: async () => ({ integrations: [] }),
  createIntegration: async () => ({}),
  updateIntegration: async () => ({}),
  deleteIntegration: async () => ({}),
  createPlexPin: async () => ({}),
  checkPlexPin: async () => ({}),
  refreshPlexServers: async () => ({ servers: [] }),
  triggerPlexSync: async () => ({}),

  // ── Settings ──────────────────────────────────────────────────────────────
  changePassword: async () => ({}),
  getStats: async () => ({}),
  getHomepageLayout: async () => ({ homepage_layout: [] }),
  updateHomepageLayout: async () => ({}),
  getDepartureAlertSettings: async () => ({}),
  updateDepartureAlertSettings: async () => ({}),
  getCrowdedWeekSettings: async () => ({}),
  updateCrowdedWeekSettings: async () => ({}),
  getAppearanceSettings: async () => ({}),
  updateAppearanceSettings: async () => ({}),
  getSubscriptions: async () => ({ providerIds: [], onlyMine: false }),
  updateSubscriptions: async () => ({}),
  updateOnlyMine: async () => ({}),

  // ── Admin ─────────────────────────────────────────────────────────────────
  getAdminSettings: async () => ({}),
  updateAdminSettings: async () => ({}),
  getAdminConfig: async () => ({ config: [], secrets: [] }),
  getAdminLogs: async () => ({ logs: [] }),
  flushCache: async () => ({}),
  runAllJobs: async () => ({}),
  triggerBackup: async () => ({}),
  getJobs: async () => ({ jobs: [], recent: [] }),
  triggerJob: async () => ({}),
  getAdminUsers: async () => ({ users: [] }),
  getAdminUser: async () => ({}),
  setAdminUserRole: async () => ({}),
  banAdminUser: async () => ({}),
  unbanAdminUser: async () => ({}),
  deleteAdminUser: async () => ({}),

  // ── Tokens / sharing / kiosk ──────────────────────────────────────────────
  getFeedToken: async () => ({ token: "" }),
  regenerateFeedToken: async () => ({ token: "" }),
  getKioskData: async () => ({}),
  getKioskToken: async () => ({ token: "" }),
  regenerateKioskToken: async () => ({ token: "" }),
  revokeKioskToken: async () => ({}),
  getWatchlistShareToken: async () => ({ token: "" }),
  regenerateWatchlistShareToken: async () => ({ token: "" }),
  revokeWatchlistShareToken: async () => ({}),
  getSharedWatchlist: async () => ({ titles: [] }),

  // ── Import / export ───────────────────────────────────────────────────────
  exportWatchlist: async () => ({}),
  importWatchlist: async () => ({}),
  importCsv: async () => ({}),

  // ── Achievements / leaderboard / streak ───────────────────────────────────
  getAchievementsRegistry: async () => ({ achievements: [] }),
  getMyAchievements: async () => ({ achievements: [] }),
  getUserAchievements: async () => ({ achievements: [] }),
  getMyAchievementDetail: async () => ({}),
  getUserAchievementDetail: async () => ({}),
  getLeaderboard: async () => ({ entries: [] }),
  getMyStreak: async () => ({ current: 0, longest: 0 }),
};

type ApiMock = Record<string, ReturnType<typeof mock>>;

export const apiMock: ApiMock = Object.fromEntries(
  Object.entries(defaults).map(([name, impl]) => [name, mock(impl)]),
) as ApiMock;

// Register the complete mock for `../api` (resolves to src/api.ts from here).
mock.module("../api", () => apiMock);

/**
 * Reset every api mock's call history AND restore its default implementation.
 * Call this in `afterEach` so per-test `mockResolvedValue` overrides don't bleed
 * into the next test.
 */
export function resetApiMock(): void {
  for (const [name, impl] of Object.entries(defaults)) {
    const m = apiMock[name];
    m.mockReset();
    m.mockImplementation(impl as never);
  }
}
