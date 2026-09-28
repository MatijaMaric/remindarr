import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import * as api from "../api";
import { useQuery } from "@tanstack/react-query";
import type { StatsResponse } from "../types";
import i18n from "../i18n";
import { languageName } from "../lib/languageName";
import { statusLabelKey } from "../lib/titleStatus";

export function formatEta(days: number | null): string {
  if (days === null) return "—";
  if (days === 0) return i18n.t("stats.eta.underDay");
  if (days < 7) return i18n.t("stats.eta.days", { count: days });
  if (days < 30)
    return i18n.t("stats.eta.weeks", { count: Math.round(days / 7) });
  return i18n.t("stats.eta.months", { count: Math.round(days / 30) });
}

function formatMonth(ym: string): string {
  const d = new Date(`${ym}-01`);
  if (Number.isNaN(d.getTime())) return ym;
  // ym is "YYYY-MM"; new Date parses it as UTC midnight, so format in UTC to
  // avoid rolling back a day (and thus a month) in negative-offset timezones.
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    timeZone: "UTC",
  }).format(d);
}

function formatTime(minutes: number): string {
  if (minutes === 0) return i18n.t("stats.time.hours", { h: 0 });
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return i18n.t("stats.time.minutes", { m });
  if (m === 0) return i18n.t("stats.time.hours", { h });
  return i18n.t("stats.time.hoursMinutes", { h, m });
}

function OverviewCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string | number;
  sub?: string;
}) {
  return (
    <div className="bg-zinc-900 rounded-xl p-4 flex flex-col gap-1">
      <span className="text-2xl font-bold text-white">{value}</span>
      <span className="text-sm text-zinc-400">{label}</span>
      {sub && <span className="text-xs text-zinc-600">{sub}</span>}
    </div>
  );
}

function HorizontalBar({
  label,
  count,
  max,
}: {
  label: string;
  count: number;
  max: number;
}) {
  const pct = max > 0 ? (count / max) * 100 : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-zinc-300 w-28 truncate flex-shrink-0">
        {label}
      </span>
      <div className="flex-1 bg-zinc-800 rounded-full h-2 overflow-hidden">
        <div
          className="h-full bg-amber-500 rounded-full transition-all duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs text-zinc-500 w-6 text-right flex-shrink-0">
        {count}
      </span>
    </div>
  );
}

function MonthlyChart({ monthly }: { monthly: StatsResponse["monthly"] }) {
  const { t } = useTranslation();
  const maxVal = Math.max(
    ...monthly.map((m) => m.movies_watched + m.episodes_watched),
    1,
  );

  return (
    <div className="flex items-end gap-1 h-28">
      {monthly.map((m) => {
        const total = m.movies_watched + m.episodes_watched;
        const heightPct = (total / maxVal) * 100;
        const moviePct = total > 0 ? (m.movies_watched / total) * 100 : 0;
        return (
          <div
            key={m.month}
            className="flex-1 flex flex-col items-center gap-1"
          >
            <div
              className="w-full flex flex-col justify-end"
              style={{ height: "100px" }}
            >
              {total > 0 ? (
                <div
                  className="w-full rounded-t overflow-hidden flex flex-col-reverse"
                  style={{ height: `${heightPct}%` }}
                  title={t("stats.monthTooltip", {
                    movies: m.movies_watched,
                    episodes: m.episodes_watched,
                  })}
                >
                  <div
                    className="bg-blue-500"
                    style={{ height: `${moviePct}%` }}
                  />
                  <div className="bg-amber-500 flex-1" />
                </div>
              ) : (
                <div className="w-full h-0.5 bg-zinc-800 rounded" />
              )}
            </div>
            <span className="text-[9px] text-zinc-600">
              {formatMonth(m.month)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function ShowStatusGrid({
  showsByStatus,
}: {
  showsByStatus: StatsResponse["shows_by_status"];
}) {
  const { t } = useTranslation();
  const entries = [
    { key: "watching", color: "bg-amber-500" },
    { key: "caught_up", color: "bg-teal-500" },
    { key: "not_started", color: "bg-zinc-500" },
    { key: "completed", color: "bg-emerald-500" },
    { key: "on_hold", color: "bg-yellow-500" },
    { key: "dropped", color: "bg-red-600" },
    { key: "plan_to_watch", color: "bg-blue-500" },
    { key: "unreleased", color: "bg-zinc-700" },
  ].map((e) => ({ ...e, label: t(statusLabelKey(e.key) ?? e.key) })) as {
    key: keyof StatsResponse["shows_by_status"];
    color: string;
    label: string;
  }[];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {entries.map(({ key, label, color }) => {
        const count = showsByStatus[key];
        if (count === 0) return null;
        return (
          <div
            key={key}
            className="bg-zinc-900 rounded-lg p-3 flex items-center gap-3"
          >
            <div
              className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${color}`}
            />
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

export function StatsView() {
  const { t, i18n: i18nInstance } = useTranslation();
  const languageLabel = (code: string) =>
    languageName(code, i18nInstance.language) ?? code.toUpperCase();
  const {
    data,
    isLoading: loading,
    isError,
  } = useQuery({
    queryKey: ["stats"],
    queryFn: ({ signal }) => api.getStats(signal),
  });

  if (isError) {
    return (
      <p className="text-zinc-400 text-sm py-12 text-center">
        {t("stats.loadError")}
      </p>
    );
  }

  if (loading || !data) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="bg-zinc-900 rounded-xl p-4 h-20 animate-pulse"
            />
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
      <div className="flex justify-end">
        <Link
          to="/wrapped"
          className="text-sm text-amber-400 hover:text-amber-300"
        >
          {t("nav.wrapped")} →
        </Link>
      </div>
      {/* Overview */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
        <OverviewCard
          label={t("stats.moviesWatched")}
          value={overview.watched_movies}
        />
        <OverviewCard
          label={t("stats.episodesWatched")}
          value={overview.watched_episodes}
        />
        <OverviewCard
          label={t("stats.showsTracked")}
          value={overview.tracked_shows}
        />
        <OverviewCard
          label={t("stats.moviesTracked")}
          value={overview.tracked_movies}
        />
        <OverviewCard
          label={t("stats.watchTime")}
          value={formatTime(overview.watch_time_minutes)}
          sub={t("stats.total")}
        />
        <OverviewCard
          label={t("stats.watchlistEta")}
          value={formatEta(pace?.watchlistEtaDays ?? null)}
          sub={t("stats.atCurrentPace")}
        />
      </div>

      {/* Watch time breakdown */}
      <div className="grid grid-cols-2 gap-4">
        <OverviewCard
          label={t("stats.tvWatchTime")}
          value={formatTime(overview.watch_time_minutes_shows)}
          sub={t("stats.episodeCount", { count: overview.watched_episodes })}
        />
        <OverviewCard
          label={t("stats.movieWatchTime")}
          value={formatTime(overview.watch_time_minutes_movies)}
          sub={t("stats.movieCount", { count: overview.watched_movies })}
        />
      </div>

      {!!overview.watch_time_unknown_episodes && (
        <p className="text-sm text-zinc-400">
          {t("watchTime.unknownEpisodes", {
            count: overview.watch_time_unknown_episodes,
          })}
        </p>
      )}

      {/* Monthly Activity */}
      <div className="bg-zinc-900 rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">
            {t("stats.monthlyActivity")}
          </h3>
          <div className="flex items-center gap-4 text-xs text-zinc-500">
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-amber-500 inline-block" />{" "}
              {t("stats.episodes")}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-blue-500 inline-block" />{" "}
              {t("stats.movies")}
            </span>
          </div>
        </div>
        <MonthlyChart monthly={monthly} />
      </div>

      {/* Genre + Language breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {genres.length > 0 && (
          <div className="bg-zinc-900 rounded-xl p-4 space-y-3">
            <h3 className="text-sm font-semibold">{t("stats.topGenres")}</h3>
            <div className="space-y-2">
              {genres.map((g) => (
                <HorizontalBar
                  key={g.genre}
                  label={g.genre}
                  count={g.count}
                  max={maxGenre}
                />
              ))}
            </div>
          </div>
        )}

        {languages.length > 0 && (
          <div className="bg-zinc-900 rounded-xl p-4 space-y-3">
            <h3 className="text-sm font-semibold">{t("stats.topLanguages")}</h3>
            <div className="space-y-2">
              {languages.map((l) => (
                <HorizontalBar
                  key={l.language}
                  label={languageLabel(l.language)}
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
          <h3 className="text-sm font-semibold">{t("stats.showsByStatus")}</h3>
          <ShowStatusGrid showsByStatus={shows_by_status} />
        </div>
      )}
    </div>
  );
}

export default function StatsPage() {
  const { t } = useTranslation();
  return (
    <div className="space-y-8">
      <h2 className="text-lg font-semibold">{t("stats.title")}</h2>
      <StatsView />
    </div>
  );
}
