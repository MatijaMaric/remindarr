import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import * as api from "../api";
import type { Title } from "../types";
import TitleList from "../components/TitleList";
import { TitleGridSkeleton } from "../components/SkeletonComponents";
import { useApiCall } from "../hooks/useApiCall";
import { groupShowsByStatus } from "../lib/groupShows";
import { useGridNavigation } from "../hooks/useGridNavigation";
import { useScrollRestoration } from "../hooks/useScrollRestoration";
import { useIsMobile } from "../hooks/useIsMobile";
import { PageHeader, Pill } from "../components/design";
import BackdateWatchedButton from "../components/BackdateWatchedButton";
import { StatsView } from "./StatsPage";

// Module-scope empty array so the empty-state TitleList sees a stable
// reference and React.memo can short-circuit re-renders.
const EMPTY_TITLES: Title[] = [];

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
        <div key={s.label} className="bg-zinc-900 border border-white/[0.06] rounded-xl p-[18px]">
          <div className="font-mono text-[10px] uppercase tracking-[0.15em] text-zinc-500 font-semibold mb-2">{s.label}</div>
          <div className="flex items-baseline gap-2">
            <div className="text-[30px] sm:text-[36px] font-extrabold tracking-[-0.03em] leading-none">{s.value}</div>
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

type SortKey = 'last_aired' | 'title' | 'rating' | 'progress';

function sortTitles(titles: Title[], sort: SortKey): Title[] {
  return [...titles].sort((a, b) => {
    switch (sort) {
      case 'title': return a.title.localeCompare(b.title);
      case 'rating': return ((b.imdb_score ?? b.tmdb_score ?? 0) - (a.imdb_score ?? a.tmdb_score ?? 0));
      case 'progress': {
        const pctA = a.total_episodes ? (a.watched_episodes_count ?? 0) / a.total_episodes : 0;
        const pctB = b.total_episodes ? (b.watched_episodes_count ?? 0) / b.total_episodes : 0;
        return pctB - pctA;
      }
      case 'last_aired':
      default: {
        const dA = a.latest_released_air_date ?? a.tracked_at ?? '';
        const dB = b.latest_released_air_date ?? b.tracked_at ?? '';
        return dB.localeCompare(dA);
      }
    }
  });
}

export default function TrackedPage() {
  const { data, loading, refetch } = useApiCall(() => api.getTrackedTitles(), []);
  const allTitles: Title[] = useMemo(() => data?.titles ?? [], [data]);
  useScrollRestoration("tracked", !loading);
  const { t } = useTranslation();
  useGridNavigation();

  const [statusFilter, setStatusFilter] = useState<StatusTab>('all');
  const [view, setView] = useState<'grid' | 'list' | 'stats'>('list');
  const [sort, setSort] = useState<SortKey>('last_aired');

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

  const sortedFilteredTitles = useMemo(() => sortTitles(filteredTitles, sort), [filteredTitles, sort]);

  return (
    <div className="space-y-4">
      <PageHeader
        kicker={`Your library · ${allTitles.length} title${allTitles.length === 1 ? '' : 's'}`}
        title="Tracked"
        right={
          <div className="flex items-center gap-2 flex-wrap justify-end">
            <BackdateWatchedButton scope="all" variant="ghost" />
            <Pill active={view === 'grid'} onClick={() => setView('grid')}>Grid</Pill>
            <Pill active={view === 'list'} onClick={() => setView('list')}>List</Pill>
            <Pill active={view === 'stats'} onClick={() => setView('stats')}>Stats</Pill>
          </div>
        }
      />

      {!loading && <TrackedStatsBand titles={allTitles} />}

      {view !== 'stats' && (
        <div className="flex items-center gap-0 border-b border-white/[0.06] mb-4 overflow-x-auto scrollbar-none">
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
          <div className="flex-1" />
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className="font-mono text-[11px] bg-white/[0.04] border border-white/[0.06] text-zinc-400 rounded-md px-3 py-1.5 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-900 mb-0.5"
          >
            <option value="last_aired">sort: last aired</option>
            <option value="title">sort: title</option>
            <option value="rating">sort: rating</option>
            <option value="progress">sort: progress</option>
          </select>
        </div>
      )}

      {view === 'stats' ? (
        <StatsView />
      ) : loading ? (
        <TitleGridSkeleton />
      ) : filteredTitles.length === 0 ? (
        <TitleList titles={EMPTY_TITLES} onTrackToggle={refetch} emptyMessage={t("tracked.empty")} />
      ) : view === 'list' ? (
        <TrackedTable titles={sortedFilteredTitles} onRefetch={refetch} />
      ) : statusFilter !== 'all' ? (
        <TitleList titles={sortedFilteredTitles} onTrackToggle={refetch} hideTypeBadge showProgressBar showStatusPicker showNotificationPicker showTags />
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

const STATUS_COLORS: Record<string, string> = {
  watching: '#fbbf24',
  completed: 'oklch(0.7 0.14 140)',
  on_hold: 'oklch(0.7 0.12 60)',
  plan_to_watch: 'oklch(0.72 0.1 240)',
  dropped: 'oklch(0.65 0.12 0)',
};

function RowActionsMenu({ title, onRefetch }: { title: Title; onRefetch: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const handleUntrack = async () => {
    setOpen(false);
    await api.untrackTitle(title.id);
    onRefetch();
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="px-2 py-1 text-[11px] font-medium bg-white/[0.06] border border-white/[0.08] rounded text-zinc-400 hover:text-white transition-colors cursor-pointer"
      >
        ···
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-20 min-w-[160px] bg-zinc-800 border border-white/[0.08] rounded-lg shadow-xl py-1 text-sm">
          {title.tmdb_url && (
            <a
              href={title.tmdb_url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setOpen(false)}
              className="block px-3 py-2 text-zinc-300 hover:bg-white/[0.06] transition-colors"
            >
              Open on TMDB ↗
            </a>
          )}
          <button
            onClick={() => { void handleUntrack(); }}
            className="w-full text-left px-3 py-2 text-red-400 hover:bg-white/[0.06] transition-colors cursor-pointer"
          >
            Untrack
          </button>
        </div>
      )}
    </div>
  );
}

function TrackedTable({ titles, onRefetch }: { titles: Title[]; onRefetch: () => void }) {
  const isMobile = useIsMobile();

  if (isMobile) {
    return (
      <div className="flex flex-col gap-2">
        {titles.map((title) => {
          const statusKey = title.user_status ?? title.show_status ?? null;
          const statusColor = statusKey ? (STATUS_COLORS[statusKey] ?? STATUS_COLORS['plan_to_watch']) : '#71717a';
          const statusLabel = statusKey ? (statusKey.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())) : '—';
          const watched = title.watched_episodes_count ?? 0;
          const total = title.total_episodes ?? title.released_episodes_count ?? 0;
          const pct = total > 0 ? Math.round((watched / total) * 100) : 0;
          return (
            <Link
              key={title.id}
              to={`/title/${title.id}`}
              className="flex gap-3 items-center bg-zinc-900 border border-white/[0.05] rounded-xl p-2.5"
            >
              <div className="w-[48px] h-[68px] rounded-lg overflow-hidden shrink-0 bg-zinc-800">
                {title.poster_url && (
                  <img src={title.poster_url} alt="" className="w-full h-full object-cover" loading="lazy" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 mb-0.5">
                  <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: statusColor }} />
                  <span className="text-[13px] font-semibold truncate">{title.title}</span>
                </div>
                <div className="font-mono text-[10px] text-zinc-500 mb-1.5">
                  {title.offers[0]?.provider_name ?? ''}{statusKey ? ` · ${statusLabel}` : ''}
                  {title.next_episode_air_date && statusKey !== 'completed' ? ` · ${new Date(title.next_episode_air_date).toLocaleDateString('en', { month: 'short', day: 'numeric' })}` : ''}
                </div>
                {total > 0 && (
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-[3px] bg-white/[0.08] rounded-full overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${pct}%`, background: statusColor }} />
                    </div>
                    <span className="font-mono text-[10px] text-zinc-400 shrink-0">{watched}/{total}</span>
                  </div>
                )}
              </div>
            </Link>
          );
        })}
      </div>
    );
  }

  return (
    <div>
      {/* Column header */}
      <div className="grid gap-4 px-4 py-2.5 font-mono text-[10px] uppercase tracking-[0.12em] text-zinc-500"
        style={{ gridTemplateColumns: '50px 1fr 130px 200px 130px 90px 90px' }}>
        <div />
        <div>Show</div>
        <div>Status</div>
        <div>Progress</div>
        <div>Next</div>
        <div>Rating</div>
        <div className="text-right">Actions</div>
      </div>
      {/* Rows */}
      <div className="rounded-xl border border-white/[0.06] overflow-hidden divide-y divide-white/[0.04]">
        {titles.map((title) => {
          const statusKey = title.user_status ?? title.show_status ?? null;
          const statusColor = statusKey ? (STATUS_COLORS[statusKey] ?? STATUS_COLORS['plan_to_watch']) : '#71717a';
          const statusLabel = statusKey ? (statusKey.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())) : '—';
          const watched = title.watched_episodes_count ?? 0;
          const total = title.total_episodes ?? title.released_episodes_count ?? 0;
          const pct = total > 0 ? Math.round((watched / total) * 100) : 0;
          const score = title.imdb_score ?? title.tmdb_score;
          const nextDate = title.next_episode_air_date
            ? new Date(title.next_episode_air_date).toLocaleDateString('en', { month: 'short', day: 'numeric' })
            : null;
          return (
            <div
              key={title.id}
              className="grid gap-4 px-4 py-3 items-center bg-zinc-900 hover:bg-zinc-800/60 transition-colors"
              style={{ gridTemplateColumns: '50px 1fr 130px 200px 130px 90px 90px' }}
            >
              {/* Poster thumbnail */}
              <div className="w-[38px] h-[56px] rounded overflow-hidden shrink-0 bg-zinc-800">
                {title.poster_url && (
                  <img src={title.poster_url} alt="" className="w-full h-full object-cover" loading="lazy" />
                )}
              </div>
              {/* Title + meta */}
              <div>
                <Link to={`/title/${title.id}`} className="text-sm font-semibold hover:text-amber-300 transition-colors line-clamp-1">
                  {title.title}
                </Link>
                <div className="font-mono text-[11px] text-zinc-500 mt-0.5">
                  {title.release_year}{title.object_type === 'SHOW' ? ' · Show' : ' · Movie'}
                  {title.offers[0] && ` · ${title.offers[0].provider_name}`}
                </div>
              </div>
              {/* Status */}
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: statusColor }} />
                <span className="text-[12px] font-semibold" style={{ color: statusColor }}>{statusLabel}</span>
              </div>
              {/* Progress */}
              {total > 0 ? (
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <div className="flex-1 h-1 rounded-full bg-white/[0.08] overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${pct}%`, background: statusColor }} />
                    </div>
                    <span className="font-mono text-[11px] text-zinc-400 shrink-0">{watched}/{total}</span>
                  </div>
                </div>
              ) : (
                <div className="font-mono text-[11px] text-zinc-600">—</div>
              )}
              {/* Next air date */}
              <div className="font-mono text-[12px] text-zinc-300">{nextDate ?? '—'}</div>
              {/* Rating */}
              <div className="font-mono text-[13px] font-semibold" style={{ color: score ? '#fbbf24' : '#52525b' }}>
                {score ? `★ ${score.toFixed(1)}` : '—'}
              </div>
              {/* Actions */}
              <div className="flex gap-1 justify-end">
                <Link
                  to={`/title/${title.id}`}
                  className="px-2.5 py-1 text-[11px] font-medium bg-white/[0.06] border border-white/[0.08] rounded text-zinc-300 hover:text-white transition-colors"
                >
                  Open
                </Link>
                <RowActionsMenu title={title} onRefetch={onRefetch} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
