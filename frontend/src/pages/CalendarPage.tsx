import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { Link } from "react-router";
import { ChevronLeftIcon, ChevronRightIcon, CheckCircleIcon, CircleIcon, LayoutGridIcon, ListIcon, EyeIcon, EyeOffIcon } from "lucide-react";
import { toast } from "sonner";
import { getCalendarTitles, watchEpisode, unwatchEpisode, watchEpisodesBulk } from "../api";
import { useIsMobile } from "../hooks/useIsMobile";
import TitleList from "../components/TitleList";
import type { Title, Episode, Offer } from "../types";
import { CalendarSkeleton } from "../components/SkeletonComponents";

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

function formatEpisodeTag(ep: Episode): string {
  const s = String(ep.season_number).padStart(2, "0");
  const e = String(ep.episode_number).padStart(2, "0");
  return `S${s}E${e} ${ep.show_title}`;
}

function getUniqueProviders(offers?: Offer[]) {
  if (!offers?.length) return [];
  const map = new Map<number, Offer>();
  for (const o of offers) {
    if (o.monetization_type === "FLATRATE" || o.monetization_type === "FREE" || o.monetization_type === "ADS") {
      if (!map.has(o.provider_id)) map.set(o.provider_id, o);
    }
  }
  return Array.from(map.values());
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

// Generate month options for ±24 months
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

function ViewToggle({ viewMode, onViewModeChange }: { viewMode: ViewMode; onViewModeChange: (mode: ViewMode) => void }) {
  return (
    <div className="flex items-center bg-gray-800 rounded-lg p-0.5">
      <button
        onClick={() => onViewModeChange("grid")}
        className={`p-1.5 rounded-md transition-colors cursor-pointer ${
          viewMode === "grid"
            ? "bg-indigo-600 text-white"
            : "text-gray-400 hover:text-white"
        }`}
        title="Grid view"
      >
        <LayoutGridIcon className="size-4" />
      </button>
      <button
        onClick={() => onViewModeChange("agenda")}
        className={`p-1.5 rounded-md transition-colors cursor-pointer ${
          viewMode === "agenda"
            ? "bg-indigo-600 text-white"
            : "text-gray-400 hover:text-white"
        }`}
        title="Agenda view"
      >
        <ListIcon className="size-4" />
      </button>
    </div>
  );
}

export default function CalendarPage() {
  const isMobile = useIsMobile();
  const [viewMode, setViewMode] = useState<ViewMode>("grid");

  if (isMobile) {
    return <AgendaCalendar />;
  }

  if (viewMode === "agenda") {
    return <AgendaCalendar viewMode={viewMode} onViewModeChange={setViewMode} />;
  }

  return <GridCalendar viewMode={viewMode} onViewModeChange={setViewMode} />;
}

// ─── Mobile Agenda View ──────────────────────────────────────────────────────

interface AgendaMonth {
  month: string; // "YYYY-MM"
  titles: Title[];
  episodes: Episode[];
}

function AgendaCalendar({ viewMode, onViewModeChange }: { viewMode?: ViewMode; onViewModeChange?: (mode: ViewMode) => void } = {}) {
  const [typeFilter, setTypeFilter] = useState("");
  const [hideWatched, setHideWatched] = useState(true);
  const [months, setMonths] = useState<AgendaMonth[]>([]);
  const [loadingMore, setLoadingMore] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);
  const topRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const todayRef = useRef<HTMLDivElement>(null);
  const monthOptions = useMemo(() => getMonthOptions(), []);

  // Track which months we've loaded to avoid duplicates
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

  // Load a specific month's data
  const loadMonth = useCallback(async (monthStr: string): Promise<AgendaMonth | null> => {
    if (loadedMonthsRef.current.has(monthStr)) return null;
    loadedMonthsRef.current.add(monthStr);
    try {
      const data = await getCalendarTitles({
        month: monthStr,
        type: typeFilter || undefined,
      });
      return { month: monthStr, titles: data.titles, episodes: data.episodes || [] };
    } catch {
      loadedMonthsRef.current.delete(monthStr);
      return null;
    }
  }, [typeFilter]);

  // Initial load: current month ± 1
  useEffect(() => {
    loadedMonthsRef.current.clear();
    setMonths([]);
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

  // Load more months at bottom
  const loadNextMonth = useCallback(async () => {
    if (loadingMore) return;
    setLoadingMore(true);
    const next = new Date(latestMonth.getFullYear(), latestMonth.getMonth() + 1, 1);
    const result = await loadMonth(formatMonth(next));
    if (result) {
      setMonths((prev) => [...prev, result]);
    }
    setLatestMonth(next);
    setLoadingMore(false);
  }, [latestMonth, loadMonth, loadingMore]);

  // Load more months at top
  const loadPrevMonth = useCallback(async () => {
    if (loadingMore) return;
    setLoadingMore(true);
    const prev = new Date(earliestMonth.getFullYear(), earliestMonth.getMonth() - 1, 1);
    const result = await loadMonth(formatMonth(prev));
    if (result) {
      setMonths((prevMonths) => [result, ...prevMonths]);
    }
    setEarliestMonth(prev);
    setLoadingMore(false);
  }, [earliestMonth, loadMonth, loadingMore]);

  // IntersectionObserver for infinite scroll down
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

  // IntersectionObserver for infinite scroll up
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

  // Jump to month
  const jumpToMonth = useCallback(async (monthStr: string) => {
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
  }, [loadMonth]);

  // Build agenda items sorted by date
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

    return new Map([...byDate.entries()].sort(([a], [b]) => a.localeCompare(b)));
  }, [months, hideWatched]);

  // Toggle watched
  const toggleWatched = async (episodeId: number, currentlyWatched: boolean) => {
    setMonths((prev) =>
      prev.map((m) => ({
        ...m,
        episodes: m.episodes.map((ep) =>
          ep.id === episodeId ? { ...ep, is_watched: !currentlyWatched } : ep
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
            ep.id === episodeId ? { ...ep, is_watched: currentlyWatched } : ep
          ),
        }))
      );
      toast.error("Failed to update watched status — please try again");
    }
  };

  const isEpisodeReleased = (ep: Episode) => {
    if (!ep.air_date) return false;
    return ep.air_date <= today;
  };

  return (
    <div ref={containerRef} className="space-y-4">
      {/* Header: month picker + type filter */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <select
            value={formatMonth(new Date())}
            onChange={(e) => jumpToMonth(e.target.value)}
            className={`px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 ${viewMode ? "flex-1" : "w-full"}`}
          >
            {monthOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          {viewMode && onViewModeChange && (
            <ViewToggle viewMode={viewMode} onViewModeChange={onViewModeChange} />
          )}
        </div>
        <div className="flex items-center gap-2">
          {typeFilters.map((f) => (
            <button
              key={f.value}
              onClick={() => setTypeFilter(f.value)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
                typeFilter === f.value
                  ? "bg-indigo-600 text-white"
                  : "text-gray-400 hover:text-white hover:bg-gray-800"
              }`}
            >
              {f.label}
            </button>
          ))}
          <button
            onClick={() => setHideWatched((v) => !v)}
            className={`ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
              hideWatched
                ? "bg-indigo-600 text-white"
                : "text-gray-400 hover:text-white hover:bg-gray-800"
            }`}
            title={hideWatched ? "Show watched" : "Hide watched"}
          >
            {hideWatched ? <EyeOffIcon className="size-4" /> : <EyeIcon className="size-4" />}
            <span className="hidden sm:inline">Hide watched</span>
          </button>
        </div>
      </div>

      {initialLoading ? (
        <CalendarSkeleton />
      ) : (
        <>
          {/* Load more top sentinel */}
          <div ref={topRef} className="h-1" />

          {agendaItems.size === 0 ? (
            <div className="text-center py-8 text-gray-500 text-sm">No items for this period.</div>
          ) : (
            <div className="space-y-1">
              {Array.from(agendaItems.entries()).map(([dateKey, items]) => {
                const isDateToday = dateKey === today;
                const dateLabel = new Date(dateKey + "T00:00:00").toLocaleDateString(undefined, {
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                });

                return (
                  <div key={dateKey} ref={isDateToday ? todayRef : undefined}>
                    {/* Date header */}
                    <div className={`sticky top-0 z-10 px-3 py-2 text-sm font-medium ${
                      isDateToday
                        ? "bg-indigo-900/60 text-indigo-300 border-l-2 border-indigo-500"
                        : "bg-gray-900/95 text-gray-400"
                    }`}>
                      {isDateToday ? `Today — ${dateLabel}` : dateLabel}
                    </div>

                    {/* Items for this date */}
                    <div className="space-y-1 px-2 py-1">
                      {items.map((item, idx) => {
                        if (item.type === "episode") {
                          const ep = item.data;
                          const released = isEpisodeReleased(ep);
                          return (
                            <div
                              key={`e-${ep.id}-${idx}`}
                              className={`flex items-center gap-3 p-2.5 rounded-lg ${
                                ep.is_watched
                                  ? "bg-gray-900/30 opacity-60"
                                  : "bg-gray-900/60"
                              }`}
                            >
                              {released ? (
                                <button
                                  onClick={() => toggleWatched(ep.id, !!ep.is_watched)}
                                  className={`flex-shrink-0 cursor-pointer transition-colors ${
                                    ep.is_watched
                                      ? "text-emerald-400 hover:text-emerald-300"
                                      : "text-gray-600 hover:text-gray-400"
                                  }`}
                                >
                                  {ep.is_watched ? <CheckCircleIcon className="size-5" /> : <CircleIcon className="size-5" />}
                                </button>
                              ) : (
                                <span className="flex-shrink-0 text-gray-700">
                                  <CircleIcon className="size-5" />
                                </span>
                              )}
                              <div className="flex-1 min-w-0">
                                <Link to={`/title/${ep.title_id}`} className="hover:text-indigo-400 transition-colors">
                                  <p className="text-sm font-medium text-white truncate">{ep.show_title}</p>
                                </Link>
                                <Link to={`/title/${ep.title_id}/season/${ep.season_number}/episode/${ep.episode_number}`} className="hover:text-indigo-400 transition-colors">
                                  <p className="text-xs text-emerald-400">
                                    S{String(ep.season_number).padStart(2, "0")}E{String(ep.episode_number).padStart(2, "0")}
                                    {ep.name && ` — ${ep.name}`}
                                  </p>
                                </Link>
                              </div>
                              {(() => {
                                const providers = getUniqueProviders(ep.offers);
                                return providers.length > 0 ? (
                                  <div className="flex gap-1 flex-shrink-0">
                                    {providers.slice(0, 2).map((p) => (
                                      <img
                                        key={p.provider_id}
                                        src={p.provider_icon_url}
                                        alt={p.provider_name}
                                        className="w-5 h-5 rounded-sm"
                                        loading="lazy"
                                      />
                                    ))}
                                  </div>
                                ) : null;
                              })()}
                            </div>
                          );
                        }

                        // Title item
                        const t = item.data;
                        return (
                          <Link
                            key={`t-${t.id}-${idx}`}
                            to={`/title/${t.id}`}
                            className={`flex items-center gap-3 p-2.5 rounded-lg hover:bg-gray-800/60 transition-colors ${
                              t.object_type === "MOVIE" ? "bg-blue-900/20" : "bg-purple-900/20"
                            }`}
                          >
                            {t.poster_url && (
                              <img
                                src={t.poster_url}
                                alt={t.title}
                                className="w-8 h-12 rounded object-cover flex-shrink-0"
                                loading="lazy"
                              />
                            )}
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-white truncate">{t.title}</p>
                              <p className={`text-xs ${
                                t.object_type === "MOVIE" ? "text-blue-400" : "text-purple-400"
                              }`}>
                                {t.object_type === "MOVIE" ? "Movie" : "Show"}
                                {t.release_year && ` · ${t.release_year}`}
                              </p>
                            </div>
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Load more bottom sentinel */}
          <div ref={bottomRef} className="h-1" />
          {loadingMore && (
            <div className="text-center py-4 text-gray-500 text-sm">Loading more...</div>
          )}
        </>
      )}
    </div>
  );
}

// ─── Desktop Grid Calendar ──────────────────────────────────────────────────

function GridCalendar({ viewMode, onViewModeChange }: { viewMode: ViewMode; onViewModeChange: (mode: ViewMode) => void }) {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [typeFilter, setTypeFilter] = useState("");
  const [titles, setTitles] = useState<Title[]>([]);
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();

  useEffect(() => {
    setLoading(true);
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
      const item: CalendarItem = { type: "episode", data: ep };
      const arr = map.get(ep.air_date);
      if (arr) arr.push(item);
      else map.set(ep.air_date, [item]);
    }

    return map;
  }, [titles, episodes]);

  // Build calendar grid (weeks × 7 days, Monday-start)
  const weeks = useMemo(() => {
    const days = getDaysInMonth(year, month);
    // Monday = 0, Sunday = 6
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

  const selectedTitles = useMemo(() =>
    selectedItems.filter((i): i is CalendarItem & { type: "title" } => i.type === "title").map((i) => i.data),
    [selectedItems]
  );

  const selectedEpisodes = useMemo(() =>
    selectedItems.filter((i): i is CalendarItem & { type: "episode" } => i.type === "episode").map((i) => i.data),
    [selectedItems]
  );

  const prevMonth = () => setCurrentMonth(new Date(year, month - 1, 1));
  const nextMonth = () => setCurrentMonth(new Date(year, month + 1, 1));
  const today = formatDateKey(new Date());

  const toggleWatched = async (episodeId: number, currentlyWatched: boolean) => {
    // Optimistic update
    setEpisodes((prev) =>
      prev.map((ep) => (ep.id === episodeId ? { ...ep, is_watched: !currentlyWatched } : ep))
    );
    try {
      if (currentlyWatched) {
        await unwatchEpisode(episodeId);
      } else {
        await watchEpisode(episodeId);
      }
    } catch (err) {
      // Revert on error
      setEpisodes((prev) =>
        prev.map((ep) => (ep.id === episodeId ? { ...ep, is_watched: currentlyWatched } : ep))
      );
      console.error("Failed to toggle watched:", err);
      toast.error("Failed to update watched status — please try again");
    }
  };

  const isEpisodeReleased = (ep: Episode) => {
    if (!ep.air_date) return false;
    return ep.air_date <= today;
  };

  const toggleBulkWatched = async (episodeIds: number[], markWatched: boolean) => {
    // When marking as watched, filter to only released episodes
    const effectiveIds = markWatched
      ? episodeIds.filter((id) => {
          const ep = episodes.find((e) => e.id === id);
          return ep && isEpisodeReleased(ep);
        })
      : episodeIds;
    if (effectiveIds.length === 0) return;

    // Optimistic update
    const idSet = new Set(effectiveIds);
    setEpisodes((prev) =>
      prev.map((ep) => (idSet.has(ep.id) ? { ...ep, is_watched: markWatched } : ep))
    );
    try {
      await watchEpisodesBulk(effectiveIds, markWatched);
    } catch (err) {
      setEpisodes((prev) =>
        prev.map((ep) => (idSet.has(ep.id) ? { ...ep, is_watched: !markWatched } : ep))
      );
      console.error("Failed to bulk toggle watched:", err);
      toast.error("Failed to update watched status — please try again");
    }
  };

  return (
    <div className="space-y-6">
      {/* Header: month nav + type filter */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <button onClick={prevMonth} className="p-1.5 rounded-lg hover:bg-gray-800 text-gray-400 hover:text-white transition-colors cursor-pointer">
            <ChevronLeftIcon className="size-5" />
          </button>
          <h2 className="text-lg font-semibold w-44 text-center">
            {currentMonth.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
          </h2>
          <button onClick={nextMonth} className="p-1.5 rounded-lg hover:bg-gray-800 text-gray-400 hover:text-white transition-colors cursor-pointer">
            <ChevronRightIcon className="size-5" />
          </button>
          {loading && <span className="text-sm text-gray-500">Loading...</span>}
        </div>
        <div className="flex items-center gap-2">
          {typeFilters.map((f) => (
            <button
              key={f.value}
              onClick={() => setTypeFilter(f.value)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
                typeFilter === f.value
                  ? "bg-indigo-600 text-white"
                  : "text-gray-400 hover:text-white hover:bg-gray-800"
              }`}
            >
              {f.label}
            </button>
          ))}
          <ViewToggle viewMode={viewMode} onViewModeChange={onViewModeChange} />
        </div>
      </div>

      {/* Calendar grid */}
      <div className="border border-gray-800 rounded-xl overflow-hidden">
        {/* Weekday headers */}
        <div className="grid grid-cols-7 bg-gray-900 border-b border-gray-800">
          {WEEKDAYS.map((d) => (
            <div key={d} className="px-2 py-2 text-center text-xs font-medium text-gray-500 uppercase">
              {d}
            </div>
          ))}
        </div>

        {/* Weeks */}
        {weeks.map((week, wi) => (
          <div key={wi} className="grid grid-cols-7 border-b border-gray-800 last:border-b-0">
            {week.map((day, di) => {
              if (!day) {
                return <div key={di} className="min-h-24 bg-gray-950/50" />;
              }
              const dateKey = formatDateKey(day);
              const dayItems = itemsByDate.get(dateKey) ?? [];
              const isToday = dateKey === today;
              const isSelected = dateKey === selectedDate;

              return (
                <button
                  key={di}
                  onClick={() => setSelectedDate(isSelected ? null : dateKey)}
                  className={`min-h-24 p-1.5 text-left transition-colors cursor-pointer border-r border-gray-800 last:border-r-0 ${
                    isSelected
                      ? "bg-indigo-950/40 ring-1 ring-inset ring-indigo-500"
                      : "hover:bg-gray-900/60"
                  }`}
                >
                  <div className={`text-xs font-medium mb-1 ${
                    isToday
                      ? "bg-indigo-600 text-white rounded-full size-5 flex items-center justify-center"
                      : "text-gray-400 pl-0.5"
                  }`}>
                    {day.getDate()}
                  </div>
                  <div className="space-y-0.5">
                    {dayItems.slice(0, 3).map((item, idx) => {
                      const providers = getUniqueProviders(
                        item.type === "title" ? item.data.offers : item.data.offers
                      );
                      return (
                        <div
                          key={item.type === "title" ? `t-${item.data.id}` : `e-${item.data.id}-${idx}`}
                          className={`text-[10px] leading-tight rounded px-1 py-0.5 flex items-center gap-1 ${
                            item.type === "episode"
                              ? item.data.is_watched
                                ? "bg-emerald-900/20 text-emerald-600"
                                : "bg-emerald-900/40 text-emerald-300"
                              : item.data.object_type === "MOVIE"
                                ? "bg-blue-900/40 text-blue-300"
                                : "bg-purple-900/40 text-purple-300"
                          }`}
                          title={item.type === "episode" ? formatEpisodeTag(item.data) : item.data.title}
                        >
                          {providers.length > 0 && (
                            <span className="flex items-center gap-0.5 flex-shrink-0">
                              {providers.slice(0, 2).map((p) => (
                                <img
                                  key={p.provider_id}
                                  src={p.provider_icon_url}
                                  alt={p.provider_name}
                                  title={p.provider_name}
                                  className="w-3.5 h-3.5 rounded-sm"
                                  loading="lazy"
                                />
                              ))}
                            </span>
                          )}
                          <span className="truncate">
                            {item.type === "episode"
                              ? formatEpisodeTag(item.data)
                              : item.data.title}
                          </span>
                        </div>
                      );
                    })}
                    {dayItems.length > 3 && (
                      <div className="text-[10px] text-gray-500 pl-1">
                        +{dayItems.length - 3} more
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        ))}
      </div>

      {/* Selected day detail */}
      {selectedDate && (
        <div>
          <h3 className="text-lg font-semibold mb-4">
            {new Date(selectedDate + "T00:00:00").toLocaleDateString("en-US", {
              weekday: "long",
              month: "long",
              day: "numeric",
              year: "numeric",
            })}
            <span className="text-gray-500 text-sm font-normal ml-2">
              ({selectedItems.length} item{selectedItems.length !== 1 ? "s" : ""})
            </span>
          </h3>

          {/* Episodes section */}
          {selectedEpisodes.length > 0 && (
            <div className="mb-6">
              <h4 className="text-sm font-medium text-emerald-400 mb-3">Episodes</h4>
              {(() => {
                // Group episodes by show
                const showGroups = new Map<string, typeof selectedEpisodes>();
                for (const ep of selectedEpisodes) {
                  const key = ep.title_id;
                  const group = showGroups.get(key);
                  if (group) group.push(ep);
                  else showGroups.set(key, [ep]);
                }

                return Array.from(showGroups.entries()).map(([titleId, showEps]) => {
                  const allWatched = showEps.every((ep) => ep.is_watched);
                  return (
                    <div key={titleId} className="mb-4">
                      {showGroups.size > 1 && showEps.length > 1 && (
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-medium text-gray-400">{showEps[0].show_title}</span>
                          <button
                            onClick={() => toggleBulkWatched(showEps.map((ep) => ep.id), !allWatched)}
                            className="text-xs text-gray-500 hover:text-gray-300 transition-colors cursor-pointer"
                          >
                            {allWatched ? "Mark all unwatched" : "Mark all watched"}
                          </button>
                        </div>
                      )}
                      <div className="space-y-3">
                        {showEps.map((ep) => (
                          <div
                            key={ep.id}
                            className={`flex gap-3 p-3 rounded-lg border transition-colors ${
                              ep.is_watched
                                ? "bg-gray-900/30 border-gray-800/60 opacity-60"
                                : "bg-gray-900/60 border-gray-800"
                            }`}
                          >
                            {ep.poster_url && (
                              <Link to={`/title/${ep.title_id}`} className="flex-shrink-0">
                                <img
                                  src={ep.poster_url}
                                  alt={ep.show_title}
                                  className="w-12 h-18 rounded object-cover"
                                />
                              </Link>
                            )}
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center justify-between gap-2">
                                <Link to={`/title/${ep.title_id}`} className="hover:text-indigo-400 transition-colors">
                                  <div className="text-sm font-medium text-white">{ep.show_title}</div>
                                </Link>
                                {isEpisodeReleased(ep) ? (
                                  <button
                                    onClick={() => toggleWatched(ep.id, !!ep.is_watched)}
                                    className={`flex-shrink-0 p-1 rounded-md transition-colors cursor-pointer ${
                                      ep.is_watched
                                        ? "text-emerald-400 hover:text-emerald-300"
                                        : "text-gray-600 hover:text-gray-400"
                                    }`}
                                    title={ep.is_watched ? "Mark as unwatched" : "Mark as watched"}
                                  >
                                    {ep.is_watched ? (
                                      <CheckCircleIcon className="size-5" />
                                    ) : (
                                      <CircleIcon className="size-5" />
                                    )}
                                  </button>
                                ) : (
                                  <span
                                    className="flex-shrink-0 p-1 text-gray-700 cursor-not-allowed"
                                    title="Not yet released"
                                  >
                                    <CircleIcon className="size-5" />
                                  </span>
                                )}
                              </div>
                              <Link to={`/title/${ep.title_id}/season/${ep.season_number}/episode/${ep.episode_number}`} className="block hover:text-indigo-400 transition-colors">
                                <div className="text-xs text-emerald-400 mt-0.5">
                                  S{String(ep.season_number).padStart(2, "0")}E{String(ep.episode_number).padStart(2, "0")}
                                  {ep.name && ` — ${ep.name}`}
                                </div>
                              </Link>
                              {ep.overview && (
                                <p className="text-xs text-gray-400 mt-1 line-clamp-2">{ep.overview}</p>
                              )}
                              {(() => {
                                const providers = getUniqueProviders(ep.offers);
                                return providers.length > 0 ? (
                                  <div className="flex flex-wrap gap-1.5 mt-2">
                                    {providers.map((p) => (
                                      <a
                                        key={p.provider_id}
                                        href={p.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        title={p.provider_name}
                                      >
                                        <img
                                          src={p.provider_icon_url}
                                          alt={p.provider_name}
                                          className="w-6 h-6 rounded-md"
                                          loading="lazy"
                                        />
                                      </a>
                                    ))}
                                  </div>
                                ) : null;
                              })()}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                });
              })()}
            </div>
          )}

          {/* Titles section */}
          <TitleList
            titles={selectedTitles}
            emptyMessage={selectedEpisodes.length === 0 ? "No tracked releases on this day" : undefined}
          />
        </div>
      )}
    </div>
  );
}
