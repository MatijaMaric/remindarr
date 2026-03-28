import { useState, useEffect, useMemo, useRef, useCallback, memo } from "react";
import { Link, useSearchParams } from "react-router";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  LayoutGridIcon,
  ListIcon,
  EyeIcon,
  EyeOffIcon,
  XIcon,
} from "lucide-react";
import { toast } from "sonner";
import { getCalendarTitles, watchEpisode, unwatchEpisode, watchEpisodesBulk } from "../api";
import { useIsMobile } from "../hooks/useIsMobile";
import TitleCard from "../components/TitleCard";
import { DeckCardWrapper } from "../components/EpisodeShowCard";
import type { Title, Episode } from "../types";
import { CalendarSkeleton, GridCalendarSkeleton } from "../components/SkeletonComponents";
import {
  formatEpisodeCode,
  getUniqueProviders,
  getEpisodeCardImageUrl,
  groupByShow,
} from "../components/EpisodeComponents";
import WatchedToggleButton from "../components/WatchedToggleButton";
import WatchButton from "../components/WatchButton";



// ─── Helpers ────────────────────────────────────────────────────────────────

function formatMonth(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function formatDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function getDaysInMonth(year: number, month: number): Date[] {
  const days: Date[] = [];
  const date = new Date(year, month, 1);
  while (date.getMonth() === month) {
    days.push(new Date(date));
    date.setDate(date.getDate() + 1);
  }
  return days;
}

type CalendarItem =
  | { type: "title"; data: Title }
  | { type: "episode"; data: Episode };

const typeFilters = [
  { label: "All", value: "" },
  { label: "Movies", value: "MOVIE" },
  { label: "Shows", value: "SHOW" },
] as const;

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function getMonthOptions(): { label: string; value: string }[] {
  const options: { label: string; value: string }[] = [];
  const now = new Date();
  for (let i = -24; i <= 24; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    options.push({
      label: d.toLocaleDateString(undefined, { month: "long", year: "numeric" }),
      value: formatMonth(d),
    });
  }
  return options;
}

type ViewMode = "grid" | "agenda";

/** Get the best hero image URL for a calendar item */
function getItemHeroUrl(item: CalendarItem): string | null {
  if (item.type === "episode") {
    return getEpisodeCardImageUrl(item.data);
  }
  return item.data.poster_url;
}

/** Pick the featured item from a list (best image, unwatched episodes first) */
function pickFeaturedItem(items: CalendarItem[]): CalendarItem | null {
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
function getItemPosterUrl(item: CalendarItem): string | null {
  if (item.type === "episode") return item.data.poster_url;
  return item.data.poster_url;
}

/** Determine cell border color based on item types */
function getCellBorderColor(items: CalendarItem[]): string {
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

function useCalendarParam(
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

function ViewToggle({
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

// ─── Month Stats Bar ────────────────────────────────────────────────────────

function MonthStatsBar({
  episodes,
  titles,
}: {
  episodes: number;
  titles: number;
}) {
  const total = episodes + titles;
  if (total === 0) return null;
  return (
    <div className="flex items-center gap-3 text-xs font-medium">
      {episodes > 0 && (
        <span className="bg-emerald-500/15 text-emerald-400 px-2.5 py-1 rounded-full">
          {episodes} Episode{episodes !== 1 ? "s" : ""}
        </span>
      )}
      {titles > 0 && (
        <span className="bg-blue-500/15 text-blue-400 px-2.5 py-1 rounded-full">
          {titles} Title{titles !== 1 ? "s" : ""}
        </span>
      )}
      <span className="bg-amber-500/15 text-amber-400 px-2.5 py-1 rounded-full">
        {total} Total
      </span>
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

// ─── Slide-over Panel for Grid View ─────────────────────────────────────────

function SlideOverPanel({
  selectedDate,
  items,
  episodes,
  titles,
  onClose,
  onToggleWatched,
  onBulkToggle,
}: {
  selectedDate: string;
  items: CalendarItem[];
  episodes: Episode[];
  titles: Title[];
  onClose: () => void;
  onToggleWatched: (id: number, watched: boolean) => void;
  onBulkToggle: (ids: number[], watched: boolean) => void;
}) {
  const today = formatDateKey(new Date());
  const isToday = selectedDate === today;
  const dateLabel = new Date(selectedDate + "T00:00:00").toLocaleDateString(
    undefined,
    { weekday: "long", month: "long", day: "numeric" }
  );

  const isEpisodeReleased = (ep: Episode) =>
    ep.air_date ? ep.air_date <= today : false;

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  // Group episodes by show for the carousel
  const episodesByShow = useMemo(() => groupByShow(episodes), [episodes]);

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 z-40 transition-opacity"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="fixed right-0 top-14 bottom-0 w-full sm:w-[420px] z-50 bg-zinc-950 border-l border-white/[0.06] overflow-y-auto animate-slide-in-right">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-zinc-950/95 backdrop-blur-sm border-b border-white/[0.06] px-4 py-3 flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-white">{dateLabel}</h3>
            <p className="text-xs text-zinc-500">
              {items.length} item{items.length !== 1 ? "s" : ""}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors cursor-pointer"
          >
            <XIcon className="size-5" />
          </button>
        </div>

        {/* Day header */}
        <div className="p-4">
          <DayHeader items={items} dateLabel={dateLabel} isToday={isToday} />
        </div>

        {/* Episodes */}
        {episodes.length > 0 && (
          <div className="px-4 pb-4">
            <h4 className="text-sm font-medium text-emerald-400 mb-3">
              Episodes
            </h4>
            {Array.from(episodesByShow.entries()).map(([titleId, showEps]) => {
              const allWatched = showEps.every((ep) => ep.is_watched);
              return (
                <div key={titleId} className="mb-4">
                  {episodesByShow.size > 1 && (
                    <div className="flex items-center justify-between mb-2">
                      <Link
                        to={`/title/${titleId}`}
                        className="text-xs font-medium text-zinc-400 hover:text-amber-400 transition-colors"
                      >
                        {showEps[0].show_title}
                      </Link>
                      {showEps.length > 1 && (
                        <button
                          onClick={() =>
                            onBulkToggle(
                              showEps.map((ep) => ep.id),
                              !allWatched
                            )
                          }
                          className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors cursor-pointer"
                        >
                          {allWatched
                            ? "Mark all unwatched"
                            : "Mark all watched"}
                        </button>
                      )}
                    </div>
                  )}
                  <div className="space-y-2">
                    {showEps.map((ep) => {
                      const released = isEpisodeReleased(ep);
                      const providers = getUniqueProviders(ep.offers);
                      return (
                        <div
                          key={ep.id}
                          className={`flex gap-3 p-3 rounded-lg border transition-colors ${
                            ep.is_watched
                              ? "bg-zinc-900/30 border-zinc-800/60 opacity-60"
                              : "bg-zinc-900/60 border-white/[0.06]"
                          }`}
                        >
                          {ep.poster_url && (
                            <Link
                              to={`/title/${ep.title_id}`}
                              className="flex-shrink-0"
                            >
                              <img
                                src={ep.poster_url}
                                alt={ep.show_title}
                                className="w-12 h-18 rounded object-cover"
                                loading="lazy"
                              />
                            </Link>
                          )}
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-2">
                              <Link
                                to={`/title/${ep.title_id}`}
                                className="hover:text-amber-400 transition-colors"
                              >
                                <div className="text-sm font-medium text-white truncate">
                                  {ep.show_title}
                                </div>
                              </Link>
                              <WatchedToggleButton
                                watched={!!ep.is_watched}
                                onClick={() => onToggleWatched(ep.id, !!ep.is_watched)}
                                disabled={!released}
                                size="sm"
                              />
                            </div>
                            <Link
                              to={`/title/${ep.title_id}/season/${ep.season_number}/episode/${ep.episode_number}`}
                              className="block hover:text-amber-400 transition-colors"
                            >
                              <div className="text-xs text-emerald-400 mt-0.5">
                                {formatEpisodeCode(ep)}
                                {ep.name && ` — ${ep.name}`}
                              </div>
                            </Link>
                            {ep.overview && (
                              <p className="text-xs text-zinc-400 mt-1 line-clamp-2">
                                {ep.overview}
                              </p>
                            )}
                            {released && providers.length > 0 && (
                              <div className="mt-2">
                                <WatchButton
                                  url={providers[0].url}
                                  providerId={providers[0].provider_id}
                                  providerName={providers[0].provider_name}
                                  providerIconUrl={providers[0].provider_icon_url}
                                  monetizationType={providers[0].monetization_type}
                                  variant="full"
                                />
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Titles */}
        {titles.length > 0 && (
          <div className="px-4 pb-6">
            <h4 className="text-sm font-medium text-blue-400 mb-3">
              Releases
            </h4>
            <div className="grid grid-cols-2 gap-3">
              {titles.map((t) => (
                <TitleCard key={t.id} title={t} />
              ))}
            </div>
          </div>
        )}

        {items.length === 0 && (
          <div className="px-4 py-8 text-center text-zinc-500 text-sm">
            No tracked releases on this day
          </div>
        )}
      </div>
    </>
  );
}

// ─── Main Export ─────────────────────────────────────────────────────────────

export default function CalendarPage() {
  const isMobile = useIsMobile();
  const [searchParams, setSearchParams] = useSearchParams();

  const [viewParam, setViewParam] = useCalendarParam(
    searchParams,
    setSearchParams,
    "view",
    "grid"
  );
  const viewMode = (viewParam === "agenda" ? "agenda" : "grid") as ViewMode;
  const setViewMode = (mode: ViewMode) => setViewParam(mode);

  if (isMobile) {
    return (
      <AgendaCalendar
        searchParams={searchParams}
        setSearchParams={setSearchParams}
      />
    );
  }

  if (viewMode === "agenda") {
    return (
      <AgendaCalendar
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        searchParams={searchParams}
        setSearchParams={setSearchParams}
      />
    );
  }

  return (
    <GridCalendar
      viewMode={viewMode}
      onViewModeChange={setViewMode}
      searchParams={searchParams}
      setSearchParams={setSearchParams}
    />
  );
}

// ─── Agenda Calendar (Cinematic) ────────────────────────────────────────────

interface AgendaMonth {
  month: string;
  titles: Title[];
  episodes: Episode[];
}

function AgendaCalendar({
  viewMode,
  onViewModeChange,
  searchParams,
  setSearchParams,
}: {
  viewMode?: ViewMode;
  onViewModeChange?: (mode: ViewMode) => void;
  searchParams: URLSearchParams;
  setSearchParams: ReturnType<typeof useSearchParams>[1];
}) {
  const [typeFilter, setTypeFilter] = useCalendarParam(
    searchParams,
    setSearchParams,
    "type"
  );
  const [hideWatched, setHideWatched] = useState(true);
  const [months, setMonths] = useState<AgendaMonth[]>([]);
  const [loadingMore, setLoadingMore] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);
  const topRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const todayRef = useRef<HTMLDivElement>(null);
  const monthOptions = useMemo(() => getMonthOptions(), []);

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

  // Scroll to today after initial load
  useEffect(() => {
    if (!initialLoading && todayRef.current) {
      requestAnimationFrame(() => {
        todayRef.current?.scrollIntoView({ block: "start" });
      });
    }
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
        if (entries[0].isIntersecting) loadNextMonth();
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
        if (entries[0].isIntersecting) loadPrevMonth();
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
          setActiveDateKey(sorted[0] ?? null);
        },
        { threshold: 0.3 }
      );
      observer.observe(el);
      observers.push(observer);
    }

    return () => observers.forEach((o) => o.disconnect());
  }, [months, hideWatched]);

  // Jump to month
  const jumpToMonth = useCallback(
    async (monthStr: string) => {
      loadedMonthsRef.current.clear();
      setMonths([]);
      setInitialLoading(true);

      const [yearStr, monthNum] = monthStr.split("-");
      const target = new Date(parseInt(yearStr), parseInt(monthNum) - 1, 1);
      const prev = new Date(target.getFullYear(), target.getMonth() - 1, 1);
      const next = new Date(target.getFullYear(), target.getMonth() + 1, 1);

      setEarliestMonth(prev);
      setLatestMonth(next);

      const results = await Promise.all([
        loadMonth(formatMonth(prev)),
        loadMonth(monthStr),
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

  // Condense empty day ranges
  const condensedEntries = useMemo(() => {
    const entries = Array.from(agendaItems.entries());
    const result: (
      | { type: "day"; dateKey: string; items: CalendarItem[] }
      | { type: "gap"; from: string; to: string }
    )[] = [];

    for (let i = 0; i < entries.length; i++) {
      const [dateKey, items] = entries[i];
      result.push({ type: "day", dateKey, items });

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
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <select
              value={formatMonth(new Date())}
              onChange={(e) => jumpToMonth(e.target.value)}
              className={`px-3 py-2 bg-zinc-800 border border-white/[0.08] rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/50 ${viewMode ? "flex-1" : "w-full"}`}
            >
              {monthOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
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

                  const { dateKey, items } = entry;
                  const isDateToday = dateKey === today;
                  const dateLabel = new Date(
                    dateKey + "T00:00:00"
                  ).toLocaleDateString(undefined, {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                  });

                  const dayEpisodes = items
                    .filter(
                      (i): i is CalendarItem & { type: "episode" } =>
                        i.type === "episode"
                    )
                    .map((i) => i.data);
                  const dayTitles = items
                    .filter(
                      (i): i is CalendarItem & { type: "title" } =>
                        i.type === "title"
                    )
                    .map((i) => i.data);
                  const episodesByShow = groupByShow(dayEpisodes);

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
                      className="space-y-3"
                    >
                      {/* Compact day header */}
                      <DayHeader
                        items={items}
                        dateLabel={dateLabel}
                        isToday={isDateToday}
                      />

                      {/* All episode cards in a single row */}
                      {dayEpisodes.length > 0 && (
                        <div className="flex flex-wrap lg:flex-nowrap lg:overflow-x-auto lg:[&::-webkit-scrollbar]:hidden lg:[-ms-overflow-style:none] lg:[scrollbar-width:none] gap-3">
                          {dayEpisodes.map((ep) => {
                            const showEps = episodesByShow.get(ep.title_id) ?? [ep];
                            const imgUrl = getEpisodeCardImageUrl(ep);
                            const providers = getUniqueProviders(ep.offers);
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
                                      {isEpisodeReleased(ep) && providers.length > 0 && (
                                        <div className="mt-2">
                                          <WatchButton
                                            url={providers[0].url}
                                            providerId={providers[0].provider_id}
                                            providerName={providers[0].provider_name}
                                            providerIconUrl={providers[0].provider_icon_url}
                                            monetizationType={providers[0].monetization_type}
                                            variant="full"
                                          />
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                </DeckCardWrapper>
                              </div>
                            );
                          })}
                        </div>
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

// ─── Grid Calendar (Poster Cells) ───────────────────────────────────────────

function GridCalendar({
  viewMode,
  onViewModeChange,
  searchParams,
  setSearchParams,
}: {
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  searchParams: URLSearchParams;
  setSearchParams: ReturnType<typeof useSearchParams>[1];
}) {
  const [monthParam, setMonthParam] = useCalendarParam(
    searchParams,
    setSearchParams,
    "month",
    formatMonth(new Date())
  );
  const [typeFilter, setTypeFilter] = useCalendarParam(
    searchParams,
    setSearchParams,
    "type"
  );
  const [selectedDate, setSelectedDate] = useCalendarParam(
    searchParams,
    setSearchParams,
    "date"
  );
  const [hideWatched, setHideWatched] = useState(false);

  const currentMonth = useMemo(() => {
    const [y, m] = monthParam.split("-").map(Number);
    return new Date(y, m - 1, 1);
  }, [monthParam]);

  const [titles, setTitles] = useState<Title[]>([]);
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [loading, setLoading] = useState(false);

  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();

  useEffect(() => {
    setLoading(true); // eslint-disable-line react-hooks/set-state-in-effect -- reset before async load
    getCalendarTitles({
      month: formatMonth(currentMonth),
      type: typeFilter || undefined,
    })
      .then((data) => {
        setTitles(data.titles);
        setEpisodes(data.episodes || []);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [currentMonth, typeFilter]);

  const itemsByDate = useMemo(() => {
    const map = new Map<string, CalendarItem[]>();

    for (const t of titles) {
      if (!t.release_date) continue;
      const item: CalendarItem = { type: "title", data: t };
      const arr = map.get(t.release_date);
      if (arr) arr.push(item);
      else map.set(t.release_date, [item]);
    }

    for (const ep of episodes) {
      if (!ep.air_date) continue;
      if (hideWatched && ep.is_watched) continue;
      const item: CalendarItem = { type: "episode", data: ep };
      const arr = map.get(ep.air_date);
      if (arr) arr.push(item);
      else map.set(ep.air_date, [item]);
    }

    return map;
  }, [titles, episodes, hideWatched]);

  // Stats
  const stats = useMemo(() => {
    let epCount = 0;
    let titleCount = 0;
    for (const items of itemsByDate.values()) {
      for (const item of items) {
        if (item.type === "episode") epCount++;
        else titleCount++;
      }
    }
    return { episodes: epCount, titles: titleCount };
  }, [itemsByDate]);

  const weeks = useMemo(() => {
    const days = getDaysInMonth(year, month);
    const firstDayOfWeek = (days[0].getDay() + 6) % 7;
    const grid: (Date | null)[][] = [];
    let week: (Date | null)[] = Array(firstDayOfWeek).fill(null);
    for (const day of days) {
      week.push(day);
      if (week.length === 7) {
        grid.push(week);
        week = [];
      }
    }
    if (week.length > 0) {
      while (week.length < 7) week.push(null);
      grid.push(week);
    }
    return grid;
  }, [year, month]);

  const selectedItems = useMemo(() => {
    if (!selectedDate) return [];
    return itemsByDate.get(selectedDate) ?? [];
  }, [selectedDate, itemsByDate]);

  const selectedTitles = useMemo(
    () =>
      selectedItems
        .filter(
          (i): i is CalendarItem & { type: "title" } => i.type === "title"
        )
        .map((i) => i.data),
    [selectedItems]
  );

  const selectedEpisodes = useMemo(
    () =>
      selectedItems
        .filter(
          (i): i is CalendarItem & { type: "episode" } =>
            i.type === "episode"
        )
        .map((i) => i.data),
    [selectedItems]
  );

  const prevMonth = () =>
    setMonthParam(formatMonth(new Date(year, month - 1, 1)));
  const nextMonth = () =>
    setMonthParam(formatMonth(new Date(year, month + 1, 1)));
  const today = formatDateKey(new Date());

  const toggleWatched = async (
    episodeId: number,
    currentlyWatched: boolean
  ) => {
    setEpisodes((prev) =>
      prev.map((ep) =>
        ep.id === episodeId
          ? { ...ep, is_watched: !currentlyWatched }
          : ep
      )
    );
    try {
      if (currentlyWatched) {
        await unwatchEpisode(episodeId);
      } else {
        await watchEpisode(episodeId);
      }
    } catch (err) {
      setEpisodes((prev) =>
        prev.map((ep) =>
          ep.id === episodeId
            ? { ...ep, is_watched: currentlyWatched }
            : ep
        )
      );
      console.error("Failed to toggle watched:", err);
      toast.error("Failed to update watched status — please try again");
    }
  };

  const isEpisodeReleased = (ep: Episode) =>
    ep.air_date ? ep.air_date <= today : false;

  const toggleBulkWatched = async (
    episodeIds: number[],
    markWatched: boolean
  ) => {
    const effectiveIds = markWatched
      ? episodeIds.filter((id) => {
          const ep = episodes.find((e) => e.id === id);
          return ep && isEpisodeReleased(ep);
        })
      : episodeIds;
    if (effectiveIds.length === 0) return;

    const idSet = new Set(effectiveIds);
    setEpisodes((prev) =>
      prev.map((ep) =>
        idSet.has(ep.id) ? { ...ep, is_watched: markWatched } : ep
      )
    );
    try {
      await watchEpisodesBulk(effectiveIds, markWatched);
    } catch (err) {
      setEpisodes((prev) =>
        prev.map((ep) =>
          idSet.has(ep.id) ? { ...ep, is_watched: !markWatched } : ep
        )
      );
      console.error("Failed to bulk toggle watched:", err);
      toast.error("Failed to update watched status — please try again");
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            onClick={prevMonth}
            className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors cursor-pointer"
          >
            <ChevronLeftIcon className="size-5" />
          </button>
          <h2 className="text-lg font-semibold w-44 text-center">
            {currentMonth.toLocaleDateString("en-US", {
              month: "long",
              year: "numeric",
            })}
          </h2>
          <button
            onClick={nextMonth}
            className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors cursor-pointer"
          >
            <ChevronRightIcon className="size-5" />
          </button>
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
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
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
          </button>
          <ViewToggle viewMode={viewMode} onViewModeChange={onViewModeChange} />
        </div>
      </div>

      {/* Stats bar */}
      {!loading && <MonthStatsBar episodes={stats.episodes} titles={stats.titles} />}

      {/* Calendar grid */}
      {loading ? (
        <GridCalendarSkeleton />
      ) : (
        <div className="border border-white/[0.06] rounded-xl overflow-hidden">
          {/* Weekday headers */}
          <div className="grid grid-cols-7 bg-zinc-900 border-b border-white/[0.06]">
            {WEEKDAYS.map((d) => (
              <div
                key={d}
                className="px-2 py-2 text-center text-xs font-medium text-zinc-500 uppercase"
              >
                {d}
              </div>
            ))}
          </div>

          {/* Weeks */}
          {weeks.map((week, wi) => (
            <div
              key={wi}
              className="grid grid-cols-7 border-b border-white/[0.06] last:border-b-0"
            >
              {week.map((day, di) => {
                if (!day) {
                  return (
                    <div key={di} className="min-h-28 bg-zinc-950/50" />
                  );
                }
                const dateKey = formatDateKey(day);
                const dayItems = itemsByDate.get(dateKey) ?? [];
                const isToday = dateKey === today;
                const isSelected = dateKey === selectedDate;
                const borderColor = getCellBorderColor(dayItems);

                // Pick featured item for card display
                const featured = dayItems.length > 0 ? pickFeaturedItem(dayItems) : null;
                const featuredImageUrl = featured ? getItemHeroUrl(featured) : null;

                return (
                  <button
                    key={di}
                    onClick={() =>
                      setSelectedDate(isSelected ? "" : dateKey)
                    }
                    className={`min-h-36 p-1.5 text-left transition-colors cursor-pointer border-r border-white/[0.06] last:border-r-0 ${
                      borderColor ? `border-l-2 ${borderColor}` : ""
                    } ${
                      isSelected
                        ? "bg-amber-500/10 ring-1 ring-inset ring-amber-500"
                        : dayItems.length > 0
                          ? "hover:bg-zinc-900/60"
                          : "hover:bg-zinc-950/80"
                    } ${isToday ? "ring-2 ring-inset ring-amber-500/40" : ""}`}
                  >
                    <div
                      className={`text-xs font-medium mb-1 ${
                        isToday
                          ? "bg-amber-500 text-zinc-950 rounded-full size-5 flex items-center justify-center"
                          : "text-zinc-400 pl-0.5"
                      }`}
                    >
                      {day.getDate()}
                    </div>

                    {/* Mini card — episode still + title + code */}
                    {featured && (
                      <div className="space-y-1">
                        <div className="relative rounded-sm overflow-hidden">
                          {featuredImageUrl ? (
                            <img
                              src={featuredImageUrl}
                              alt=""
                              className="w-full aspect-video object-cover"
                              loading="lazy"
                            />
                          ) : (
                            <div className="w-full aspect-video bg-gradient-to-b from-zinc-800 to-zinc-950" />
                          )}
                          {dayItems.length > 1 && (
                            <span className="absolute top-1 right-1 bg-black/70 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                              +{dayItems.length - 1}
                            </span>
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-white truncate">
                            {featured.type === "episode"
                              ? featured.data.show_title
                              : featured.data.title}
                          </p>
                          <p className="text-xs truncate">
                            {featured.type === "episode" ? (
                              <>
                                <span className="text-amber-400 font-medium">
                                  {formatEpisodeCode(featured.data)}
                                </span>
                                {featured.data.name && (
                                  <span className="text-zinc-400"> · {featured.data.name}</span>
                                )}
                              </>
                            ) : (
                              <span className={
                                featured.data.object_type === "MOVIE"
                                  ? "text-blue-400"
                                  : "text-purple-400"
                              }>
                                {featured.data.object_type === "MOVIE" ? "Movie" : "Show"}
                                {featured.data.release_year && ` · ${featured.data.release_year}`}
                              </span>
                            )}
                          </p>
                        </div>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      )}

      {/* Slide-over panel for selected day */}
      {selectedDate && (
        <SlideOverPanel
          selectedDate={selectedDate}
          items={selectedItems}
          episodes={selectedEpisodes}
          titles={selectedTitles}
          onClose={() => setSelectedDate("")}
          onToggleWatched={toggleWatched}
          onBulkToggle={toggleBulkWatched}
        />
      )}
    </div>
  );
}
