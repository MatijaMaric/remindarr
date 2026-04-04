export type ParsedGuids = {
  tmdbId?: number;
  imdbId?: string;
  tvdbId?: number;
};

/**
 * Parses Plex's Guid array into external IDs.
 * Handles both new format (`tmdb://12345`) and legacy format
 * (`com.plexapp.agents.themoviedb://12345?lang=en`).
 */
export function parsePlexGuids(guids: Array<{ id: string }> | undefined): ParsedGuids {
  if (!guids || guids.length === 0) return {};

  const result: ParsedGuids = {};

  for (const g of guids) {
    const id = g.id;

    // New format: tmdb://12345, imdb://tt1234567, tvdb://67890
    const newMatch = id.match(/^(tmdb|imdb|tvdb):\/\/(.+)$/);
    if (newMatch) {
      const [, source, value] = newMatch;
      if (source === "tmdb") result.tmdbId = parseInt(value, 10);
      else if (source === "imdb") result.imdbId = value;
      else if (source === "tvdb") result.tvdbId = parseInt(value, 10);
      continue;
    }

    // Legacy format: com.plexapp.agents.themoviedb://12345?lang=en
    const legacyMovieDb = id.match(/com\.plexapp\.agents\.themoviedb:\/\/(\d+)/);
    if (legacyMovieDb) {
      result.tmdbId = parseInt(legacyMovieDb[1], 10);
      continue;
    }

    // Legacy format: com.plexapp.agents.thetvdb://12345?lang=en
    const legacyTvDb = id.match(/com\.plexapp\.agents\.thetvdb:\/\/(\d+)/);
    if (legacyTvDb) {
      result.tvdbId = parseInt(legacyTvDb[1], 10);
      continue;
    }

    // Legacy format: com.plexapp.agents.imdb://tt1234567?lang=en
    const legacyImdb = id.match(/com\.plexapp\.agents\.imdb:\/\/(tt\d+)/);
    if (legacyImdb) {
      result.imdbId = legacyImdb[1];
      continue;
    }
  }

  return result;
}

/**
 * Parses a single legacy guid string (the `guid` field on older Plex items).
 * Falls back gracefully if the format is unrecognized.
 */
export function parseLegacyGuid(guid: string | undefined): ParsedGuids {
  if (!guid) return {};
  return parsePlexGuids([{ id: guid }]);
}

/**
 * Converts a TMDB ID + media type to Remindarr's title ID format.
 */
export function toRemindarrTitleId(type: "movie" | "show", tmdbId: number): string {
  return type === "movie" ? `movie-${tmdbId}` : `tv-${tmdbId}`;
}
