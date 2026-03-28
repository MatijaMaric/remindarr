import type { Title } from "../types";

export interface ShowGroup {
  key: string;
  labelKey: string;
  titles: Title[];
}

const STATUS_ORDER = ["watching", "caught_up", "not_started", "unreleased", "completed"] as const;

const LABEL_KEYS: Record<string, string> = {
  watching: "tracked.sections.watching",
  caught_up: "tracked.sections.caughtUp",
  not_started: "tracked.sections.notStarted",
  unreleased: "tracked.sections.unreleased",
  completed: "tracked.sections.completed",
};

function compareDatesDesc(a: string | null | undefined, b: string | null | undefined): number {
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  return b.localeCompare(a);
}

function compareDatesAsc(a: string | null | undefined, b: string | null | undefined): number {
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  return a.localeCompare(b);
}

function sortByTrackedAtDesc(a: Title, b: Title): number {
  return compareDatesDesc(a.tracked_at, b.tracked_at);
}

function sortGroup(key: string, titles: Title[]): Title[] {
  switch (key) {
    case "watching":
      return [...titles].sort((a, b) =>
        compareDatesDesc(a.latest_released_air_date, b.latest_released_air_date)
      );
    case "caught_up":
      return [...titles].sort((a, b) =>
        compareDatesAsc(a.next_episode_air_date, b.next_episode_air_date)
      );
    case "not_started":
      return [...titles].sort((a, b) =>
        compareDatesDesc(a.latest_released_air_date, b.latest_released_air_date)
      );
    case "unreleased":
      return [...titles].sort((a, b) =>
        compareDatesAsc(a.release_date, b.release_date)
      );
    case "completed":
      return [...titles].sort(sortByTrackedAtDesc);
    default:
      return titles;
  }
}

/**
 * Groups shows by their show_status into sorted sections.
 * Returns only non-empty groups in the defined order.
 */
export function groupShowsByStatus(shows: Title[]): ShowGroup[] {
  const buckets: Record<string, Title[]> = {};

  for (const status of STATUS_ORDER) {
    buckets[status] = [];
  }

  for (const show of shows) {
    const status = show.show_status ?? "not_started";
    const bucket = buckets[status];
    if (bucket) {
      bucket.push(show);
    } else {
      // Fallback for unexpected status values
      buckets["not_started"].push(show);
    }
  }

  const groups: ShowGroup[] = [];
  for (const status of STATUS_ORDER) {
    const titles = buckets[status];
    if (titles.length > 0) {
      groups.push({
        key: status,
        labelKey: LABEL_KEYS[status],
        titles: sortGroup(status, titles),
      });
    }
  }

  return groups;
}
