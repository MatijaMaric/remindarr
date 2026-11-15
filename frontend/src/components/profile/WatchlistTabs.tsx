import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { Title } from "../../types";

export type WatchlistTab =
  | "watching"
  | "not_started"
  | "completed"
  | "plan_to_watch"
  | "on_hold"
  | "dropped"
  | "unreleased"
  | "movies";

interface WatchlistTabsProps {
  active: WatchlistTab;
  onChange: (tab: WatchlistTab) => void;
  counts: Record<WatchlistTab, number>;
}

const TABS: { key: WatchlistTab; labelKey: string }[] = [
  { key: "watching", labelKey: "userProfile.dossier.tabWatching" },
  { key: "not_started", labelKey: "userProfile.dossier.status.notStarted" },
  { key: "completed", labelKey: "userProfile.dossier.tabCompleted" },
  { key: "plan_to_watch", labelKey: "userProfile.dossier.tabPlanToWatch" },
  { key: "on_hold", labelKey: "userProfile.dossier.tabOnHold" },
  { key: "dropped", labelKey: "userProfile.dossier.status.dropped" },
  { key: "unreleased", labelKey: "userProfile.dossier.status.unreleased" },
  { key: "movies", labelKey: "userProfile.dossier.tabMovies" },
];

/** The active tab if it has titles, else the first tab that does. */
export function resolveWatchlistTab(
  active: WatchlistTab,
  counts: Record<WatchlistTab, number>,
): WatchlistTab {
  if (counts[active] > 0) return active;
  return TABS.find((tab) => counts[tab.key] > 0)?.key ?? active;
}

export default function WatchlistTabs({
  active,
  onChange,
  counts,
}: WatchlistTabsProps) {
  const { t } = useTranslation();
  const visible = TABS.filter((tab) => counts[tab.key] > 0);
  if (visible.length === 0) return null;
  return (
    <div
      className="flex gap-1 overflow-x-auto border-b border-border"
      role="tablist"
      data-testid="watchlist-tabs"
    >
      {visible.map((tab) => {
        const isActive = active === tab.key;
        return (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(tab.key)}
            className={`px-4 py-2.5 text-[13px] whitespace-nowrap cursor-pointer flex items-center gap-2 -mb-px border-b-2 transition-colors ${
              isActive
                ? "font-semibold text-foreground border-primary"
                : "font-medium text-muted-foreground border-transparent hover:text-foreground-secondary"
            }`}
            data-testid={`tab-${tab.key}`}
          >
            {t(tab.labelKey)}
            <span
              className={`font-mono text-[11px] px-1.5 py-0.5 rounded-full min-w-[1.25rem] text-center ${
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "bg-accent text-muted-foreground"
              }`}
            >
              {counts[tab.key]}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** Tab for a show: its user-set status, else the computed one. Every show lands in exactly one tab. */
function tabForShow(show: Title): Exclude<WatchlistTab, "movies"> {
  switch (show.user_status ?? show.show_status ?? null) {
    case "not_started":
      return "not_started";
    case "completed":
      return "completed";
    case "plan_to_watch":
      return "plan_to_watch";
    case "on_hold":
      return "on_hold";
    case "dropped":
      return "dropped";
    case "unreleased":
      return "unreleased";
    default:
      // watching, caught_up, or no computable status
      return "watching";
  }
}

export function useWatchlistFilters(shows: Title[], movies: Title[]) {
  return useMemo(() => {
    const lists: Record<WatchlistTab, Title[]> = {
      watching: [],
      not_started: [],
      completed: [],
      plan_to_watch: [],
      on_hold: [],
      dropped: [],
      unreleased: [],
      movies,
    };
    for (const show of shows) lists[tabForShow(show)].push(show);
    const counts = Object.fromEntries(
      Object.entries(lists).map(([k, v]) => [k, v.length]),
    ) as Record<WatchlistTab, number>;
    return { counts, lists };
  }, [shows, movies]);
}
