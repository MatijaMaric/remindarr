import type {
  Title,
  SearchTitle,
  Provider,
  Episode,
  MovieDetailsResponse,
  ShowDetailsResponse,
  SeasonDetailsResponse,
  EpisodeDetailsResponse,
  PersonDetailsResponse,
  AdminSettings,
  AdminSettingsUpdateRequest,
  AdminSettingsUpdateResponse,
  UserProfileResponse,
  UserSummary,
  TitleRatingResponse,
  SentRecommendation,
  RecommendationsResponse,
  InvitationItem,
} from "./types";

const BASE = "/api";

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${url}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (res.status === 401) {
    window.dispatchEvent(new CustomEvent("auth:unauthorized"));
    throw new Error("Authentication required");
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `Request failed: ${res.status}`);
  }
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
} = {}): Promise<{ titles: Title[]; count: number }> {
  const qs = new URLSearchParams();
  if (params.daysBack) qs.set("daysBack", String(params.daysBack));
  if (params.type) qs.set("type", params.type);
  if (params.provider) qs.set("provider", params.provider);
  if (params.genre) qs.set("genre", params.genre);
  if (params.language) qs.set("language", params.language);
  if (params.excludeTracked) qs.set("excludeTracked", "1");
  if (params.limit) qs.set("limit", String(params.limit));
  if (params.offset) qs.set("offset", String(params.offset));
  return fetchJson(`/titles?${qs}`);
}

export async function searchTitles(query: string): Promise<{ titles: SearchTitle[]; count: number }> {
  return fetchJson(`/search?q=${encodeURIComponent(query)}`);
}

export async function browseTitles(params: {
  category: string;
  type?: string;
  page?: number;
  genre?: string;
  provider?: string;
  language?: string;
}): Promise<{
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
  if (params.page) qs.set("page", String(params.page));
  if (params.genre) qs.set("genre", params.genre);
  if (params.provider) qs.set("provider", params.provider);
  if (params.language) qs.set("language", params.language);
  return fetchJson(`/browse?${qs}`);
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
}

export async function untrackTitle(id: string): Promise<void> {
  await fetchJson(`/track/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

export async function getTrackedTitles(): Promise<{ titles: (Title & { public: boolean })[]; count: number; profile_public: boolean; profile_visibility: string }> {
  return fetchJson("/track");
}

export async function exportWatchlist(): Promise<void> {
  const res = await fetch(`${BASE}/track/export`, { credentials: "include" });
  if (!res.ok) throw new Error("Export failed");
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

// ─── User Profile ──────────────────────────────────────────────────────────

export async function getUserProfile(username: string): Promise<UserProfileResponse> {
  return fetchJson(`/user/${encodeURIComponent(username)}`);
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

export async function getProviders(): Promise<{ providers: Provider[]; regionProviderIds: number[] }> {
  return fetchJson("/titles/providers");
}

export async function getGenres(): Promise<{ genres: string[] }> {
  return fetchJson("/titles/genres");
}

export async function getLanguages(): Promise<{ languages: string[]; priorityLanguageCodes: string[] }> {
  return fetchJson("/titles/languages");
}

export async function getCalendarTitles(params: {
  month: string;
  type?: string;
  provider?: string;
}): Promise<{ titles: Title[]; episodes: Episode[]; count: number }> {
  const qs = new URLSearchParams();
  qs.set("month", params.month);
  if (params.type) qs.set("type", params.type);
  if (params.provider) qs.set("provider", params.provider);
  return fetchJson(`/calendar?${qs}`);
}

export async function syncEpisodes(): Promise<{ success: boolean; synced: number; shows: number; message: string }> {
  return fetchJson("/episodes/sync", { method: "POST" });
}

export async function getUpcomingEpisodes(): Promise<{ today: Episode[]; upcoming: Episode[]; unwatched: Episode[] }> {
  return fetchJson("/episodes/upcoming");
}

export async function getSeasonEpisodeStatus(
  titleId: string,
  season: number,
): Promise<{ episodes: Array<{ episode_number: number; id: number; is_watched: boolean }> }> {
  return fetchJson(`/episodes/status/${encodeURIComponent(titleId)}/${season}`);
}

// ─── Watched Episodes ─────────────────────────────────────────────────────────

export async function watchEpisode(episodeId: number): Promise<void> {
  await fetchJson(`/watched/${episodeId}`, { method: "POST" });
}

export async function unwatchEpisode(episodeId: number): Promise<void> {
  await fetchJson(`/watched/${episodeId}`, { method: "DELETE" });
}

export async function watchEpisodesBulk(episodeIds: number[], watched: boolean): Promise<void> {
  await fetchJson("/watched/bulk", {
    method: "POST",
    body: JSON.stringify({ episodeIds, watched }),
  });
}

// ─── Watched Movies ──────────────────────────────────────────────────────────

export async function watchMovie(titleId: string): Promise<void> {
  await fetchJson(`/watched/movies/${encodeURIComponent(titleId)}`, { method: "POST" });
}

export async function unwatchMovie(titleId: string): Promise<void> {
  await fetchJson(`/watched/movies/${encodeURIComponent(titleId)}`, { method: "DELETE" });
}

// ─── Details ────────────────────────────────────────────────────────────────

export async function getMovieDetails(titleId: string): Promise<MovieDetailsResponse> {
  return fetchJson(`/details/movie/${encodeURIComponent(titleId)}`);
}

export async function getShowDetails(titleId: string): Promise<ShowDetailsResponse> {
  return fetchJson(`/details/show/${encodeURIComponent(titleId)}`);
}

export async function getSeasonDetails(titleId: string, season: number): Promise<SeasonDetailsResponse> {
  return fetchJson(`/details/show/${encodeURIComponent(titleId)}/season/${season}`);
}

export async function getEpisodeDetails(titleId: string, season: number, episode: number): Promise<EpisodeDetailsResponse> {
  return fetchJson(`/details/show/${encodeURIComponent(titleId)}/season/${season}/episode/${episode}`);
}

export async function getPersonDetails(personId: number): Promise<PersonDetailsResponse> {
  return fetchJson(`/details/person/${personId}`);
}

// ─── Auth ────────────────────────────────────────────────────────────────────

export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  await fetchJson("/auth/change-password", {
    method: "POST",
    body: JSON.stringify({ currentPassword, newPassword }),
  });
}

// ─── Admin ───────────────────────────────────────────────────────────────────

export async function getAdminSettings(): Promise<AdminSettings> {
  return fetchJson("/admin/settings");
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

export async function getJobs(): Promise<JobsResponse> {
  return fetchJson("/jobs");
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
  created_at: string;
  updated_at: string;
}

export async function getVapidPublicKey(): Promise<{ publicKey: string }> {
  return fetchJson("/notifiers/vapid-public-key");
}

export async function getNotifiers(): Promise<{ notifiers: Notifier[] }> {
  return fetchJson("/notifiers");
}

export async function getNotifierProviders(): Promise<{ providers: string[] }> {
  return fetchJson("/notifiers/providers");
}

export async function createNotifier(data: {
  provider: string;
  config: Record<string, string>;
  notify_time: string;
  timezone: string;
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

export async function getFollowers(userId?: string): Promise<{ followers: UserSummary[]; count: number }> {
  const path = userId
    ? `/social/followers/${encodeURIComponent(userId)}`
    : "/social/followers";
  return fetchJson(path);
}

export async function getFollowing(userId?: string): Promise<{ following: UserSummary[]; count: number }> {
  const path = userId
    ? `/social/following/${encodeURIComponent(userId)}`
    : "/social/following";
  return fetchJson(path);
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

export async function getTitleRating(titleId: string): Promise<TitleRatingResponse> {
  return fetchJson(`/ratings/${encodeURIComponent(titleId)}`);
}

// ─── Recommendations ──────────────────────────────────────────────────────────

export async function sendRecommendation(titleId: string, message?: string): Promise<{ id: string }> {
  return fetchJson("/recommendations", {
    method: "POST",
    body: JSON.stringify({ titleId, message }),
  });
}

export async function checkRecommendation(titleId: string): Promise<{ recommended: boolean; id: string | null }> {
  return fetchJson(`/recommendations/check/${encodeURIComponent(titleId)}`);
}

export async function getRecommendations(limit?: number, offset?: number): Promise<RecommendationsResponse> {
  const qs = new URLSearchParams();
  if (limit != null) qs.set("limit", String(limit));
  if (offset != null) qs.set("offset", String(offset));
  const query = qs.toString();
  return fetchJson(`/recommendations${query ? `?${query}` : ""}`);
}

export async function getSentRecommendations(): Promise<{ recommendations: SentRecommendation[] }> {
  return fetchJson("/recommendations/sent");
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

export async function getUnreadRecommendationCount(): Promise<{ count: number }> {
  return fetchJson("/recommendations/count");
}

// ─── Invitations ──────────────────────────────────────────────────────────

export async function createInvitation(): Promise<{ id: string; code: string; expires_at: string }> {
  return fetchJson("/invitations", { method: "POST" });
}

export async function getInvitations(): Promise<{ invitations: InvitationItem[] }> {
  return fetchJson("/invitations");
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

export async function getIntegrations(): Promise<{ integrations: Integration[] }> {
  return fetchJson("/integrations");
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

export async function triggerPlexSync(
  id: string
): Promise<{ success: boolean; moviesMarked?: number; episodesMarked?: number; error?: string }> {
  return fetchJson(`/integrations/${encodeURIComponent(id)}/sync`, { method: "POST" });
}
