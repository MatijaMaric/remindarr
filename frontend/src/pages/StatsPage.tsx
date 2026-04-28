import * as api from "../api";
import type { StatsResponse } from "../types";
import { useApiCall } from "../hooks/useApiCall";

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function formatEta(days: number | null): string {
  if (days === null) return "—";
  if (days === 0) return "< 1 day";
  if (days < 7) return `${days}d`;
  if (days < 30) return `~${Math.round(days / 7)}w`;
  return `~${Math.round(days / 30)}mo`;
}

function formatMonth(ym: string): string {
  const [, m] = ym.split("-");
  return MONTH_NAMES[parseInt(m, 10) - 1] ?? ym;
}

function formatTime(minutes: number): string {
  if (minutes === 0) return "0h";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function OverviewCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="bg-zinc-900 rounded-xl p-4 flex flex-col gap-1">
      <span className="text-2xl font-bold text-white">{value}</span>
      <span className="text-sm text-zinc-400">{label}</span>
      {sub && <span className="text-xs text-zinc-600">{sub}</span>}
    </div>
  );
}

function HorizontalBar({ label, count, max }: { label: string; count: number; max: number }) {
  const pct = max > 0 ? (count / max) * 100 : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-zinc-300 w-28 truncate flex-shrink-0">{label}</span>
      <div className="flex-1 bg-zinc-800 rounded-full h-2 overflow-hidden">
        <div className="h-full bg-amber-500 rounded-full transition-all duration-300" style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-zinc-500 w-6 text-right flex-shrink-0">{count}</span>
    </div>
  );
}

function MonthlyChart({ monthly }: { monthly: StatsResponse["monthly"] }) {
  const maxVal = Math.max(...monthly.map((m) => m.movies_watched + m.episodes_watched), 1);

  return (
    <div className="flex items-end gap-1 h-28">
      {monthly.map((m) => {
        const total = m.movies_watched + m.episodes_watched;
        const heightPct = (total / maxVal) * 100;
        const moviePct = total > 0 ? (m.movies_watched / total) * 100 : 0;
        return (
          <div key={m.month} className="flex-1 flex flex-col items-center gap-1">
            <div className="w-full flex flex-col justify-end" style={{ height: "100px" }}>
              {total > 0 ? (
                <div
                  className="w-full rounded-t overflow-hidden flex flex-col-reverse"
                  style={{ height: `${heightPct}%` }}
                  title={`${m.movies_watched} movies, ${m.episodes_watched} episodes`}
                >
                  <div className="bg-blue-500" style={{ height: `${moviePct}%` }} />
                  <div className="bg-amber-500 flex-1" />
                </div>
              ) : (
                <div className="w-full h-0.5 bg-zinc-800 rounded" />
              )}
            </div>
            <span className="text-[9px] text-zinc-600">{formatMonth(m.month)}</span>
          </div>
        );
      })}
    </div>
  );
}

function ShowStatusGrid({ showsByStatus }: { showsByStatus: StatsResponse["shows_by_status"] }) {
  const entries = [
    { key: "watching", label: "Watching", color: "bg-amber-500" },
    { key: "caught_up", label: "Caught Up", color: "bg-teal-500" },
    { key: "not_started", label: "Not Started", color: "bg-zinc-500" },
    { key: "completed", label: "Completed", color: "bg-emerald-500" },
    { key: "on_hold", label: "On Hold", color: "bg-yellow-500" },
    { key: "dropped", label: "Dropped", color: "bg-red-600" },
    { key: "plan_to_watch", label: "Plan to Watch", color: "bg-blue-500" },
    { key: "unreleased", label: "Unreleased", color: "bg-zinc-700" },
  ] as const;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {entries.map(({ key, label, color }) => {
        const count = showsByStatus[key];
        if (count === 0) return null;
        return (
          <div key={key} className="bg-zinc-900 rounded-lg p-3 flex items-center gap-3">
            <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${color}`} />
            <div>
              <div className="text-base font-bold text-white">{count}</div>
              <div className="text-xs text-zinc-500">{label}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

const LANGUAGE_NAMES: Record<string, string> = {
  en: "English", ja: "Japanese", ko: "Korean", fr: "French", de: "German",
  es: "Spanish", it: "Italian", pt: "Portuguese", zh: "Chinese", hi: "Hindi",
  ar: "Arabic", ru: "Russian", tr: "Turkish", nl: "Dutch", sv: "Swedish",
  da: "Danish", fi: "Finnish", no: "Norwegian", pl: "Polish", th: "Thai",
};

export function StatsView() {
  const { data, loading } = useApiCall((signal) => api.getStats(signal), []);

  if (loading || !data) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="bg-zinc-900 rounded-xl p-4 h-20 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  const { overview, genres, languages, monthly, shows_by_status, pace } = data;
  const maxGenre = genres[0]?.count ?? 0;
  const maxLang = languages[0]?.count ?? 0;

  return (
    <div className="space-y-8 pb-8">
      {/* Overview */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        <OverviewCard label="Movies Watched" value={overview.watched_movies} />
        <OverviewCard label="Episodes Watched" value={overview.watched_episodes} />
        <OverviewCard label="Shows Tracked" value={overview.tracked_shows} />
        <OverviewCard label="Movies Tracked" value={overview.tracked_movies} />
        <OverviewCard label="Watch Time" value={formatTime(overview.watch_time_minutes)} sub="total" />
        <OverviewCard
          label="Watchlist ETA"
          value={formatEta(pace?.watchlistEtaDays ?? null)}
          sub="at your current pace"
        />
      </div>

      {/* Watch time breakdown */}
      <div className="grid grid-cols-2 gap-4">
        <OverviewCard
          label="TV Watch Time"
          value={formatTime(overview.watch_time_minutes_shows)}
          sub={`${overview.watched_episodes} episodes`}
        />
        <OverviewCard
          label="Movie Watch Time"
          value={formatTime(overview.watch_time_minutes_movies)}
          sub={`${overview.watched_movies} movies`}
        />
      </div>

      {/* Monthly Activity */}
      <div className="bg-zinc-900 rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Monthly Activity</h3>
          <div className="flex items-center gap-4 text-xs text-zinc-500">
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-amber-500 inline-block" /> Episodes</span>
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-blue-500 inline-block" /> Movies</span>
          </div>
        </div>
        <MonthlyChart monthly={monthly} />
      </div>

      {/* Genre + Language breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {genres.length > 0 && (
          <div className="bg-zinc-900 rounded-xl p-4 space-y-3">
            <h3 className="text-sm font-semibold">Top Genres</h3>
            <div className="space-y-2">
              {genres.map((g) => (
                <HorizontalBar key={g.genre} label={g.genre} count={g.count} max={maxGenre} />
              ))}
            </div>
          </div>
        )}

        {languages.length > 0 && (
          <div className="bg-zinc-900 rounded-xl p-4 space-y-3">
            <h3 className="text-sm font-semibold">Top Languages</h3>
            <div className="space-y-2">
              {languages.map((l) => (
                <HorizontalBar
                  key={l.language}
                  label={LANGUAGE_NAMES[l.language] ?? l.language.toUpperCase()}
                  count={l.count}
                  max={maxLang}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Shows by status */}
      {overview.tracked_shows > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold">Shows by Status</h3>
          <ShowStatusGrid showsByStatus={shows_by_status} />
        </div>
      )}
    </div>
  );
}

export default function StatsPage() {
  return (
    <div className="space-y-8">
      <h2 className="text-lg font-semibold">Stats</h2>
      <StatsView />
    </div>
  );
}
