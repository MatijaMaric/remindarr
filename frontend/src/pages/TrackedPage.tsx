import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Card } from "../components/ui/card";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
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
import {
  AlertDialog,
  AlertDialogPopup,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogClose,
} from "../components/ui/alert-dialog";

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
        <Card key={s.label} padding="none" className="p-[18px]">
          <div className="font-mono text-[10px] uppercase tracking-[0.15em] text-zinc-500 font-semibold mb-2">{s.label}</div>
          <div className="flex items-baseline gap-2">
            <div className="text-[30px] sm:text-[36px] font-extrabold tracking-[-0.03em] leading-none">{s.value}</div>
            <div className="font-mono text-[11px] text-zinc-500">{s.sub}</div>
          </div>
        </Card>
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
  const { data, loading, refetch } = useApiCall((signal) => api.getTrackedTitles(signal), []);
  const allTitles: Title[] = useMemo(() => data?.titles ?? [], [data]);
  useScrollRestoration("tracked", !loading);
  const { t } = useTranslation();
  useGridNavigation();

  const [statusFilter, setStatusFilter] = useState<StatusTab>('all');
  const [view, setView] = useState<'grid' | 'list' | 'stats'>('list');
  const [sort, setSort] = useState<SortKey>('last_aired');

  // Select mode state
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

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

  // Exit select mode and clear selection
  const exitSelectMode = useCallback(() => {
    setSelectMode(false);
    setSelectedIds(new Set());
  }, []);

  // Toggle select mode
  const toggleSelectMode = useCallback(() => {
    if (selectMode) {
      exitSelectMode();
    } else {
      setSelectMode(true);
      setSelectedIds(new Set());
    }
  }, [selectMode, exitSelectMode]);

  // Ctrl/Cmd+A selects all visible titles when in select mode
  useEffect(() => {
    if (!selectMode) return;
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
        e.preventDefault();
        setSelectedIds(new Set(sortedFilteredTitles.map(t => t.id)));
      }
      if (e.key === 'Escape') {
        exitSelectMode();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectMode, sortedFilteredTitles, exitSelectMode]);

  return (
    <div className="space-y-4">
      <PageHeader
        kicker={`Your library · ${allTitles.length} title${allTitles.length === 1 ? '' : 's'}`}
        title="Tracked"
        right={
          <div className="flex items-center gap-2 flex-wrap justify-end">
            <BackdateWatchedButton scope="all" variant="ghost" />
            <Pill active={selectMode} onClick={toggleSelectMode}>Select</Pill>
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
        <TrackedTable
          titles={sortedFilteredTitles}
          onRefetch={refetch}
          selectMode={selectMode}
          selectedIds={selectedIds}
          onSelectionChange={setSelectedIds}
        />
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

      {/* Bulk action bar */}
      {selectMode && (
        <BulkActionBar
          selectedIds={selectedIds}
          onDone={() => { exitSelectMode(); refetch(); }}
          onCancel={exitSelectMode}
        />
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

interface TrackedTableProps {
  titles: Title[];
  onRefetch: () => void;
  selectMode?: boolean;
  selectedIds?: Set<string>;
  onSelectionChange?: (ids: Set<string>) => void;
}

function TrackedTable({ titles, onRefetch, selectMode = false, selectedIds = new Set(), onSelectionChange }: TrackedTableProps) {
  const isMobile = useIsMobile();

  function toggleId(id: string) {
    if (!onSelectionChange) return;
    const next = new Set(selectedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    onSelectionChange(next);
  }

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
          const isSelected = selectedIds.has(title.id);

          const rowContent = (
            <>
              {selectMode && (
                <div className="w-5 h-5 flex items-center justify-center shrink-0">
                  <div className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-colors ${isSelected ? 'bg-amber-400 border-amber-400' : 'border-zinc-600'}`}>
                    {isSelected && (
                      <svg className="w-2.5 h-2.5 text-zinc-900" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>
                </div>
              )}
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
            </>
          );

          if (selectMode) {
            return (
              <button
                key={title.id}
                type="button"
                onClick={() => toggleId(title.id)}
                className={`flex gap-3 items-center rounded-xl p-2.5 w-full text-left transition-colors ${isSelected ? 'bg-amber-500/10 border border-amber-500/30' : 'bg-zinc-900 border border-white/[0.05]'}`}
              >
                {rowContent}
              </button>
            );
          }

          return (
            <Link
              key={title.id}
              to={`/title/${title.id}`}
              className="flex gap-3 items-center bg-zinc-900 border border-white/[0.05] rounded-xl p-2.5"
            >
              {rowContent}
            </Link>
          );
        })}
      </div>
    );
  }

  return (
    <div>
      {/* Column header */}
      <div
        className="grid gap-4 px-4 py-2.5 font-mono text-[10px] uppercase tracking-[0.12em] text-zinc-500"
        style={{ gridTemplateColumns: selectMode ? '32px 50px 1fr 130px 200px 130px 90px 90px' : '50px 1fr 130px 200px 130px 90px 90px' }}
      >
        {selectMode && (
          <div>
            <button
              type="button"
              onClick={() => {
                if (!onSelectionChange) return;
                if (selectedIds.size === titles.length) {
                  onSelectionChange(new Set());
                } else {
                  onSelectionChange(new Set(titles.map(t => t.id)));
                }
              }}
              className="w-4 h-4 rounded border-2 flex items-center justify-center transition-colors border-zinc-600 hover:border-amber-400"
              title="Select all"
            >
              {selectedIds.size === titles.length && titles.length > 0 && (
                <svg className="w-2.5 h-2.5 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              )}
            </button>
          </div>
        )}
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
          const isSelected = selectedIds.has(title.id);

          return (
            <div
              key={title.id}
              className={`grid gap-4 px-4 py-3 items-center transition-colors ${selectMode ? (isSelected ? 'bg-amber-500/10 cursor-pointer' : 'bg-zinc-900 hover:bg-zinc-800/60 cursor-pointer') : 'bg-zinc-900 hover:bg-zinc-800/60'}`}
              style={{ gridTemplateColumns: selectMode ? '32px 50px 1fr 130px 200px 130px 90px 90px' : '50px 1fr 130px 200px 130px 90px 90px' }}
              onClick={selectMode ? () => toggleId(title.id) : undefined}
            >
              {/* Checkbox column */}
              {selectMode && (
                <div className="flex items-center justify-center">
                  <div className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-colors ${isSelected ? 'bg-amber-400 border-amber-400' : 'border-zinc-600'}`}>
                    {isSelected && (
                      <svg className="w-2.5 h-2.5 text-zinc-900" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>
                </div>
              )}
              {/* Poster thumbnail */}
              <div className="w-[38px] h-[56px] rounded overflow-hidden shrink-0 bg-zinc-800">
                {title.poster_url && (
                  <img src={title.poster_url} alt="" className="w-full h-full object-cover" loading="lazy" />
                )}
              </div>
              {/* Title + meta */}
              <div>
                {selectMode ? (
                  <span className="text-sm font-semibold line-clamp-1">{title.title}</span>
                ) : (
                  <Link to={`/title/${title.id}`} className="text-sm font-semibold hover:text-amber-300 transition-colors line-clamp-1">
                    {title.title}
                  </Link>
                )}
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
              <div className="flex gap-1 justify-end" onClick={(e) => selectMode && e.stopPropagation()}>
                {!selectMode && (
                  <>
                    <Link
                      to={`/title/${title.id}`}
                      className="px-2.5 py-1 text-[11px] font-medium bg-white/[0.06] border border-white/[0.08] rounded text-zinc-300 hover:text-white transition-colors"
                    >
                      Open
                    </Link>
                    <RowActionsMenu title={title} onRefetch={onRefetch} />
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Bulk Action Bar ──────────────────────────────────────────────────────────

const BULK_STATUS_OPTIONS = [
  { value: 'watching', label: 'Watching' },
  { value: 'completed', label: 'Completed' },
  { value: 'on_hold', label: 'On Hold' },
  { value: 'plan_to_watch', label: 'Plan to Watch' },
  { value: 'dropped', label: 'Dropped' },
] as const;

interface BulkActionBarProps {
  selectedIds: Set<string>;
  onDone: () => void;
  onCancel: () => void;
}

function BulkActionBar({ selectedIds, onDone, onCancel }: BulkActionBarProps) {
  const [confirmUntrack, setConfirmUntrack] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [tagOpen, setTagOpen] = useState(false);
  const [tagInput, setTagInput] = useState('');
  const [loading, setLoading] = useState(false);
  const count = selectedIds.size;

  async function runBulkAction(action: Parameters<typeof api.bulkTrackAction>[0]) {
    setLoading(true);
    // Optimistic: get the selected ids for rollback reference
    const titleIds = action.titleIds;
    try {
      await api.bulkTrackAction(action);
      toast.success(`Updated ${titleIds.length} title${titleIds.length === 1 ? '' : 's'}`);
      onDone();
    } catch (err) {
      console.error('Bulk action failed', err);
      toast.error('Bulk action failed — please try again');
    } finally {
      setLoading(false);
    }
  }

  async function handleUntrack() {
    setConfirmUntrack(false);
    await runBulkAction({ titleIds: Array.from(selectedIds), action: 'untrack' });
  }

  async function handleSetStatus(status: string) {
    setStatusOpen(false);
    await runBulkAction({ titleIds: Array.from(selectedIds), action: 'set_status', payload: { status } });
  }

  async function handleAddTag() {
    const tag = tagInput.trim().toLowerCase();
    if (!tag) return;
    setTagOpen(false);
    setTagInput('');
    await runBulkAction({ titleIds: Array.from(selectedIds), action: 'add_tag', payload: { tag } });
  }

  async function handleMuteNotifications() {
    await runBulkAction({ titleIds: Array.from(selectedIds), action: 'set_notification_mode', payload: { mode: 'none' } });
  }

  if (count === 0) {
    return (
      <div className="fixed bottom-[calc(4rem+env(safe-area-inset-bottom,0px))] left-0 right-0 z-30 flex justify-center pointer-events-none">
        <div className="mx-4 mb-4 max-w-xl w-full bg-zinc-900 border border-white/[0.08] rounded-2xl px-4 py-3 shadow-2xl pointer-events-auto">
          <div className="flex items-center justify-between">
            <span className="text-sm text-zinc-400">Select titles to apply bulk actions</span>
            <button type="button" onClick={onCancel} className="text-xs text-zinc-500 hover:text-white transition-colors cursor-pointer">
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="fixed bottom-[calc(4rem+env(safe-area-inset-bottom,0px))] left-0 right-0 z-30 flex justify-center">
        <div className="mx-4 mb-4 max-w-2xl w-full bg-zinc-900 border border-white/[0.1] rounded-2xl px-4 py-3 shadow-2xl">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="font-mono text-[11px] text-amber-400 font-semibold shrink-0">
              {count} selected
            </span>

            {/* Untrack */}
            <button
              type="button"
              disabled={loading}
              onClick={() => count > 10 ? setConfirmUntrack(true) : void handleUntrack()}
              className="px-3 py-1.5 text-xs font-medium rounded-lg bg-red-600/20 border border-red-500/30 text-red-400 hover:bg-red-600/30 transition-colors cursor-pointer disabled:opacity-50"
            >
              Untrack
            </button>

            {/* Set Status */}
            <div className="relative">
              <button
                type="button"
                disabled={loading}
                onClick={() => setStatusOpen(v => !v)}
                className="px-3 py-1.5 text-xs font-medium rounded-lg bg-white/[0.06] border border-white/[0.08] text-zinc-300 hover:text-white transition-colors cursor-pointer disabled:opacity-50"
              >
                Set Status ▾
              </button>
              {statusOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setStatusOpen(false)} />
                  <div className="absolute bottom-full mb-2 left-0 z-20 min-w-[160px] bg-zinc-800 border border-white/[0.08] rounded-xl shadow-2xl py-1">
                    {BULK_STATUS_OPTIONS.map(opt => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => void handleSetStatus(opt.value)}
                        className="w-full text-left px-3 py-2 text-xs text-zinc-300 hover:bg-white/[0.06] transition-colors cursor-pointer"
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* Add Tag */}
            <div className="relative">
              <button
                type="button"
                disabled={loading}
                onClick={() => setTagOpen(v => !v)}
                className="px-3 py-1.5 text-xs font-medium rounded-lg bg-white/[0.06] border border-white/[0.08] text-zinc-300 hover:text-white transition-colors cursor-pointer disabled:opacity-50"
              >
                Add Tag
              </button>
              {tagOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setTagOpen(false)} />
                  <div className="absolute bottom-full mb-2 left-0 z-20 w-[220px] bg-zinc-800 border border-white/[0.08] rounded-xl shadow-2xl p-3">
                    <div className="flex gap-2">
                      <input
                        autoFocus
                        type="text"
                        value={tagInput}
                        onChange={e => setTagInput(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') void handleAddTag(); if (e.key === 'Escape') setTagOpen(false); }}
                        placeholder="Tag name…"
                        maxLength={30}
                        className="flex-1 bg-zinc-900 border border-white/[0.08] rounded-md px-2 py-1.5 text-xs text-zinc-200 placeholder-zinc-600 outline-none focus-visible:ring-1 focus-visible:ring-amber-400"
                      />
                      <button
                        type="button"
                        onClick={() => void handleAddTag()}
                        className="px-2.5 py-1.5 text-xs font-medium bg-amber-500 text-zinc-900 rounded-md hover:bg-amber-400 transition-colors cursor-pointer"
                      >
                        Add
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Mute notifications */}
            <button
              type="button"
              disabled={loading}
              onClick={() => void handleMuteNotifications()}
              className="px-3 py-1.5 text-xs font-medium rounded-lg bg-white/[0.06] border border-white/[0.08] text-zinc-300 hover:text-white transition-colors cursor-pointer disabled:opacity-50"
            >
              Mute Notifications
            </button>

            <div className="flex-1" />

            <button
              type="button"
              onClick={onCancel}
              className="text-xs text-zinc-500 hover:text-white transition-colors cursor-pointer shrink-0"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>

      {/* Confirm bulk untrack for large selections */}
      <AlertDialog open={confirmUntrack} onOpenChange={setConfirmUntrack}>
        <AlertDialogPopup>
          <AlertDialogTitle>Untrack {count} titles?</AlertDialogTitle>
          <AlertDialogDescription>
            This will remove all {count} selected titles from your watchlist. This cannot be undone.
          </AlertDialogDescription>
          <div className="mt-4 flex justify-end gap-2">
            <AlertDialogClose className="inline-flex items-center justify-center rounded-md px-3 py-1.5 text-xs font-medium bg-zinc-800 text-zinc-400 hover:bg-zinc-700 cursor-pointer transition-colors">
              Cancel
            </AlertDialogClose>
            <button
              onClick={() => void handleUntrack()}
              className="inline-flex items-center justify-center rounded-md px-3 py-1.5 text-xs font-medium bg-red-600 text-white hover:bg-red-700 cursor-pointer transition-colors"
            >
              Untrack all
            </button>
          </div>
        </AlertDialogPopup>
      </AlertDialog>
    </>
  );
}
