import { CONFIG } from "../config";
import { GET_POPULAR_TITLES, SEARCH_TITLES } from "./queries";
import { parseTitles, type ParsedTitle } from "./parser";
import type { JWPopularTitlesResponse } from "./types";

async function graphqlRequest(query: string, variables: Record<string, unknown>): Promise<any> {
  const res = await fetch(CONFIG.JUSTWATCH_GRAPHQL_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  const body = await res.json() as any;
  if (!res.ok || (body.errors && !body.data)) {
    const msg = body.errors?.[0]?.message || res.statusText;
    throw new Error(`JustWatch API error: ${msg}`);
  }
  return body;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function fetchNewReleases(options: {
  daysBack?: number;
  objectType?: "MOVIE" | "SHOW";
  maxPages?: number;
}): Promise<ParsedTitle[]> {
  const { daysBack = CONFIG.DEFAULT_DAYS_BACK, objectType, maxPages = 10 } = options;

  // JustWatch only supports releaseYear (IntFilter with min/max), not date-based filtering
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysBack);
  const minYear = cutoffDate.getFullYear();

  const filter: Record<string, unknown> = {
    releaseYear: { min: minYear },
  };
  if (objectType) {
    filter.objectTypes = [objectType];
  }

  const allTitles: ParsedTitle[] = [];
  let cursor: string | null = null;
  let page = 0;

  while (page < maxPages) {
    const variables: Record<string, unknown> = {
      country: CONFIG.COUNTRY,
      language: CONFIG.LANGUAGE,
      first: CONFIG.PAGE_SIZE,
      after: cursor,
      filter,
      sortBy: "RELEASE_YEAR",
    };

    const data = (await graphqlRequest(GET_POPULAR_TITLES, variables)) as JWPopularTitlesResponse;
    const edges = data.data?.popularTitles?.edges || [];
    if (edges.length === 0) break;

    allTitles.push(...parseTitles(edges));

    const pageInfo = data.data.popularTitles.pageInfo;
    if (!pageInfo.hasNextPage) break;

    cursor = pageInfo.endCursor;
    page++;

    if (page < maxPages) {
      await delay(CONFIG.PAGE_DELAY_MS);
    }
  }

  return allTitles;
}

export async function searchTitles(query: string, limit = 20): Promise<ParsedTitle[]> {
  const variables = {
    country: CONFIG.COUNTRY,
    language: CONFIG.LANGUAGE,
    first: limit,
    searchQuery: query,
  };

  const data = (await graphqlRequest(SEARCH_TITLES, variables)) as JWPopularTitlesResponse;
  const edges = data.data?.popularTitles?.edges || [];
  return parseTitles(edges);
}
