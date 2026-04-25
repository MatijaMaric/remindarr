import { useState, useEffect, useMemo, useRef, useCallback, memo } from "react";
import { Link, useSearchParams } from "react-router";
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
import { getCalendarTitles, watchEpisode, unwatchEpisode } from "../api";
import TitleCard from "../components/TitleCard";
import { DeckCardWrapper } from "../components/EpisodeShowCard";
import type { Title, Episode } from "../types";
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

/** Get the best hero image URL for a calendar item */
export function getItemHeroUrl(item: CalendarItem): string | null {
  if (item.type === "episode") {
    return getEpisodeCardImageUrl(item.data);
  }
  return item.data.poster_url;
}

/** Pick the featured item from a list (best image, unwatched episodes first) */
export function pickFeaturedItem(items: CalendarItem[]): CalendarItem | null {
  if (items.length === 0) return null;
  // Prefer unwatched episode with an image
  const unwatchedEps = items.filter(
    (i) => i.type === "episode" && !i.data.is_watched && getItemHeroUrl(i)
  );
  if (unwatchedEps.length > 0) return unwatchedEps[0];
  // Then any item with an image
  const withImage = items.filter((i) => getItemHeroUrl(i));
  if (withImage.length > 0) return withImage[0];
  return items[0];
}

/** Get poster URL for a calendar item (show poster for episodes, title poster for movies) */
export function getItemPosterUrl(item: CalendarItem): string | null {
  if (item.type === "episode") return item.data.poster_url;
  return item.data.poster_url;
}

/** Determine cell border color based on item types */
export function getCellBorderColor(items: CalendarItem[]): string {
  const hasEpisodes = items.some((i) => i.type === "episode");
  const hasMovies = items.some(
    (i) => i.type === "title" && i.data.object_type === "MOVIE"
  );
  const hasShows = items.some(
    (i) => i.type === "title" && i.data.object_type === "SHOW"
  );
  if (hasEpisodes && (hasMovies || hasShows)) return "border-l-amber-500";
  if (hasEpisodes) return "border-l-emerald-500";
  if (hasMovies) return "border-l-blue-500";
  if (hasShows) return "border-l-purple-500";
  return "";
}

// ─── URL state helper ───────────────────────────────────────────────────────

export function useCalendarParam(
  searchParams: URLSearchParams,
  setSearchParams: ReturnType<typeof useSearchParams>[1],
  key: string,
  defaultValue = ""
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
        { replace: true }
      );
    },
    [setSearchParams, key, defaultValue]
  );
  return [value, setValue];
}

// ─── View Toggle ────────────────────────────────────────────────────────────

export function ViewToggle({
  viewMode,
  onViewModeChange,
}: {
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
}) {
  return (
    <div className="flex items-center bg-zinc-800 rounded-lg p-0.5">
      <button
        onClick={() => onViewModeChange("grid")}
        className={`p-1.5 rounded-md transition-colors cursor-pointer ${
          viewMode === "grid"
            ? "bg-amber-500 text-zinc-950"
            : "text-zinc-400 hover:text-white"
        }`}
        title="Grid view"
      >
        <LayoutGridIcon className="size-4" />
      </button>
      <button
        onClick={() => onViewModeChange("agenda")}
        className={`p-1.5 rounded-md transition-colors cursor-pointer ${
          viewMode === "agenda"
            ? "bg-amber-500 text-zinc-950"
            : "text-zinc-400 hover:text-white"
        }`}
        title="Agenda view"
      >
        <ListIcon className="size-4" />
      </button>
    </div>
  );
}

// ─── Compact Day Header ─────────────────────────────────────────────────────

const DayHeader = memo(function DayHeader({
  items,
  dateLabel,
  isToday,
}: {
  items: CalendarItem[];
  dateLabel: string;
  isToday: boolean;
}) {
  const featured = pickFeaturedItem(items);
  const posterUrl = featured ? getItemPosterUrl(featured) : null;

  return (
    <div
      className={`flex items-center gap-3 px-3 py-2.5 rounded-lg ${
        isToday
          ? "bg-amber-500/10 border-l-2 border-amber-500"
          : "bg-zinc-900/60 border-l-2 border-zinc-700"
      }`}
    >
      {posterUrl && (
        <img
          src={posterUrl}
          alt=""
          className="w-10 h-15 rounded object-cover flex-shrink-0"
          loading="lazy"
        />
      )}
      <div className="flex-1 min-w-0">
        {isToday && (
          <span className="text-[10px] uppercase tracking-widest text-amber-400 font-semibold">
            Today
          </span>
        )}
        <h3 className={`text-sm font-semibold ${isToday ? "text-white" : "text-zinc-200"}`}>
          {dateLabel}
        </h3>
      </div>
      <span className="text-xs text-zinc-500 flex-shrink-0">
        {items.length} item{items.length !== 1 ? "s" : ""}
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
  const [typeFilter, setTypeFilter] = useCalendarParam(
    searchParams,
    setSearchParams,
    "type"
  );
  const [hideWatched, setHideWatched] = useState(true);
  const [months, setMonths] = useState<AgendaMonth[]>([]);
  const [loadingMore, setLoadingMore] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [activeDate, setActiveDate] = useState(() => new Date());
  const [pickerOpen, setPickerOpen] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const topRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const todayRef = useRef<HTMLDivElement>(null);
  const initialScrollDoneRef = useRef(false);
  const scrollTargetRef = useRef(formatDateKey(new Date()));

  // Scroll-spy state for date sidebar
  const [activeDateKey, setActiveDateKey] = useState<string | null>(null);
  const dayRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  const loadedMonthsRef = useRef(new Set<string>());
  const [earliestMonth, setEarliestMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth() - 1, 1);
  });
  const [latestMonth, setLatestMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth() + 1, 1);
  });

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
    [typeFilter]
  );

  // Initial load
  useEffect(() => {
    loadedMonthsRef.current.clear();
    setMonths([]); // eslint-disable-line react-hooks/set-state-in-effect -- reset before async load
    setInitialLoading(true);

    const now = new Date();
    const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const curr = new Date(now.getFullYear(), now.getMonth(), 1);
    const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);

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
        let target = dayRefs.current.get(scrollTargetRef.current) ?? todayRef.current;
        // If exact date not found, scroll to nearest date (closest before, then after)
        if (!target && dayRefs.current.size > 0) {
          const targetKey = scrollTargetRef.current;
          const keys = [...dayRefs.current.keys()].sort();
          // Find the last date on or before target, or first date after
          const before = keys.filter((k) => k <= targetKey);
          const after = keys.filter((k) => k > targetKey);
          const bestKey = before.length > 0 ? before[before.length - 1] : after[0];
          if (bestKey) target = dayRefs.current.get(bestKey) ?? null;
        }
        target?.scrollIntoView({ block: "start" });
        initialScrollDoneRef.current = true;
      });
    });
  }, [initialLoading]);

  // Infinite scroll down
  const loadNextMonth = useCallback(async () => {
    if (loadingMore) return;
    setLoadingMore(true);
    const next = new Date(
      latestMonth.getFullYear(),
      latestMonth.getMonth() + 1,
      1
    );
    const result = await loadMonth(formatMonth(next));
    if (result) {
      setMonths((prev) => [...prev, result]);
    }
    setLatestMonth(next);
    setLoadingMore(false);
  }, [latestMonth, loadMonth, loadingMore]);

  // Infinite scroll up
  const loadPrevMonth = useCallback(async () => {
    if (loadingMore) return;
    setLoadingMore(true);
    const prev = new Date(
      earliestMonth.getFullYear(),
      earliestMonth.getMonth() - 1,
      1
    );
    const result = await loadMonth(formatMonth(prev));
    if (result) {
      setMonths((prevMonths) => [result, ...prevMonths]);
    }
    setEarliestMonth(prev);
    setLoadingMore(false);
  }, [earliestMonth, loadMonth, loadingMore]);

  useEffect(() => {
    const el = bottomRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && initialScrollDoneRef.current) loadNextMonth();
      },
      { threshold: 0.1 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [loadNextMonth]);

  useEffect(() => {
    const el = topRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && initialScrollDoneRef.current) loadPrevMonth();
      },
      { threshold: 0.1 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [loadPrevMonth]);

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
        { threshold: 0.3 }
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
    [loadMonth]
  );

  // Build agenda items
  const agendaItems = useMemo(() => {
    const byDate = new Map<string, CalendarItem[]>();

    for (const m of months) {
      for (const t of m.titles) {
        if (!t.release_date) continue;
        const arr = byDate.get(t.release_date);
        if (arr) arr.push({ type: "title", data: t });
        else byDate.set(t.release_date, [{ type: "title", data: t }]);
      }
      for (const ep of m.episodes) {
        if (!ep.air_date) continue;
        if (hideWatched && ep.is_watched) continue;
        const arr = byDate.get(ep.air_date);
        if (arr) arr.push({ type: "episode", data: ep });
        else byDate.set(ep.air_date, [{ type: "episode", data: ep }]);
      }
    }

    return new Map(
      [...byDate.entries()].sort(([a], [b]) => a.localeCompare(b))
    );
  }, [months, hideWatched]);

  // All date keys with content (for sidebar)
  const contentDates = useMemo(
    () => [...agendaItems.keys()],
    [agendaItems]
  );

  // Date objects for calendar content highlights
  const contentDateObjects = useMemo(
    () => contentDates.map((d) => new Date(d + "T00:00:00")),
    [contentDates]
  );

  // Toggle watched
  const toggleWatched = async (
    episodeId: number,
    currentlyWatched: boolean
  ) => {
    setMonths((prev) =>
      prev.map((m) => ({
        ...m,
        episodes: m.episodes.map((ep) =>
          ep.id === episodeId
            ? { ...ep, is_watched: !currentlyWatched }
            : ep
        ),
      }))
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
            ep.id === episodeId
              ? { ...ep, is_watched: currentlyWatched }
              : ep
          ),
        }))
      );
      toast.error("Failed to update watched status — please try again");
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
          dayEpisodes: Episode[];
          dayTitles: Title[];
          episodesByShow: Map<string, Episode[]>;
        }
      | { type: "gap"; from: string; to: string }
    )[] = [];

    for (let i = 0; i < entries.length; i++) {
      const [dateKey, items] = entries[i];
      const dateLabel = new Date(dateKey + "T00:00:00").toLocaleDateString(
        undefined,
        { weekday: "short", month: "short", day: "numeric" }
      );
      const dayEpisodes = items
        .filter(
          (i): i is CalendarItem & { type: "episode" } => i.type === "episode"
        )
        .map((i) => i.data);
      const dayTitles = items
        .filter(
          (i): i is CalendarItem & { type: "title" } => i.type === "title"
        )
        .map((i) => i.data);
      const episodesByShow = groupByShow(dayEpisodes);
      result.push({
        type: "day",
        dateKey,
        items,
        dateLabel,
        dayEpisodes,
        dayTitles,
        episodesByShow,
      });

      // Check gap to next entry
      if (i < entries.length - 1) {
        const nextDate = entries[i + 1][0];
        const currentD = new Date(dateKey + "T00:00:00");
        const nextD = new Date(nextDate + "T00:00:00");
        const diffDays = Math.round(
          (nextD.getTime() - currentD.getTime()) / (1000 * 60 * 60 * 24)
        );
        if (diffDays > 3) {
          const fromLabel = new Date(
            currentD.getTime() + 86400000
          ).toLocaleDateString(undefined, { month: "short", day: "numeric" });
          const toLabel = new Date(
            nextD.getTime() - 86400000
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
                className={`w-8 h-8 rounded-full text-xs font-medium flex items-center justify-center transition-all cursor-pointer ${
                  isTodayDate
                    ? "bg-amber-500 text-zinc-950 font-bold"
                    : isActive
                      ? "bg-zinc-700 text-white ring-1 ring-amber-500/50"
                      : isPast
                        ? "text-zinc-600 hover:text-zinc-400 hover:bg-zinc-800"
                        : "text-zinc-400 hover:text-white hover:bg-zinc-800"
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
        <div className="flex flex-col gap-3 sticky top-14 z-30 bg-zinc-950 pb-2">
          <div className="flex items-center gap-3">
            <Popover.Root open={pickerOpen} onOpenChange={setPickerOpen}>
              <Popover.Trigger
                className={`flex items-center gap-2 px-3 py-2 bg-zinc-800 border border-white/[0.08] rounded-lg text-white text-sm hover:bg-zinc-700 transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-amber-500/50 ${viewMode ? "flex-1" : "w-full"}`}
              >
                <CalendarIcon className="size-4 text-amber-400 flex-shrink-0" />
                <span>
                  {activeDate.toLocaleDateString(undefined, {
                    month: "long",
                    day: "numeric",
                    year: "numeric",
                  })}
                </span>
              </Popover.Trigger>
              <Popover.Portal>
                <Popover.Positioner side="bottom" align="start" sideOffset={4} className="z-50">
                  <Popover.Popup className="rounded-lg border border-white/[0.08] bg-zinc-900 shadow-xl p-2">
                    <Calendar
                      mode="single"
                      selected={activeDate}
                      defaultMonth={activeDate}
                      className="!bg-zinc-900 text-white [--cell-size:--spacing(8)]"
                      classNames={{
                        month_caption: "text-white",
                        weekday: "!text-zinc-500",
                        today: "!bg-amber-500/20 !text-amber-400",
                        day: "text-zinc-300",
                        outside: "!text-zinc-600",
                      }}
                      onSelect={(date) => {
                        if (date) {
                          jumpToDate(date);
                          setPickerOpen(false);
                        }
                      }}
                      modifiers={{ hasContent: contentDateObjects }}
                      modifiersClassNames={{ hasContent: "!text-amber-400 font-semibold" }}
                    />
                    <div className="border-t border-white/[0.08] pt-2 mt-1">
                      <button
                        onClick={() => {
                          jumpToDate(new Date());
                          setPickerOpen(false);
                        }}
                        className="w-full px-3 py-1.5 text-sm font-medium text-amber-400 hover:bg-zinc-800 rounded-md transition-colors cursor-pointer"
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
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
                  typeFilter === f.value
                    ? "bg-amber-500 text-zinc-950"
                    : "text-zinc-400 hover:text-white hover:bg-zinc-800"
                }`}
              >
                {f.label}
              </button>
            ))}
            <button
              onClick={() => setHideWatched((v) => !v)}
              className={`ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
                hideWatched
                  ? "bg-amber-500 text-zinc-950"
                  : "text-zinc-400 hover:text-white hover:bg-zinc-800"
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
            <div ref={topRef} className="h-1" />

            {condensedEntries.length === 0 ? (
              <div className="text-center py-8 text-zinc-500 text-sm">
                No items for this period.
              </div>
            ) : (
              <div className="space-y-6">
                {condensedEntries.map((entry) => {
                  if (entry.type === "gap") {
                    return (
                      <div
                        key={`gap-${entry.from}-${entry.to}`}
                        className="flex items-center gap-3 py-2"
                      >
                        <div className="flex-1 h-px bg-zinc-800" />
                        <span className="text-xs text-zinc-600">
                          {entry.from} – {entry.to}: No releases
                        </span>
                        <div className="flex-1 h-px bg-zinc-800" />
                      </div>
                    );
                  }

                  const {
                    dateKey,
                    items,
                    dateLabel,
                    dayEpisodes,
                    dayTitles,
                    episodesByShow,
                  } = entry;
                  const isDateToday = dateKey === today;

                  return (
                    <div
                      key={dateKey}
                      ref={(el) => {
                        if (el) {
                          dayRefs.current.set(dateKey, el);
                        }
                        if (isDateToday && el) {
                          (todayRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
                        }
                      }}
                      className="space-y-3 scroll-mt-36"
                    >
                      {/* Compact day header */}
                      <DayHeader
                        items={items}
                        dateLabel={dateLabel}
                        isToday={isDateToday}
                      />

                      {/* All episode cards in a single row */}
                      {dayEpisodes.length > 0 && (
                        <ScrollableRow className="flex-wrap lg:flex-nowrap gap-3">
                          {dayEpisodes.map((ep) => {
                            const showEps = episodesByShow.get(ep.title_id) ?? [ep];
                            const imgUrl = getEpisodeCardImageUrl(ep);
                            return (
                              <div
                                key={ep.id}
                                className="w-full sm:w-72 lg:w-80 flex-shrink-0"
                              >
                                <DeckCardWrapper
                                  episodeCount={showEps.length > 1 ? showEps.length : 1}
                                >
                                  <div className="bg-zinc-900 rounded-xl overflow-hidden">
                                    <Link
                                      to={`/title/${ep.title_id}/season/${ep.season_number}/episode/${ep.episode_number}`}
                                      className="block relative"
                                    >
                                      {imgUrl ? (
                                        <img
                                          src={imgUrl}
                                          alt={ep.name || formatEpisodeCode(ep)}
                                          className="w-full aspect-video object-cover"
                                          loading="lazy"
                                        />
                                      ) : (
                                        <div className="w-full aspect-video bg-gradient-to-b from-zinc-800 to-zinc-950" />
                                      )}
                                    </Link>
                                    <div className="p-3">
                                      <div className="flex items-center justify-between gap-2">
                                        <Link
                                          to={`/title/${ep.title_id}`}
                                          className="hover:text-amber-400 transition-colors min-w-0"
                                        >
                                          <h3 className="font-semibold text-white text-sm truncate">
                                            {ep.show_title}
                                          </h3>
                                        </Link>
                                        <WatchedToggleButton
                                          watched={!!ep.is_watched}
                                          onClick={() => toggleWatched(ep.id, !!ep.is_watched)}
                                          disabled={!isEpisodeReleased(ep)}
                                          size="sm"
                                        />
                                      </div>
                                      <Link
                                        to={`/title/${ep.title_id}/season/${ep.season_number}/episode/${ep.episode_number}`}
                                        className="hover:text-amber-400 transition-colors"
                                      >
                                        <p className="text-xs mt-0.5">
                                          <span className="text-amber-400 font-medium">
                                            {formatEpisodeCode(ep)}
                                          </span>
                                          {ep.name && (
                                            <span className="text-zinc-400"> · {ep.name}</span>
                                          )}
                                        </p>
                                      </Link>
                                      {isEpisodeReleased(ep) && (
                                        <div className="mt-2">
                                          <WatchButtonGroup offers={ep.offers ?? []} variant="dropdown" />
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                </DeckCardWrapper>
                              </div>
                            );
                          })}
                        </ScrollableRow>
                      )}

                      {/* Title cards */}
                      {dayTitles.length > 0 && (
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                          {dayTitles.map((t) => (
                            <TitleCard key={t.id} title={t} />
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            <div ref={bottomRef} className="h-1" />
            {loadingMore && (
              <div className="text-center py-4 text-zinc-500 text-sm">
                Loading more...
              </div>
            )}
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
