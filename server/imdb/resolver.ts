import { searchTitles } from "../justwatch/client";
import type { ParsedTitle } from "../justwatch/parser";

const IMDB_URL_REGEX = /(?:https?:\/\/)?(?:www\.)?imdb\.com\/title\/(tt\d+)/i;
const IMDB_ID_REGEX = /^tt\d+$/;

export function extractImdbId(input: string): string | null {
  const urlMatch = input.match(IMDB_URL_REGEX);
  if (urlMatch) return urlMatch[1];
  if (IMDB_ID_REGEX.test(input.trim())) return input.trim();
  return null;
}

async function fetchImdbTitle(imdbId: string): Promise<string | null> {
  try {
    // Use IMDB's suggestion/autocomplete API — reliable, no auth needed
    const firstChar = imdbId[0];
    const res = await fetch(`https://v2.sg.media-imdb.com/suggestion/${firstChar}/${imdbId}.json`);
    if (!res.ok) return null;
    const data = (await res.json()) as any;
    const entry = data.d?.find((d: any) => d.id === imdbId);
    return entry?.l || null;
  } catch {
    return null;
  }
}

export async function resolveImdbUrl(url: string): Promise<ParsedTitle | null> {
  const imdbId = extractImdbId(url);
  if (!imdbId) return null;

  // Get the title name from IMDB
  const titleName = await fetchImdbTitle(imdbId);
  if (!titleName) return null;

  // Search JustWatch by title name and match by IMDB ID
  const results = await searchTitles(titleName, 20);
  const exactMatch = results.find((t) => t.imdbId === imdbId);
  if (exactMatch) return exactMatch;

  // If no exact IMDB match, return the first result as a best guess
  return results[0] || null;
}
