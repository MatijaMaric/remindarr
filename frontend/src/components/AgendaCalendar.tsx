import { useState, useEffect, useMemo, useRef, useCallback, memo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router";
import { useTranslation } from "react-i18next";
import ScrollableRow from "./ScrollableRow";
import {
  CalendarIcon,
  LayoutGridIcon,
  ListIcon,
  EyeIcon,
  EyeOffIcon,
} from "lucide-react";
import { Popover } from "@base-ui/react/popover";
import { Calendar } from "../components/ui/calendar";
import { toast } from "sonner";
import {
  getCalendarTitles,
  watchEpisode,
  unwatchEpisode,
  getCrowdedWeekSettings,
} from "../api";
import { getISOWeekKey } from "../lib/isoWeek";
import { DeckCardWrapper } from "../components/EpisodeShowCard";
import type { Title, Episode } from "../types";
import { useContentAdvisory } from "../hooks/useContentAdvisory";
import { CalendarSkeleton } from "../components/SkeletonComponents";
import {
  formatEpisodeCode,
  getEpisodeCardImageUrl,
  groupByShow,
} from "../components/EpisodeComponents";
import WatchedToggleButton from "../components/WatchedToggleButton";
import WatchButtonGroup from "../components/WatchButtonGroup";

// ─── Types & Helpers ───────────────────────────────────────────────────────

export type CalendarItem =
  | { type: "title"; data: Title }
  | { type: "episode"; data: Episode };

export const typeFilters = [
  { label: "All", value: "" },
  { label: "Movies", value: "MOVIE" },
  { label: "Shows", value: "SHOW" },
] as const;

export type ViewMode = "grid" | "agenda";

export function formatMonth(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export function formatDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Determine cell border color based on item types */
export function getCellBorderColor(items: CalendarItem[]): string {
  const hasEpisodes = items.some((i) => i.type === "episode");
  const hasMovies = items.some(
    (i) => i.type === "title" && i.data.object_type === "MOVIE",
  );
  const hasShows = items.some(
    (i) => i.type === "title" && i.data.object_type === "SHOW",
  );
  if (hasEpisodes && (hasMovies || hasShows)) return "border-l-primary";
  if (hasEpisodes) return "border-l-success";
  if (hasMovies) return "border-l-info";
  if (hasShows) return "border-l-purple-500";
  return "";
}

/**
 * A tracked show's premiere date is also the air date of its first episode,
 * so the API returns both. Keep the episode (it carries the watched state and
 * episode link) and drop the show title on any day that show has an episode.
 */
export function dropPremiereDuplicates(
  titles: Title[],
  episodes: Episode[],
): Title[] {
  const showDays = new Set(
    episodes.map((ep) => `${ep.title_id}|${ep.air_date}`),
  );
  return titles.filter(
    (t) =>
      t.object_type !== "SHOW" || !showDays.has(`${t.id}|${t.release_date}`),
  );
}

/** The episode a show's day card stands for: its first unwatched one, else its first. */
export function pickShowEpisode(showEps: Episode[]): Episode {
  return showEps.find((ep) => !ep.is_watched) ?? showEps[0];
}

// ─── URL state helpers ──────────────────────────────────────────────────────

export function useCalendarParam(
  searchParams: URLSearchParams,
  setSearchParams: ReturnType<typeof useSearchParams>[1],
  key: string,
  defaultValue = "",
): [string, (value: string) => void] {
  const value = searchParams.get(key) || defaultValue;
  const setValue = useCallback(
    (newValue: string) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (newValue && newValue !== defaultValue) {
            next.set(key, newValue);
          } else {
            next.delete(key);
          }
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams, key, defaultValue],
  );
  return [value, setValue];
}

/** One Hide watched setting for every calendar view, kept in `?hideWatched=1`. */
export function useHideWatched(
  searchParams: URLSearchParams,
  setSearchParams: ReturnType<typeof useSearchParams>[1],
): [boolean, (hide: boolean) => void] {
  const [value, setValue] = useCalendarParam(
    searchParams,
    setSearchParams,
    "hideWatched",
  );
  const setHide = useCallback(
    (hide: boolean) => setValue(hide ? "1" : ""),
    [setValue],
  );
  return [value === "1", setHide];
}

// ─── View Toggle ────────────────────────────────────────────────────────────

export function ViewToggle({
  viewMode,
  onViewModeChange,
}: {
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center bg-muted rounded-md p-0.5">
      <button
        onClick={() => onViewModeChange("grid")}
        aria-label={t("calendar.gridView")}
        aria-pressed={viewMode === "grid"}
        className={`p-1.5 rounded-sm transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-muted ${
          viewMode === "grid"
            ? "bg-primary text-primary-foreground"
            : "text-muted-foreground hover:text-foreground"
        }`}
        title={t("calendar.gridView")}
      >
        <LayoutGridIcon className="size-4" />
      </button>
      <button
        onClick={() => onViewModeChange("agenda")}
        aria-label={t("calendar.agendaView")}
        aria-pressed={viewMode === "agenda"}
        className={`p-1.5 rounded-sm transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-muted ${
          viewMode === "agenda"
            ? "bg-primary text-primary-foreground"
            : "text-muted-foreground hover:text-foreground"
        }`}
        title={t("calendar.agendaView")}
      >
        <ListIcon className="size-4" />
      </button>
    </div>
  );
}

// ─── Compact Day Header ─────────────────────────────────────────────────────

const DayHeader = memo(function DayHeader({
  count,
  dateLabel,
  isToday,
}: {
  count: number;
  dateLabel: string;
  isToday: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-3 px-3 py-2.5 rounded-md ${
        isToday
          ? "bg-primary-soft border-l-2 border-primary"
          : "bg-card/60 border-l-2 border-border"
      }`}
    >
      <div className="flex-1 min-w-0">
        {isToday && (
          <span className="text-[11px] uppercase tracking-widest text-primary-text font-semibold">
            Today
          </span>
        )}
        <h3
          className={`text-sm font-semibold ${isToday ? "text-foreground" : "text-foreground-secondary"}`}
        >
          {dateLabel}
        </h3>
      </div>
      <span className="text-xs text-muted-foreground flex-shrink-0">
        {count} item{count !== 1 ? "s" : ""}
      </span>
    </div>
  );
});

// ─── Agenda Calendar (Cinematic) ────────────────────────────────────────────

interface AgendaMonth {
  month: string;
  titles: Title[];
  episodes: Episode[];
}

interface AgendaCalendarProps {
  viewMode?: ViewMode;
  onViewModeChange?: (mode: ViewMode) => void;
  searchParams: URLSearchParams;
  setSearchParams: ReturnType<typeof useSearchParams>[1];
}

function AgendaCalendarImpl({
  viewMode,
  onViewModeChange,
  searchParams,
  setSearchParams,
}: AgendaCalendarProps) {
  const { t } = useTranslation();
  const { actionFor } = useContentAdvisory();
  const [typeFilter, setTypeFilter] = useCalendarParam(
    searchParams,
    setSearchParams,
    "type",
  );
  const [hideWatched, setHideWatched] = useHideWatched(
    searchParams,
    setSearchParams,
  );
  // Shared with the month grid so switching views keeps the month.
  const [monthParam, setMonthParam] = useCalendarParam(
    searchParams,
    setSearchParams,
    "month",
    formatMonth(new Date()),
  );
  const [months, setMonths] = useState<AgendaMonth[]>([]);

  const { data: crowdedWeekData } = useQuery({
    queryKey: ["crowded-week-settings"],
    queryFn: ({ signal }) => getCrowdedWeekSettings(signal),
  });
  const crowdedWeekThreshold = crowdedWeekData?.crowdedWeekThreshold ?? 5;
  const crowdedWeekBadgeEnabled = crowdedWeekData
    ? crowdedWeekData.crowdedWeekBadgeEnabled !== 0
    : true;
  const [loadingMore, setLoadingMore] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  // Start on today, or on the 1st of the month the URL (month grid) points at.
  const [startDate] = useState(() =>
    monthParam === formatMonth(new Date())
      ? new Date()
      : new Date(monthParam + "-01T00:00:00"),
  );
  const [activeDate, setActiveDate] = useState(startDate);
  const [pickerOpen, setPickerOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const todayRef = useRef<HTMLDivElement>(null);
  const initialScrollDoneRef = useRef(false);
  const scrollTargetRef = useRef(formatDateKey(startDate));

  // Scroll-spy state for date sidebar
  const [activeDateKey, setActiveDateKey] = useState<string | null>(null);
  const dayRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  const loadedMonthsRef = useRef(new Set<string>());
  const [earliestMonth, setEarliestMonth] = useState(
    () => new Date(startDate.getFullYear(), startDate.getMonth() - 1, 1),
  );
  const [latestMonth, setLatestMonth] = useState(
    () => new Date(startDate.getFullYear(), startDate.getMonth() + 1, 1),
  );

  const today = useMemo(() => formatDateKey(new Date()), []);

  const loadMonth = useCallback(
    async (monthStr: string): Promise<AgendaMonth | null> => {
      if (loadedMonthsRef.current.has(monthStr)) return null;
      loadedMonthsRef.current.add(monthStr);
      try {
        const data = await getCalendarTitles({
          month: monthStr,
          type: typeFilter || undefined,
        });
        return {
          month: monthStr,
          titles: data.titles,
          episodes: data.episodes || [],
        };
      } catch {
        loadedMonthsRef.current.delete(monthStr);
        return null;
      }
    },
    [typeFilter],
  );

  // Initial load: the month around the scroll target plus one either side
  useEffect(() => {
    loadedMonthsRef.current.clear();
    setMonths([]); // eslint-disable-line react-hooks/set-state-in-effect -- reset before async load
    setInitialLoading(true);

    const center = new Date(scrollTargetRef.current + "T00:00:00");
    const prev = new Date(center.getFullYear(), center.getMonth() - 1, 1);
    const curr = new Date(center.getFullYear(), center.getMonth(), 1);
    const next = new Date(center.getFullYear(), center.getMonth() + 1, 1);

    setEarliestMonth(prev);
    setLatestMonth(next);

    Promise.all([
      loadMonth(formatMonth(prev)),
      loadMonth(formatMonth(curr)),
      loadMonth(formatMonth(next)),
    ]).then((results) => {
      const loaded = results.filter((r): r is AgendaMonth => r !== null);
      loaded.sort((a, b) => a.month.localeCompare(b.month));
      setMonths(loaded);
      setInitialLoading(false);
    });
  }, [typeFilter, loadMonth]);

  // Scroll to target date after load completes
  useEffect(() => {
    if (initialLoading) {
      initialScrollDoneRef.current = false;
      return;
    }
    // Double rAF to ensure DOM is fully settled after React commit
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        let target =
          dayRefs.current.get(scrollTargetRef.current) ?? todayRef.current;
        // If exact date not found, scroll to nearest date (closest before, then after)
        if (!target && dayRefs.current.size > 0) {
          const targetKey = scrollTargetRef.current;
          const keys = [...dayRefs.current.keys()].sort();
          // Find the last date on or before target, or first date after
          const before = keys.filter((k) => k <= targetKey);
          const after = keys.filter((k) => k > targetKey);
          const bestKey =
            before.length > 0 ? before[before.length - 1] : after[0];
          if (bestKey) target = dayRefs.current.get(bestKey) ?? null;
        }
        target?.scrollIntoView({ block: "start" });
        initialScrollDoneRef.current = true;
      });
    });
  }, [initialLoading]);

  // Keep ?month= on the month being read, so the grid opens on it.
  useEffect(() => {
    if (!initialScrollDoneRef.current) return;
    const m = formatMonth(activeDate);
    if (m !== monthParam) setMonthParam(m);
  }, [activeDate, monthParam, setMonthParam]);

  // ponytail: user-driven paging; each click loads exactly one month.
  const loadNextMonth = useCallback(async () => {
    if (loadingMore) return;
    setLoadingMore(true);
    const next = new Date(
      latestMonth.getFullYear(),
      latestMonth.getMonth() + 1,
      1,
    );
    const result = await loadMonth(formatMonth(next));
    if (result) {
      setMonths((prev) => [...prev, result]);
    }
    setLatestMonth(next);
    setLoadingMore(false);
  }, [latestMonth, loadMonth, loadingMore]);

  const loadPrevMonth = useCallback(async () => {
    if (loadingMore) return;
    setLoadingMore(true);
    const prev = new Date(
      earliestMonth.getFullYear(),
      earliestMonth.getMonth() - 1,
      1,
    );
    const result = await loadMonth(formatMonth(prev));
    if (result) {
      setMonths((prevMonths) => [result, ...prevMonths]);
    }
    setEarliestMonth(prev);
    setLoadingMore(false);
  }, [earliestMonth, loadMonth, loadingMore]);

  // Scroll-spy for date sidebar
  useEffect(() => {
    const observers: IntersectionObserver[] = [];
    const visibleDates = new Set<string>();

    for (const [dateKey, el] of dayRefs.current.entries()) {
      const observer = new IntersectionObserver(
        (entries) => {
          if (entries[0].isIntersecting) {
            visibleDates.add(dateKey);
          } else {
            visibleDates.delete(dateKey);
          }
          // Set active to the earliest visible date
          const sorted = [...visibleDates].sort();
          const first = sorted[0] ?? null;
          setActiveDateKey(first);
          if (first) setActiveDate(new Date(first + "T00:00:00"));
        },
        { threshold: 0.3 },
      );
      observer.observe(el);
      observers.push(observer);
    }

    return () => observers.forEach((o) => o.disconnect());
  }, [months, hideWatched]);

  // Jump to a specific date
  const jumpToDate = useCallback(
    async (date: Date) => {
      setActiveDate(date);
      scrollTargetRef.current = formatDateKey(date);
      initialScrollDoneRef.current = false;
      loadedMonthsRef.current.clear();
      setMonths([]);
      setInitialLoading(true);

      const targetMonth = formatMonth(date);
      const prev = new Date(date.getFullYear(), date.getMonth() - 1, 1);
      const next = new Date(date.getFullYear(), date.getMonth() + 1, 1);

      setEarliestMonth(prev);
      setLatestMonth(next);

      const results = await Promise.all([
        loadMonth(formatMonth(prev)),
        loadMonth(targetMonth),
        loadMonth(formatMonth(next)),
      ]);
      const loaded = results.filter((r): r is AgendaMonth => r !== null);
      loaded.sort((a, b) => a.month.localeCompare(b.month));
      setMonths(loaded);
      setInitialLoading(false);
    },
    [loadMonth],
  );

  // Build agenda items
  const agendaItems = useMemo(() => {
    const byDate = new Map<string, CalendarItem[]>();

    for (const m of months) {
      for (const t of dropPremiereDuplicates(m.titles, m.episodes)) {
        if (!t.release_date) continue;
        if (actionFor(t.age_certification, t.id) === "hide") continue;
        const arr = byDate.get(t.release_date);
        if (arr) arr.push({ type: "title", data: t });
        else byDate.set(t.release_date, [{ type: "title", data: t }]);
      }
      for (const ep of m.episodes) {
        if (!ep.air_date) continue;
        if (hideWatched && ep.is_watched) continue;
        if (actionFor(ep.age_certification, ep.title_id) === "hide") continue;
        const arr = byDate.get(ep.air_date);
        if (arr) arr.push({ type: "episode", data: ep });
        else byDate.set(ep.air_date, [{ type: "episode", data: ep }]);
      }
    }

    return new Map(
      [...byDate.entries()].sort(([a], [b]) => a.localeCompare(b)),
    );
  }, [months, hideWatched, actionFor]);

  // All date keys with content (for sidebar)
  const contentDates = useMemo(() => [...agendaItems.keys()], [agendaItems]);

  // Date objects for calendar content highlights
  const contentDateObjects = useMemo(
    () => contentDates.map((d) => new Date(d + "T00:00:00")),
    [contentDates],
  );

  // Compute crowded ISO week keys from all loaded episodes
  const crowdedWeeks = useMemo(() => {
    if (!crowdedWeekBadgeEnabled) return new Set<string>();
    const counts = new Map<string, number>();
    for (const m of months) {
      for (const ep of m.episodes) {
        if (!ep.air_date) continue;
        if (hideWatched && ep.is_watched) continue;
        const key = getISOWeekKey(new Date(ep.air_date));
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
    }
    const crowded = new Set<string>();
    for (const [key, count] of counts) {
      if (count >= crowdedWeekThreshold) crowded.add(key);
    }
    return crowded;
  }, [months, hideWatched, crowdedWeekThreshold, crowdedWeekBadgeEnabled]);

  // Toggle watched
  const toggleWatched = async (
    episodeId: number,
    currentlyWatched: boolean,
  ) => {
    setMonths((prev) =>
      prev.map((m) => ({
        ...m,
        episodes: m.episodes.map((ep) =>
          ep.id === episodeId ? { ...ep, is_watched: !currentlyWatched } : ep,
        ),
      })),
    );
    try {
      if (currentlyWatched) {
        await unwatchEpisode(episodeId);
      } else {
        await watchEpisode(episodeId);
      }
    } catch {
      setMonths((prev) =>
        prev.map((m) => ({
          ...m,
          episodes: m.episodes.map((ep) =>
            ep.id === episodeId ? { ...ep, is_watched: currentlyWatched } : ep,
          ),
        })),
      );
      toast.error(t("episodes.watchedError"));
    }
  };

  const isEpisodeReleased = (ep: Episode) =>
    ep.air_date ? ep.air_date <= today : false;

  // Condense empty day ranges + precompute per-day projections so the render
  // loop doesn't re-run filter/map/groupByShow/toLocaleDateString every time
  // an unrelated piece of parent state (active date sidebar, popover open, etc.)
  // changes. The result is regenerated only when the underlying day data does.
  const condensedEntries = useMemo(() => {
    const entries = Array.from(agendaItems.entries());
    const result: (
      | {
          type: "day";
          dateKey: string;
          items: CalendarItem[];
          dateLabel: string;
          dayTitles: Title[];
          episodesByShow: Map<string, Episode[]>;
        }
      | { type: "gap"; from: string; to: string }
    )[] = [];

    for (let i = 0; i < entries.length; i++) {
      const [dateKey, items] = entries[i];
      const dateLabel = new Date(dateKey + "T00:00:00").toLocaleDateString(
        undefined,
        { weekday: "short", month: "short", day: "numeric" },
      );
      const dayEpisodes = items
        .filter(
          (i): i is CalendarItem & { type: "episode" } => i.type === "episode",
        )
        .map((i) => i.data);
      const dayTitles = items
        .filter(
          (i): i is CalendarItem & { type: "title" } => i.type === "title",
        )
        .map((i) => i.data);
      const episodesByShow = groupByShow(dayEpisodes);
      result.push({
        type: "day",
        dateKey,
        items,
        dateLabel,
        dayTitles,
        episodesByShow,
      });

      // Check gap to next entry
      if (i < entries.length - 1) {
        const nextDate = entries[i + 1][0];
        const currentD = new Date(dateKey + "T00:00:00");
        const nextD = new Date(nextDate + "T00:00:00");
        const diffDays = Math.round(
          (nextD.getTime() - currentD.getTime()) / (1000 * 60 * 60 * 24),
        );
        if (diffDays > 3) {
          const fromLabel = new Date(
            currentD.getTime() + 86400000,
          ).toLocaleDateString(undefined, { month: "short", day: "numeric" });
          const toLabel = new Date(
            nextD.getTime() - 86400000,
          ).toLocaleDateString(undefined, { month: "short", day: "numeric" });
          result.push({
            type: "gap",
            from: fromLabel,
            to: toLabel,
          });
        }
      }
    }
    return result;
  }, [agendaItems]);

  const scrollToDate = useCallback((dateKey: string) => {
    const el = dayRefs.current.get(dateKey);
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  const monthName = (d: Date) =>
    d.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  const pageButtonClass =
    "w-full px-3 py-2 rounded-md border border-border text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-default";

  return (
    <div ref={containerRef} className="flex gap-0 lg:gap-4">
      {/* Date sidebar (desktop only) */}
      {viewMode && contentDates.length > 0 && (
        <div className="hidden lg:flex flex-col items-center gap-1 sticky top-14 self-start pt-16 w-12 shrink-0">
          {contentDates.map((dateKey) => {
            const day = new Date(dateKey + "T00:00:00").getDate();
            const isActive = activeDateKey === dateKey;
            const isPast = dateKey < today;
            const isTodayDate = dateKey === today;
            return (
              <button
                key={dateKey}
                onClick={() => scrollToDate(dateKey)}
                aria-label={t("calendar.goToDay", { date: dateKey })}
                className={`w-8 h-8 rounded-full text-xs font-medium flex items-center justify-center transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background ${
                  isTodayDate
                    ? "bg-primary text-primary-foreground font-bold"
                    : isActive
                      ? "bg-muted-hover text-foreground ring-1 ring-primary-border"
                      : isPast
                        ? "text-muted-foreground hover:text-muted-foreground hover:bg-muted"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted"
                }`}
                title={dateKey}
              >
                {day}
              </button>
            );
          })}
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 min-w-0 space-y-4">
        {/* Header */}
        <div className="flex flex-col gap-3 sticky top-14 z-30 bg-background pb-2">
          <div className="flex items-center gap-3">
            <Popover.Root open={pickerOpen} onOpenChange={setPickerOpen}>
              <Popover.Trigger
                className={`flex items-center gap-2 px-3 py-2 bg-muted border border-border rounded-md text-foreground text-sm hover:bg-muted-hover transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary-border ${viewMode ? "flex-1" : "w-full"}`}
              >
                <CalendarIcon className="size-4 text-primary-text flex-shrink-0" />
                <span>
                  {activeDate.toLocaleDateString(undefined, {
                    month: "long",
                    day: "numeric",
                    year: "numeric",
                  })}
                </span>
              </Popover.Trigger>
              <Popover.Portal>
                <Popover.Positioner
                  side="bottom"
                  align="start"
                  sideOffset={4}
                  className="z-50"
                >
                  <Popover.Popup className="rounded-md border border-border bg-card shadow-xl p-2">
                    <Calendar
                      mode="single"
                      selected={activeDate}
                      defaultMonth={activeDate}
                      className="!bg-card text-foreground [--cell-size:--spacing(8)]"
                      classNames={{
                        month_caption: "text-foreground",
                        weekday: "!text-muted-foreground",
                        today: "!bg-primary-soft !text-primary-text",
                        day: "text-foreground-secondary",
                        outside: "!text-muted-foreground",
                      }}
                      onSelect={(date) => {
                        if (date) {
                          jumpToDate(date);
                          setPickerOpen(false);
                        }
                      }}
                      modifiers={{ hasContent: contentDateObjects }}
                      modifiersClassNames={{
                        hasContent: "!text-primary-text font-semibold",
                      }}
                    />
                    <div className="border-t border-border pt-2 mt-1">
                      <button
                        onClick={() => {
                          jumpToDate(new Date());
                          setPickerOpen(false);
                        }}
                        className="w-full px-3 py-1.5 text-sm font-medium text-primary-text hover:bg-muted rounded-sm transition-colors cursor-pointer"
                      >
                        Go to Today
                      </button>
                    </div>
                  </Popover.Popup>
                </Popover.Positioner>
              </Popover.Portal>
            </Popover.Root>
            {viewMode && onViewModeChange && (
              <ViewToggle
                viewMode={viewMode}
                onViewModeChange={onViewModeChange}
              />
            )}
          </div>
          <div className="flex items-center gap-2">
            {typeFilters.map((f) => (
              <button
                key={f.value}
                onClick={() => setTypeFilter(f.value)}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors cursor-pointer ${
                  typeFilter === f.value
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                }`}
              >
                {f.label}
              </button>
            ))}
            <button
              onClick={() => setHideWatched(!hideWatched)}
              aria-label={t("calendar.hideWatched")}
              aria-pressed={hideWatched}
              className={`ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
                hideWatched
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              }`}
              title={hideWatched ? "Show watched" : "Hide watched"}
            >
              {hideWatched ? (
                <EyeOffIcon className="size-4" />
              ) : (
                <EyeIcon className="size-4" />
              )}
              <span className="hidden sm:inline">Hide watched</span>
            </button>
          </div>
        </div>

        {initialLoading ? (
          <CalendarSkeleton />
        ) : (
          <>
            <button
              onClick={loadPrevMonth}
              disabled={loadingMore}
              className={pageButtonClass}
            >
              {t("calendar.loadMonth", {
                month: monthName(
                  new Date(
                    earliestMonth.getFullYear(),
                    earliestMonth.getMonth() - 1,
                    1,
                  ),
                ),
              })}
            </button>

            {condensedEntries.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm">
                No items for this period.
              </div>
            ) : (
              <div className="space-y-6">
                {(() => {
                  let lastRenderedWeekKey: string | null = null;
                  return condensedEntries.map((entry) => {
                    if (entry.type === "gap") {
                      return (
                        <div
                          key={`gap-${entry.from}-${entry.to}`}
                          className="flex items-center gap-3 py-2"
                        >
                          <div className="flex-1 h-px bg-muted" />
                          <span className="text-xs text-muted-foreground">
                            {entry.from} – {entry.to}: No releases
                          </span>
                          <div className="flex-1 h-px bg-muted" />
                        </div>
                      );
                    }

                    const { dateKey, dateLabel, dayTitles, episodesByShow } =
                      entry;
                    const isDateToday = dateKey === today;
                    const entryWeekKey = getISOWeekKey(
                      new Date(dateKey + "T00:00:00"),
                    );
                    const showCrowdedBanner =
                      crowdedWeeks.has(entryWeekKey) &&
                      entryWeekKey !== lastRenderedWeekKey;
                    if (showCrowdedBanner) lastRenderedWeekKey = entryWeekKey;

                    return (
                      <div key={dateKey}>
                        {showCrowdedBanner && (
                          <div className="flex items-center gap-2 mb-2 px-1">
                            <div className="flex-1 h-px bg-orange-500/30" />
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-orange-500/15 border border-orange-500/30 text-orange-400 text-[11px] font-mono font-semibold">
                              Crowded week
                            </span>
                            <div className="flex-1 h-px bg-orange-500/30" />
                          </div>
                        )}
                        <div
                          ref={(el) => {
                            if (el) {
                              dayRefs.current.set(dateKey, el);
                            }
                            if (isDateToday && el) {
                              (
                                todayRef as React.MutableRefObject<HTMLDivElement | null>
                              ).current = el;
                            }
                          }}
                          className="space-y-3 scroll-mt-36"
                        >
                          {/* Compact day header */}
                          <DayHeader
                            count={episodesByShow.size + dayTitles.length}
                            dateLabel={dateLabel}
                            isToday={isDateToday}
                          />

                          {/* One card per show: first unwatched episode, plus a count */}
                          {episodesByShow.size > 0 && (
                            <ScrollableRow className="flex-wrap lg:flex-nowrap gap-3">
                              {[...episodesByShow.entries()].map(
                                ([showId, showEps]) => {
                                  const ep = pickShowEpisode(showEps);
                                  const imgUrl = getEpisodeCardImageUrl(ep);
                                  return (
                                    <div
                                      key={showId}
                                      data-testid="agenda-show-card"
                                      className="w-full sm:w-72 lg:w-80 flex-shrink-0"
                                    >
                                      <DeckCardWrapper
                                        episodeCount={showEps.length}
                                      >
                                        <div className="bg-card rounded-lg overflow-hidden flex sm:block [&_button]:min-h-10">
                                          <Link
                                            to={`/title/${ep.title_id}/season/${ep.season_number}/episode/${ep.episode_number}`}
                                            aria-label={`${ep.show_title} ${formatEpisodeCode(ep)}`}
                                            className="block relative w-16 shrink-0 sm:w-auto"
                                          >
                                            {imgUrl ? (
                                              <img
                                                src={imgUrl}
                                                alt={
                                                  ep.name ||
                                                  formatEpisodeCode(ep)
                                                }
                                                className="w-full h-full object-cover sm:aspect-video sm:h-auto"
                                                loading="lazy"
                                              />
                                            ) : (
                                              <div className="w-full h-full sm:aspect-video bg-gradient-to-b from-muted to-background" />
                                            )}
                                          </Link>
                                          <div className="p-3 flex-1 min-w-0">
                                            <div className="flex items-center justify-between gap-2">
                                              <Link
                                                to={`/title/${ep.title_id}`}
                                                className="hover:text-primary-text transition-colors min-w-0"
                                              >
                                                <h3 className="font-semibold text-foreground text-sm break-words">
                                                  {ep.show_title}
                                                </h3>
                                              </Link>
                                              <WatchedToggleButton
                                                watched={!!ep.is_watched}
                                                onClick={() =>
                                                  toggleWatched(
                                                    ep.id,
                                                    !!ep.is_watched,
                                                  )
                                                }
                                                disabled={
                                                  !isEpisodeReleased(ep)
                                                }
                                                size="sm"
                                              />
                                            </div>
                                            <Link
                                              to={`/title/${ep.title_id}/season/${ep.season_number}/episode/${ep.episode_number}`}
                                              className="hover:text-primary-text transition-colors"
                                            >
                                              <p className="text-xs mt-0.5">
                                                <span className="text-primary-text font-medium">
                                                  {formatEpisodeCode(ep)}
                                                </span>
                                                {ep.name && (
                                                  <span className="text-muted-foreground">
                                                    {" "}
                                                    · {ep.name}
                                                  </span>
                                                )}
                                              </p>
                                            </Link>
                                            {showEps.length > 1 && (
                                              <p className="text-xs text-muted-foreground mt-0.5">
                                                {t("calendar.stats.episodes", {
                                                  count: showEps.length,
                                                })}
                                              </p>
                                            )}
                                            {isEpisodeReleased(ep) && (
                                              <div className="mt-2">
                                                <WatchButtonGroup
                                                  offers={ep.offers ?? []}
                                                  variant="dropdown"
                                                />
                                              </div>
                                            )}
                                          </div>
                                        </div>
                                      </DeckCardWrapper>
                                    </div>
                                  );
                                },
                              )}
                            </ScrollableRow>
                          )}

                          {/* Movie and show releases as compact rows */}
                          {dayTitles.length > 0 && (
                            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
                              {dayTitles.map((title) => {
                                const blurred =
                                  actionFor(
                                    title.age_certification,
                                    title.id,
                                  ) === "blur";
                                return (
                                  <Link
                                    key={title.id}
                                    to={`/title/${title.id}`}
                                    data-testid="agenda-title-row"
                                    className="flex items-center gap-3 p-2 rounded-md bg-card border border-border hover:bg-muted transition-colors"
                                  >
                                    <div className="w-10 h-15 shrink-0 rounded-sm overflow-hidden bg-muted">
                                      {title.poster_url && (
                                        <img
                                          src={title.poster_url}
                                          alt=""
                                          className={`w-full h-full object-cover${blurred ? " blur-md" : ""}`}
                                          loading="lazy"
                                          width={40}
                                          height={60}
                                        />
                                      )}
                                    </div>
                                    <div className="min-w-0">
                                      <div className="text-sm font-medium text-foreground truncate">
                                        {title.title}
                                      </div>
                                      <div className="text-xs text-muted-foreground">
                                        {title.object_type === "MOVIE"
                                          ? t("calendar.movie")
                                          : t("calendar.show")}
                                      </div>
                                    </div>
                                  </Link>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>
            )}

            <button
              onClick={loadNextMonth}
              disabled={loadingMore}
              className={pageButtonClass}
            >
              {t("calendar.loadMonth", {
                month: monthName(
                  new Date(
                    latestMonth.getFullYear(),
                    latestMonth.getMonth() + 1,
                    1,
                  ),
                ),
              })}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// React.memo with default shallow equality. CalendarPage re-renders frequently
// as URL search params and other page state change; skipping the agenda's
// expensive month/agenda-item recomputations when none of its props changed
// is the primary win. `searchParams` is the URLSearchParams instance returned
// by react-router, which keeps a stable reference across unrelated re-renders.
const AgendaCalendar = memo(AgendaCalendarImpl);
export default AgendaCalendar;
