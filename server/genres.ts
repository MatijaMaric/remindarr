/**
 * Genre grouping for overlapping TMDB movie/TV genres.
 *
 * TMDB uses different genre lists for movies and TV shows. Some genres overlap
 * conceptually but have different names:
 *   Movie "Action" + "Adventure" ↔ TV "Action & Adventure"
 *   Movie "Science Fiction" + "Fantasy" ↔ TV "Sci-Fi & Fantasy"
 *   Movie "War" ↔ TV "War & Politics"
 *
 * This module provides helpers to merge them into canonical display names
 * and expand them back for API/DB queries.
 */

/** Maps a canonical display name to all constituent TMDB genre names. */
export const GENRE_GROUPS: Record<string, string[]> = {
  "Action & Adventure": ["Action", "Adventure", "Action & Adventure"],
  "Sci-Fi & Fantasy": ["Science Fiction", "Fantasy", "Sci-Fi & Fantasy"],
  "War & Politics": ["War", "War & Politics"],
};

// Reverse lookup: individual genre name → canonical group name
const reverseMap = new Map<string, string>();
for (const [canonical, members] of Object.entries(GENRE_GROUPS)) {
  for (const member of members) {
    reverseMap.set(member, canonical);
  }
}

/** Returns the canonical group name if the genre belongs to a group, otherwise the original name. */
export function toCanonicalGenre(name: string): string {
  return reverseMap.get(name) ?? name;
}

/** Expands a canonical group name to all constituent individual genre names. For non-grouped genres, returns [name]. */
export function expandGenreGroup(canonicalName: string): string[] {
  return GENRE_GROUPS[canonicalName] ?? [canonicalName];
}

/** Expands a canonical genre name to all matching TMDB genre IDs from both movie and TV genre maps. */
export function expandGenreIds(
  canonicalName: string,
  movieGenres: Map<number, string>,
  tvGenres: Map<number, string>,
): number[] {
  const memberNames = new Set(expandGenreGroup(canonicalName));
  const ids: number[] = [];
  for (const [id, name] of movieGenres) {
    if (memberNames.has(name)) ids.push(id);
  }
  for (const [id, name] of tvGenres) {
    if (memberNames.has(name)) ids.push(id);
  }
  return ids;
}
