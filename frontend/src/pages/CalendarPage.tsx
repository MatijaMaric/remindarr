import { useState, useEffect, useMemo } from "react";
import { Link, useSearchParams } from "react-router";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  EyeIcon,
  EyeOffIcon,
  XIcon,
} from "lucide-react";
import { toast } from "sonner";
import { getCalendarTitles, watchEpisode, unwatchEpisode, watchEpisodesBulk } from "../api";
import { useIsMobile } from "../hooks/useIsMobile";
import TitleCard from "../components/TitleCard";
import type { Title, Episode } from "../types";
import { GridCalendarSkeleton } from "../components/SkeletonComponents";
import {
  formatEpisodeCode,
  groupByShow,
} from "../components/EpisodeComponents";
import WatchedToggleButton from "../components/WatchedToggleButton";
import WatchButtonGroup from "../components/WatchButtonGroup";
import AgendaCalendar, {
  type CalendarItem,
  type ViewMode,
  typeFilters,
  formatMonth,
  formatDateKey,
  getCellBorderColor,
  useCalendarParam,
  ViewToggle,
} from "../components/AgendaCalendar";
import { PageHeader } from "../components/design";


// ─── Helpers ────────────────────────────────────────────────────────────────

function getDaysInMonth(year: number, month: number): Date[] {
  const days: Date[] = [];
  const date = new Date(year, month, 1);
  while (date.getMonth() === month) {
    days.push(new Date(date));
    date.setDate(date.getDate() + 1);
  }
  return days;
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

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

        {/* Episodes */}
        {episodes.length > 0 && (
          <div className="px-4 pb-4 pt-4">
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
                            {released && (
                              <div className="mt-2">
                                <WatchButtonGroup offers={ep.offers ?? []} variant="dropdown" />
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

  const monthTitle = currentMonth.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });

  const headerRight = (
    <div className="flex items-center gap-2">
      <button
        onClick={prevMonth}
        className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors cursor-pointer"
      >
        <ChevronLeftIcon className="size-5" />
      </button>
      <button
        onClick={() => setMonthParam(formatMonth(new Date()))}
        className="px-3 py-1.5 rounded-lg text-sm font-medium text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors cursor-pointer"
      >
        Today
      </button>
      <button
        onClick={nextMonth}
        className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors cursor-pointer"
      >
        <ChevronRightIcon className="size-5" />
      </button>
      <div className="w-px h-5 bg-white/10 mx-1" />
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
  );

  return (
    <div className="space-y-4">
      {/* Header */}
      <PageHeader
        kicker="Month view · your timezone"
        title={monthTitle}
        right={headerRight}
        className="px-0 pt-4 pb-4"
      />

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
                className="px-2 py-2 text-center font-mono text-[11px] text-zinc-500 font-semibold uppercase tracking-[0.15em]"
              >
                {d}
              </div>
            ))}
          </div>

          {/* Weeks */}
          {weeks.map((week, wi) => (
            <div
              key={wi}
              className="grid grid-cols-7 gap-px bg-white/[0.06]"
            >
              {week.map((day, di) => {
                if (!day) {
                  return (
                    <div key={di} className="min-h-28 bg-zinc-950" />
                  );
                }
                const dateKey = formatDateKey(day);
                const dayItems = itemsByDate.get(dateKey) ?? [];
                const isToday = dateKey === today;
                const isSelected = dateKey === selectedDate;
                const borderColor = getCellBorderColor(dayItems);

                return (
                  <button
                    key={di}
                    onClick={() =>
                      setSelectedDate(isSelected ? "" : dateKey)
                    }
                    className={`min-h-36 p-1.5 text-left transition-colors cursor-pointer bg-zinc-950 ${
                      borderColor ? `border-l-2 ${borderColor}` : ""
                    } ${
                      isSelected
                        ? "bg-amber-500/10 ring-1 ring-inset ring-amber-500"
                        : dayItems.length > 0
                          ? "hover:bg-zinc-900/60"
                          : "hover:bg-zinc-900/30"
                    } ${isToday ? "outline-2 outline-amber-400 outline-offset-[-2px] relative z-10" : ""}`}
                  >
                    <div className="flex items-center mb-1">
                      {isToday ? (
                        <>
                          <span className="font-mono text-[13px] text-amber-400 font-bold">
                            {day.getDate()}
                          </span>
                          <span className="font-mono text-[9px] ml-1 tracking-widest text-amber-400 opacity-80">TODAY</span>
                        </>
                      ) : (
                        <span className="font-mono text-[13px] text-zinc-400 pl-0.5">
                          {day.getDate()}
                        </span>
                      )}
                    </div>

                    {/* Episode + title pills */}
                    {dayItems.length > 0 && (
                      <div className="space-y-0.5">
                        {dayItems.slice(0, 3).map((item, idx) => {
                          const isEp = item.type === "episode";
                          const label = isEp
                            ? item.data.show_title
                            : item.type === "title"
                              ? item.data.title
                              : "";
                          const prefix = isEp
                            ? `S${item.data.season_number}E${item.data.episode_number} `
                            : item.type === "title"
                              ? (item.data.object_type === "MOVIE" ? "FILM " : "SHOW ")
                              : "";
                          return (
                            <div
                              key={idx}
                              className="bg-amber-400/10 text-amber-400 border-l-2 border-amber-400 px-1.5 py-0.5 rounded-sm text-[10px] font-medium leading-tight overflow-hidden text-ellipsis whitespace-nowrap"
                            >
                              <span className="font-mono">{prefix}</span>
                              {label}
                            </div>
                          );
                        })}
                        {dayItems.length > 3 && (
                          <div className="text-[10px] text-zinc-500 pl-1.5">
                            +{dayItems.length - 3} more
                          </div>
                        )}
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
