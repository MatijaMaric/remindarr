import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import * as api from "../api";
import type { Title } from "../types";
import TitleList from "../components/TitleList";
import { TitleGridSkeleton } from "../components/SkeletonComponents";
import { useApiCall } from "../hooks/useApiCall";
import { groupShowsByStatus } from "../lib/groupShows";
import { useGridNavigation } from "../hooks/useGridNavigation";
import { useScrollRestoration } from "../hooks/useScrollRestoration";
import { PageHeader } from "../components/design";

function TrackedStatsBand({ titles }: { titles: Title[] }) {
  const watching = titles.filter(t => t.show_status === 'watching' || t.user_status === 'watching').length;
  const completed = titles.filter(t => t.show_status === 'completed' || t.user_status === 'completed').length;
  const scored = titles.filter(t => t.imdb_score || t.tmdb_score);
  const avgScore = scored.length > 0
    ? (scored.reduce((sum, t) => sum + (t.imdb_score ?? t.tmdb_score ?? 0), 0) / scored.length).toFixed(1)
    : null;
  const stats = [
    { label: 'Currently watching', value: String(watching), sub: `of ${titles.length} tracked` },
    { label: 'Completed', value: String(completed), sub: 'shows & movies' },
    { label: 'Avg score', value: avgScore ? `★ ${avgScore}` : '—', sub: scored.length > 0 ? `across ${scored.length} rated` : 'no ratings yet' },
    { label: 'Total tracked', value: String(titles.length), sub: 'titles in library' },
  ];
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
      {stats.map(s => (
        <div key={s.label} className="bg-zinc-900 border border-white/[0.06] rounded-xl p-4">
          <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-zinc-500 mb-2">{s.label}</div>
          <div className="flex items-baseline gap-2">
            <div className="text-3xl font-extrabold tracking-[-0.03em] leading-none">{s.value}</div>
            <div className="font-mono text-[11px] text-zinc-500">{s.sub}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

const STATUS_TABS = [
  { key: 'all', label: 'All' },
  { key: 'watching', label: 'Watching' },
  { key: 'completed', label: 'Completed' },
  { key: 'on_hold', label: 'On Hold' },
  { key: 'plan_to_watch', label: 'Planning' },
  { key: 'dropped', label: 'Dropped' },
] as const;
type StatusTab = (typeof STATUS_TABS)[number]['key'];

export default function TrackedPage() {
  const { data, loading, refetch } = useApiCall(() => api.getTrackedTitles(), []);
  const allTitles: Title[] = useMemo(() => data?.titles ?? [], [data]);
  useScrollRestoration("tracked", !loading);
  const { t } = useTranslation();
  useGridNavigation();

  const [statusFilter, setStatusFilter] = useState<StatusTab>('all');

  const { showGroups, movies } = useMemo(() => {
    const shows = allTitles.filter((t) => t.object_type === "SHOW");
    const movieList = allTitles
      .filter((t) => t.object_type === "MOVIE")
      .sort((a, b) => {
        if (!a.tracked_at && !b.tracked_at) return 0;
        if (!a.tracked_at) return 1;
        if (!b.tracked_at) return -1;
        return b.tracked_at.localeCompare(a.tracked_at);
      });
    return { showGroups: groupShowsByStatus(shows), movies: movieList };
  }, [allTitles]);

  const filteredTitles = useMemo(() => {
    if (statusFilter === 'all') return allTitles;
    return allTitles.filter(t =>
      t.user_status === statusFilter ||
      (statusFilter === 'watching' && t.show_status === 'watching') ||
      (statusFilter === 'completed' && t.show_status === 'completed')
    );
  }, [allTitles, statusFilter]);

  return (
    <div className="space-y-4">
      <PageHeader
        kicker={`Your library · ${allTitles.length} title${allTitles.length === 1 ? '' : 's'}`}
        title="Tracked"
        className="px-0 pt-4 pb-4"
      />

      {!loading && <TrackedStatsBand titles={allTitles} />}

      <div className="flex gap-0 border-b border-white/[0.06] mb-4">
        {STATUS_TABS.map(tab => {
          const count = tab.key === 'all' ? allTitles.length
            : allTitles.filter(t => t.user_status === tab.key || (tab.key === 'watching' && t.show_status === 'watching') || (tab.key === 'completed' && t.show_status === 'completed')).length;
          return (
            <button
              key={tab.key}
              onClick={() => setStatusFilter(tab.key)}
              className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
                statusFilter === tab.key
                  ? 'text-zinc-100 border-amber-400 font-semibold'
                  : 'text-zinc-400 border-transparent hover:text-zinc-100'
              }`}
            >
              {tab.label}
              <span className="ml-2 font-mono text-[11px] text-zinc-500">{count}</span>
            </button>
          );
        })}
      </div>

      {loading ? (
        <TitleGridSkeleton />
      ) : filteredTitles.length === 0 ? (
        <TitleList titles={[]} onTrackToggle={refetch} emptyMessage={t("tracked.empty")} />
      ) : statusFilter !== 'all' ? (
        <TitleList titles={filteredTitles} onTrackToggle={refetch} hideTypeBadge showProgressBar showStatusPicker showNotificationPicker showTags />
      ) : (
        <div className="space-y-6">
          {showGroups.map((group) => (
            <div key={group.key}>
              <h3 className="text-sm font-semibold text-zinc-400 mb-3">
                {t(group.labelKey)} ({group.titles.length})
              </h3>
              <TitleList titles={group.titles} onTrackToggle={refetch} hideTypeBadge showProgressBar showStatusPicker showNotificationPicker showTags />
            </div>
          ))}
          {movies.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-zinc-400 mb-3">
                {t("tracked.sections.movies")} ({movies.length})
              </h3>
              <TitleList titles={movies} onTrackToggle={refetch} showStatusPicker showTags />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
