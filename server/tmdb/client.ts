import { CONFIG } from "../config";
import type { TmdbShowDetails, TmdbSeasonResponse } from "./types";

async function tmdbRequest<T>(path: string): Promise<T> {
  const url = `${CONFIG.TMDB_BASE_URL}${path}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${CONFIG.TMDB_API_KEY}`,
      "Content-Type": "application/json",
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`TMDB API error ${res.status}: ${body}`);
  }
  return res.json() as Promise<T>;
}

export async function fetchShowDetails(tmdbId: string): Promise<TmdbShowDetails> {
  return tmdbRequest<TmdbShowDetails>(`/tv/${tmdbId}`);
}

export async function fetchSeasonEpisodes(tmdbId: string, seasonNumber: number): Promise<TmdbSeasonResponse> {
  return tmdbRequest<TmdbSeasonResponse>(`/tv/${tmdbId}/season/${seasonNumber}`);
}
