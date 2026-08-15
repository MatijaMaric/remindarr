export type EpisodeRef = {
  season: number;
  episode: number;
};

export function formatEpisodeCode(season: number, episode: number): string {
  return `S${String(season).padStart(2, "0")}E${String(episode).padStart(2, "0")}`;
}

export function getAdjacentEpisodes(
  current: EpisodeRef,
  seasonEpisodes: { episode_number: number }[],
  seasons: { season_number: number; episode_count: number }[],
): { prev: EpisodeRef | null; next: EpisodeRef | null } {
  const sorted = [...seasonEpisodes].sort(
    (a, b) => a.episode_number - b.episode_number,
  );
  const idx = sorted.findIndex((e) => e.episode_number === current.episode);

  const prevInSeason =
    idx > 0
      ? { season: current.season, episode: sorted[idx - 1].episode_number }
      : null;
  const nextInSeason =
    idx >= 0 && idx < sorted.length - 1
      ? { season: current.season, episode: sorted[idx + 1].episode_number }
      : null;

  if (prevInSeason && nextInSeason) {
    return { prev: prevInSeason, next: nextInSeason };
  }

  const seasonList = [...seasons].sort(
    (a, b) => a.season_number - b.season_number,
  );
  const seasonIdx = seasonList.findIndex(
    (s) => s.season_number === current.season,
  );

  let prev = prevInSeason;
  let next = nextInSeason;

  if (!prev && idx === 0 && seasonIdx > 0) {
    const prevSeason = seasonList[seasonIdx - 1];
    if (prevSeason.episode_count > 0) {
      prev = {
        season: prevSeason.season_number,
        episode: prevSeason.episode_count,
      };
    }
  }

  if (
    !next &&
    idx >= 0 &&
    idx === sorted.length - 1 &&
    seasonIdx >= 0 &&
    seasonIdx < seasonList.length - 1
  ) {
    const nextSeason = seasonList[seasonIdx + 1];
    next = { season: nextSeason.season_number, episode: 1 };
  }

  return { prev, next };
}
