import { findByImdbId, fetchMovieDetails, fetchTvDetails } from "../tmdb/client";
import { parseMovieDetails, parseTvDetails, type ParsedTitle } from "../tmdb/parser";

const IMDB_URL_REGEX = /(?:https?:\/\/)?(?:www\.)?imdb\.com\/title\/(tt\d+)/i;
const IMDB_ID_REGEX = /^tt\d+$/;

export function extractImdbId(input: string): string | null {
  const urlMatch = input.match(IMDB_URL_REGEX);
  if (urlMatch) return urlMatch[1];
  if (IMDB_ID_REGEX.test(input.trim())) return input.trim();
  return null;
}

export async function resolveImdbUrl(url: string): Promise<ParsedTitle | null> {
  const imdbId = extractImdbId(url);
  if (!imdbId) return null;

  // Use TMDB's /find endpoint for direct IMDB ID lookup
  const findResult = await findByImdbId(imdbId);

  if (findResult.movie_results.length > 0) {
    const movie = findResult.movie_results[0];
    const details = await fetchMovieDetails(movie.id);
    return parseMovieDetails(details);
  }

  if (findResult.tv_results.length > 0) {
    const tv = findResult.tv_results[0];
    const details = await fetchTvDetails(tv.id);
    return parseTvDetails(details);
  }

  return null;
}
