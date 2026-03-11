import type { Title, SearchTitle, Provider, Episode } from "./types";

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
  limit?: number;
  offset?: number;
} = {}): Promise<{ titles: Title[]; count: number }> {
  const qs = new URLSearchParams();
  if (params.daysBack) qs.set("daysBack", String(params.daysBack));
  if (params.type) qs.set("type", params.type);
  if (params.provider) qs.set("provider", params.provider);
  if (params.limit) qs.set("limit", String(params.limit));
  if (params.offset) qs.set("offset", String(params.offset));
  return fetchJson(`/titles?${qs}`);
}

export async function searchTitles(query: string): Promise<{ titles: SearchTitle[]; count: number }> {
  return fetchJson(`/search?q=${encodeURIComponent(query)}`);
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

export async function getTrackedTitles(): Promise<{ titles: Title[]; count: number }> {
  return fetchJson("/track");
}

export async function resolveImdb(url: string): Promise<{ success: boolean; title: SearchTitle }> {
  return fetchJson("/imdb", {
    method: "POST",
    body: JSON.stringify({ url }),
  });
}

export async function getProviders(): Promise<{ providers: Provider[] }> {
  return fetchJson("/titles/providers");
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

export async function getUpcomingEpisodes(): Promise<{ today: Episode[]; upcoming: Episode[] }> {
  return fetchJson("/episodes/upcoming");
}

// ─── Auth ────────────────────────────────────────────────────────────────────

export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  await fetchJson("/auth/change-password", {
    method: "POST",
    body: JSON.stringify({ currentPassword, newPassword }),
  });
}

// ─── Admin ───────────────────────────────────────────────────────────────────

export async function getAdminSettings(): Promise<any> {
  return fetchJson("/admin/settings");
}

export async function updateAdminSettings(settings: Record<string, string>): Promise<any> {
  return fetchJson("/admin/settings", {
    method: "PUT",
    body: JSON.stringify(settings),
  });
}
