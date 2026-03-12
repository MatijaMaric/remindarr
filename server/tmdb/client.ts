import { CONFIG } from "../config";
import type {
  TmdbShowDetails,
  TmdbSeasonResponse,
  TmdbMovieDetails,
  TmdbShowDetailsExtended,
  TmdbSeasonDetails,
  TmdbEpisodeDetails,
} from "./types";

const language = CONFIG.LOCALE.replace("_", "-");

async function tmdbRequest<T>(path: string): Promise<T> {
  const separator = path.includes("?") ? "&" : "?";
  const url = `${CONFIG.TMDB_BASE_URL}${path}${separator}language=${language}`;
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

// ─── Detail endpoints ────────────────────────────────────────────────────────

export async function fetchMovieDetails(tmdbId: string): Promise<TmdbMovieDetails> {
  return tmdbRequest<TmdbMovieDetails>(
    `/movie/${tmdbId}?append_to_response=credits,release_dates,watch/providers`
  );
}

export async function fetchShowDetailsExtended(tmdbId: string): Promise<TmdbShowDetailsExtended> {
  return tmdbRequest<TmdbShowDetailsExtended>(
    `/tv/${tmdbId}?append_to_response=credits,content_ratings,watch/providers`
  );
}

export async function fetchSeasonDetails(tmdbId: string, seasonNumber: number): Promise<TmdbSeasonDetails> {
  return tmdbRequest<TmdbSeasonDetails>(
    `/tv/${tmdbId}/season/${seasonNumber}?append_to_response=credits`
  );
}

export async function fetchEpisodeDetails(
  tmdbId: string,
  seasonNumber: number,
  episodeNumber: number
): Promise<TmdbEpisodeDetails> {
  return tmdbRequest<TmdbEpisodeDetails>(
    `/tv/${tmdbId}/season/${seasonNumber}/episode/${episodeNumber}?append_to_response=credits`
  );
}
