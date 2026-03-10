import { useState, useEffect, useMemo } from "react";
import { ChevronLeftIcon, ChevronRightIcon, RefreshCwIcon } from "lucide-react";
import { getCalendarTitles, syncEpisodes } from "../api";
import TitleList from "../components/TitleList";
import type { Title, Episode, Offer } from "../types";

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

export default function CalendarPage() {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [typeFilter, setTypeFilter] = useState("");
  const [titles, setTitles] = useState<Title[]>([]);
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
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

  const handleSyncEpisodes = async () => {
    setSyncing(true);
    try {
      await syncEpisodes();
      // Refresh calendar data
      const data = await getCalendarTitles({
        month: formatMonth(currentMonth),
        type: typeFilter || undefined,
      });
      setTitles(data.titles);
      setEpisodes(data.episodes || []);
    } catch (err) {
      console.error("Episode sync failed:", err);
    } finally {
      setSyncing(false);
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
          <button
            onClick={handleSyncEpisodes}
            disabled={syncing}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors cursor-pointer text-emerald-400 hover:text-emerald-300 hover:bg-emerald-900/30 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <RefreshCwIcon className={`size-3.5 ${syncing ? "animate-spin" : ""}`} />
            {syncing ? "Syncing..." : "Sync Episodes"}
          </button>
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
                              ? "bg-emerald-900/40 text-emerald-300"
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
              <div className="space-y-3">
                {selectedEpisodes.map((ep) => (
                  <div key={ep.id} className="flex gap-3 p-3 rounded-lg bg-gray-900/60 border border-gray-800">
                    {ep.poster_url && (
                      <img
                        src={ep.poster_url}
                        alt={ep.show_title}
                        className="w-12 h-18 rounded object-cover flex-shrink-0"
                      />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-white">{ep.show_title}</div>
                      <div className="text-xs text-emerald-400 mt-0.5">
                        S{String(ep.season_number).padStart(2, "0")}E{String(ep.episode_number).padStart(2, "0")}
                        {ep.name && ` — ${ep.name}`}
                      </div>
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
