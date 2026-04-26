import { CONFIG } from "../config";
import { traceHttp } from "../tracing";
import { logger } from "../logger";
import { getCache } from "../cache";
import { httpFetch } from "../lib/http";
import type { SAShow, SAStreamingOption } from "./types";
import { RateLimitError } from "./types";

const log = logger.child({ module: "streaming-availability" });

const SA_BASE_URL = "https://streaming-availability.p.rapidapi.com";

/**
 * Fetch streaming options from the Streaming Availability API for a single title.
 * Returns streaming options for the configured country, or empty array if not found.
 */
export async function fetchStreamingOptions(
  tmdbId: number,
  objectType: "MOVIE" | "SHOW",
  country: string,
): Promise<SAStreamingOption[]> {
  const showType = objectType === "MOVIE" ? "movie" : "tv";
  const cacheKey = `sa:streaming:${showType}/${tmdbId}:${country.toLowerCase()}`;
  const cache = getCache();
  const cached = await cache.get<SAStreamingOption[]>(cacheKey);
  if (cached !== null) return cached;

  const showId = `${showType}/${tmdbId}`;
  const url = new URL(`${SA_BASE_URL}/shows/${showId}`);
  url.searchParams.set("country", country.toLowerCase());
  url.searchParams.set("series_granularity", "show");

  return traceHttp("GET", url.toString(), async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), CONFIG.TMDB_API_TIMEOUT_MS);
    try {
      // maxRetries: 0 — SA has custom 429/403 handling; don't retry at the httpFetch layer
      const res = await httpFetch(
        url.toString(),
        {
          headers: {
            "X-RapidAPI-Key": CONFIG.STREAMING_AVAILABILITY_API_KEY,
            "X-RapidAPI-Host": "streaming-availability.p.rapidapi.com",
          },
          signal: controller.signal,
        },
        { maxRetries: 0 }
      );

      if (res.status === 404) {
        log.debug("Title not found on SA", { tmdbId, objectType });
        await cache.set(cacheKey, [], CONFIG.CACHE_TTL_STREAMING);
        return [];
      }

      if (res.status === 429 || res.status === 403) {
        throw new RateLimitError();
      }

      if (!res.ok) {
        throw new Error(`SA API error: ${res.status} ${res.statusText}`);
      }

      const data = (await res.json()) as SAShow;
      const countryKey = country.toLowerCase();
      const result = data.streamingOptions?.[countryKey] ?? [];
      await cache.set(cacheKey, result, CONFIG.CACHE_TTL_STREAMING);
      return result;
    } finally {
      clearTimeout(timeout);
    }
  });
}
