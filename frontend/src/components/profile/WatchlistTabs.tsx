import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { Title } from "../../types";

export type WatchlistTab =
  | "watching"
  | "completed"
  | "plan_to_watch"
  | "on_hold"
  | "movies";

interface WatchlistTabsProps {
  active: WatchlistTab;
  onChange: (tab: WatchlistTab) => void;
  counts: Record<WatchlistTab, number>;
}

const TABS: { key: WatchlistTab; labelKey: string }[] = [
  { key: "watching", labelKey: "userProfile.dossier.tabWatching" },
  { key: "completed", labelKey: "userProfile.dossier.tabCompleted" },
  { key: "plan_to_watch", labelKey: "userProfile.dossier.tabPlanToWatch" },
  { key: "on_hold", labelKey: "userProfile.dossier.tabOnHold" },
  { key: "movies", labelKey: "userProfile.dossier.tabMovies" },
];

export default function WatchlistTabs({ active, onChange, counts }: WatchlistTabsProps) {
  const { t } = useTranslation();
  return (
    <div
      className="flex gap-1 overflow-x-auto border-b border-white/[0.06]"
      role="tablist"
      data-testid="watchlist-tabs"
    >
      {TABS.map((tab) => {
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
                ? "font-semibold text-zinc-100 border-amber-400"
                : "font-medium text-zinc-400 border-transparent hover:text-zinc-200"
            }`}
            data-testid={`tab-${tab.key}`}
          >
            {t(tab.labelKey)}
            <span
              className={`font-mono text-[10px] px-1.5 py-0.5 rounded-full min-w-[1.25rem] text-center ${
                isActive ? "bg-amber-400 text-black" : "bg-white/[0.08] text-zinc-400"
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

export function useWatchlistFilters(shows: Title[], movies: Title[]) {
  return useMemo(() => {
    const statusOf = (t: Title) => t.user_status ?? t.show_status ?? null;
    const watching = shows.filter((s) => {
      const st = statusOf(s);
      return st === "watching" || st === "caught_up";
    });
    const completed = shows.filter((s) => statusOf(s) === "completed");
    const planToWatch = shows.filter((s) => s.user_status === "plan_to_watch");
    const onHold = shows.filter((s) => s.user_status === "on_hold");
    const counts: Record<WatchlistTab, number> = {
      watching: watching.length,
      completed: completed.length,
      plan_to_watch: planToWatch.length,
      on_hold: onHold.length,
      movies: movies.length,
    };
    const lists: Record<WatchlistTab, Title[]> = {
      watching,
      completed,
      plan_to_watch: planToWatch,
      on_hold: onHold,
      movies,
    };
    return { counts, lists };
  }, [shows, movies]);
}
