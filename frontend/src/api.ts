import type {
  Title,
  SearchTitle,
  Provider,
  Episode,
  StatsResponse,
  MovieDetailsResponse,
  ShowDetailsResponse,
  SeasonDetailsResponse,
  EpisodeDetailsResponse,
  PersonDetailsResponse,
  AdminSettings,
  AdminSettingsUpdateRequest,
  AdminSettingsUpdateResponse,
  AdminUser,
  AdminUsersResponse,
  UserProfileResponse,
  ActivityFeedResponse,
  UserSummary,
  TitleRatingResponse,
  EpisodeRatingResponse,
  RatingValue,
  SentRecommendation,
  RecommendationsResponse,
  InvitationItem,
  HomepageSection,
  WatchHistoryEntry,
  ActivitySettings,
  NotifierHistoryResponse,
  UserSettings,
} from "./types";

const BASE = "/api";

/**
 * Low-level fetch used by every helper. Shares 401-handling (dispatching the
 * `auth:unauthorized` CustomEvent that `AuthContext` listens for) and
 * error-body parsing across JSON, blob, and form-data callers.
 */
async function doFetch(url: string, options: RequestInit): Promise<Response> {
  const res = await fetch(`${BASE}${url}`, options);
  if (res.status === 401) {
    window.dispatchEvent(new CustomEvent("auth:unauthorized"));
    throw new Error("Authentication required");
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `Request failed: ${res.status}`);
  }
  return res;
}

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await doFetch(url, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  return res.json();
}

/** Fetches a binary response. Returns the raw Response so callers can read the
 *  blob and headers (e.g. Content-Disposition for downloads). */
async function fetchBlob(url: string, options?: RequestInit): Promise<Response> {
  return doFetch(url, { credentials: "include", ...options });
}

/** Posts multipart form data and parses the JSON response. */
async function fetchForm<T>(url: string, form: FormData): Promise<T> {
  const res = await doFetch(url, { method: "POST", body: form });
  return res.json();
}

export async function getTitles(params: {
  daysBack?: number;
  type?: string;
  provider?: string;
  genre?: string;
  language?: string;
  excludeTracked?: boolean;
  limit?: number;
  offset?: number;
} = {}, signal?: AbortSignal): Promise<{ titles: Title[]; count: number }> {
  const qs = new URLSearchParams();
  if (params.daysBack != null) qs.set("daysBack", String(params.daysBack));
  if (params.type) qs.set("type", params.type);
  if (params.provider) qs.set("provider", params.provider);
  if (params.genre) qs.set("genre", params.genre);
  if (params.language) qs.set("language", params.language);
  if (params.excludeTracked) qs.set("excludeTracked", "1");
  if (params.limit != null) qs.set("limit", String(params.limit));
  if (params.offset != null) qs.set("offset", String(params.offset));
  return fetchJson(`/titles?${qs}`, { signal });
}

export async function searchTitles(
  query: string,
  filters?: {
    yearMin?: number;
    yearMax?: number;
    minRating?: number;
    language?: string;
    type?: "MOVIE" | "SHOW";
  },
  signal?: AbortSignal,
): Promise<{ titles: SearchTitle[]; count: number }> {
  const qs = new URLSearchParams();
  qs.set("q", query);
  if (filters?.yearMin != null) qs.set("year_min", String(filters.yearMin));
  if (filters?.yearMax != null) qs.set("year_max", String(filters.yearMax));
  if (filters?.minRating != null) qs.set("min_rating", String(filters.minRating));
  if (filters?.language) qs.set("language", filters.language);
  if (filters?.type) qs.set("type", filters.type);
  return fetchJson(`/search?${qs}`, { signal });
}

export async function browseTitles(params: {
  category: string;
  type?: string;
  page?: number;
  genre?: string;
  provider?: string;
  language?: string;
  yearMin?: number;
  yearMax?: number;
  minRating?: number;
}, signal?: AbortSignal): Promise<{
  titles: SearchTitle[];
  page: number;
  totalPages: number;
  totalResults: number;
  availableGenres: string[];
  availableProviders: { id: number; name: string; iconUrl: string }[];
  availableLanguages: { code: string; name: string }[];
  regionProviderIds: number[];
  priorityLanguageCodes: string[];
}> {
  const qs = new URLSearchParams();
  qs.set("category", params.category);
  if (params.type) qs.set("type", params.type);
  if (params.page != null) qs.set("page", String(params.page));
  if (params.genre) qs.set("genre", params.genre);
  if (params.provider) qs.set("provider", params.provider);
  if (params.language) qs.set("language", params.language);
  if (params.yearMin != null) qs.set("year_min", String(params.yearMin));
  if (params.yearMax != null) qs.set("year_max", String(params.yearMax));
  if (params.minRating != null) qs.set("min_rating", String(params.minRating));
  return fetchJson(`/browse?${qs}`, { signal });
}

export async function syncReleases(daysBack = 30, type?: string): Promise<{ success: boolean; count: number; message: string }> {
  return fetchJson("/sync", {
    method: "POST",
    body: JSON.stringify({ daysBack, type }),
  });
}

export async function trackTitle(id: string, notes?: string, titleData?: Title): Promise<void> {
  await fetchJson(`/track/${encodeURIComponent(id)}`, {
    method: "POST",
    body: JSON.stringify({ notes, titleData }),
  });
  if (titleData && "serviceWorker" in navigator && navigator.serviceWorker.controller) {
    navigator.serviceWorker.controller.postMessage({
      type: "PRECACHE_TITLE",
      titleId: id,
      objectType: titleData.object_type,
    });
  }
}

export async function untrackTitle(id: string): Promise<void> {
  await fetchJson(`/track/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

export async function getTrackedTitles(signal?: AbortSignal): Promise<{ titles: (Title & { public: boolean })[]; count: number; profile_public: boolean; profile_visibility: string }> {
  return fetchJson("/track", { signal });
}

export async function exportWatchlist(): Promise<void> {
  const res = await fetchBlob("/track/export");
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const disposition = res.headers.get("Content-Disposition") || "";
  const match = disposition.match(/filename="([^"]+)"/);
  a.href = url;
  a.download = match ? match[1] : "watchlist.json";
  a.click();
  URL.revokeObjectURL(url);
}

export async function importWatchlist(file: File): Promise<{ success: boolean; imported: number; skipped: number }> {
  const text = await file.text();
  return fetchJson("/track/import", {
    method: "POST",
    body: text,
  });
}

export async function importCsv(file: File): Promise<{ imported: number; failed: number; skipped: number; errors: string[] }> {
  const form = new FormData();
  form.append("file", file);
  return fetchForm("/import/csv", form);
}

// ─── User Profile ──────────────────────────────────────────────────────────

export async function getUserProfile(username: string, signal?: AbortSignal): Promise<UserProfileResponse> {
  return fetchJson(`/user/${encodeURIComponent(username)}`, { signal });
}

export async function getUserActivity(
  username: string,
  options: { limit?: number; before?: string } = {},
  signal?: AbortSignal,
): Promise<ActivityFeedResponse> {
  const params = new URLSearchParams();
  if (options.limit) params.set("limit", String(options.limit));
  if (options.before) params.set("before", options.before);
  const qs = params.toString();
  return fetchJson(`/user/${encodeURIComponent(username)}/activity${qs ? `?${qs}` : ""}`, { signal });
}

export async function updateMyBio(bio: string | null): Promise<{ bio: string | null }> {
  return fetchJson("/user/me/bio", {
    method: "PATCH",
    body: JSON.stringify({ bio }),
  });
}

export async function getActivitySettings(signal?: AbortSignal): Promise<ActivitySettings> {
  return fetchJson("/user/me/activity-settings", { signal });
}

export async function updateActivitySettings(
  settings: Partial<ActivitySettings>,
): Promise<ActivitySettings> {
  return fetchJson("/user/me/activity-settings", {
    method: "PATCH",
    body: JSON.stringify(settings),
  });
}

export async function hideActivityEvent(eventKind: string, eventKey: string): Promise<void> {
  await fetchJson("/user/me/activity/hide", {
    method: "POST",
    body: JSON.stringify({ event_kind: eventKind, event_key: eventKey }),
  });
}

export async function unhideActivityEvent(eventKind: string, eventKey: string): Promise<void> {
  await fetchJson(`/user/me/activity/hide/${encodeURIComponent(eventKind)}/${encodeURIComponent(eventKey)}`, {
    method: "DELETE",
  });
}

export async function pinTitle(titleId: string): Promise<{ pinned: boolean }> {
  return fetchJson(`/user/me/pinned/${encodeURIComponent(titleId)}`, { method: "POST" });
}

export async function unpinTitle(titleId: string): Promise<{ pinned: boolean }> {
  return fetchJson(`/user/me/pinned/${encodeURIComponent(titleId)}`, { method: "DELETE" });
}

export async function reorderPinnedTitles(titleIds: string[]): Promise<{ ok: boolean }> {
  return fetchJson("/user/me/pinned/order", {
    method: "PUT",
    body: JSON.stringify({ titleIds }),
  });
}

export async function updateProfileVisibility(visibility: string): Promise<void> {
  await fetchJson("/track/profile-visibility", {
    method: "PATCH",
    body: JSON.stringify({ visibility }),
  });
}

export async function updateTitleVisibility(titleId: string, isPublic: boolean): Promise<void> {
  await fetchJson(`/track/${encodeURIComponent(titleId)}/visibility`, {
    method: "PATCH",
    body: JSON.stringify({ public: isPublic }),
  });
}

export async function updateTrackedStatus(titleId: string, status: string | null): Promise<void> {
  await fetchJson(`/track/${encodeURIComponent(titleId)}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
}

export async function updateAllTitleVisibility(isPublic: boolean): Promise<void> {
  await fetchJson("/track/visibility", {
    method: "PATCH",
    body: JSON.stringify({ public: isPublic }),
  });
}

export async function searchUsers(query: string): Promise<{ users: UserSummary[] }> {
  return fetchJson(`/user/search?q=${encodeURIComponent(query)}`);
}

export async function resolveImdb(url: string): Promise<{ success: boolean; title: SearchTitle }> {
  return fetchJson("/imdb", {
    method: "POST",
    body: JSON.stringify({ url }),
  });
}

export async function getProviders(signal?: AbortSignal): Promise<{ providers: Provider[]; regionProviderIds: number[] }> {
  return fetchJson("/titles/providers", { signal });
}

export async function getGenres(signal?: AbortSignal): Promise<{ genres: string[] }> {
  return fetchJson("/titles/genres", { signal });
}

export async function getLanguages(signal?: AbortSignal): Promise<{ languages: string[]; priorityLanguageCodes: string[] }> {
  return fetchJson("/titles/languages", { signal });
}

export async function getCalendarTitles(params: {
  month: string;
  type?: string;
  provider?: string;
}, signal?: AbortSignal): Promise<{ titles: Title[]; episodes: Episode[]; count: number }> {
  const qs = new URLSearchParams();
  qs.set("month", params.month);
  if (params.type) qs.set("type", params.type);
  if (params.provider) qs.set("provider", params.provider);
  return fetchJson(`/calendar?${qs}`, { signal });
}

export async function syncEpisodes(): Promise<{ success: boolean; synced: number; shows: number; message: string }> {
  return fetchJson("/episodes/sync", { method: "POST" });
}

export async function getUpcomingEpisodes(signal?: AbortSignal): Promise<{ today: Episode[]; upcoming: Episode[]; unwatched: Episode[] }> {
  return fetchJson("/episodes/upcoming", { signal });
}

export async function getSeasonEpisodeStatus(
  titleId: string,
  season: number,
  signal?: AbortSignal,
): Promise<{ episodes: Array<{ episode_number: number; id: number; is_watched: boolean }> }> {
  return fetchJson(`/episodes/status/${encodeURIComponent(titleId)}/${season}`, { signal });
}

// ─── Watched Episodes ─────────────────────────────────────────────────────────

export async function watchEpisode(episodeId: number): Promise<void> {
  await fetchJson(`/watched/${episodeId}`, { method: "POST" });
}

export async function unwatchEpisode(episodeId: number): Promise<void> {
  await fetchJson(`/watched/${episodeId}`, { method: "DELETE" });
}

export async function watchEpisodesBulk(
  episodeIds: number[],
  watched: boolean,
  options?: { useAirDate?: boolean },
): Promise<void> {
  await fetchJson("/watched/bulk", {
    method: "POST",
    body: JSON.stringify({ episodeIds, watched, useAirDate: options?.useAirDate }),
  });
}

export async function backdateWatchedToAirDate(
  titleId?: string,
): Promise<{ updated: number }> {
  return fetchJson<{ updated: number }>("/watched/backdate", {
    method: "POST",
    body: JSON.stringify(titleId ? { titleId } : {}),
  });
}

// ─── Watched Movies ──────────────────────────────────────────────────────────

export async function watchMovie(titleId: string): Promise<void> {
  await fetchJson(`/watched/movies/${encodeURIComponent(titleId)}`, { method: "POST" });
}

export async function unwatchMovie(titleId: string): Promise<void> {
  await fetchJson(`/watched/movies/${encodeURIComponent(titleId)}`, { method: "DELETE" });
}

// ─── Watch History ───────────────────────────────────────────────────────────

export async function getWatchHistory(titleId: string, signal?: AbortSignal): Promise<{ history: WatchHistoryEntry[]; playCount: number }> {
  return fetchJson(`/watched/history/${encodeURIComponent(titleId)}`, { signal });
}

// ─── Details ────────────────────────────────────────────────────────────────

export async function getMovieDetails(titleId: string, signal?: AbortSignal): Promise<MovieDetailsResponse> {
  return fetchJson(`/details/movie/${encodeURIComponent(titleId)}`, { signal });
}

export async function getShowDetails(titleId: string, signal?: AbortSignal): Promise<ShowDetailsResponse> {
  return fetchJson(`/details/show/${encodeURIComponent(titleId)}`, { signal });
}

export async function getSeasonDetails(titleId: string, season: number, signal?: AbortSignal): Promise<SeasonDetailsResponse> {
  return fetchJson(`/details/show/${encodeURIComponent(titleId)}/season/${season}`, { signal });
}

export async function getEpisodeDetails(titleId: string, season: number, episode: number, signal?: AbortSignal): Promise<EpisodeDetailsResponse> {
  return fetchJson(`/details/show/${encodeURIComponent(titleId)}/season/${season}/episode/${episode}`, { signal });
}

export async function getPersonDetails(personId: number, signal?: AbortSignal): Promise<PersonDetailsResponse> {
  return fetchJson(`/details/person/${personId}`, { signal });
}

// ─── Auth ────────────────────────────────────────────────────────────────────

export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  await fetchJson("/auth/change-password", {
    method: "POST",
    body: JSON.stringify({ currentPassword, newPassword }),
  });
}

// ─── Admin ───────────────────────────────────────────────────────────────────

export async function getAdminSettings(signal?: AbortSignal): Promise<AdminSettings> {
  return fetchJson("/admin/settings", { signal });
}

export async function updateAdminSettings(settings: AdminSettingsUpdateRequest): Promise<AdminSettingsUpdateResponse> {
  return fetchJson("/admin/settings", {
    method: "PUT",
    body: JSON.stringify(settings),
  });
}

// ─── Jobs ─────────────────────────────────────────────────────────────────────

export interface CronJobInfo {
  name: string;
  cron: string;
  last_run: string | null;
  next_run: string;
  enabled: number;
}

export interface RecentJob {
  id: number;
  name: string;
  status: "pending" | "running" | "completed" | "failed";
  error: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
}

export interface JobsResponse {
  stats: Record<string, { pending: number; running: number; completed: number; failed: number }>;
  crons: CronJobInfo[];
  recentJobs: RecentJob[];
}

export async function getJobs(signal?: AbortSignal): Promise<JobsResponse> {
  return fetchJson("/jobs", { signal });
}

export async function triggerJob(name: string): Promise<{ success: boolean; jobId: number }> {
  return fetchJson(`/jobs/${encodeURIComponent(name)}`, { method: "POST" });
}

// ─── Notifiers ──────────────────────────────────────────────────────────────

export interface Notifier {
  id: string;
  user_id: string;
  provider: string;
  name: string;
  config: Record<string, string>;
  notify_time: string;
  timezone: string;
  enabled: boolean;
  last_sent_date: string | null;
  digest_mode: "weekly" | "off" | null;
  digest_day: number | null;
  streaming_alerts_enabled: boolean;
  created_at: string;
  updated_at: string;
}

export async function getVapidPublicKey(signal?: AbortSignal): Promise<{ publicKey: string }> {
  return fetchJson("/notifiers/vapid-public-key", { signal });
}

export async function getNotifiers(signal?: AbortSignal): Promise<{ notifiers: Notifier[] }> {
  return fetchJson("/notifiers", { signal });
}

export async function getNotifierProviders(signal?: AbortSignal): Promise<{ providers: string[] }> {
  return fetchJson("/notifiers/providers", { signal });
}

export async function createNotifier(data: {
  provider: string;
  config: Record<string, string>;
  notify_time: string;
  timezone: string;
  digest_mode?: "weekly" | "off" | null;
  digest_day?: number | null;
  streaming_alerts_enabled?: boolean;
}): Promise<{ notifier: Notifier }> {
  return fetchJson("/notifiers", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function updateNotifier(
  id: string,
  data: Partial<{
    config: Record<string, string>;
    notify_time: string;
    timezone: string;
    enabled: boolean;
    digest_mode: "weekly" | "off" | null;
    digest_day: number | null;
    streaming_alerts_enabled: boolean;
  }>
): Promise<{ notifier: Notifier }> {
  return fetchJson(`/notifiers/${encodeURIComponent(id)}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export async function deleteNotifier(id: string): Promise<void> {
  await fetchJson(`/notifiers/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

export async function testNotifier(
  id: string
): Promise<{ success: boolean; message: string }> {
  return fetchJson(`/notifiers/${encodeURIComponent(id)}/test`, {
    method: "POST",
  });
}

export async function getNotifierHistory(
  id: string
): Promise<NotifierHistoryResponse> {
  return fetchJson<NotifierHistoryResponse>(`/notifiers/${encodeURIComponent(id)}/history`);
}

// ─── Social (Follow/Unfollow) ────────────────────────────────────────────────

export async function followUser(userId: string): Promise<void> {
  await fetchJson(`/social/follow/${encodeURIComponent(userId)}`, {
    method: "POST",
  });
}

export async function unfollowUser(userId: string): Promise<void> {
  await fetchJson(`/social/follow/${encodeURIComponent(userId)}`, {
    method: "DELETE",
  });
}

export async function getFollowers(userId?: string, signal?: AbortSignal): Promise<{ followers: UserSummary[]; count: number }> {
  const path = userId
    ? `/social/followers/${encodeURIComponent(userId)}`
    : "/social/followers";
  return fetchJson(path, { signal });
}

export async function getFollowing(userId?: string, signal?: AbortSignal): Promise<{ following: UserSummary[]; count: number }> {
  const path = userId
    ? `/social/following/${encodeURIComponent(userId)}`
    : "/social/following";
  return fetchJson(path, { signal });
}

// ─── Ratings ─────────────────────────────────────────────────────────────────

export async function rateTitle(titleId: string, rating: string): Promise<void> {
  await fetchJson(`/ratings/${encodeURIComponent(titleId)}`, {
    method: "POST",
    body: JSON.stringify({ rating }),
  });
}

export async function unrateTitle(titleId: string): Promise<void> {
  await fetchJson(`/ratings/${encodeURIComponent(titleId)}`, {
    method: "DELETE",
  });
}

export async function getTitleRating(titleId: string, signal?: AbortSignal): Promise<TitleRatingResponse> {
  return fetchJson(`/ratings/${encodeURIComponent(titleId)}`, { signal });
}

export async function rateEpisode(episodeId: number, rating: string, review?: string): Promise<void> {
  await fetchJson(`/ratings/episode/${episodeId}`, {
    method: "POST",
    body: JSON.stringify({ rating, review }),
  });
}

export async function unrateEpisode(episodeId: number): Promise<void> {
  await fetchJson(`/ratings/episode/${episodeId}`, {
    method: "DELETE",
  });
}

export async function getEpisodeRating(episodeId: number, signal?: AbortSignal): Promise<EpisodeRatingResponse> {
  return fetchJson(`/ratings/episode/${episodeId}`, { signal });
}

export async function getSeasonEpisodeRatings(titleId: string, season: number, signal?: AbortSignal): Promise<{ ratings: Record<number, Record<RatingValue, number>> }> {
  return fetchJson(`/ratings/season/${encodeURIComponent(titleId)}/${season}`, { signal });
}

// ─── Recommendations ──────────────────────────────────────────────────────────

export async function sendRecommendation(titleId: string, message?: string, targetUserId?: string): Promise<{ id: string }> {
  return fetchJson("/recommendations", {
    method: "POST",
    body: JSON.stringify({ titleId, message, targetUserId }),
  });
}

export async function checkRecommendation(titleId: string, signal?: AbortSignal): Promise<{ recommended: boolean; id: string | null }> {
  return fetchJson(`/recommendations/check/${encodeURIComponent(titleId)}`, { signal });
}

export async function getRecommendations(limit?: number, offset?: number, signal?: AbortSignal): Promise<RecommendationsResponse> {
  const qs = new URLSearchParams();
  if (limit != null) qs.set("limit", String(limit));
  if (offset != null) qs.set("offset", String(offset));
  const query = qs.toString();
  return fetchJson(`/recommendations${query ? `?${query}` : ""}`, { signal });
}

export async function getSentRecommendations(signal?: AbortSignal): Promise<{ recommendations: SentRecommendation[] }> {
  return fetchJson("/recommendations/sent", { signal });
}

export async function markRecommendationRead(id: string): Promise<void> {
  await fetchJson(`/recommendations/${encodeURIComponent(id)}/read`, {
    method: "POST",
  });
}

export async function deleteRecommendation(id: string): Promise<void> {
  await fetchJson(`/recommendations/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

export async function getUnreadRecommendationCount(signal?: AbortSignal): Promise<{ count: number }> {
  return fetchJson("/recommendations/count", { signal });
}

// ─── Invitations ──────────────────────────────────────────────────────────

export async function createInvitation(): Promise<{ id: string; code: string; expires_at: string }> {
  return fetchJson("/invitations", { method: "POST" });
}

export async function getInvitations(signal?: AbortSignal): Promise<{ invitations: InvitationItem[] }> {
  return fetchJson("/invitations", { signal });
}

export async function redeemInvitation(code: string): Promise<{ success: boolean; inviter: UserSummary }> {
  return fetchJson(`/invitations/redeem/${encodeURIComponent(code)}`, { method: "POST" });
}

export async function revokeInvitation(id: string): Promise<void> {
  await fetchJson(`/invitations/${encodeURIComponent(id)}`, { method: "DELETE" });
}

// ─── Integrations (Plex) ─────────────────────────────────────────────────────

export interface PlexIntegrationConfig {
  serverUrl: string;
  serverId: string;
  serverName: string;
  plexUsername: string;
  syncMovies: boolean;
  syncEpisodes: boolean;
}

export interface Integration {
  id: string;
  user_id: string;
  provider: string;
  name: string;
  config: PlexIntegrationConfig;
  enabled: boolean;
  last_sync_at: string | null;
  last_sync_error: string | null;
  created_at: string;
  updated_at: string;
}

export interface PlexServer {
  name: string;
  clientIdentifier: string;
  connections: Array<{ uri: string; local: boolean; relay: boolean }>;
}

export async function getIntegrations(signal?: AbortSignal): Promise<{ integrations: Integration[] }> {
  return fetchJson("/integrations", { signal });
}

export async function createIntegration(data: {
  provider: string;
  name?: string;
  config: Record<string, unknown>;
}): Promise<{ integration: Integration }> {
  return fetchJson("/integrations", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function updateIntegration(
  id: string,
  data: Partial<{ name: string; enabled: boolean; config: Partial<PlexIntegrationConfig> }>
): Promise<{ integration: Integration }> {
  return fetchJson(`/integrations/${encodeURIComponent(id)}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export async function deleteIntegration(id: string): Promise<void> {
  await fetchJson(`/integrations/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export async function createPlexPin(): Promise<{ pinId: number; authUrl: string }> {
  return fetchJson("/integrations/plex/pin", { method: "POST" });
}

export async function checkPlexPin(pinId: number): Promise<{
  resolved: boolean;
  authToken?: string;
  servers?: PlexServer[];
}> {
  return fetchJson(`/integrations/plex/pin/${pinId}`, { method: "POST" });
}

export async function refreshPlexServers(authToken: string): Promise<{ servers: PlexServer[] }> {
  return fetchJson("/integrations/plex/servers", {
    method: "POST",
    body: JSON.stringify({ authToken }),
  });
}

export async function triggerPlexSync(
  id: string
): Promise<{ success: boolean; moviesMarked?: number; episodesMarked?: number; error?: string }> {
  return fetchJson(`/integrations/${encodeURIComponent(id)}/sync`, { method: "POST" });
}


// ─── Stats ────────────────────────────────────────────────────────────────────

export async function getStats(signal?: AbortSignal): Promise<StatsResponse> {
  return fetchJson("/stats", { signal });
}


// ─── User settings ────────────────────────────────────────────────────────────

export async function getHomepageLayout(signal?: AbortSignal): Promise<{ homepage_layout: HomepageSection[] }> {
  return fetchJson("/user/settings/homepage-layout", { signal });
}

export async function updateHomepageLayout(layout: HomepageSection[]): Promise<{ homepage_layout: HomepageSection[] }> {
  return fetchJson("/user/settings/homepage-layout", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ homepage_layout: layout }),
  });
}

export async function getDepartureAlertSettings(signal?: AbortSignal): Promise<UserSettings> {
  return fetchJson("/user/settings/departure-alerts", { signal });
}

export async function updateDepartureAlertSettings(settings: Partial<UserSettings>): Promise<UserSettings> {
  return fetchJson("/user/settings/departure-alerts", {
    method: "PUT",
    body: JSON.stringify(settings),
  });
}

export async function getCrowdedWeekSettings(signal?: AbortSignal): Promise<{ crowdedWeekThreshold: number; crowdedWeekBadgeEnabled: number }> {
  return fetchJson("/user/settings/crowded-weeks", { signal });
}

export async function updateCrowdedWeekSettings(data: { crowdedWeekThreshold?: number; crowdedWeekBadgeEnabled?: number }): Promise<{ crowdedWeekThreshold: number; crowdedWeekBadgeEnabled: number }> {
  return fetchJson("/user/settings/crowded-weeks", {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

// ─── Admin user management ────────────────────────────────────────────────────

export async function getAdminUsers(opts: { search?: string; filter?: string; page?: number } = {}, signal?: AbortSignal): Promise<AdminUsersResponse> {
  const params = new URLSearchParams();
  if (opts.search) params.set("search", opts.search);
  if (opts.filter) params.set("filter", opts.filter);
  if (opts.page) params.set("page", String(opts.page));
  const qs = params.toString();
  return fetchJson(`/admin/users${qs ? `?${qs}` : ""}`, { signal });
}

export async function getAdminUser(userId: string, signal?: AbortSignal): Promise<{ user: AdminUser }> {
  return fetchJson(`/admin/users/${encodeURIComponent(userId)}`, { signal });
}

export async function setAdminUserRole(userId: string, role: "admin" | "user"): Promise<{ message: string }> {
  return fetchJson(`/admin/users/${encodeURIComponent(userId)}/role`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ role }),
  });
}

export async function banAdminUser(userId: string, reason?: string): Promise<{ message: string }> {
  return fetchJson(`/admin/users/${encodeURIComponent(userId)}/ban`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reason }),
  });
}

export async function unbanAdminUser(userId: string): Promise<{ message: string }> {
  return fetchJson(`/admin/users/${encodeURIComponent(userId)}/unban`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
}

export async function deleteAdminUser(userId: string): Promise<{ message: string }> {
  return fetchJson(`/admin/users/${encodeURIComponent(userId)}`, { method: "DELETE" });
}

// ─── Calendar feed ────────────────────────────────────────────────────────────

export async function getFeedToken(signal?: AbortSignal): Promise<{ token: string | null }> {
  return fetchJson("/feed/token", { signal });
}

export async function regenerateFeedToken(): Promise<{ token: string }> {
  return fetchJson("/feed/token/regenerate", { method: "POST" });
}

// ─── Kiosk ────────────────────────────────────────────────────────────────────

export type KioskFidelity = "rich" | "lite" | "epaper";

export interface KioskAiringSlot {
  id: number;
  title_id: string;
  show_title: string;
  poster_url: string | null;
  backdrop_url: string | null;
  season_number: number;
  episode_number: number;
  ep_title: string | null;
  air_date: string | null;
  provider: string | null;
}

export interface KioskRelease {
  id: number;
  title_id: string;
  show_title: string;
  poster_url: string | null;
  backdrop_url: string | null;
  season_number: number;
  episode_number: number;
  ep_title: string | null;
  air_date: string | null;
  provider: string | null;
  kind: "series" | "episode";
}

export interface KioskQueueItem {
  id: number;
  title_id: string;
  show_title: string;
  poster_url: string | null;
  season_number: number;
  episode_number: number;
  ep_title: string | null;
  air_date: string | null;
  provider: string | null;
  left: number;
}

export interface KioskMeta {
  household: string;
  fidelity: KioskFidelity;
  refresh_interval_seconds: number;
  generated_at: string;
}

export interface KioskData {
  meta: KioskMeta;
  airing_now: KioskAiringSlot | null;
  releasing_today: KioskRelease[];
  unwatched_queue: KioskQueueItem[];
}

export async function getKioskData(token: string, display?: KioskFidelity, signal?: AbortSignal): Promise<KioskData> {
  const params = display ? `?display=${encodeURIComponent(display)}` : "";
  return fetchJson(`/kiosk/${encodeURIComponent(token)}${params}`, { signal });
}

export async function getKioskToken(signal?: AbortSignal): Promise<{ token: string | null }> {
  return fetchJson("/kiosk/token", { signal });
}

export async function regenerateKioskToken(): Promise<{ token: string }> {
  return fetchJson("/kiosk/token/regenerate", { method: "POST" });
}

export async function revokeKioskToken(): Promise<void> {
  await doFetch("/kiosk/token", { method: "DELETE" });
}

// ─── Watchlist Share ──────────────────────────────────────────────────────────

export async function getWatchlistShareToken(signal?: AbortSignal): Promise<{ token: string | null }> {
  return fetchJson("/share/token", { signal });
}

export async function regenerateWatchlistShareToken(): Promise<{ token: string }> {
  return fetchJson("/share/token", { method: "POST" });
}

export async function revokeWatchlistShareToken(): Promise<void> {
  await doFetch("/share/token", { method: "DELETE" });
}

export async function getSharedWatchlist(token: string, signal?: AbortSignal): Promise<{ username: string; titles: Title[] }> {
  return fetchJson(`/share/watchlist/${encodeURIComponent(token)}`, { signal });
}

// ─── Title Notes & Tags ───────────────────────────────────────────────────────

export async function updateTrackedNotes(titleId: string, notes: string | null): Promise<void> {
  return fetchJson(`/track/${encodeURIComponent(titleId)}/notes`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ notes }),
  });
}

export async function updateTrackedTags(titleId: string, tags: string[]): Promise<void> {
  return fetchJson(`/track/${encodeURIComponent(titleId)}/tags`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tags }),
  });
}

export async function setNotificationMode(
  titleId: string,
  mode: "all" | "premieres_only" | "none" | null
): Promise<void> {
  return fetchJson(`/track/${encodeURIComponent(titleId)}/notification`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode }),
  });
}

export async function bulkTrackAction(payload: {
  titleIds: string[];
  action: "untrack" | "set_status" | "add_tag" | "set_notification_mode";
  payload?: { status?: string; tag?: string; mode?: string };
}): Promise<{ updated: number }> {
  return fetchJson<{ updated: number }>("/track/bulk", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

// ─── Up Next ───────────────────────────────────────────────────────────────

export interface UpNextItem {
  kind: "in_progress" | "newly_aired" | "recommendation";
  titleId: number;
  title: string;
  posterUrl: string | null;
  nextEpisodeId?: number;
  nextEpisodeTitle?: string;
  nextEpisodeSeason?: number;
  nextEpisodeNumber?: number;
  nextEpisodeAirDate?: string;
  unwatchedCount?: number;
  recommendedBy?: string;
  recommendationId?: number;
}

export async function getUpNext(limit = 12, signal?: AbortSignal): Promise<{ items: UpNextItem[] }> {
  const qs = new URLSearchParams();
  qs.set("limit", String(limit));
  return fetchJson(`/up-next?${qs}`, { signal });
}

export async function setTitleSnooze(
  titleId: string,
  until: string | null
): Promise<{ success: boolean }> {
  return fetchJson<{ success: boolean }>(`/track/${encodeURIComponent(titleId)}/snooze`, {
    method: "PATCH",
    body: JSON.stringify({ until }),
  });
}

export async function setRemindOnRelease(
  titleId: string,
  enabled: boolean
): Promise<{ success: boolean; scheduledFor: string | null }> {
  return fetchJson<{ success: boolean; scheduledFor: string | null }>(
    `/track/${encodeURIComponent(titleId)}/remind-on-release`,
    {
      method: "PATCH",
      body: JSON.stringify({ enabled }),
    }
  );
}
