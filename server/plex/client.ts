import { CONFIG } from "../config";
import { logger } from "../logger";
import { httpFetch } from "../lib/http";

const log = logger.child({ module: "plex" });

const PLEX_TV_BASE = "https://plex.tv";

function plexHeaders(token?: string): Record<string, string> {
  const headers: Record<string, string> = {
    "X-Plex-Client-Identifier": CONFIG.PLEX_CLIENT_ID,
    "X-Plex-Product": "Remindarr",
    "X-Plex-Version": "1.0",
    "X-Plex-Platform": "Web",
    Accept: "application/json",
  };
  if (token) headers["X-Plex-Token"] = token;
  return headers;
}

export class PlexAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PlexAuthError";
  }
}

export class PlexApiError extends Error {
  constructor(
    message: string,
    public readonly status?: number
  ) {
    super(message);
    this.name = "PlexApiError";
  }
}

async function plexFetch<T>(url: string, options: RequestInit = {}): Promise<T> {
  const res = await httpFetch(url, options);
  if (res.status === 401) throw new PlexAuthError("Plex token is invalid or revoked");
  if (!res.ok) throw new PlexApiError(`Plex API error: ${res.status} ${res.statusText}`, res.status);
  return res.json() as Promise<T>;
}

// ─── Auth / PIN flow ─────────────────────────────────────────────────────────

export type PlexPin = {
  id: number;
  code: string;
  authToken: string | null;
  expiresAt: string;
};

export async function createPin(): Promise<PlexPin> {
  const url = `${PLEX_TV_BASE}/api/v2/pins?strong=true`;
  const data = await plexFetch<{ id: number; code: string; authToken: string | null; expiresAt: string }>(url, {
    method: "POST",
    headers: plexHeaders(),
  });
  log.debug("Plex PIN created", { pinId: data.id });
  return data;
}

export async function checkPin(pinId: number): Promise<PlexPin> {
  const url = `${PLEX_TV_BASE}/api/v2/pins/${pinId}`;
  return plexFetch<PlexPin>(url, { headers: plexHeaders() });
}

export function buildPlexAuthUrl(pinCode: string): string {
  const params = new URLSearchParams({
    clientID: CONFIG.PLEX_CLIENT_ID,
    code: pinCode,
    "context[device][product]": "Remindarr",
  });
  return `https://app.plex.tv/auth#?${params.toString()}`;
}

// ─── Resources / Servers ─────────────────────────────────────────────────────

export type PlexServer = {
  name: string;
  clientIdentifier: string;
  connections: Array<{ uri: string; local: boolean; relay: boolean }>;
};

/** Raw shape returned by the Plex /api/v2/resources endpoint. */
interface PlexResource extends PlexServer {
  /** Comma-separated capability list, e.g. "server,player" */
  provides?: string;
}

export async function getServers(token: string): Promise<PlexServer[]> {
  const url = `${PLEX_TV_BASE}/api/v2/resources?includeHttps=1&includeRelay=1`;
  const data = await plexFetch<PlexResource[]>(url, { headers: plexHeaders(token) });
  // Only return MediaServer resources
  return data.filter((r: PlexResource) => r.provides?.includes("server"));
}

// ─── Library ─────────────────────────────────────────────────────────────────

export type PlexSection = {
  key: string;
  type: "movie" | "show";
  title: string;
};

export async function getLibrarySections(serverUrl: string, token: string): Promise<PlexSection[]> {
  const url = `${serverUrl}/library/sections`;
  const data = await plexFetch<{ MediaContainer: { Directory: Array<{ key: string; type: string; title: string }> } }>(
    url,
    { headers: plexHeaders(token) }
  );
  return (data.MediaContainer?.Directory ?? [])
    .filter((d) => d.type === "movie" || d.type === "show")
    .map((d) => ({ key: d.key, type: d.type as "movie" | "show", title: d.title }));
}

// ─── Watched status ───────────────────────────────────────────────────────────

export type PlexGuid = { id: string };

export type PlexMovieItem = {
  ratingKey: string;
  title: string;
  viewCount: number;
  Guid?: PlexGuid[];
  guid?: string;
};

export type PlexEpisodeItem = {
  ratingKey: string;
  title: string;
  parentTitle: string;
  grandparentTitle: string;
  seasonNumber: number;
  index: number;
  viewCount: number;
  Guid?: PlexGuid[];
  guid?: string;
  grandparentGuid?: string;
  grandparentRatingKey?: string;
};

export type PlexShowItem = {
  ratingKey: string;
  title: string;
  Guid?: PlexGuid[];
  guid?: string;
};

export async function getWatchedMovies(
  serverUrl: string,
  token: string,
  sectionKey: string
): Promise<PlexMovieItem[]> {
  const url = `${serverUrl}/library/sections/${sectionKey}/all?type=1&includeGuids=1`;
  const data = await plexFetch<{ MediaContainer: { Metadata?: PlexMovieItem[] } }>(
    url,
    { headers: plexHeaders(token) }
  );
  const items = data.MediaContainer?.Metadata ?? [];
  return items.filter((m) => (m.viewCount ?? 0) > 0);
}

export async function getAllMoviesInSection(
  serverUrl: string,
  token: string,
  sectionKey: string
): Promise<PlexMovieItem[]> {
  const url = `${serverUrl}/library/sections/${sectionKey}/all?type=1&includeGuids=1`;
  const data = await plexFetch<{ MediaContainer: { Metadata?: PlexMovieItem[] } }>(
    url,
    { headers: plexHeaders(token) }
  );
  return data.MediaContainer?.Metadata ?? [];
}

export async function getWatchedEpisodes(
  serverUrl: string,
  token: string,
  sectionKey: string
): Promise<PlexEpisodeItem[]> {
  const url = `${serverUrl}/library/sections/${sectionKey}/all?type=4&includeGuids=1`;
  const data = await plexFetch<{ MediaContainer: { Metadata?: PlexEpisodeItem[] } }>(
    url,
    { headers: plexHeaders(token) }
  );
  const items = data.MediaContainer?.Metadata ?? [];
  return items.filter((e) => (e.viewCount ?? 0) > 0);
}

export async function getShowsInSection(
  serverUrl: string,
  token: string,
  sectionKey: string
): Promise<PlexShowItem[]> {
  const url = `${serverUrl}/library/sections/${sectionKey}/all?type=2&includeGuids=1`;
  const data = await plexFetch<{ MediaContainer: { Metadata?: PlexShowItem[] } }>(
    url,
    { headers: plexHeaders(token) }
  );
  return data.MediaContainer?.Metadata ?? [];
}

// ─── Metadata / slugs ────────────────────────────────────────────────────────

/**
 * Looks up the watch.plex.tv slug for a title via the Plex metadata provider API.
 * Returns null if the lookup fails or the title has no slug.
 */
export async function getPlexMetadataSlug(
  tmdbId: string,
  mediaType: "movie" | "show",
  token: string
): Promise<string | null> {
  const type = mediaType === "movie" ? 1 : 2;
  const url = `https://metadata.provider.plex.tv/library/metadata/matches?guid=tmdb://${tmdbId}&type=${type}`;
  try {
    const data = await plexFetch<{ MediaContainer?: { Metadata?: Array<{ slug?: string }> } }>(
      url,
      { headers: plexHeaders(token) }
    );
    return data.MediaContainer?.Metadata?.[0]?.slug ?? null;
  } catch {
    return null;
  }
}
