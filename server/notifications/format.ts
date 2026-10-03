import type { NotificationEpisode, NotificationPersonCredit } from "./types";

/**
 * Groups episodes by their show title, preserving insertion order.
 * Used by every notification provider to render one entry per show
 * (e.g. "Show Title — S01E01, S01E02") instead of duplicating the show name
 * for each episode.
 */
export function groupEpisodesByShow(
  episodes: NotificationEpisode[],
): Map<string, NotificationEpisode[]> {
  const showMap = new Map<string, NotificationEpisode[]>();
  for (const ep of episodes) {
    const existing = showMap.get(ep.showTitle) ?? [];
    existing.push(ep);
    showMap.set(ep.showTitle, existing);
  }
  return showMap;
}

/**
 * Deduplicates and joins provider names from an offers list. Returns an
 * empty string when there are no offers, which lets callers concatenate
 * without producing trailing separators.
 */
export function formatProviderNames(
  offers: ReadonlyArray<{
    providerName: string;
    providerIconUrl: string | null;
  }>,
): string {
  return [...new Set(offers.map((o) => o.providerName))].join(", ");
}

/** "Tom Hanks: The Movie (2027) as Captain" — one line per New credit. */
export function formatPersonCredit(pc: NotificationPersonCredit): string {
  const year = pc.releaseDate?.slice(0, 4);
  return `${pc.personName}: ${pc.title}${year ? ` (${year})` : ""}${pc.role ? ` as ${pc.role}` : ""}`;
}
